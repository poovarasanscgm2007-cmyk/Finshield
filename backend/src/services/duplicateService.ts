import { pool } from '../db';
import { normalizeInvoiceNumber } from './extractionService';
import { writeAuditLog } from './auditService';

export interface DuplicateMatch {
  invoice_id: string;
  invoice_number: string;
  normalized_invoice_number: string;
  supplier_id: string;
  supplier_name?: string;
  invoice_date?: string;
  total: number;
  similarity_score: number;
  reasons: string[];
  created_at: Date | string;
}

export interface DuplicateDetectionResult {
  target_invoice_id: string;
  target_invoice_number: string;
  is_possible_duplicate: boolean;
  highest_similarity: number;
  threshold: number;
  duplicates: DuplicateMatch[];
}

/**
 * Retrieves the duplicate detection threshold from risk_rules_config (default 0.85 = 85%)
 */
async function getDuplicateThreshold(): Promise<number> {
  let threshold = 0.85;

  try {
    const res = await pool.query(
      `SELECT threshold FROM risk_rules_config WHERE rule_code = 'DUPLICATE_INVOICE' AND is_active = TRUE`
    );
    if (res.rows.length > 0) {
      const val = parseFloat(res.rows[0].threshold);
      if (!isNaN(val)) {
        threshold = val > 1 ? val / 100 : val;
      }
    }
  } catch (err) {
    console.warn('Could not read threshold from risk_rules_config, using default 0.85:', err);
  }

  return threshold;
}

/**
 * Duplicate Invoice Detection Engine:
 * Compares target invoice against all existing invoices using:
 * - Normalized invoice number (strips spaces, dashes, underscores)
 * - Same supplier
 * - Exact or near total amount
 * - IRN match (e-invoice hash)
 * - Date proximity (within 30 days)
 * - Line item similarity
 *
 * Golden Rule: Never auto-rejects; flags 'POSSIBLE DUPLICATE' for human review.
 */
export async function detectDuplicates(
  invoiceId: string,
  actorId?: string
): Promise<DuplicateDetectionResult> {
  // 1. Fetch Target Invoice
  const targetRes = await pool.query(
    `SELECT inv.*, s.name AS supplier_name 
     FROM invoices inv 
     LEFT JOIN suppliers s ON inv.supplier_id = s.id 
     WHERE inv.id = $1 OR inv.invoice_number = $1`,
    [invoiceId]
  );

  if (targetRes.rows.length === 0) {
    throw new Error(`Target invoice '${invoiceId}' not found.`);
  }

  const target = targetRes.rows[0];
  const targetId = target.id;
  const targetNorm = target.normalized_invoice_number || normalizeInvoiceNumber(target.invoice_number);
  const targetTotal = parseFloat(target.total) || 0;
  const targetDate = target.invoice_date ? new Date(target.invoice_date) : null;
  const targetIrn = target.irn ? target.irn.trim().toLowerCase() : null;

  // Fetch target line items
  const targetLinesRes = await pool.query(
    `SELECT * FROM invoice_lines WHERE invoice_id = $1`,
    [targetId]
  );
  const targetLines = targetLinesRes.rows;

  // 2. Fetch all other candidate invoices
  const candidatesRes = await pool.query(
    `SELECT inv.*, s.name AS supplier_name 
     FROM invoices inv 
     LEFT JOIN suppliers s ON inv.supplier_id = s.id 
     WHERE inv.id != $1`,
    [targetId]
  );
  const candidates = candidatesRes.rows;

  const threshold = await getDuplicateThreshold();
  const matchedDuplicates: DuplicateMatch[] = [];

  for (const cand of candidates) {
    let score = 0.0;
    const reasons: string[] = [];
    const candNorm = cand.normalized_invoice_number || normalizeInvoiceNumber(cand.invoice_number);
    const candTotal = parseFloat(cand.total) || 0;
    const candDate = cand.invoice_date ? new Date(cand.invoice_date) : null;
    const candIrn = cand.irn ? cand.irn.trim().toLowerCase() : null;

    // Check A: Identical e-Invoice IRN (Cryptographic proof of duplicate)
    let isIrnMatch = false;
    if (targetIrn && candIrn && targetIrn === candIrn) {
      isIrnMatch = true;
      score += 0.40;
      reasons.push(`Identical government e-invoice IRN: ${targetIrn}`);
    }

    // Check B: Normalized Invoice Number (35% weight)
    if (candNorm && targetNorm && candNorm === targetNorm) {
      score += 0.35;
      reasons.push(
        `Identical normalized invoice number: "${cand.invoice_number}" vs "${target.invoice_number}" (${targetNorm})`
      );
    }

    // Check C: Same Supplier (35% weight)
    if (cand.supplier_id && target.supplier_id && cand.supplier_id === target.supplier_id) {
      score += 0.35;
      reasons.push(`Same supplier: ${cand.supplier_name || cand.supplier_id}`);
    }

    // Check D: Total Amount Match (15% weight)
    if (targetTotal > 0 && candTotal > 0) {
      const diff = Math.abs(candTotal - targetTotal);
      if (diff < 0.01) {
        score += 0.15;
        reasons.push(`Identical invoice total: Rs ${targetTotal.toFixed(2)}`);
      } else if (diff / targetTotal <= 0.02) {
        score += 0.10;
        reasons.push(
          `Near invoice total match (within 2%): Rs ${candTotal.toFixed(2)} vs Rs ${targetTotal.toFixed(2)}`
        );
      }
    }

    // Check E: Invoice Date Proximity (10% weight)
    if (targetDate && candDate && !isNaN(targetDate.getTime()) && !isNaN(candDate.getTime())) {
      const daysDiff = Math.abs((targetDate.getTime() - candDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 3) {
        score += 0.10;
        reasons.push(`Invoice dates within ${Math.round(daysDiff)} days (${target.invoice_date} vs ${cand.invoice_date})`);
      } else if (daysDiff <= 30) {
        score += 0.05;
        reasons.push(`Invoice dates within ${Math.round(daysDiff)} days (${target.invoice_date} vs ${cand.invoice_date})`);
      }
    }

    // Check F: Line Items Similarity (5% weight)
    if (targetLines.length > 0) {
      const candLinesRes = await pool.query(
        `SELECT * FROM invoice_lines WHERE invoice_id = $1`,
        [cand.id]
      );
      const candLines = candLinesRes.rows;

      let hasMatchingLine = false;
      for (const tLine of targetLines) {
        const match = candLines.find((cLine: any) =>
          (cLine.item_name && tLine.item_name && cLine.item_name.toLowerCase().trim() === tLine.item_name.toLowerCase().trim()) &&
          Math.abs(parseFloat(cLine.quantity) - parseFloat(tLine.quantity)) < 0.01
        );
        if (match) {
          hasMatchingLine = true;
          break;
        }
      }

      if (hasMatchingLine) {
        score += 0.05;
        reasons.push('Matching line item descriptions and quantities');
      }
    }

    // If IRN matched, score is at least 1.0 (capped at 1.0)
    if (isIrnMatch) {
      score = 1.0;
    }

    // Cap and round score to 2 decimal places
    const finalScore = Math.min(1.0, Math.round(score * 100) / 100);

    // If similarity meets or exceeds 0.50, track it as candidate
    if (finalScore >= 0.50) {
      matchedDuplicates.push({
        invoice_id: cand.id,
        invoice_number: cand.invoice_number,
        normalized_invoice_number: candNorm,
        supplier_id: cand.supplier_id,
        supplier_name: cand.supplier_name,
        invoice_date: cand.invoice_date,
        total: candTotal,
        similarity_score: finalScore,
        reasons,
        created_at: cand.created_at
      });
    }
  }

  // Sort by highest similarity descending
  matchedDuplicates.sort((a, b) => b.similarity_score - a.similarity_score);

  const highestSimilarity = matchedDuplicates.length > 0 ? matchedDuplicates[0].similarity_score : 0;
  const isPossibleDuplicate = highestSimilarity >= threshold;

  // Persist duplicate stats to target invoice
  try {
    const reasonsToStore = matchedDuplicates.length > 0 ? matchedDuplicates[0].reasons : [];
    await pool.query(
      `UPDATE invoices 
       SET duplicate_similarity = $1,
           duplicate_reasons = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        highestSimilarity,
        JSON.stringify(reasonsToStore),
        targetId
      ]
    );

    // If possible duplicate detected, log in hash-chained audit log
    if (isPossibleDuplicate && actorId) {
      await writeAuditLog(
        actorId,
        'DUPLICATE_FLAGGED',
        'INVOICE',
        targetId,
        {
          target_invoice_number: target.invoice_number,
          matched_invoice: matchedDuplicates[0].invoice_number,
          similarity_score: highestSimilarity,
          reasons: matchedDuplicates[0].reasons
        }
      );
    }
  } catch (err) {
    console.warn('Failed to update duplicate fields on invoice:', err);
  }

  return {
    target_invoice_id: targetId,
    target_invoice_number: target.invoice_number,
    is_possible_duplicate: isPossibleDuplicate,
    highest_similarity: highestSimilarity,
    threshold,
    duplicates: matchedDuplicates
  };
}

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import {
  processInvoiceExtraction,
  persistInvoiceRecord,
  normalizeInvoiceNumber
} from '../services/extractionService';
import { writeAuditLog } from '../services/auditService';
import { matchInvoice, getMatchResult } from '../services/matchingService';
import { detectDuplicates } from '../services/duplicateService';
import { checkInvoiceGst } from '../services/gstService';
import { evaluateInvoiceRisk } from '../services/riskService';
import { syncInvoiceInvestigations } from '../services/investigationService';

const router = Router();

// Ensure upload directory exists
const uploadDir = path.resolve(__dirname, '../../../uploads/invoices');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage and file filter configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `invoice-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only PDF, PNG, and JPEG documents are permitted.'));
    }
  }
});

/**
 * POST /api/invoices/upload
 * AP Employee only: Uploads invoice, extracts text via direct PDF/OCR, parses fields via LLM/Fallback,
 * determines confidence scores, and sets status to NEEDS_VERIFICATION or EXTRACTED.
 */
router.post(
  '/upload',
  authenticate,
  requireRole('AP Employee', 'Admin'),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({
        status: 'error',
        statusCode: 400,
        message: 'Invoice file is required. Supported formats: PDF, PNG, JPG (max 10MB).'
      });
      return;
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    const originalName = req.file.originalname;

    try {
      // 1. Log file receipt in audit log
      await writeAuditLog(
        req.user!.id,
        'INVOICE_UPLOADED',
        'FILE',
        req.file.filename,
        {
          originalName,
          mimeType,
          sizeBytes: req.file.size
        }
      );

      // 2. Execute extraction pipeline (Direct PDF text -> OCR -> LLM / Fallback pattern parser)
      const extractedData = await processInvoiceExtraction(filePath, mimeType);

      // 3. Persist record into PostgreSQL database
      const savedInvoice = await persistInvoiceRecord(extractedData, filePath, req.user!.id);

      res.status(201).json({
        status: 'ok',
        message: 'Invoice processed successfully',
        invoice: {
          id: savedInvoice.id,
          invoice_number: savedInvoice.invoice_number,
          normalized_invoice_number: savedInvoice.normalized_invoice_number,
          supplier_id: savedInvoice.supplier_id,
          po_id: savedInvoice.po_id,
          invoice_date: savedInvoice.invoice_date,
          subtotal: savedInvoice.subtotal,
          cgst: savedInvoice.cgst,
          sgst: savedInvoice.sgst,
          igst: savedInvoice.igst,
          total: savedInvoice.total,
          status: savedInvoice.status,
          extraction_source: savedInvoice.extraction_source,
          extraction_confidence: savedInvoice.extraction_confidence,
          file_name: req.file.filename,
          flags: extractedData.flags
        }
      });
    } catch (err: any) {
      console.error('Invoice upload and extraction failed:', err);
      res.status(500).json({
        status: 'error',
        statusCode: 500,
        message: `Invoice extraction failed: ${err.message || 'Processing error'}`
      });
    }
  }
);

/**
 * GET /api/invoices
 * Lists all invoices with supplier details and extraction status
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const conditions: string[] = [];
    const values: any[] = [];

    if (status) {
      conditions.push(`inv.status = $1`);
      values.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        inv.id,
        inv.invoice_number,
        inv.normalized_invoice_number,
        inv.irn,
        inv.supplier_id,
        s.name AS supplier_name,
        s.gstin AS supplier_gstin,
        inv.po_id,
        po.po_number,
        inv.invoice_date,
        inv.subtotal,
        inv.cgst,
        inv.sgst,
        inv.igst,
        inv.total,
        inv.status,
        inv.extraction_source,
        inv.extraction_confidence,
        inv.verified_by,
        u_ver.name AS verified_by_name,
        inv.verified_at,
        inv.risk_score,
        inv.risk_level,
        inv.itc_at_risk,
        inv.gst_check_result,
        inv.created_at
      FROM invoices inv
      LEFT JOIN suppliers s ON inv.supplier_id = s.id
      LEFT JOIN purchase_orders po ON inv.po_id = po.id
      LEFT JOIN users u_ver ON inv.verified_by = u_ver.id
      ${whereClause}
      ORDER BY inv.created_at DESC
    `;

    const result = await pool.query(query, values);

    res.status(200).json({
      status: 'ok',
      count: result.rows.length,
      invoices: result.rows
    });
  } catch (err: any) {
    console.error('Error in GET /api/invoices:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to retrieve invoices.'
    });
  }
});

/**
 * GET /api/invoices/:id
 * Retrieves comprehensive invoice details, line items, and original extracted data
 */
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const invRes = await pool.query(
      `SELECT 
        inv.*,
        s.name AS supplier_name,
        s.gstin AS supplier_gstin,
        s.bank_identifier AS supplier_bank_identifier,
        po.po_number,
        u_ver.name AS verified_by_name
       FROM invoices inv
       LEFT JOIN suppliers s ON inv.supplier_id = s.id
       LEFT JOIN purchase_orders po ON inv.po_id = po.id
       LEFT JOIN users u_ver ON inv.verified_by = u_ver.id
       WHERE inv.id = $1 OR inv.invoice_number = $1`,
      [id]
    );

    if (invRes.rows.length === 0) {
      res.status(404).json({
        status: 'error',
        statusCode: 404,
        message: 'Invoice not found.'
      });
      return;
    }

    const invoice = invRes.rows[0];

    const linesRes = await pool.query(
      'SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY id ASC',
      [invoice.id]
    );

    const matchResult = await getMatchResult(invoice.id);
    const duplicateInfo = await detectDuplicates(invoice.id);

    res.status(200).json({
      status: 'ok',
      invoice: {
        ...invoice,
        line_items: linesRes.rows,
        match_result: matchResult,
        duplicate_info: duplicateInfo
      }
    });
  } catch (err: any) {
    console.error('Error in GET /api/invoices/:id:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to retrieve invoice details.'
    });
  }
});

/**
 * GET /api/invoices/:id/file
 * Serves the original document file for the split-screen verification viewer
 */
router.get('/:id/file', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const resInv = await pool.query('SELECT file_path, invoice_number FROM invoices WHERE id = $1 OR invoice_number = $1', [id]);
    if (resInv.rows.length === 0 || !resInv.rows[0].file_path) {
      res.status(404).json({ status: 'error', message: 'Invoice file not found' });
      return;
    }

    const storedPath = resInv.rows[0].file_path;
    let resolvedPath = path.isAbsolute(storedPath)
      ? storedPath
      : path.resolve(__dirname, '../../..', storedPath.replace(/^\//, ''));

    // Check if file exists, or check in sample-data
    if (!fs.existsSync(resolvedPath)) {
      const sampleFallback = path.resolve(__dirname, '../../../sample-data/invoices', `${resInv.rows[0].invoice_number}.pdf`);
      if (fs.existsSync(sampleFallback)) {
        resolvedPath = sampleFallback;
      } else {
        res.status(404).json({ status: 'error', message: 'Document file missing on disk.' });
        return;
      }
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolvedPath)}"`);
    fs.createReadStream(resolvedPath).pipe(res);
  } catch (err: any) {
    console.error('Error serving invoice file:', err);
    res.status(500).json({ status: 'error', message: 'Could not stream invoice file.' });
  }
});

/**
 * PUT /api/invoices/:id/verify
 * AP Employee only: Confirms human verification of invoice fields.
 * Stores who verified, when, keeps original extracted values, records diff in hash-chained audit log,
 * and updates status to VERIFIED.
 */
router.put(
  '/:id/verify',
  authenticate,
  requireRole('AP Employee', 'Admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const {
      invoice_number,
      invoice_date,
      supplier_gstin,
      po_reference,
      subtotal,
      cgst,
      sgst,
      igst,
      total,
      line_items,
      notes
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingRes = await client.query(
        'SELECT * FROM invoices WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (existingRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({
          status: 'error',
          statusCode: 404,
          message: 'Invoice not found.'
        });
        return;
      }

      const existing = existingRes.rows[0];

      // Resolve supplier if gstin was changed
      let supplierId = existing.supplier_id;
      if (supplier_gstin) {
        const supRes = await client.query('SELECT id FROM suppliers WHERE gstin = $1 LIMIT 1', [supplier_gstin]);
        if (supRes.rows.length > 0) {
          supplierId = supRes.rows[0].id;
        }
      }

      // Resolve PO if po_reference provided
      let poId = existing.po_id;
      if (po_reference) {
        const poRes = await client.query('SELECT id FROM purchase_orders WHERE po_number = $1 LIMIT 1', [po_reference]);
        if (poRes.rows.length > 0) {
          poId = poRes.rows[0].id;
        }
      }

      const updatedInvNum = invoice_number || existing.invoice_number;
      const normalizedInvNum = normalizeInvoiceNumber(updatedInvNum);

      // Compute diff between original extraction and corrected values
      const originalValues = {
        invoice_number: existing.invoice_number,
        invoice_date: existing.invoice_date,
        subtotal: existing.subtotal,
        cgst: existing.cgst,
        sgst: existing.sgst,
        igst: existing.igst,
        total: existing.total,
        status: existing.status
      };

      const correctedValues = {
        invoice_number: updatedInvNum,
        invoice_date: invoice_date || existing.invoice_date,
        subtotal: subtotal !== undefined ? Number(subtotal) : existing.subtotal,
        cgst: cgst !== undefined ? Number(cgst) : existing.cgst,
        sgst: sgst !== undefined ? Number(sgst) : existing.sgst,
        igst: igst !== undefined ? Number(igst) : existing.igst,
        total: total !== undefined ? Number(total) : existing.total,
        status: 'VERIFIED'
      };

      const diff: Record<string, { before: any; after: any }> = {};
      for (const key of Object.keys(correctedValues) as (keyof typeof correctedValues)[]) {
        if (String(originalValues[key]) !== String(correctedValues[key])) {
          diff[key] = {
            before: originalValues[key],
            after: correctedValues[key]
          };
        }
      }

      // Update invoice record
      const updateRes = await client.query(
        `UPDATE invoices 
         SET invoice_number = $1,
             normalized_invoice_number = $2,
             supplier_id = $3,
             po_id = $4,
             invoice_date = $5,
             subtotal = $6,
             cgst = $7,
             sgst = $8,
             igst = $9,
             total = $10,
             status = 'VERIFIED',
             verified_by = $11,
             verified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $12
         RETURNING *;`,
        [
          updatedInvNum,
          normalizedInvNum,
          supplierId,
          poId,
          correctedValues.invoice_date,
          correctedValues.subtotal,
          correctedValues.cgst,
          correctedValues.sgst,
          correctedValues.igst,
          correctedValues.total,
          req.user!.id,
          id
        ]
      );

      // Optionally update line items if provided
      if (Array.isArray(line_items) && line_items.length > 0) {
        await client.query('DELETE FROM invoice_lines WHERE invoice_id = $1', [id]);
        for (const item of line_items) {
          await client.query(
            `INSERT INTO invoice_lines (invoice_id, item_name, quantity, unit_price, total_price, tax_rate)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              item.item_name || item.description,
              item.quantity,
              item.unit_price,
              item.total_price || (item.quantity * item.unit_price),
              item.tax_rate || 18.00
            ]
          );
        }
      }

      // Write verification and field diff to hash-chained audit log
      await writeAuditLog(
        req.user!.id,
        'INVOICE_VERIFIED',
        'INVOICE',
        id,
        {
          invoice_number: updatedInvNum,
          verified_by: req.user!.name,
          diff,
          notes: notes || 'Verified and confirmed by AP Employee'
        }
      );

      await client.query('COMMIT');

      // Auto-run full pipeline after verification: match -> duplicate -> GST -> PO change -> overbilling -> risk score
      let autoMatchResult = null;
      let autoGstResult = null;
      let autoRiskAssessment = null;
      let finalInvoice = updateRes.rows[0];
      try {
        autoMatchResult = await matchInvoice(id, req.user!.id);
        await detectDuplicates(id, req.user!.id);
        autoGstResult = await checkInvoiceGst(id, req.user!.id);
        autoRiskAssessment = await evaluateInvoiceRisk(id, req.user!.id);
        await syncInvoiceInvestigations(id, req.user!.id);
        const refetch = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
        if (refetch.rows.length > 0) {
          finalInvoice = refetch.rows[0];
        }
      } catch (pipelineErr) {
        console.warn('Auto pipeline execution error on verify:', pipelineErr);
      }

      res.status(200).json({
        status: 'ok',
        message: 'Invoice verified successfully.',
        invoice: finalInvoice,
        diff,
        match_result: autoMatchResult,
        gst_check: autoGstResult,
        risk_assessment: autoRiskAssessment
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error verifying invoice:', err);
      res.status(500).json({
        status: 'error',
        statusCode: 500,
        message: `Failed to verify invoice: ${err.message}`
      });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/invoices/:id/match
 * Manually triggers 3-way matching engine for an invoice (PO vs GRN vs Invoice)
 * AP Employee, Finance Manager, Admin
 */
router.post(
  '/:id/match',
  authenticate,
  requireRole('AP Employee', 'Finance Manager', 'Admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const matchResult = await matchInvoice(id, req.user!.id);
      let gstCheck = null;
      let riskAssessment = null;
      try {
        gstCheck = await checkInvoiceGst(id, req.user!.id);
        riskAssessment = await evaluateInvoiceRisk(id, req.user!.id);
        await syncInvoiceInvestigations(id, req.user!.id);
      } catch (postMatchErr) {
        console.warn('Auto GST & risk check post match error:', postMatchErr);
      }

      res.status(200).json({
        status: 'ok',
        message: `3-Way Matching completed with status: ${matchResult.status}`,
        match_result: matchResult,
        gst_check: gstCheck,
        risk_assessment: riskAssessment
      });
    } catch (err: any) {
      console.error('3-Way matching execution failed:', err);
      res.status(500).json({
        status: 'error',
        statusCode: 500,
        message: `3-Way matching failed: ${err.message || 'Execution error'}`
      });
    }
  }
);

/**
 * GET /api/invoices/:id/gst-check
 * Evaluates GSTIN format/checksum, tax calculation, GSTR-2B presence and ITC at risk
 */
router.get('/:id/gst-check', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const result = await checkInvoiceGst(id, req.user?.id);
    res.status(200).json({
      status: 'ok',
      ...result
    });
  } catch (err: any) {
    console.error('GST check failed:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: `GST check failed: ${err.message || 'Execution error'}`
    });
  }
});

/**
 * GET /api/invoices/:id/risk
 * Returns explainable 0-100 risk score, priority level, and detailed reasons list
 */
router.get('/:id/risk', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const assessment = await evaluateInvoiceRisk(id, req.user?.id);
    res.status(200).json({
      status: 'ok',
      assessment
    });
  } catch (err: any) {
    console.error('Invoice risk assessment failed:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: `Risk evaluation failed: ${err.message || 'Execution error'}`
    });
  }
});

/**
 * GET /api/invoices/:id/match-result
 * Retrieves the latest 3-way matching result and compared values
 */
router.get(
  '/:id/match-result',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const matchResult = await getMatchResult(id);

      if (!matchResult) {
        res.status(200).json({
          status: 'ok',
          match_result: null,
          message: 'Invoice has not been matched yet. Run POST /api/invoices/:id/match to execute matching.'
        });
        return;
      }

      res.status(200).json({
        status: 'ok',
        match_result: matchResult
      });
    } catch (err: any) {
      console.error('Failed to retrieve match result:', err);
      res.status(500).json({
        status: 'error',
        statusCode: 500,
        message: 'Failed to retrieve match result.'
      });
    }
  }
);

/**
 * GET /api/invoices/:id/duplicates
 * Evaluates duplicate similarity across invoices based on normalized number, supplier, amount, IRN, date
 */
router.get(
  '/:id/duplicates',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const result = await detectDuplicates(id, req.user!.id);

      res.status(200).json({
        status: 'ok',
        ...result
      });
    } catch (err: any) {
      console.error('Duplicate detection failed:', err);
      res.status(500).json({
        status: 'error',
        statusCode: 500,
        message: `Duplicate detection failed: ${err.message || 'Execution error'}`
      });
    }
  }
);

/**
 * POST /api/invoices/:id/approve-payment
 * Final human payment approval by Finance Manager only.
 * Golden Rule 2: AI NEVER releases payment. Final payment approval is strictly a human action.
 * Golden Rule: Admin must NOT be able to approve payments.
 * Maker-checker: Requester who created related PO change or uploaded invoice cannot approve payment.
 * Gate: Invoice must be ELIGIBLE_FOR_APPROVAL (all investigations must be REVALIDATED and matching passed).
 * Multi-level approval: High-risk invoices require two distinct Finance approvers.
 */
router.post(
  '/:id/approve-payment',
  authenticate,
  requireRole('Finance Manager'),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { notes } = req.body;
    const actor = req.user!;

    try {
      const invRes = await pool.query('SELECT * FROM invoices WHERE id = $1 OR invoice_number = $1', [id]);
      if (invRes.rows.length === 0) {
        res.status(404).json({ status: 'error', message: `Invoice '${id}' not found.` });
        return;
      }
      const invoice = invRes.rows[0];

      // 1. Maker-Checker check: approver cannot be the same user who created the related PO change or uploaded invoice
      if (invoice.uploaded_by && invoice.uploaded_by === actor.id) {
        res.status(403).json({
          status: 'error',
          message: 'Maker-checker violation: User who uploaded this invoice cannot approve its payment.'
        });
        return;
      }

      if (invoice.po_id) {
        const changesRes = await pool.query(
          'SELECT changed_by FROM po_change_history WHERE po_id = $1',
          [invoice.po_id]
        );
        const hasSelfModified = changesRes.rows.some((r: any) => r.changed_by === actor.id);
        if (hasSelfModified) {
          res.status(403).json({
            status: 'error',
            message: 'Maker-checker violation: User who modified the Purchase Order cannot approve payment for this invoice.'
          });
          return;
        }
      }

      // 2. Gate check: Check that all investigations for this invoice are REVALIDATED
      const invsRes = await pool.query('SELECT * FROM investigations WHERE invoice_id = $1', [invoice.id]);
      const pendingInvs = invsRes.rows.filter((inv: any) => inv.status !== 'REVALIDATED');
      if (pendingInvs.length > 0) {
        res.status(400).json({
          status: 'error',
          message: `Cannot approve payment: Invoice has ${pendingInvs.length} unresolved or un-revalidated investigation(s). All investigations must be REVALIDATED before payment release.`,
          pending_investigations: pendingInvs.map((p: any) => ({
            issue_type: p.issue_type,
            department: p.department,
            status: p.status
          }))
        });
        return;
      }

      // 3. Multi-level approval for High-Risk invoices
      const isHighRisk = invoice.risk_level === 'HIGH' || (invoice.risk_score && invoice.risk_score >= 70);

      if (isHighRisk) {
        if (!invoice.approved_by) {
          // First-level approval
          await pool.query(
            `UPDATE invoices 
             SET payment_status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, payment_approval_notes = $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            ['PENDING_SECOND_APPROVAL', actor.id, notes || 'First-level approval granted', invoice.id]
          );

          await writeAuditLog(actor.id, 'PAYMENT_FIRST_APPROVAL', 'INVOICE', invoice.id, {
            invoice_number: invoice.invoice_number,
            approver: actor.name,
            notes
          });

          res.status(200).json({
            status: 'ok',
            message: 'First-level approval granted. High-risk invoice requires second independent Finance approval.',
            payment_status: 'PENDING_SECOND_APPROVAL',
            requires_second_approver: true
          });
          return;
        } else {
          // Second-level approval check
          if (invoice.approved_by === actor.id) {
            res.status(403).json({
              status: 'error',
              message: 'Multi-level approval violation: Second approver must be a different Finance Manager.'
            });
            return;
          }

          // Final approval
          await pool.query(
            `UPDATE invoices 
             SET payment_status = $1, second_approved_by = $2, status = $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            ['APPROVED', actor.id, 'APPROVED', invoice.id]
          );

          await writeAuditLog(actor.id, 'PAYMENT_FINAL_APPROVED', 'INVOICE', invoice.id, {
            invoice_number: invoice.invoice_number,
            first_approver_id: invoice.approved_by,
            second_approver: actor.name,
            notes
          });

          res.status(200).json({
            status: 'ok',
            message: 'Final payment approval authorized. Payment released.',
            payment_status: 'APPROVED'
          });
          return;
        }
      }

      // Non-high-risk: Single approval
      await pool.query(
        `UPDATE invoices 
         SET payment_status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, status = $3, payment_approval_notes = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        ['APPROVED', actor.id, 'APPROVED', notes || 'Payment approved', invoice.id]
      );

      await writeAuditLog(actor.id, 'PAYMENT_APPROVED', 'INVOICE', invoice.id, {
        invoice_number: invoice.invoice_number,
        approver: actor.name,
        notes
      });

      res.status(200).json({
        status: 'ok',
        message: 'Payment approval authorized. Payment released.',
        payment_status: 'APPROVED'
      });
    } catch (err: any) {
      console.error('Payment approval error:', err);
      res.status(500).json({ status: 'error', message: err.message || 'Payment approval failed' });
    }
  }
);

export default router;

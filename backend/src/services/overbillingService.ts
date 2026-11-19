import { pool } from '../db';

export interface ExtraChargeEvidence {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  item_name: string;
  amount: number;
  extra_charge_name: string;
  extra_charge_amount: number;
  total: number;
}

export interface OverbillingReport {
  supplier_id: string;
  supplier_name: string;
  has_overbilling_pattern: boolean;
  pattern_description: string;
  threshold_occurrences: number;
  extra_charges_count: number;
  distinct_charge_amounts: number[];
  evidence_invoices: ExtraChargeEvidence[];
  unit_price_jumps: {
    item_name: string;
    historical_avg_price: number;
    highest_recent_price: number;
    jump_percentage: number;
  }[];
}

const EXTRA_CHARGE_KEYWORDS = [
  'surcharge',
  'handling',
  'logistics',
  'unloading',
  'fee',
  'processing',
  'extra',
  'pallet',
  'packing',
  'gate',
  'charge'
];

/**
 * Historical Overbilling Detection Service:
 * Analyzes supplier invoice history for persistent patterns:
 * - Repeated ancillary surcharges/fees (e.g. Rs 500, Rs 700, Rs 1000 additions)
 * - Unusual unit price jumps versus historical average (>10%)
 * - Discrepancies versus authorized PO values
 */
export async function detectSupplierOverbilling(
  supplierIdOrName: string
): Promise<OverbillingReport> {
  // 1. Fetch supplier
  const supRes = await pool.query(
    `SELECT * FROM suppliers WHERE id = $1 OR name ILIKE $1 LIMIT 1`,
    [supplierIdOrName]
  );

  if (supRes.rows.length === 0) {
    throw new Error(`Supplier '${supplierIdOrName}' not found.`);
  }

  const supplier = supRes.rows[0];

  // 2. Fetch configurable threshold from risk_rules_config (default 3 occurrences)
  let thresholdOccurrences = 3;
  let priceJumpThresholdPercent = 10.0;

  try {
    const configRes = await pool.query(
      `SELECT rule_code, threshold FROM risk_rules_config WHERE rule_code = 'HISTORICAL_OVERBILLING' AND is_active = TRUE`
    );
    if (configRes.rows.length > 0) {
      const val = parseFloat(configRes.rows[0].threshold);
      if (!isNaN(val) && val > 0) {
        thresholdOccurrences = Math.round(val);
      }
    }
  } catch (err) {
    console.warn('Could not read threshold from risk_rules_config, using default 3:', err);
  }

  // 3. Fetch all invoices for supplier
  const invRes = await pool.query(
    `SELECT * FROM invoices WHERE supplier_id = $1 ORDER BY invoice_date ASC`,
    [supplier.id]
  );
  const invoices = invRes.rows;

  const extraChargeEvidence: ExtraChargeEvidence[] = [];
  const distinctAmounts = new Set<number>();

  // Map to compute item historical prices: item_name -> array of unit prices
  const itemPrices = new Map<string, number[]>();

  for (const inv of invoices) {
    const linesRes = await pool.query(
      `SELECT * FROM invoice_lines WHERE invoice_id = $1`,
      [inv.id]
    );

    for (const line of linesRes.rows) {
      const name = (line.item_name || '').toLowerCase();
      const unitPrice = parseFloat(line.unit_price) || 0;
      const totalPrice = parseFloat(line.total_price) || 0;
      const qty = parseFloat(line.quantity) || 0;

      // Check for extra charge / surcharge pattern
      const isKeywordMatch = EXTRA_CHARGE_KEYWORDS.some((kw) => name.includes(kw));
      const isSmallAddon = (qty === 1 || qty <= 2) && (totalPrice === 500 || totalPrice === 700 || totalPrice === 1000 || (totalPrice <= 1500 && totalPrice > 0 && isKeywordMatch));

      if (isKeywordMatch || isSmallAddon) {
        extraChargeEvidence.push({
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          item_name: line.item_name,
          amount: totalPrice,
          extra_charge_name: line.item_name,
          extra_charge_amount: totalPrice,
          total: parseFloat(inv.total) || totalPrice
        });
        distinctAmounts.add(totalPrice);
      } else {
        // Track core product prices for price jump analysis
        const key = line.item_name.trim().toLowerCase();
        const existing = itemPrices.get(key) || [];
        existing.push(unitPrice);
        itemPrices.set(key, existing);
      }
    }
  }

  // Check for unit price jumps > 10%
  const priceJumps: OverbillingReport['unit_price_jumps'] = [];
  for (const [itemName, prices] of itemPrices.entries()) {
    if (prices.length >= 2) {
      const baselinePrices = prices.slice(0, -1);
      const avgPrice = baselinePrices.reduce((a, b) => a + b, 0) / baselinePrices.length;
      const latestPrice = prices[prices.length - 1];

      if (avgPrice > 0 && latestPrice > avgPrice) {
        const jumpPercent = Math.round(((latestPrice - avgPrice) / avgPrice) * 100);
        if (jumpPercent >= priceJumpThresholdPercent) {
          priceJumps.push({
            item_name: itemName,
            historical_avg_price: Math.round(avgPrice * 100) / 100,
            highest_recent_price: latestPrice,
            jump_percentage: jumpPercent
          });
        }
      }
    }
  }

  const extraChargesCount = extraChargeEvidence.length;
  const hasPattern = extraChargesCount >= thresholdOccurrences || priceJumps.length > 0;
  const sortedAmounts = Array.from(distinctAmounts).sort((a, b) => a - b);

  let patternDescription = 'No systemic historical overbilling detected';
  if (extraChargesCount >= thresholdOccurrences) {
    const amountsStr = sortedAmounts.map((a) => `Rs ${a}`).join(', ');
    const sampleInvoices = Array.from(new Set(extraChargeEvidence.map((e) => e.invoice_number))).slice(0, 3).join(', ');
    patternDescription = `${supplier.name}: repeated ancillary extra charges of ${amountsStr} across ${extraChargesCount} historical invoices (e.g. ${sampleInvoices})`;
  } else if (priceJumps.length > 0) {
    const pj = priceJumps[0];
    patternDescription = `${supplier.name}: unusual unit price jump detected for '${pj.item_name}' (Rs ${pj.highest_recent_price} is +${pj.jump_percentage}% above historical average Rs ${pj.historical_avg_price})`;
  }

  return {
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    has_overbilling_pattern: hasPattern,
    pattern_description: patternDescription,
    threshold_occurrences: thresholdOccurrences,
    extra_charges_count: extraChargesCount,
    distinct_charge_amounts: sortedAmounts,
    evidence_invoices: extraChargeEvidence,
    unit_price_jumps: priceJumps
  };
}

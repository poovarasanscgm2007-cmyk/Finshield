import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { authenticate } from '../middleware/auth';
import { detectSupplierOverbilling } from '../services/overbillingService';
import { evaluateSupplierRisk } from '../services/riskService';
import { getSupplierGraph, requestSupplierBankChange } from '../services/supplierGraphService';
import { computeSupplierScorecard, getAllSupplierScorecards } from '../services/supplierScorecardService';

const router = Router();

/**
 * GET /api/suppliers/graph
 * Builds relational nodes and edges across suppliers (bank, address, phone, PAN).
 * Wording: "Relationship requires verification", NOT proof of fraud.
 * Auto-raises SHARED_BANK investigation & risk flag without duplicates.
 */
router.get('/graph', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const graphData = await getSupplierGraph();
    res.status(200).json({
      status: 'ok',
      ...graphData
    });
  } catch (err: any) {
    console.error('Error generating supplier relationship graph:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: `Failed to build supplier relationship graph: ${err.message || 'Execution error'}`
    });
  }
});

/**
 * GET /api/suppliers/scorecards
 * Computes transparent empirical performance scorecards for all suppliers
 */
router.get('/scorecards', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const scorecards = await getAllSupplierScorecards();
    res.status(200).json({
      status: 'ok',
      count: scorecards.length,
      scorecards
    });
  } catch (err: any) {
    console.error('Error retrieving supplier scorecards:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: `Failed to retrieve supplier scorecards: ${err.message || 'Execution error'}`
    });
  }
});

/**
 * GET /api/suppliers
 * List all suppliers with risk scores, GST filing status, and bank details
 */
router.get('/', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.gstin,
        s.pan,
        s.bank_identifier,
        s.address,
        s.phone,
        s.gst_filing_status,
        s.risk_score,
        s.risk_level,
        s.created_at,
        COUNT(inv.id) AS total_invoices_count
      FROM suppliers s
      LEFT JOIN invoices inv ON s.id = inv.supplier_id
      GROUP BY s.id, s.name, s.gstin, s.pan, s.bank_identifier, s.address, s.phone, s.gst_filing_status, s.risk_score, s.risk_level, s.created_at
      ORDER BY s.risk_score DESC NULLS LAST, s.name ASC
    `);

    res.status(200).json({
      status: 'ok',
      count: result.rows.length,
      suppliers: result.rows
    });
  } catch (err: any) {
    console.error('Error fetching suppliers:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to retrieve suppliers.'
    });
  }
});

/**
 * GET /api/suppliers/:id
 * Retrieve a single supplier by ID
 */
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM suppliers WHERE id = $1 OR gstin = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        status: 'error',
        statusCode: 404,
        message: 'Supplier not found.'
      });
      return;
    }

    res.status(200).json({
      status: 'ok',
      supplier: result.rows[0]
    });
  } catch (err: any) {
    console.error('Error fetching supplier details:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to retrieve supplier details.'
    });
  }
});

/**
 * GET /api/suppliers/:id/overbilling
 * Analyzes past invoices for repeated ancillary extra charges and abnormal price jumps
 */
router.get('/:id/overbilling', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const report = await detectSupplierOverbilling(id);

    res.status(200).json({
      status: 'ok',
      ...report
    });
  } catch (err: any) {
    const isNotFound = err.message?.includes('not found');
    const statusCode = isNotFound ? 404 : 500;
    if (!isNotFound) console.error('Error analyzing supplier overbilling:', err);
    res.status(statusCode).json({
      status: 'error',
      statusCode,
      message: err.message || 'Failed to analyze supplier overbilling.'
    });
  }
});

/**
 * GET /api/suppliers/:id/risk
 * Evaluates explainable composite risk score for the supplier
 */
router.get('/:id/risk', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const assessment = await evaluateSupplierRisk(id, req.user?.id);

    res.status(200).json({
      status: 'ok',
      assessment
    });
  } catch (err: any) {
    const isNotFound = err.message?.includes('not found');
    const statusCode = isNotFound ? 404 : 500;
    if (!isNotFound) console.error('Error evaluating supplier risk:', err);
    res.status(statusCode).json({
      status: 'error',
      statusCode,
      message: err.message || 'Failed to evaluate supplier risk.'
    });
  }
});

/**
 * GET /api/suppliers/:id/scorecard
 * Computes transparent empirical performance scorecard for a specific supplier
 */
router.get('/:id/scorecard', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const scorecard = await computeSupplierScorecard(id);
    res.status(200).json({
      status: 'ok',
      scorecard
    });
  } catch (err: any) {
    const isNotFound = err.message?.includes('not found');
    const statusCode = isNotFound ? 404 : 500;
    if (!isNotFound) console.error('Error computing supplier scorecard:', err);
    res.status(statusCode).json({
      status: 'error',
      statusCode,
      message: err.message || 'Failed to compute supplier scorecard.'
    });
  }
});

/**
 * PUT /api/suppliers/:id/bank
 * Initiates a supplier bank identifier change request under maker-checker controls.
 * Requires verification and sign-off by a different Finance Manager before taking effect.
 */
router.put('/:id/bank', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { bank_identifier, reason } = req.body;

  if (!bank_identifier || typeof bank_identifier !== 'string' || bank_identifier.trim().length < 5) {
    res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'A valid bank_identifier string is required.'
    });
    return;
  }

  try {
    const approval = await requestSupplierBankChange(
      id,
      bank_identifier.trim(),
      req.user!.id,
      reason
    );

    res.status(202).json({
      status: 'ok',
      message: 'Bank identifier change request submitted for Finance Manager approval under maker-checker controls.',
      approval_id: approval.id,
      requires_approval: true
    });
  } catch (err: any) {
    console.error('Error requesting supplier bank change:', err);
    res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: err.message || 'Failed to submit bank change request.'
    });
  }
});

export default router;

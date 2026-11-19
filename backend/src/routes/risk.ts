import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import {
  evaluateInvoiceRisk,
  evaluateSupplierRisk,
  getHighRiskItems
} from '../services/riskService';
import { writeAuditLog } from '../services/auditService';

const router = Router();

/**
 * GET /api/risk/high
 * Returns all HIGH investigation priority invoices and suppliers, along with total ITC at risk (INR)
 */
router.get('/high', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const highRiskData = await getHighRiskItems();
    res.status(200).json({
      status: 'ok',
      ...highRiskData
    });
  } catch (err: any) {
    console.error('Error fetching high-risk items:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: `Failed to fetch high-risk items: ${err.message}`
    });
  }
});

/**
 * GET /api/risk/config
 * Retrieves configurable risk rule weights and thresholds
 */
router.get('/config', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const rulesRes = await pool.query(
      `SELECT id, rule_code, rule_name, description, weight, threshold, is_active, updated_at 
       FROM risk_rules_config 
       ORDER BY weight DESC, rule_code ASC`
    );

    res.status(200).json({
      status: 'ok',
      count: rulesRes.rows.length,
      rules: rulesRes.rows
    });
  } catch (err: any) {
    console.error('Error fetching risk rules config:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to retrieve risk rules configuration.'
    });
  }
});

/**
 * PUT /api/risk/config/:ruleCode
 * Admin only: Updates weight and threshold for a risk rule
 */
router.put(
  '/config/:ruleCode',
  authenticate,
  requireRole('Admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { ruleCode } = req.params;
    const { weight, threshold, is_active } = req.body;

    if (weight === undefined && threshold === undefined && is_active === undefined) {
      res.status(400).json({
        status: 'error',
        statusCode: 400,
        message: 'Must provide at least one of weight, threshold, or is_active to update.'
      });
      return;
    }

    try {
      const existingRes = await pool.query(
        `SELECT * FROM risk_rules_config WHERE rule_code = $1`,
        [ruleCode]
      );

      if (existingRes.rows.length === 0) {
        res.status(404).json({
          status: 'error',
          statusCode: 404,
          message: `Risk rule '${ruleCode}' not found.`
        });
        return;
      }

      const existing = existingRes.rows[0];
      const newWeight = weight !== undefined ? parseFloat(weight) : parseFloat(existing.weight);
      const newThreshold = threshold !== undefined ? parseFloat(threshold) : parseFloat(existing.threshold);
      const newActive = is_active !== undefined ? Boolean(is_active) : existing.is_active;

      const updateRes = await pool.query(
        `UPDATE risk_rules_config 
         SET weight = $1, threshold = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
         WHERE rule_code = $4
         RETURNING *`,
        [newWeight, newThreshold, newActive, ruleCode]
      );

      // Audit log entry
      await writeAuditLog(
        req.user!.id,
        'RULE_CONFIG_UPDATED',
        'RISK_RULE',
        ruleCode,
        {
          previous: {
            weight: existing.weight,
            threshold: existing.threshold,
            is_active: existing.is_active
          },
          updated: {
            weight: newWeight,
            threshold: newThreshold,
            is_active: newActive
          }
        }
      );

      res.status(200).json({
        status: 'ok',
        message: `Risk rule '${ruleCode}' updated successfully.`,
        rule: updateRes.rows[0]
      });
    } catch (err: any) {
      console.error('Error updating risk rule config:', err);
      res.status(500).json({
        status: 'error',
        statusCode: 500,
        message: `Failed to update risk rule: ${err.message}`
      });
    }
  }
);

/**
 * GET /api/risk/invoices/:id
 * Evaluates explainable risk score for an invoice
 */
router.get('/invoices/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const assessment = await evaluateInvoiceRisk(id, req.user!.id);
    res.status(200).json({
      status: 'ok',
      assessment
    });
  } catch (err: any) {
    console.error('Error evaluating invoice risk:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: `Failed to evaluate invoice risk: ${err.message}`
    });
  }
});

/**
 * GET /api/risk/suppliers/:id
 * Evaluates composite risk score for a supplier
 */
router.get('/suppliers/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const assessment = await evaluateSupplierRisk(id);
    res.status(200).json({
      status: 'ok',
      assessment
    });
  } catch (err: any) {
    console.error('Error evaluating supplier risk:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: `Failed to evaluate supplier risk: ${err.message}`
    });
  }
});

export default router;

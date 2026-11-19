import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool } from '../db';

const router = Router();

/**
 * GET /api/dashboard/stats
 * Aggregates complete analytics for dashboard cards, Recharts visualizations, and recent alerts.
 */
router.get('/stats', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    // 1. Invoices Count & Breakdown
    const invRes = await pool.query('SELECT id, invoice_number, status, payment_status, risk_score, risk_level, itc_at_risk, duplicate_similarity FROM invoices');
    const invoices = invRes.rows;

    const total_invoices = invoices.length;
    const matched_invoices = invoices.filter((i: any) => i.status === 'MATCHED' || i.payment_status === 'APPROVED').length;
    const mismatched_invoices = invoices.filter((i: any) => i.status === 'ON_HOLD' || i.status === 'MISMATCH').length;
    const possible_duplicates = invoices.filter((i: any) => (i.duplicate_similarity && i.duplicate_similarity >= 0.85)).length;
    const high_risk_invoices = invoices.filter((i: any) => i.risk_level === 'HIGH' || (i.risk_score && i.risk_score >= 70)).length;

    // 2. Pending Investigations
    const invsRes = await pool.query('SELECT * FROM investigations');
    const investigations = invsRes.rows;
    const pending_investigations = investigations.filter(
      (inv: any) => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(inv.status)
    ).length;

    // 3. Total ITC at Risk (INR)
    const itcRes = await pool.query('SELECT COALESCE(SUM(itc_at_risk), 0) AS total_itc FROM invoices');
    const total_itc_at_risk = parseFloat(itcRes.rows[0]?.total_itc || '9000.00');

    // 4. Invoices by Status (for Recharts)
    const statusCounts: Record<string, number> = {
      EXTRACTED: 0,
      VERIFIED: 0,
      MATCHED: 0,
      ON_HOLD: 0,
      ELIGIBLE_FOR_APPROVAL: 0,
      APPROVED: 0
    };
    for (const inv of invoices) {
      const s = inv.status || 'EXTRACTED';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
    const invoices_by_status = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count
    }));

    // 5. Risk Level Distribution (for Recharts)
    const riskCounts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const inv of invoices) {
      const lvl = inv.risk_level || (inv.risk_score >= 70 ? 'HIGH' : inv.risk_score >= 40 ? 'MEDIUM' : 'LOW');
      riskCounts[lvl] = (riskCounts[lvl] || 0) + 1;
    }
    const risk_distribution = Object.entries(riskCounts).map(([level, count]) => ({
      level,
      count
    }));

    // 6. Investigations by Department (for Recharts)
    const deptCounts: Record<string, number> = {
      'Warehouse': 0,
      'Procurement/Finance': 0,
      'AP/Finance': 0,
      'Finance/Compliance': 0
    };
    for (const inv of investigations) {
      const dept = inv.department || 'Finance/Compliance';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    }
    const investigations_by_department = Object.entries(deptCounts).map(([department, count]) => ({
      department,
      count
    }));

    // 7. Recent Alerts List
    const recent_alerts = investigations
      .filter((inv: any) => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(inv.status))
      .slice(0, 6)
      .map((inv: any) => ({
        id: inv.id,
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number || 'INV-101',
        title: inv.title,
        issue_type: inv.issue_type,
        department: inv.department,
        severity: inv.severity,
        status: inv.status,
        created_at: inv.created_at
      }));

    res.status(200).json({
      status: 'ok',
      cards: {
        total_invoices,
        matched_invoices,
        mismatched_invoices,
        possible_duplicates,
        high_risk_invoices,
        pending_investigations,
        total_itc_at_risk
      },
      charts: {
        invoices_by_status,
        risk_distribution,
        investigations_by_department
      },
      recent_alerts
    });
  } catch (err: any) {
    console.error('Error in GET /api/dashboard/stats:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to aggregate dashboard metrics' });
  }
});

export default router;

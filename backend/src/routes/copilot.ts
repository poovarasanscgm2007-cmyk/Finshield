import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { askCopilot } from '../services/copilotService';

const router = Router();

/**
 * POST /api/copilot/ask
 * AI Copilot query endpoint.
 * Accepts natural language questions, extracts entities, retrieves verified database facts,
 * and responds with evidence references and departmental recommended actions.
 */
router.post(['/ask', '/chat'], authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const rawQuestion = req.body.question || req.body.message;
    const { invoiceId } = req.body;

    if (!rawQuestion || !rawQuestion.trim()) {
      res.status(400).json({
        status: 'error',
        message: 'Question cannot be empty.'
      });
      return;
    }

    const response = await askCopilot(rawQuestion.trim(), invoiceId, {
      id: req.user!.id,
      name: req.user!.name,
      role: req.user!.role
    });

    res.status(200).json({
      status: 'ok',
      ...response
    });
  } catch (err: any) {
    console.error('Error in POST /api/copilot/ask:', err);
    res.status(500).json({
      status: 'error',
      message: err.message || 'Failed to process copilot query.'
    });
  }
});

export default router;

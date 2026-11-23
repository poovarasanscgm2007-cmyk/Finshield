import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import approvalsRouter from './routes/approvals';
import purchaseOrdersRouter from './routes/purchaseOrders';
import auditLogRouter from './routes/auditLog';
import invoicesRouter from './routes/invoices';
import riskRouter from './routes/risk';
import suppliersRouter from './routes/suppliers';
import investigationsRouter from './routes/investigations';
import copilotRouter from './routes/copilot';
import dashboardRouter from './routes/dashboard';
import grnsRouter from './routes/grns';
import { resetDemo } from './scripts/resetDemo';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app: Application = express();

const isProduction = process.env.NODE_ENV === 'production';
const rawCorsOrigin = process.env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:5173');

// In production, allow ONLY explicitly configured frontend origins.
// Reject wildcard '*' to ensure credentials security.
const allowedOrigins = rawCorsOrigin
  .split(',')
  .map(o => o.trim())
  .filter(o => Boolean(o) && o !== '*');

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile, curl, server-to-server health checks)
    if (!origin) return callback(null, true);

    // Keep localhost access for development only
    const isDevLocalhost = !isProduction && /^http:\/\/localhost(:\d+)?$/.test(origin);

    // Check against explicitly configured production origins
    const isExplicitlyAllowed = allowedOrigins.includes(origin);

    if (isExplicitlyAllowed || isDevLocalhost) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for unauthorized origin: ${origin}`));
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'FINSHIELD AI API',
    tagline: 'Beyond Invoice Matching: Catch Financial Risk and GST Loss Before You Pay.',
    documentation: '/docs',
    healthCheck: '/api/health'
  });
});

// API Routes
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/audit-log', auditLogRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/risk', riskRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/investigations', investigationsRouter);
app.use('/api/copilot', copilotRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/grns', grnsRouter);

// Demo Scenario Reset Route
app.post('/api/demo/reset', async (_req: Request, res: Response) => {
  try {
    await resetDemo();
    res.status(200).json({
      status: 'ok',
      message: 'Demo scenario reset to original Section 6 state successfully.'
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 404 Handler
app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    status: 'error',
    statusCode: 404,
    message: 'Resource not found'
  });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;

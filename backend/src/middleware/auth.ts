import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../auth/permissions';
import { writeAuditLog } from '../services/auditService';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'finshield_sample_secret_key_change_in_production_32chars';

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 'error',
      statusCode: 401,
      message: 'Authentication required. Please provide a valid Bearer token.'
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({
      status: 'error',
      statusCode: 401,
      message: 'Invalid or expired authentication token.'
    });
  }
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        statusCode: 401,
        message: 'Authentication required.'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Log 403 access denial to hash-chained audit log
      try {
        await writeAuditLog(
          req.user.id,
          'ACCESS_DENIED',
          'ROUTE',
          req.originalUrl || req.path,
          {
            userRole: req.user.role,
            requiredRoles: allowedRoles,
            method: req.method
          }
        );
      } catch (logErr) {
        console.error('Failed to log ACCESS_DENIED to audit log', logErr);
      }

      res.status(403).json({
        status: 'error',
        statusCode: 403,
        message: `Forbidden: Insufficient role permissions. Required one of: [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`
      });
      return;
    }

    next();
  };
};

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { authenticate } from '../middleware/auth';
import { writeAuditLog } from '../services/auditService';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'finshield_sample_secret_key_change_in_production_32chars';

/**
 * POST /api/auth/login
 * Authenticates user credentials and issues an 8-hour JWT
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Email and password are required.'
    });
    return;
  }

  try {
    const userRes = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1 LIMIT 1',
      [email.trim().toLowerCase()]
    );

    if (userRes.rows.length === 0) {
      // Log login failure
      await writeAuditLog(null, 'LOGIN_FAILURE', 'USER', email, {
        reason: 'User not found',
        attemptedEmail: email
      });

      res.status(401).json({
        status: 'error',
        statusCode: 401,
        message: 'Invalid email or password.'
      });
      return;
    }

    const user = userRes.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      // Log login failure
      await writeAuditLog(user.id, 'LOGIN_FAILURE', 'USER', user.id, {
        reason: 'Invalid password',
        attemptedEmail: email
      });

      res.status(401).json({
        status: 'error',
        statusCode: 401,
        message: 'Invalid email or password.'
      });
      return;
    }

    // Generate 8-hour JWT token
    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

    // Log login success in hash-chained audit log
    await writeAuditLog(user.id, 'LOGIN_SUCCESS', 'USER', user.id, {
      name: user.name,
      email: user.email,
      role: user.role
    });

    res.status(200).json({
      status: 'ok',
      message: 'Authentication successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err: any) {
    console.error('Error in /api/auth/login:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Internal authentication error.'
    });
  }
});

/**
 * GET /api/auth/me
 * Returns authenticated user session profile
 */
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userRes = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (userRes.rows.length === 0) {
      res.status(404).json({
        status: 'error',
        statusCode: 404,
        message: 'User profile not found.'
      });
      return;
    }

    res.status(200).json({
      status: 'ok',
      user: userRes.rows[0]
    });
  } catch (err: any) {
    console.error('Error in /api/auth/me:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to retrieve user profile.'
    });
  }
});

export default router;

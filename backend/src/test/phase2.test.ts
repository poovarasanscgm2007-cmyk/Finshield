import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ROLE_PERMISSIONS, hasPermission, UserRole } from '../auth/permissions';
import { calculateAuditHash, canonicalJson, GENESIS_PREV_HASH } from '../services/auditService';

describe('Phase 2: RBAC & Permissions Validation', () => {
  it('AP Employee has invoice view/upload permissions but cannot approve PO changes or payments', () => {
    assert.equal(hasPermission('AP Employee', 'invoices:upload'), true);
    assert.equal(hasPermission('AP Employee', 'invoices:view'), true);
    assert.equal(hasPermission('AP Employee', 'matching:view'), true);
    assert.equal(hasPermission('AP Employee', 'po:approve_change'), false);
    assert.equal(hasPermission('AP Employee', 'payment:approve'), false);
  });

  it('Procurement Employee can edit POs but cannot approve PO changes or payments', () => {
    assert.equal(hasPermission('Procurement Employee', 'po:view'), true);
    assert.equal(hasPermission('Procurement Employee', 'po:edit'), true);
    assert.equal(hasPermission('Procurement Employee', 'po:approve_change'), false);
    assert.equal(hasPermission('Procurement Employee', 'payment:approve'), false);
  });

  it('Warehouse Employee can view/edit GRNs and resolve quantity issues only', () => {
    assert.equal(hasPermission('Warehouse Employee', 'grn:view'), true);
    assert.equal(hasPermission('Warehouse Employee', 'grn:edit'), true);
    assert.equal(hasPermission('Warehouse Employee', 'investigations:resolve_quantity'), true);
    assert.equal(hasPermission('Warehouse Employee', 'po:edit'), false);
    assert.equal(hasPermission('Warehouse Employee', 'payment:approve'), false);
  });

  it('Finance Manager has approval rights for PO changes and final payments', () => {
    assert.equal(hasPermission('Finance Manager', 'po:approve_change'), true);
    assert.equal(hasPermission('Finance Manager', 'payment:approve'), true);
    assert.equal(hasPermission('Finance Manager', 'risk:view'), true);
    assert.equal(hasPermission('Finance Manager', 'audit:view'), true);
  });

  it('Admin must NOT be able to approve payments (Golden Rule)', () => {
    assert.equal(hasPermission('Admin', 'payment:approve'), false);
    assert.equal(hasPermission('Admin', 'users:manage'), true);
    assert.equal(hasPermission('Admin', 'audit:view'), true);
  });
});

describe('Phase 2: Authentication & Password Verification', () => {
  const sampleUsers = [
    { role: 'Admin', email: 'admin@finshield.sample', pass: 'Admin@123', hash: '$2b$10$W59YKQZYj2PLQncLmvtKcO0bAe/tJ0CyGH1EqtEeTAQPUxGqHVRna' },
    { role: 'Finance Manager', email: 'finance@finshield.sample', pass: 'Finance@123', hash: '$2b$10$bnFpgwNewg.CBT1FDGgmSuYxd9A7IDXuEGh6U9l/bI74TUwvqhwu6' },
    { role: 'AP Employee', email: 'ap@finshield.sample', pass: 'Ap@12345', hash: '$2b$10$18yK/pse/9vAXrFmgWJNwe9l1P72SlxWbYX1wfj/sHKC6iuVmOifi' },
    { role: 'Warehouse Employee', email: 'warehouse@finshield.sample', pass: 'Warehouse@123', hash: '$2b$10$OX3Wx4WAdAwhD6e7CWMrdulqYiEujRAAXVia0WjZ.qMSZLwL23.iu' },
    { role: 'Procurement Employee', email: 'emp102@finshield.sample', pass: 'Emp102@123', hash: '$2b$10$wIA0di0CF0xBfExwlLS48OgnxP/bk1yWeSE5q.IHrn04TPH5l2kXO' }
  ];

  sampleUsers.forEach(({ role, pass, hash }) => {
    it(`Correct demo password verifies for ${role}`, async () => {
      const match = await bcrypt.compare(pass, hash);
      assert.equal(match, true);
    });

    it(`Wrong password fails verification for ${role}`, async () => {
      const match = await bcrypt.compare('WrongPassword999!', hash);
      assert.equal(match, false);
    });
  });

  it('JWT generates and verifies correctly with user payload', () => {
    const secret = 'finshield_test_secret';
    const payload = { id: 'u-1', name: 'Test User', email: 'test@finshield.sample', role: 'AP Employee' as UserRole };
    const token = jwt.sign(payload, secret, { expiresIn: '8h' });
    const decoded = jwt.verify(token, secret) as typeof payload;
    assert.equal(decoded.id, payload.id);
    assert.equal(decoded.role, payload.role);
  });
});

describe('Phase 2: Maker-Checker Logic Simulation', () => {
  it('Requester cannot approve their own request (Maker-Checker Violation)', () => {
    const requesterId = 'emp-102';
    const approverId = 'emp-102';

    const canApprove = (reqId: string, appId: string) => {
      if (reqId === appId) {
        throw new Error('Maker-checker violation: requester cannot approve their own request.');
      }
      return true;
    };

    assert.throws(
      () => canApprove(requesterId, approverId),
      /Maker-checker violation: requester cannot approve their own request/
    );
  });

  it('Authorized checker (Finance Manager) different from requester can approve', () => {
    const requesterId = 'emp-102';
    const approverId = 'finance-mgr';
    const approverRole: UserRole = 'Finance Manager';

    const checkAndApprove = (reqId: string, appId: string, role: UserRole) => {
      if (reqId === appId) throw new Error('Maker-checker violation');
      if (role !== 'Finance Manager') throw new Error('Only Finance Manager can approve');
      return 'APPROVED';
    };

    const status = checkAndApprove(requesterId, approverId, approverRole);
    assert.equal(status, 'APPROVED');
  });

  it('Non-Finance Manager (e.g. Warehouse Employee) cannot approve PO price changes', () => {
    const requesterId = 'emp-102';
    const approverId = 'warehouse-emp';
    const approverRole: UserRole = 'Warehouse Employee';

    const checkAndApprove = (reqId: string, appId: string, role: UserRole) => {
      if (reqId === appId) throw new Error('Maker-checker violation');
      if (role !== 'Finance Manager') throw new Error('Only Finance Manager can approve');
      return 'APPROVED';
    };

    assert.throws(
      () => checkAndApprove(requesterId, approverId, approverRole),
      /Only Finance Manager can approve/
    );
  });
});

describe('Phase 2: Cryptographic Hash-Chained Audit Log Simulation', () => {
  it('Canonical JSON produces identical string regardless of key ordering', () => {
    const objA = { z: 1, a: 2, m: { nestedB: true, nestedA: 'hello' } };
    const objB = { a: 2, m: { nestedA: 'hello', nestedB: true }, z: 1 };
    assert.equal(canonicalJson(objA), canonicalJson(objB));
  });

  it('Chain verification succeeds on a sequence of valid blocks', () => {
    const now = new Date();
    const b1_prev = GENESIS_PREV_HASH;
    const b1_hash = calculateAuditHash(b1_prev, 'user-1', 'LOGIN_SUCCESS', 'USER', 'user-1', { email: 'admin@finshield.sample' }, now);

    const b2_prev = b1_hash;
    const b2_hash = calculateAuditHash(b2_prev, 'user-1', 'PO_CHANGE_REQUESTED', 'PO', 'PO-101', { oldPrice: 500, newPrice: 700 }, now);

    const b3_prev = b2_hash;
    const b3_hash = calculateAuditHash(b3_prev, 'finance-1', 'APPROVAL_GRANTED', 'APPROVAL', 'app-1', { approverRole: 'Finance Manager' }, now);

    const chain = [
      { id: 'b1', prev_hash: b1_prev, hash: b1_hash, actor_id: 'user-1', action: 'LOGIN_SUCCESS', entity: 'USER', entity_id: 'user-1', payload: { email: 'admin@finshield.sample' }, created_at: now.toISOString() },
      { id: 'b2', prev_hash: b2_prev, hash: b2_hash, actor_id: 'user-1', action: 'PO_CHANGE_REQUESTED', entity: 'PO', entity_id: 'PO-101', payload: { oldPrice: 500, newPrice: 700 }, created_at: now.toISOString() },
      { id: 'b3', prev_hash: b3_prev, hash: b3_hash, actor_id: 'finance-1', action: 'APPROVAL_GRANTED', entity: 'APPROVAL', entity_id: 'app-1', payload: { approverRole: 'Finance Manager' }, created_at: now.toISOString() }
    ];

    // Verification algorithm
    let expectedPrev = GENESIS_PREV_HASH;
    for (const b of chain) {
      assert.equal(b.prev_hash, expectedPrev, 'prev_hash must match prior hash');
      const recomputed = calculateAuditHash(b.prev_hash, b.actor_id, b.action, b.entity, b.entity_id, b.payload, b.created_at);
      assert.equal(b.hash, recomputed, 'stored hash must match recomputed hash');
      expectedPrev = b.hash;
    }
  });

  it('Tampering with any block payload or hash breaks the chain and detects the tampered block', () => {
    const now = new Date();
    const b1_prev = GENESIS_PREV_HASH;
    const b1_hash = calculateAuditHash(b1_prev, 'user-1', 'LOGIN_SUCCESS', 'USER', 'user-1', { email: 'admin@finshield.sample' }, now);

    const b2_prev = b1_hash;
    const b2_hash = calculateAuditHash(b2_prev, 'user-1', 'PO_CHANGE_REQUESTED', 'PO', 'PO-101', { oldPrice: 500, newPrice: 700 }, now);

    // Tampered payload in block 2 (e.g. changing price secretly)
    const tamperedPayload = { oldPrice: 500, newPrice: 999999 };

    const recomputed = calculateAuditHash(b2_prev, 'user-1', 'PO_CHANGE_REQUESTED', 'PO', 'PO-101', tamperedPayload, now);
    assert.notEqual(recomputed, b2_hash, 'Hash must mismatch when payload is tampered');
  });
});

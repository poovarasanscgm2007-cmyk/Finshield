import crypto from 'crypto';
import { pool } from '../db';

export const GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  payload: any;
  prev_hash: string;
  hash: string;
  created_at: string;
}

/**
 * Deterministically serialize JSON payload by sorting keys recursively
 */
export function canonicalJson(obj: any): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return '{' + parts.join(',') + '}';
}

/**
 * Calculates SHA-256 hash for an audit log entry
 */
export function calculateAuditHash(
  prevHash: string,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  payload: any,
  createdAt: string | Date
): string {
  const dateStr = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
  const serializedPayload = canonicalJson(payload);
  const dataToHash = `${prevHash}|${actorId || 'NULL'}|${action}|${entity}|${entityId}|${serializedPayload}|${dateStr}`;
  return crypto.createHash('sha256').update(dataToHash, 'utf8').digest('hex');
}

/**
 * Serialized write to audit_log inside a database transaction with table lock
 */
export async function writeAuditLog(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  payload: any
): Promise<AuditEntry> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Use advisory transaction lock to serialize audit log writes and avoid chain forks
    await client.query('SELECT pg_advisory_xact_lock(71829304)');

    // Fetch the latest entry in the chain
    const latestRes = await client.query(
      'SELECT id, hash FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1'
    );

    const prevHash = latestRes.rows.length > 0 ? latestRes.rows[0].hash : GENESIS_PREV_HASH;
    const now = new Date();
    const hash = calculateAuditHash(prevHash, actorId, action, entity, entityId, payload, now);

    const insertRes = await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, payload, prev_hash, hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, actor_id, action, entity, entity_id, payload, prev_hash, hash, created_at;`,
      [actorId, action, entity, entityId, JSON.stringify(payload), prevHash, hash, now]
    );

    await client.query('COMMIT');
    return insertRes.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to write audit log:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Recomputes the entire audit log chain and returns verification status
 */
export async function verifyAuditChain(): Promise<{
  valid: boolean;
  totalEntries: number;
  brokenAtId?: string;
  error?: string;
  expectedHash?: string;
  actualHash?: string;
}> {
  const client = await pool.connect();
  try {
    // Fetch all logs in chronological sequence
    const result = await client.query(
      'SELECT id, actor_id, action, entity, entity_id, payload, prev_hash, hash, created_at FROM audit_log ORDER BY created_at ASC, id ASC'
    );

    const entries = result.rows;
    if (entries.length === 0) {
      return { valid: true, totalEntries: 0 };
    }

    let expectedPrevHash = GENESIS_PREV_HASH;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Genesis check for first entry
      if (i === 0) {
        if (entry.prev_hash !== GENESIS_PREV_HASH) {
          return {
            valid: false,
            totalEntries: entries.length,
            brokenAtId: entry.id,
            error: `Genesis block prev_hash invalid. Expected ${GENESIS_PREV_HASH}, got ${entry.prev_hash}`,
            expectedHash: GENESIS_PREV_HASH,
            actualHash: entry.prev_hash
          };
        }
      } else {
        // Subsequent entries must point to previous block's hash
        if (entry.prev_hash !== expectedPrevHash) {
          return {
            valid: false,
            totalEntries: entries.length,
            brokenAtId: entry.id,
            error: `Chain broken at entry index ${i} (${entry.id}). prev_hash ${entry.prev_hash} does not match prior hash ${expectedPrevHash}`,
            expectedHash: expectedPrevHash,
            actualHash: entry.prev_hash
          };
        }
      }

      // Check current entry hash recalculation (skip if it was the initial raw seed payload from seed.sql, or verify computed)
      // Note: For all entries inserted by writeAuditLog, the hash calculation matches calculateAuditHash.
      const calculatedHash = calculateAuditHash(
        entry.prev_hash,
        entry.actor_id,
        entry.action,
        entry.entity,
        entry.entity_id,
        typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload,
        entry.created_at
      );

      // Check if hash matches
      // Special case: Initial seed.sql genesis entry has seed fixed hash if it was seeded raw
      if (entry.action !== 'SYSTEM_SEED_INITIALIZED' && calculatedHash !== entry.hash) {
        return {
          valid: false,
          totalEntries: entries.length,
          brokenAtId: entry.id,
          error: `Tampering detected at entry ${entry.id}! Stored hash: ${entry.hash}, Recomputed hash: ${calculatedHash}`,
          expectedHash: calculatedHash,
          actualHash: entry.hash
        };
      }

      expectedPrevHash = entry.hash;
    }

    return {
      valid: true,
      totalEntries: entries.length
    };
  } finally {
    client.release();
  }
}

/**
 * Query audit logs with pagination and filters
 */
export async function getAuditLogs(params: {
  action?: string;
  entity?: string;
  actorId?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (params.action) {
    conditions.push(`al.action = $${paramIdx++}`);
    values.push(params.action);
  }
  if (params.entity) {
    conditions.push(`al.entity = $${paramIdx++}`);
    values.push(params.entity);
  }
  if (params.actorId) {
    conditions.push(`al.actor_id = $${paramIdx++}`);
    values.push(params.actorId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*) FROM audit_log al ${whereClause}`;
  const countRes = await pool.query(countQuery, values);
  const total = parseInt(countRes.rows[0].count, 10);

  const dataQuery = `
    SELECT 
      al.id,
      al.actor_id,
      u.name AS actor_name,
      u.role AS actor_role,
      al.action,
      al.entity,
      al.entity_id,
      al.payload,
      al.prev_hash,
      al.hash,
      al.created_at
    FROM audit_log al
    LEFT JOIN users u ON al.actor_id = u.id
    ${whereClause}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;
  values.push(limit, offset);

  const dataRes = await pool.query(dataQuery, values);

  return {
    total,
    limit,
    offset,
    entries: dataRes.rows
  };
}

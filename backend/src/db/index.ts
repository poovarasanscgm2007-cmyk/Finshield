import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import { inMemoryDb } from './inMemoryDb';

dotenv.config();

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/finshield',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

let isPgHealthy: boolean | null = null;

export async function checkPgHealth(): Promise<boolean> {
  try {
    const client = await pgPool.connect();
    client.release();
    isPgHealthy = true;
    return true;
  } catch {
    isPgHealthy = false;
    return false;
  }
}

export const pool = {
  async query(text: string, params?: any[]): Promise<any> {
    if (isPgHealthy === null) {
      await checkPgHealth();
    }
    if (isPgHealthy) {
      try {
        return await pgPool.query(text, params);
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED' || err.message?.includes('connect')) {
          isPgHealthy = false;
          return await inMemoryDb.executeQuery(text, params);
        }
        throw err;
      }
    }
    return await inMemoryDb.executeQuery(text, params);
  },

  async connect(): Promise<PoolClient> {
    if (isPgHealthy === null) {
      await checkPgHealth();
    }
    if (isPgHealthy) {
      try {
        return await pgPool.connect();
      } catch {
        isPgHealthy = false;
      }
    }

    const mockClient = {
      async query(text: string, params?: any[]) {
        return await inMemoryDb.executeQuery(text, params);
      },
      release() {}
    } as unknown as PoolClient;

    return mockClient;
  },

  async end(): Promise<void> {
    try {
      await pgPool.end();
    } catch {}
  },

  on(_event: string, _listener: (...args: any[]) => void) {
    return this;
  }
};

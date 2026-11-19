import fs from 'fs';
import path from 'path';
import { pool } from '../db';
import { inMemoryDb } from '../db/inMemoryDb';

export async function resetDemo(): Promise<void> {
  console.log('--- FINSHIELD AI: Resetting Demo Scenario Database ---');

  // 1. Reset In-Memory Database
  inMemoryDb.resetDemoData();
  console.log('✓ In-Memory database reset to pristine Section 6 demo scenario.');

  // 2. If Postgres is connected, re-run migrations and seed.sql
  try {
    const seedFilePath = path.resolve(__dirname, '../../../database/seed.sql');
    if (fs.existsSync(seedFilePath)) {
      const client = await pool.connect();
      try {
        const sql = fs.readFileSync(seedFilePath, 'utf-8');
        await client.query(sql);
        console.log('✓ PostgreSQL seed data re-executed successfully.');
      } finally {
        client.release();
      }
    }
  } catch (err: any) {
    console.log('ℹ PostgreSQL not connected or unreachable, using in-memory store.');
  }

  console.log('✓ Demo scenario reset complete: Ready for repeat presentation.\n');
}

if (require.main === module) {
  resetDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Reset demo error:', err);
      process.exit(1);
    });
}

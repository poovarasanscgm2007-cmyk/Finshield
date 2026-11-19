import fs from 'fs';
import path from 'path';
import { pool } from './index';

async function runMigrations() {
  console.log('--- FINSHIELD AI: Running Database Migrations ---');
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  const client = await pool.connect();
  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      console.log(`Applying migration: ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf-8');
      await client.query(sql);
      console.log(`✓ Migration ${file} applied successfully.`);
    }
    console.log('--- All migrations applied successfully ---');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();

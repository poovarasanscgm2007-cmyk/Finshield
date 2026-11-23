import fs from 'fs';
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import { inMemoryDb } from './inMemoryDb';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Checks whether a hostname represents a loopback or local address.
 * Handles IPv4 (127.0.0.0/8, 0.0.0.0), IPv6 loopback (::1, [::1]), and 'localhost'.
 */
function isLoopbackHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (clean === 'localhost' || clean === '::1' || clean === '0:0:0:0:0:0:0:1' || clean === '0.0.0.0' || clean === '::') {
    return true;
  }
  // Check 127.0.0.0/8 range
  if (/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/.test(clean)) {
    return true;
  }
  return false;
}

/**
 * Validates and resolves the database connection string.
 * Production environments MUST explicitly supply DATABASE_URL and CANNOT target loopback addresses.
 * Sensitive connection credentials are never included in error messages or logs.
 */
function resolveDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (isProduction) {
    if (!configuredUrl || configuredUrl.trim() === '') {
      throw new Error(
        '[DB CONFIG ERROR] DATABASE_URL environment variable is required in production. Implicit database configuration is forbidden.'
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(configuredUrl);
    } catch {
      throw new Error(
        '[DB CONFIG ERROR] Production DATABASE_URL is not a valid URL. Please check connection string format.'
      );
    }

    if (isLoopbackHost(parsedUrl.hostname)) {
      throw new Error(
        '[DB CONFIG ERROR] Production DATABASE_URL cannot target localhost or loopback addresses (localhost, 127.0.0.1, ::1).'
      );
    }

    return configuredUrl;
  }

  // Local development / automated tests default
  return configuredUrl || 'postgresql://postgres:postgres@localhost:5432/finshield';
}

const dbUrl = resolveDatabaseUrl();

/**
 * Configure secure TLS connection for PostgreSQL (Supabase / cloud providers).
 * Strictly enforces server certificate validation (rejectUnauthorized: true).
 * Compatible with Supabase direct (db.<ref>.supabase.co) and pooler (aws-0-<region>.pooler.supabase.com)
 * connections which use certificates trusted by standard Node.js root CAs.
 *
 * If DATABASE_CA_CERT_PATH is provided:
 * - Fails startup immediately if the file is missing or unreadable (fail-closed).
 */
function getSecureSslConfig(): { rejectUnauthorized: true; ca?: string } | undefined {
  // If CA cert path is configured, it MUST exist and be readable. Fail startup immediately if invalid.
  if (process.env.DATABASE_CA_CERT_PATH) {
    const certPath = process.env.DATABASE_CA_CERT_PATH;
    if (!fs.existsSync(certPath)) {
      throw new Error(`[DB CONFIG ERROR] DATABASE_CA_CERT_PATH was configured ('${certPath}'), but the file does not exist.`);
    }
    try {
      fs.readFileSync(certPath, 'utf-8');
    } catch (err: any) {
      throw new Error(`[DB CONFIG ERROR] Failed to read DATABASE_CA_CERT_PATH ('${certPath}'): ${err?.message || err}`);
    }
  }

  const sslExplicitlyEnabled = process.env.DATABASE_SSL === 'true';
  const sslExplicitlyDisabled = process.env.DATABASE_SSL === 'false';

  // In production, secure TLS is mandatory. Reject any attempt to disable TLS.
  if (isProduction) {
    if (sslExplicitlyDisabled) {
      throw new Error(
        '[DB CONFIG ERROR] Disabling TLS via DATABASE_SSL=false is strictly forbidden in production. Secure TLS with certificate verification is mandatory.'
      );
    }
  } else {
    // In local development / test environments, permit explicit opt-out of SSL
    if (sslExplicitlyDisabled) {
      return undefined;
    }
  }

  const isCaConfigured = Boolean(process.env.DATABASE_CA_CERT || process.env.DATABASE_CA_CERT_PATH);
  const isCloudOrRemote =
    dbUrl.includes('supabase.co') ||
    dbUrl.includes('supabase.com') ||
    dbUrl.includes('pooler.supabase.com') ||
    dbUrl.includes('render.com') ||
    isProduction;

  if (!sslExplicitlyEnabled && !isCloudOrRemote && !isCaConfigured) {
    return undefined;
  }

  // Strict TLS validation - NEVER disable rejectUnauthorized
  const sslConfig: { rejectUnauthorized: true; ca?: string } = {
    rejectUnauthorized: true,
  };

  // Support Supabase CA bundle if provided via environment variable or file
  if (process.env.DATABASE_CA_CERT) {
    sslConfig.ca = process.env.DATABASE_CA_CERT;
  } else if (process.env.DATABASE_CA_CERT_PATH) {
    sslConfig.ca = fs.readFileSync(process.env.DATABASE_CA_CERT_PATH, 'utf-8');
  }

  return sslConfig;
}

const pgPool = new Pool({
  connectionString: dbUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: getSecureSslConfig(),
});

let isPgHealthy: boolean | null = null;

export async function checkPgHealth(): Promise<boolean> {
  try {
    const client = await pgPool.connect();
    client.release();
    isPgHealthy = true;
    return true;
  } catch (err: any) {
    isPgHealthy = false;
    if (isProduction) {
      console.error(`[DB ERROR] Production PostgreSQL connection failure: ${err?.message || err}`);
    }
    return false;
  }
}

export const pool = {
  async query(text: string, params?: any[]): Promise<any> {
    // In production, NEVER fall back to inMemoryDb. Fail closed and throw clear error.
    if (isProduction) {
      try {
        return await pgPool.query(text, params);
      } catch (err: any) {
        console.error(`[DB ERROR] Production PostgreSQL query execution failed: ${err?.message || err}`);
        throw new Error(`Production database query failure: ${err?.message || err}`);
      }
    }

    // In local development and automated test suites, preserve in-memory fallback
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
    // In production, NEVER fall back to mock client. Fail closed and throw clear error.
    if (isProduction) {
      try {
        return await pgPool.connect();
      } catch (err: any) {
        console.error(`[DB ERROR] Production PostgreSQL connection acquisition failed: ${err?.message || err}`);
        throw new Error(`Production database connection failure: ${err?.message || err}`);
      }
    }

    // In local development and automated test suites, preserve in-memory mock client
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

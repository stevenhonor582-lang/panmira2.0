/**
 * PostgreSQL connection pool singleton.
 * All migrated modules import `pool` from here.
 */
import * as pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.warn('[DB] WARNING: DATABASE_URL not set — database features disabled');
}

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err: any) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

export const db = drizzle(pool, { schema });

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

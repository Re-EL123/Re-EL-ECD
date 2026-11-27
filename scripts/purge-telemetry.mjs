#!/usr/bin/env node
/**
 * Retention for product telemetry. Diagnostics are only useful while fresh;
 * delete raw events older than TELEMETRY_RETENTION_DAYS (default 90).
 * Requires DATABASE_URL. Run weekly.
 */
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Retention only runs against a real PostgreSQL database.');
  process.exit(1);
}

const days = Math.max(7, Number(process.env.TELEMETRY_RETENTION_DAYS || 90));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const result = await pool.query(
  `DELETE FROM telemetry_events WHERE occurred_at < now() - ($1 || ' days')::interval`,
  [String(days)]
);
console.log(JSON.stringify({
  level: 'info',
  action: 'telemetry_retention_purged',
  retentionDays: days,
  deleted: result.rowCount,
  at: new Date().toISOString()
}));
await pool.end();

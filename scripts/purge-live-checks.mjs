#!/usr/bin/env node
/**
 * Retention enforcement for live checks (POPIA).
 *
 * Deletes raw, learner-linked responses from named (class_roster) sessions
 * older than RETENTION_MONTHS (default 24). Anonymous votes are already
 * unidentifiable and are kept forever; aggregates live on
 * presentation_sessions.aggregate_snapshot and are unaffected.
 *
 * Requires DATABASE_URL. Run on a schedule (e.g. weekly).
 */
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Retention only runs against a real PostgreSQL database.');
  process.exit(1);
}

const months = Math.max(1, Number(process.env.RETENTION_MONTHS || 24));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const count = await pool.query(
  `SELECT COUNT(*)::int AS n FROM presentation_responses pr
   JOIN presentation_sessions s ON s.id = pr.session_id
   WHERE s.participant_mode = 'class_roster' AND pr.created_at < now() - ($1 || ' months')::interval`,
  [String(months)]
);

const result = await pool.query(
  `DELETE FROM presentation_responses pr
   USING presentation_sessions s
   WHERE pr.session_id = s.id AND s.participant_mode = 'class_roster'
     AND pr.created_at < now() - ($1 || ' months')::interval`,
  [String(months)]
);

console.log(JSON.stringify({
  level: 'info',
  action: 'live_checks_retention_purged',
  retentionMonths: months,
  candidates: count.rows[0].n,
  deleted: result.rowCount,
  at: new Date().toISOString()
}));

await pool.end();

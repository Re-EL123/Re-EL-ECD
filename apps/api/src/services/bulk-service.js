'use strict';

/**
 * Bulk operations.
 *
 * Every list screen that can act on more than one record uses the same
 * contract: `{ ids: [...], action: '...' }` in, `{ action, updated, skipped }`
 * out. Each record is handled independently so one bad id cannot roll back the
 * rest, and every change is written to the audit trail with `bulk: true`.
 *
 * Tenant scoping is never delegated to this helper: the caller's handler must
 * select the row by `organisation_id` before touching it.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('./audit-service');

const MAX_BULK = 200;

function parse(body, actions) {
  const parsed = validate(body, {
    ids: { type: 'array', of: 'uuid', max: MAX_BULK },
    action: { type: 'string', enum: actions }
  });
  if (!parsed.ids.length) {
    fail('VALIDATION', [{ field: 'ids', message: 'Select at least one record.' }]);
  }
  if (new Set(parsed.ids).size !== parsed.ids.length) {
    fail('VALIDATION', [{ field: 'ids', message: 'The selection contains duplicates.' }]);
  }
  return parsed;
}

/**
 * Run `handler(id)` for each id. The handler returns
 * `{ ok: true, branchId?, metadata? }` or `{ ok: false, reason }`.
 */
async function run(ctx, { ids, action, resourceType, auditAction, handler }) {
  const updated = [];
  const skipped = [];
  for (const id of ids) {
    let outcome;
    try {
      outcome = await handler(id);
    } catch (error) {
      outcome = { ok: false, reason: error.message || 'failed' };
    }
    if (!outcome || outcome.ok !== true) {
      skipped.push({ id, reason: (outcome && outcome.reason) || 'not applicable' });
      continue;
    }
    updated.push(id);
    if (auditAction) {
      await recordAudit(ctx.db, ctx, {
        action: typeof auditAction === 'function' ? auditAction(outcome) : auditAction,
        resourceType,
        resourceId: id,
        branchId: outcome.branchId || null,
        metadata: Object.assign({ bulk: true, action }, outcome.metadata || {})
      });
    }
  }
  return { action, updated: updated.length, skipped };
}

module.exports = { MAX_BULK, parse, run };

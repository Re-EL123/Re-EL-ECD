'use strict';

/**
 * Plan entitlements: usage, limits and the 7-day grace window.
 *
 * A limit of 0 means unlimited. At 90% the state is "near"; at 100% a grace
 * row is recorded and a week of continued use is allowed. After that the
 * limit is enforced. Dropping back under the limit clears the grace row.
 */

const { AppError } = require('../../../../packages/contracts/errors');
const { currentSubscription } = require('./subscription-billing-service');

const GRACE_DAYS = 7;
const KIND = { learners: 'learners', staff: 'staff', storage: 'storage' };
const LABEL = { learners: 'Learners', staff: 'Staff members', storage: 'Storage' };

function bytesToGb(bytes) {
  return Math.round(Number(bytes || 0) / (1024 * 1024 * 1024) * 10) / 10;
}
function gbLabel(bytes) {
  return (bytesToGb(bytes) || 0) + ' GB';
}
function describe(kind, used, limit) {
  if (kind === KIND.storage) return gbLabel(used) + ' / ' + (limit > 0 ? gbLabel(limit) : 'Unlimited');
  return used + ' / ' + (limit > 0 ? limit : 'Unlimited');
}

async function usage(db, organisationId, extra) {
  const subscription = await currentSubscription(db, organisationId);
  const plan = subscription || {};
  const counts = await db.one(
    `SELECT
       (SELECT COUNT(*)::int FROM learners WHERE organisation_id = $1) AS learners,
       (SELECT COUNT(*)::int FROM staff_profiles WHERE organisation_id = $1) AS staff,
       (SELECT COALESCE(SUM(size_bytes), 0)::bigint FROM media_assets
         WHERE organisation_id = $1 AND status = 'ready') AS storage_bytes`,
    [organisationId]
  );
  const additional = extra || {};
  const values = {
    learners: Number(counts.learners || 0) + Number(additional.learners || 0),
    staff: Number(counts.staff || 0) + Number(additional.staff || 0),
    storage: Number(counts.storage_bytes || 0) + Number(additional.storageBytes || 0)
  };
  const limits = {
    learners: Number(plan.max_learners || 0),
    staff: Number(plan.max_staff || 0),
    storage: Number(plan.max_storage_bytes || 0)
  };
  return { subscription, values, limits };
}

function ratio(value, limit) {
  return limit > 0 ? value / limit : 0;
}

async function check(db, organisationId, kind, extra) {
  if (!KIND[kind]) throw new AppError('INTERNAL', null, 'Unknown plan limit.');
  const { subscription, values, limits } = await usage(db, organisationId, extra);
  const limit = limits[kind], value = values[kind];
  const r = ratio(value, limit);
  if (!limit || r < 0.9) {
    if (r < 1) await db.query('DELETE FROM plan_limit_grace WHERE organisation_id = $1 AND kind = $2', [organisationId, kind]);
    return { allowed: true, state: 'ok', value, limit, ratio: r, description: describe(kind, value, limit) };
  }
  if (r < 1) {
    return { allowed: true, state: 'near', value, limit, ratio: r, description: describe(kind, value, limit) };
  }
  let grace = await db.one(
    'SELECT breached_at FROM plan_limit_grace WHERE organisation_id = $1 AND kind = $2', [organisationId, kind]
  );
  if (!grace) {
    grace = await db.one(
      `INSERT INTO plan_limit_grace (organisation_id, kind) VALUES ($1,$2)
       ON CONFLICT (organisation_id, kind) DO UPDATE SET breached_at = plan_limit_grace.breached_at
       RETURNING breached_at`, [organisationId, kind]
    );
  }
  const age = (Date.now() - new Date(grace.breached_at)) / 86400000;
  if (age <= GRACE_DAYS) {
    return {
      allowed: true, state: 'grace', value, limit, ratio: r,
      graceDaysLeft: Math.max(0, Math.ceil(GRACE_DAYS - age)),
      description: describe(kind, value, limit)
    };
  }
  return {
    allowed: false, state: 'over', value, limit, ratio: r,
    description: describe(kind, value, limit),
    message: LABEL[kind] + ' ' + describe(kind, value, limit) +
      ' — your plan limit has been reached. Upgrade your plan to continue.'
  };
}

function limitError(result) {
  return new AppError('CONFLICT', {
    code: 'PLAN_LIMIT_REACHED',
    state: result.state,
    kind: result.description
  }, result.message || 'Your plan limit has been reached. Upgrade your plan to continue.');
}

module.exports = { usage, check, limitError, describe, bytesToGb, GRACE_DAYS };

/** Read-only status for all three limits, for the tenant billing summary. */
async function status(db, organisationId) {
  const data = await usage(db, organisationId);
  const grace = await db.many(
    'SELECT kind, breached_at FROM plan_limit_grace WHERE organisation_id = $1', [organisationId]
  ).catch(() => []);
  const byKind = new Map(grace.map((row) => [row.kind, row.breached_at]));
  const result = {};
  for (const kind of Object.keys(KIND)) {
    const limit = data.limits[kind], value = data.values[kind];
    const r = ratio(value, limit);
    let state = !limit || r < 0.9 ? 'ok' : (r < 1 ? 'near' : 'over');
    let graceDaysLeft = 0;
    if (state === 'over') {
      const breached = byKind.get(kind);
      const age = breached ? (Date.now() - new Date(breached)) / 86400000 : GRACE_DAYS + 1;
      if (age <= GRACE_DAYS) { state = 'grace'; graceDaysLeft = Math.max(0, Math.ceil(GRACE_DAYS - age)); }
    }
    result[kind] = { used: value, limit, state, graceDaysLeft, description: describe(kind, value, limit) };
  }
  return result;
}

module.exports.status = status;

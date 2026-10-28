'use strict';

const { AppError, fail } = require('../../../../packages/contracts/errors');
const { hasPermission } = require('../../../../packages/auth/permissions');

async function assignedClassroomIds(ctx) {
  const staff = await ctx.db.one('SELECT id FROM staff_profiles WHERE user_id = $1 AND organisation_id = $2',
    [ctx.user.id, ctx.organisationId]);
  if (!staff) return [];
  const rows = await ctx.db.many('SELECT classroom_id FROM staff_classrooms WHERE staff_id = $1', [staff.id]);
  return rows.map((r) => r.classroom_id);
}

async function guardianLearnerIds(ctx, learnerId = null) {
  const params = [ctx.user.id, ctx.organisationId];
  let sql = `SELECT lg.learner_id FROM learner_guardians lg
    JOIN guardians g ON g.id = lg.guardian_id
    WHERE g.user_id = $1 AND lg.organisation_id = $2
      AND lg.portal_access_status = 'active'
      AND (lg.ends_at IS NULL OR lg.ends_at >= CURRENT_DATE)`;
  if (learnerId) {
    params.push(learnerId);
    sql += ' AND lg.learner_id = $3';
  }
  const rows = await ctx.db.many(sql, params);
  return rows.map((r) => r.learner_id);
}

async function getLearner(ctx, learnerId, options = {}) {
  const learner = await ctx.db.one('SELECT * FROM learners WHERE id = $1 AND organisation_id = $2',
    [learnerId, ctx.organisationId]);
  if (!learner) throw new AppError('NOT_FOUND');
  const access = ctx.access.permissions;
  const daycareRead = hasPermission(access, 'learners.read.daycare');
  if (daycareRead) return learner;
  if (hasPermission(access, 'learners.read.assigned')) {
    const classrooms = await assignedClassroomIds(ctx);
    if (learner.classroom_id && classrooms.includes(learner.classroom_id)) return learner;
  }
  if (options.parent) {
    const ids = await guardianLearnerIds(ctx, learnerId);
    if (ids.length) return learner;
  }
  throw new AppError('FORBIDDEN');
}

function assertLearnerWrite(ctx, learner) {
  const perms = ctx.access.permissions;
  if (hasPermission(perms, 'learners.update.daycare')) return;
  if (hasPermission(perms, 'learners.update.assigned') && learner.classroom_id) return;
  fail('FORBIDDEN');
}

function assertPermission(ctx, key) {
  if (!hasPermission(ctx.access.permissions, key)) fail('FORBIDDEN');
}

function has(ctx, key) {
  return hasPermission(ctx.access.permissions, key);
}

async function guardianForLearner(ctx, learnerId) {
  return ctx.db.one(
    `SELECT lg.*, g.first_name, g.last_name, g.email, g.phone
     FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
     WHERE lg.learner_id = $1 AND lg.organisation_id = $2 AND g.user_id = $3`,
    [learnerId, ctx.organisationId, ctx.user.id]
  );
}

async function nextInvoiceNumber(ctx) {
  return ctx.db.withTransaction(async (client) => {
    const current = await client.query('SELECT last_number FROM invoice_counters WHERE organisation_id = $1', [ctx.organisationId]);
    let next = 1;
    if (current.rows.length) {
      next = Number(current.rows[0].last_number) + 1;
      await client.query('UPDATE invoice_counters SET last_number = $1 WHERE organisation_id = $2', [next, ctx.organisationId]);
    } else {
      await client.query('INSERT INTO invoice_counters (organisation_id, last_number) VALUES ($1,$2)', [ctx.organisationId, next]);
    }
    return `INV-${new Date().getFullYear()}-${String(next).padStart(4, '0')}`;
  });
}

function paging(ctx, total, page, pageSize) {
  ctx.meta.page = page;
  ctx.meta.pageSize = pageSize;
  ctx.meta.total = total;
  ctx.meta.totalPages = Math.max(1, Math.ceil(total / pageSize));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = {
  assignedClassroomIds,
  guardianLearnerIds,
  getLearner,
  assertLearnerWrite,
  assertPermission,
  has,
  guardianForLearner,
  nextInvoiceNumber,
  paging,
  roundMoney,
  today,
  dateOnly,
  iso
};

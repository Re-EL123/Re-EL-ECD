'use strict';

const { fail } = require('../../../../packages/contracts/errors');

const PERMISSION_CACHE_TTL_MS = 15_000;
const cache = new Map();

function cacheKey(userId, organisationId) {
  return `${userId}:${organisationId}`;
}

function invalidateAccess(userId, organisationId) {
  if (organisationId) cache.delete(cacheKey(userId, organisationId));
  else {
    for (const key of cache.keys()) if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

async function resolveAccess(db, userId, organisationId) {
  const key = cacheKey(userId, organisationId);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const membership = (await db.query(
    `SELECT * FROM memberships WHERE user_id = $1 AND organisation_id = $2`,
    [userId, organisationId]
  )).rows[0];
  if (!membership || membership.status !== 'active') {
    return { membership: membership || null, permissions: new Set(), branchIds: new Set(), orgWide: false, roles: [] };
  }

  const roleRows = (await db.query(
    `SELECT mr.id, mr.branch_id, r.role_key, r.name, r.scope_type
     FROM membership_roles mr
     JOIN roles r ON r.id = mr.role_id
     WHERE mr.membership_id = $1 AND mr.status = 'active'
       AND (mr.expires_at IS NULL OR mr.expires_at > now())`,
    [membership.id]
  )).rows;

  const permissions = new Set();
  const branchIds = new Set();
  let orgWide = false;
  for (const role of roleRows) {
    if (role.branch_id) branchIds.add(role.branch_id);
    else orgWide = true;
    const perms = (await db.query(
      `SELECT p.permission_key FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       JOIN membership_roles mr ON mr.role_id = rp.role_id
       WHERE mr.id = $1`,
      [role.id]
    )).rows;
    perms.forEach((p) => permissions.add(p.permission_key));
  }

  const delegations = (await db.query(
    `SELECT d.* FROM delegations d
     WHERE d.grantee_user_id = $1 AND d.organisation_id = $2
       AND d.revoked_at IS NULL AND d.starts_at <= now() AND d.expires_at > now()`,
    [userId, organisationId]
  )).rows;
  for (const delegation of delegations) {
    const keys = (await db.query(
      'SELECT permission_key FROM delegations_permissions WHERE delegation_id = $1',
      [delegation.id]
    )).rows;
    keys.forEach((k) => permissions.add(k.permission_key));
    if (delegation.branch_id) branchIds.add(delegation.branch_id);
    else orgWide = true;
  }

  const value = {
    membership,
    permissions,
    branchIds,
    orgWide,
    roles: roleRows.map((r) => r.role_key),
    membershipId: membership.id
  };
  cache.set(key, { value, expires: Date.now() + PERMISSION_CACHE_TTL_MS });
  return value;
}

async function requireOrganisationAccess(ctx, organisationId) {
  if (!organisationId) fail('VALIDATION', [{ field: 'organisationId', message: 'An organisation is required.' }]);
  const user = ctx.user;
  if (!user) fail('UNAUTHENTICATED');
  const membership = (await ctx.db.query(
    'SELECT * FROM memberships WHERE user_id = $1 AND organisation_id = $2',
    [user.id, organisationId]
  )).rows[0];
  if (!membership || membership.status !== 'active') fail('TENANT_MISMATCH');
  const organisation = (await ctx.db.query('SELECT * FROM organisations WHERE id = $1', [organisationId])).rows[0];
  if (!organisation) fail('NOT_FOUND');
  return organisation;
}

async function assertBranchAccess(ctx, branchId) {
  if (!branchId) return;
  if (ctx.access.orgWide) return;
  if (!ctx.access.branchIds.has(branchId)) fail('FORBIDDEN');
}

module.exports = { resolveAccess, requireOrganisationAccess, assertBranchAccess, invalidateAccess };

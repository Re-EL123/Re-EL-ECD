'use strict';

async function recordAudit(db, ctx, { action, resourceType, resourceId = null, organisationId = null, branchId = null, metadata = {} }) {
  // An impersonated action is attributed to both: the actor who did the
  // thing and the user whose identity and permissions were used.
  const merged = (ctx && ctx.impersonatedBy)
    ? { ...metadata, impersonatedBy: ctx.impersonatedBy }
    : metadata;
  try {
    await db.query(
      `INSERT INTO audit_events (actor_user_id, organisation_id, branch_id, action, resource_type, resource_id,
        request_id, ip_address, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        ctx && ctx.user ? ctx.user.id : null,
        organisationId || (ctx ? ctx.organisationId : null),
        branchId || null,
        action,
        resourceType,
        resourceId,
        ctx ? ctx.requestId : null,
        ctx ? ctx.ip : null,
        JSON.stringify(merged || {})
      ]
    );
  } catch (error) {
    // Auditing must never break the primary operation, but it must be visible.
    console.error('[audit] failed to record event', { action, resourceType, message: error.message });
  }
}

module.exports = { recordAudit };

'use strict';

async function recordAudit(db, ctx, { action, resourceType, resourceId = null, organisationId = null, branchId = null, metadata = {} }) {
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
        JSON.stringify(metadata || {})
      ]
    );
  } catch (error) {
    // Auditing must never break the primary operation, but it must be visible.
    console.error('[audit] failed to record event', { action, resourceType, message: error.message });
  }
}

module.exports = { recordAudit };

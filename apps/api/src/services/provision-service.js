'use strict';

/**
 * Shared tenant provisioning: organisation + main branch + owner account +
 * membership + role grant + settings + website draft + optional trial plan.
 *
 * Used by both the platform-admin provisioning endpoint
 * (`POST /platform/organisations`) and the public self-signup endpoint
 * (`POST /public/signup`, gated by the platform `allowTenantSignup` setting).
 */

const { invalidateAccess } = require('./access-service');

async function provisionOrganisation(db, input, actorUserId) {
  const result = await db.withTransaction(async (client) => {
    const org = (await client.query(
      `INSERT INTO organisations (name, slug, legal_name, registration_number, status, subscription_status, currency, timezone)
       VALUES ($1,$2,$3,$4,'onboarding','trial',$5,$6) RETURNING *`,
      [input.name, input.slug, input.legalName || input.name, input.registrationNumber || null,
        input.currency || 'ZAR', input.timezone || 'Africa/Johannesburg']
    )).rows[0];
    const branch = (await client.query(
      `INSERT INTO branches (organisation_id, name, slug, contact_email) VALUES ($1,$2,'main',$3) RETURNING *`,
      [org.id, input.branchName || 'Main Branch', input.ownerEmail]
    )).rows[0];
    let owner = input.owner || null;
    let isNewOwner = false;
    if (!owner) {
      owner = (await client.query(
        `INSERT INTO users (email, email_normalized, display_name, password_hash, status)
         VALUES ($1,$2,$3,$4,'active') RETURNING *`,
        [input.ownerEmail, input.ownerEmail.toLowerCase(), input.ownerName, input.passwordHash]
      )).rows[0];
      isNewOwner = true;
    }
    const membership = (await client.query(
      `INSERT INTO memberships (user_id, organisation_id, status, joined_at) VALUES ($1,$2,'active',now()) RETURNING *`,
      [owner.id, org.id]
    )).rows[0];
    const ownerRole = (await client.query("SELECT id FROM roles WHERE role_key = 'organisation_owner'")).rows[0];
    await client.query(
      `INSERT INTO membership_roles (membership_id, role_id, granted_by, status) VALUES ($1,$2,$3,'active')`,
      [membership.id, ownerRole.id, actorUserId || null]
    );
    await client.query('INSERT INTO branch_memberships (membership_id, branch_id) VALUES ($1,$2)', [membership.id, branch.id]);
    await client.query('INSERT INTO organisation_settings (organisation_id, settings) VALUES ($1,$2)', [org.id, JSON.stringify({
      academicYear: new Date().getFullYear(),
      operatingHours: { open: '06:30', close: '18:00' },
      publicWebsite: { enabled: false }
    })]);
    await client.query(
      `INSERT INTO website_configs (organisation_id, branch_id, slug, status) VALUES ($1,$2,$3,'draft')`,
      [org.id, branch.id, input.slug]
    );
    if (input.planKey) {
      const plan = (await client.query('SELECT id FROM subscription_plans WHERE plan_key = $1', [input.planKey])).rows[0];
      if (plan) {
        await client.query(
          `INSERT INTO platform_subscriptions (organisation_id, plan_id, status, current_period_start, current_period_end)
           VALUES ($1,$2,'trial',CURRENT_DATE,CURRENT_DATE + 30)`, [org.id, plan.id]
        );
      }
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id, organisation_id, branch_id, action, resource_type, resource_id, metadata)
       VALUES ($1,$2,$3,'organisation.provisioned','organisation',$2,$4)`,
      [actorUserId || null, org.id, branch.id, JSON.stringify({ planKey: input.planKey || null, source: input.source || 'admin' })]
    );
    return { organisation: org, branch, membership, owner, isNewOwner };
  });
  invalidateAccess(result.owner.id, result.organisation.id);
  return result;
}

module.exports = { provisionOrganisation };

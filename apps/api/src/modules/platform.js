'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { hashPassword, randomToken, sha256 } = require('../../../../packages/auth/password');
const { ROLES } = require('../../../../packages/auth/roles');
const { recordAudit } = require('../services/audit-service');
const { invalidateAccess } = require('../services/access-service');
const { parsePagination } = require('../utils/http');

function register(router) {
  router.get('/platform/overview', async (ctx) => {
    const orgs = await ctx.db.one(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)::int AS active,
              SUM(CASE WHEN status = 'onboarding' THEN 1 ELSE 0 END)::int AS onboarding,
              SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END)::int AS suspended
       FROM organisations WHERE slug <> 're-el-platform'`
    );
    const users = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM users WHERE status = 'active'`
    );
    const learners = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM learners WHERE status = 'enrolled'`
    );
    const revenue = await ctx.db.one(
      `SELECT COALESCE(SUM(sp.monthly_price), 0)::float AS mrr
       FROM platform_subscriptions ps JOIN subscription_plans sp ON sp.id = ps.plan_id
       WHERE ps.status IN ('active','past_due')`
    );
    const failedPayments = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM payments WHERE status = 'failed'`
    );
    const security = await ctx.db.many(
      `SELECT action, COUNT(*)::int AS total FROM audit_events
       WHERE action LIKE 'auth.%' OR action LIKE 'access.%'
       GROUP BY action ORDER BY total DESC LIMIT 6`
    );
    const recentEvents = await ctx.db.many(
      `SELECT ae.*, u.display_name AS actor_name, o.name AS organisation_name
       FROM audit_events ae LEFT JOIN users u ON u.id = ae.actor_user_id
       LEFT JOIN organisations o ON o.id = ae.organisation_id
       ORDER BY ae.occurred_at DESC LIMIT 12`
    );
    return {
      organisations: orgs,
      activeUsers: users.total,
      activeLearners: learners.total,
      subscriptionRevenue: revenue.mrr,
      failedPaymentEvents: failedPayments.total,
      securityEvents: security,
      recentEvents
    };
  }, { platformOnly: true, permission: 'platform.organisations.read' });

  router.get('/platform/organisations', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const search = ctx.query.q ? `%${ctx.query.q}%` : null;
    const status = ctx.query.status || null;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM organisations
       WHERE slug <> 're-el-platform' AND ($1::text IS NULL OR name ILIKE $1 OR slug ILIKE $1)
         AND ($2::text IS NULL OR status = $2)`,
      [search, status]
    );
    const rows = await ctx.db.many(
      `SELECT o.*, sp.name AS plan_name, sp.monthly_price,
        (SELECT COUNT(*)::int FROM learners l WHERE l.organisation_id = o.id AND l.status = 'enrolled') AS learner_count,
        (SELECT COUNT(*)::int FROM staff_profiles s WHERE s.organisation_id = o.id AND s.employment_status = 'active') AS staff_count,
        (SELECT COUNT(*)::int FROM branches b WHERE b.organisation_id = o.id) AS branch_count
       FROM organisations o
       LEFT JOIN platform_subscriptions ps ON ps.organisation_id = o.id
       LEFT JOIN subscription_plans sp ON sp.id = ps.plan_id
       WHERE o.slug <> 're-el-platform'
         AND ($1::text IS NULL OR o.name ILIKE $1 OR o.slug ILIKE $1)
         AND ($2::text IS NULL OR o.status = $2)
       ORDER BY o.created_at DESC LIMIT $3 OFFSET $4`,
      [search, status, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    ctx.meta.totalPages = Math.max(1, Math.ceil(total.total / pageSize));
    return rows;
  }, { platformOnly: true, permission: 'platform.organisations.read' });

  router.get('/platform/organisations/:id', async (ctx) => {
    const organisation = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.params.id]);
    if (!organisation) throw new AppError('NOT_FOUND');
    const [branches, subscription, counts, settings] = await Promise.all([
      ctx.db.many('SELECT * FROM branches WHERE organisation_id = $1 ORDER BY name', [organisation.id]),
      ctx.db.one(
        `SELECT ps.*, sp.name AS plan_name, sp.monthly_price FROM platform_subscriptions ps
         LEFT JOIN subscription_plans sp ON sp.id = ps.plan_id WHERE ps.organisation_id = $1
         ORDER BY ps.created_at DESC LIMIT 1`, [organisation.id]
      ),
      ctx.db.one(
        `SELECT (SELECT COUNT(*)::int FROM learners WHERE organisation_id = $1) AS learners,
                (SELECT COUNT(*)::int FROM staff_profiles WHERE organisation_id = $1) AS staff,
                (SELECT COUNT(*)::int FROM branches WHERE organisation_id = $1) AS branches`,
        [organisation.id]
      ),
      ctx.db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [organisation.id])
    ]);
    return { ...organisation, branches, subscription, counts, settings: settings ? settings.settings : {} };
  }, { platformOnly: true, permission: 'platform.organisations.read' });

  router.post('/platform/organisations', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200 },
      slug: { type: 'string', min: 2, max: 100, regex: /^[a-z0-9-]+$/ },
      legalName: { type: 'string', max: 200, optional: true },
      registrationNumber: { type: 'string', max: 100, optional: true },
      ownerName: { type: 'string', min: 2, max: 120 },
      ownerEmail: { type: 'string', email: true },
      branchName: { type: 'string', min: 2, max: 120, optional: true },
      currency: { type: 'string', min: 3, max: 3, optional: true },
      timezone: { type: 'string', max: 64, optional: true },
      planKey: { type: 'string', max: 40, optional: true },
      temporaryPassword: { type: 'string', min: 10, max: 200, optional: true }
    });
    const existing = await ctx.db.one('SELECT id FROM organisations WHERE slug = $1', [body.slug]);
    if (existing) fail('CONFLICT', null, 'That organisation slug is already in use.');
    const ownerExisting = await ctx.db.one('SELECT * FROM users WHERE email_normalized = $1', [body.ownerEmail.toLowerCase()]);
    if (ownerExisting) {
      const membership = await ctx.db.one('SELECT id FROM memberships WHERE user_id = $1 AND organisation_id IN (SELECT id FROM organisations WHERE slug = $2)',
        [ownerExisting.id, body.slug]);
      if (membership) fail('CONFLICT', null, 'The owner already belongs to this organisation.');
    }
    const password = body.temporaryPassword || `Reel-${randomToken(6)}`;
    const passwordHash = await hashPassword(password);
    const result = await ctx.db.withTransaction(async (client) => {
      const org = (await client.query(
        `INSERT INTO organisations (name, slug, legal_name, registration_number, status, subscription_status, currency, timezone)
         VALUES ($1,$2,$3,$4,'onboarding','trial',$5,$6) RETURNING *`,
        [body.name, body.slug, body.legalName || body.name, body.registrationNumber || null,
          body.currency || 'ZAR', body.timezone || 'Africa/Johannesburg']
      )).rows[0];
      const branch = (await client.query(
        `INSERT INTO branches (organisation_id, name, slug, contact_email) VALUES ($1,$2,'main',$3) RETURNING *`,
        [org.id, body.branchName || 'Main Branch', body.ownerEmail]
      )).rows[0];
      let owner = ownerExisting;
      if (!owner) {
        owner = (await client.query(
          `INSERT INTO users (email, email_normalized, display_name, password_hash, status)
           VALUES ($1,$2,$3,$4,'active') RETURNING *`,
          [body.ownerEmail, body.ownerEmail.toLowerCase(), body.ownerName, passwordHash]
        )).rows[0];
      }
      const membership = (await client.query(
        `INSERT INTO memberships (user_id, organisation_id, status, joined_at) VALUES ($1,$2,'active',now()) RETURNING *`,
        [owner.id, org.id]
      )).rows[0];
      const ownerRole = (await client.query("SELECT id FROM roles WHERE role_key = 'organisation_owner'")).rows[0];
      await client.query(
        `INSERT INTO membership_roles (membership_id, role_id, granted_by, status) VALUES ($1,$2,$3,'active')`,
        [membership.id, ownerRole.id, ctx.user.id]
      );
      await client.query('INSERT INTO branch_memberships (membership_id, branch_id) VALUES ($1,$2)', [membership.id, branch.id]);
      await client.query('INSERT INTO organisation_settings (organisation_id, settings) VALUES ($1,$2)', [org.id, JSON.stringify({
        academicYear: new Date().getFullYear(),
        operatingHours: { open: '06:30', close: '18:00' },
        publicWebsite: { enabled: false }
      })]);
      await client.query(
        `INSERT INTO website_configs (organisation_id, branch_id, slug, status) VALUES ($1,$2,$3,'draft')`,
        [org.id, branch.id, body.slug]
      );
      if (body.planKey) {
        const plan = (await client.query('SELECT id FROM subscription_plans WHERE plan_key = $1', [body.planKey])).rows[0];
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
        [ctx.user.id, org.id, branch.id, JSON.stringify({ planKey: body.planKey || null })]
      );
      return { organisation: org, branch, membership, owner };
    });
    invalidateAccess(result.owner.id, result.organisation.id);
    if (process.env.NODE_ENV !== 'production') ctx.meta.temporaryPassword = password;
    ctx.status = 201;
    return result.organisation;
  }, { platformOnly: true, permission: 'platform.organisations.manage' });

  router.patch('/platform/organisations/:id', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200, optional: true },
      legalName: { type: 'string', max: 200, optional: true },
      registrationNumber: { type: 'string', max: 100, optional: true },
      subscriptionStatus: { type: 'string', enum: ['trial', 'active', 'past_due', 'cancelled'], optional: true },
      timezone: { type: 'string', max: 64, optional: true },
      currency: { type: 'string', min: 3, max: 3, optional: true }
    });
    const organisation = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.params.id]);
    if (!organisation) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `UPDATE organisations SET name = COALESCE($1,name), legal_name = COALESCE($2,legal_name),
        registration_number = COALESCE($3,registration_number), subscription_status = COALESCE($4,subscription_status),
        timezone = COALESCE($5,timezone), currency = COALESCE($6,currency), updated_at = now() WHERE id = $7`,
      [body.name || null, body.legalName || null, body.registrationNumber || null, body.subscriptionStatus || null,
        body.timezone || null, body.currency || null, organisation.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'platform.organisation_updated', resourceType: 'organisation', resourceId: organisation.id,
      organisationId: organisation.id, metadata: { fields: Object.keys(body) }
    });
    return ctx.db.one('SELECT * FROM organisations WHERE id = $1', [organisation.id]);
  }, { platformOnly: true, permission: 'platform.organisations.manage' });

  router.post('/platform/organisations/:id/suspend', async (ctx) => {
    const body = validate(ctx.body, { reason: { type: 'string', min: 5, max: 500 } });
    const organisation = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.params.id]);
    if (!organisation) throw new AppError('NOT_FOUND');
    if (organisation.status === 'suspended') fail('CONFLICT', null, 'This organisation is already suspended.');
    await ctx.db.query(
      `UPDATE organisations SET status = 'suspended', suspended_reason = $1, suspended_at = now(), updated_at = now()
       WHERE id = $2`, [body.reason, organisation.id]
    );
    await ctx.db.query("UPDATE sessions SET revoked_at = now() WHERE user_id IN (SELECT user_id FROM memberships WHERE organisation_id = $1)",
      [organisation.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'platform.organisation_suspended', resourceType: 'organisation', resourceId: organisation.id,
      organisationId: organisation.id, metadata: { reason: body.reason }
    });
    return { success: true, status: 'suspended' };
  }, { platformOnly: true, permission: 'platform.organisations.manage' });

  router.post('/platform/organisations/:id/restore', async (ctx) => {
    const organisation = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.params.id]);
    if (!organisation) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `UPDATE organisations SET status = 'active', suspended_reason = NULL, suspended_at = NULL, updated_at = now()
       WHERE id = $1`, [organisation.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'platform.organisation_restored', resourceType: 'organisation', resourceId: organisation.id,
      organisationId: organisation.id
    });
    return { success: true, status: 'active' };
  }, { platformOnly: true, permission: 'platform.organisations.manage' });

  router.get('/platform/audit-events', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const orgId = ctx.query.organisationId || null;
    const action = ctx.query.action ? `%${ctx.query.action}%` : null;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM audit_events
       WHERE ($1::uuid IS NULL OR organisation_id = $1::uuid)
         AND ($2::text IS NULL OR action ILIKE $2)`,
      [orgId, action]
    );
    const rows = await ctx.db.many(
      `SELECT ae.*, u.display_name AS actor_name, u.email AS actor_email, o.name AS organisation_name
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id
       LEFT JOIN organisations o ON o.id = ae.organisation_id
       WHERE ($1::uuid IS NULL OR ae.organisation_id = $1::uuid)
         AND ($2::text IS NULL OR ae.action ILIKE $2)
       ORDER BY ae.occurred_at DESC LIMIT $3 OFFSET $4`,
      [orgId, action, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    ctx.meta.totalPages = Math.max(1, Math.ceil(total.total / pageSize));
    return rows;
  }, { platformOnly: true, permission: 'platform.audit.read' });

  router.get('/platform/health', async (ctx) => {
    const started = Date.now();
    let database = 'ok';
    let latency = null;
    try {
      await ctx.db.query('SELECT 1 AS ok');
      latency = Date.now() - started;
    } catch {
      database = 'unavailable';
    }
    const errorEvents = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM audit_events WHERE action LIKE '%failed%' AND occurred_at > now() - interval '24 hours'`
    );
    return {
      status: database === 'ok' ? 'healthy' : 'degraded',
      database,
      latencyMs: latency,
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      failedActions24h: errorEvents.total,
      checkedAt: new Date().toISOString()
    };
  }, { platformOnly: true, permission: 'platform.health.read' });

  router.get('/platform/subscriptions', async (ctx) => {
    const plans = await ctx.db.many('SELECT * FROM subscription_plans ORDER BY monthly_price');
    const subscriptions = await ctx.db.many(
      `SELECT ps.*, o.name AS organisation_name, o.status AS organisation_status, sp.name AS plan_name,
              sp.monthly_price
       FROM platform_subscriptions ps
       JOIN organisations o ON o.id = ps.organisation_id
       LEFT JOIN subscription_plans sp ON sp.id = ps.plan_id
       ORDER BY ps.created_at DESC`
    );
    const mrr = subscriptions
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => sum + Number(s.monthly_price || 0), 0);
    return { plans, subscriptions, mrr };
  }, { platformOnly: true, permission: 'platform.subscriptions.read' });

  router.get('/platform/features', async (ctx) => {
    return ctx.db.many('SELECT * FROM feature_flags ORDER BY flag_key');
  }, { platformOnly: true, permission: 'platform.organisations.read' });

  router.patch('/platform/features/:key', async (ctx) => {
    const body = validate(ctx.body, { enabled: { type: 'boolean' } });
    const flag = await ctx.db.one('SELECT * FROM feature_flags WHERE flag_key = $1', [ctx.params.key]);
    if (!flag) throw new AppError('NOT_FOUND');
    await ctx.db.query('UPDATE feature_flags SET enabled = $1, updated_at = now() WHERE id = $2', [body.enabled, flag.id]);
    await recordAudit(ctx.db, ctx, { action: 'platform.feature_updated', resourceType: 'feature_flag', resourceId: flag.id, metadata: { enabled: body.enabled } });
    return { ...flag, enabled: body.enabled };
  }, { platformOnly: true, permission: 'platform.features.manage' });

  router.get('/platform/settings', async (ctx) => {
    const organisation = await ctx.db.one(
      'SELECT * FROM organisations WHERE id = $1', [ctx.organisationId]
    );
    const settings = await ctx.db.one(
      'SELECT settings FROM organisation_settings WHERE organisation_id = $1', [ctx.organisationId]
    );
    return {
      organisation,
      settings: settings ? settings.settings : {},
      platformOrganisationId: ctx.organisationId
    };
  }, { platformOnly: true, permission: 'platform.organisations.read' });

  router.patch('/platform/settings', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200, optional: true },
      legalName: { type: 'string', max: 200, optional: true },
      registrationNumber: { type: 'string', max: 100, optional: true },
      logoUrl: { type: 'string', max: 500, optional: true },
      primaryColour: { type: 'string', max: 9, optional: true },
      timezone: { type: 'string', max: 64, optional: true },
      currency: { type: 'string', min: 3, max: 3, optional: true },
      locale: { type: 'string', max: 10, optional: true },
      settings: { type: 'object', optional: true }
    });
    await ctx.db.query(
      `UPDATE organisations SET name = COALESCE($1,name), legal_name = COALESCE($2,legal_name),
        registration_number = COALESCE($3,registration_number), logo_url = COALESCE($4,logo_url),
        primary_colour = COALESCE($5,primary_colour), timezone = COALESCE($6,timezone),
        currency = COALESCE($7,currency), locale = COALESCE($8,locale), updated_at = now()
       WHERE id = $9`,
      [body.name || null, body.legalName || null, body.registrationNumber || null, body.logoUrl || null,
        body.primaryColour || null, body.timezone || null, body.currency || null, body.locale || null,
        ctx.organisationId]
    );
    if (body.settings) {
      const existing = await ctx.db.one(
        'SELECT settings FROM organisation_settings WHERE organisation_id = $1', [ctx.organisationId]
      );
      const merged = { ...(existing ? existing.settings : {}), ...body.settings };
      if (existing) {
        await ctx.db.query(
          'UPDATE organisation_settings SET settings = $1, updated_at = now() WHERE organisation_id = $2',
          [JSON.stringify(merged), ctx.organisationId]
        );
      } else {
        await ctx.db.query(
          'INSERT INTO organisation_settings (organisation_id, settings) VALUES ($1,$2)',
          [ctx.organisationId, JSON.stringify(merged)]
        );
      }
    }
    await recordAudit(ctx.db, ctx, {
      action: 'platform.settings_updated', resourceType: 'organisation', resourceId: ctx.organisationId,
      metadata: { keys: Object.keys(body).filter((key) => body[key] !== undefined) }
    });
    const organisation = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.organisationId]);
    const settings = await ctx.db.one(
      'SELECT settings FROM organisation_settings WHERE organisation_id = $1', [ctx.organisationId]
    );
    return { organisation, settings: settings ? settings.settings : {} };
  }, { platformOnly: true, permission: 'platform.settings.manage' });

  router.get('/platform/support-cases', async (ctx) => {
    return ctx.db.many(
      `SELECT sc.*, o.name AS organisation_name, u.display_name AS opened_by_name
       FROM support_cases sc JOIN organisations o ON o.id = sc.organisation_id
       LEFT JOIN users u ON u.id = sc.opened_by ORDER BY sc.created_at DESC`
    );
  }, { platformOnly: true, permission: 'platform.support.manage' });

  router.post('/platform/support-cases', async (ctx) => {
    const body = validate(ctx.body, {
      organisationId: { type: 'string', uuid: true },
      subject: { type: 'string', min: 3, max: 200 },
      description: { type: 'string', min: 3, max: 4000 },
      accessGrantedUntil: { type: 'string', datetime: true, optional: true }
    });
    const org = await ctx.db.one('SELECT id FROM organisations WHERE id = $1', [body.organisationId]);
    if (!org) throw new AppError('NOT_FOUND');
    const row = await ctx.db.one(
      `INSERT INTO support_cases (organisation_id, opened_by, subject, description, access_granted_until)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [body.organisationId, ctx.user.id, body.subject, body.description, body.accessGrantedUntil || null]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'platform.support_case_opened', resourceType: 'support_case', resourceId: row.id,
      organisationId: body.organisationId
    });
    ctx.status = 201;
    return row;
  }, { platformOnly: true, permission: 'platform.support.manage' });
}

module.exports = { register };

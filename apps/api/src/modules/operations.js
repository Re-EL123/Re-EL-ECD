'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { parsePagination } = require('../utils/http');
const exportService = require('../services/export-service');
const bulk = require('../services/bulk-service');
const branding = require('../services/branding-service');
const websiteContent = require('../services/website-content');
const domainService = require('../services/domain-service');
const { has, today, roundMoney } = require('./helpers');

const REPORT_CATALOGUE = [
  { key: 'enrolment_summary', name: 'Enrolment summary', description: 'Learner counts by branch, classroom and status.', permission: 'reports.read.daycare' },
  { key: 'attendance_summary', name: 'Attendance summary', description: 'Attendance rates by date and classroom.', permission: 'attendance.reports.daycare' },
  { key: 'finance_summary', name: 'Finance summary', description: 'Invoiced, collected, outstanding and expenses.', permission: 'finance.reports.daycare' },
  { key: 'learner_progress', name: 'Learner progress', description: 'Observation coverage by developmental domain.', permission: 'assessments.read.daycare' },
  { key: 'staff_register', name: 'Staff register', description: 'Staff, roles, classrooms and compliance documents.', permission: 'staff.read.daycare' },
  { key: 'safety_register', name: 'Safety register', description: 'Incidents, severity and corrective actions.', permission: 'safety.read.daycare' },
  { key: 'occupancy', name: 'Occupancy and capacity', description: 'Configured capacity against enrolled learners.', permission: 'reports.read.daycare' },
  { key: 'admissions_funnel', name: 'Admissions funnel', description: 'Enquiries and applications by stage.', permission: 'admissions.read.daycare' }
];

function inferExportFormat(key) {
  const k = String(key).toLowerCase();
  if (/(_at$|_date$|^date$|^date_of_birth$|^issued_at$|^due_at$)/.test(k)) return 'date';
  if (/amount|total|paid|outstanding|balance|cost|fee|price|revenue|gross|net/.test(k)) return 'money';
  if (/count|quantity|qty|number|minutes|hours|learners|staff|children|rate/.test(k)) {
    return /rate|percent/.test(k) ? 'percent' : 'number';
  }
  return undefined;
}

function checklistLabels(values) {
  const list = Array.isArray(values) ? values : [];
  const out = [];
  for (const value of list) {
    const text = String(value === undefined || value === null ? '' : value).trim().slice(0, 300);
    if (text) out.push(text);
  }
  return out;
}

async function taskFor(ctx, id) {
  const task = await ctx.db.one('SELECT * FROM tasks WHERE id = $1 AND organisation_id = $2', [id, ctx.organisationId]);
  if (!task) throw new AppError('NOT_FOUND');
  if (!has(ctx, 'tasks.read.daycare') && task.assigned_to !== ctx.user.id) throw new AppError('FORBIDDEN');
  return task;
}

function register(router) {
  // --- Tasks --------------------------------------------------------------

  router.get('/tasks', async (ctx) => {
    const scopeAll = has(ctx, 'tasks.read.daycare');
    const status = ctx.query.status || null;
    const mine = ctx.query.mine === 'true' || !scopeAll;
    const params = [ctx.organisationId, status];
    let extra = '';
    if (mine) {
      params.push(ctx.user.id);
      extra = ` AND t.assigned_to = $${params.length}`;
    }
    return ctx.db.many(
      `SELECT t.*, u.display_name AS assignee_name, c.display_name AS creator_name,
        (SELECT COUNT(*)::int FROM task_checklist_items ci WHERE ci.task_id = t.id) AS checklist_total,
        (SELECT COUNT(*)::int FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.completed_at IS NOT NULL) AS checklist_done
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN users c ON c.id = t.created_by
       WHERE t.organisation_id = $1 AND ($2::text IS NULL OR t.status = $2)${extra}
       ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'open' THEN 2 ELSE 3 END,
         CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         t.due_at LIMIT 200`, params
    );
  }, { permission: ['tasks.read.own', 'tasks.read.daycare'], permissionMode: 'any' });

  router.post('/tasks', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 3, max: 200 },
      description: { type: 'string', max: 4000, optional: true },
      branchId: { type: 'string', uuid: true, optional: true },
      assignedTo: { type: 'string', uuid: true, optional: true },
      staffIds: { type: 'array', of: 'uuid', max: 20, optional: true },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], optional: true },
      dueAt: { type: 'string', date: true, optional: true },
      relatedResourceType: { type: 'string', max: 60, optional: true },
      relatedResourceId: { type: 'string', uuid: true, optional: true },
      checklist: { type: 'array', max: 60, optional: true }
    });
    const scopeAll = has(ctx, 'tasks.manage.daycare');
    const assignees = body.staffIds && body.staffIds.length
      ? Array.from(new Set(body.staffIds))
      : [body.assignedTo || ctx.user.id];
    if (!scopeAll && assignees.some((id) => id !== ctx.user.id)) {
      fail('FORBIDDEN', null, 'You can only create tasks assigned to yourself.');
    }
    const members = await ctx.db.many(
      "SELECT user_id FROM memberships WHERE organisation_id = $1 AND status = 'active' AND user_id = ANY($2::uuid[])",
      [ctx.organisationId, assignees]
    );
    const valid = new Set(members.map((m) => m.user_id));
    const invalid = assignees.filter((id) => !valid.has(id));
    if (invalid.length) {
      fail('VALIDATION', [{ field: 'staffIds', message: 'One or more assignees are not active organisation members.' }]);
    }
    const items = checklistLabels(body.checklist);
    const createdTasks = await ctx.db.withTransaction(async (client) => {
      const created = [];
      for (const assignedTo of assignees) {
        const task = (await client.query(
          `INSERT INTO tasks (organisation_id, branch_id, title, description, assigned_to, priority, due_at, source,
            related_resource_type, related_resource_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'manual',$8,$9,$10) RETURNING *`,
          [ctx.organisationId, body.branchId || null, body.title, body.description || null, assignedTo,
            body.priority || 'medium', body.dueAt || null, body.relatedResourceType || null,
            body.relatedResourceId || null, ctx.user.id]
        )).rows[0];
        for (const [index, label] of items.entries()) {
          await client.query(
            `INSERT INTO task_checklist_items (organisation_id, task_id, label, sort_order)
             VALUES ($1,$2,$3,$4)`,
            [ctx.organisationId, task.id, label, index]
          );
        }
        created.push(task);
      }
      return created;
    });
    if (assignees.length > 1) {
      for (const task of createdTasks) {
        if (task.assigned_to !== ctx.user.id) {
          await createNotification(ctx.db, ctx, {
            recipientUserIds: [task.assigned_to], type: 'task_assigned', title: 'Task assigned',
            body: task.title, resourceType: 'task', resourceId: task.id
          });
        }
      }
      await recordAudit(ctx.db, ctx, { action: 'task.created', resourceType: 'task', resourceId: createdTasks[0].id,
        metadata: { bulk: true, count: createdTasks.length } });
      ctx.status = 201;
      return { created: createdTasks.length, tasks: createdTasks };
    }
    const task = createdTasks[0];
    if (task.assigned_to !== ctx.user.id) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [task.assigned_to], type: 'task_assigned', title: 'Task assigned',
        body: task.title, resourceType: 'task', resourceId: task.id
      });
    }
    await recordAudit(ctx.db, ctx, { action: 'task.created', resourceType: 'task', resourceId: task.id });
    ctx.status = 201;
    return task;
  }, { permission: ['tasks.read.own', 'tasks.manage.daycare'], permissionMode: 'any' });

  router.patch('/tasks/:id', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 3, max: 200, optional: true },
      description: { type: 'string', max: 4000, optional: true },
      status: { type: 'string', enum: ['open', 'in_progress', 'blocked', 'done', 'cancelled'], optional: true },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], optional: true },
      dueAt: { type: 'string', date: true, optional: true },
      assignedTo: { type: 'string', uuid: true, optional: true }
    });
    const task = await ctx.db.one('SELECT * FROM tasks WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!task) throw new AppError('NOT_FOUND');
    const manager = has(ctx, 'tasks.manage.daycare');
    if (!manager && task.assigned_to !== ctx.user.id) throw new AppError('FORBIDDEN');
    if (!manager && (body.assignedTo || body.title)) fail('FORBIDDEN', null, 'Only a task manager can change ownership or the title.');
    await ctx.db.query(
      `UPDATE tasks SET title = COALESCE($1,title), description = COALESCE($2,description), status = COALESCE($3,status),
        priority = COALESCE($4,priority), due_at = COALESCE($5,due_at), assigned_to = COALESCE($6,assigned_to),
        completed_at = CASE WHEN $3 = 'done' THEN now() ELSE completed_at END, updated_at = now() WHERE id = $7`,
      [body.title || null, body.description || null, body.status || null, body.priority || null,
        body.dueAt || null, body.assignedTo || null, task.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'task.updated', resourceType: 'task', resourceId: task.id, metadata: { status: body.status || null }
    });
    return ctx.db.one('SELECT * FROM tasks WHERE id = $1', [task.id]);
  }, { permission: ['tasks.read.own', 'tasks.manage.daycare'], permissionMode: 'any' });

  router.post('/tasks/bulk', async (ctx) => {
    const body = bulk.parse(ctx.body, ['complete', 'reopen']);
    return bulk.run(ctx, {
      ids: body.ids,
      action: body.action,
      resourceType: 'task',
      auditAction: body.action === 'complete' ? 'task.completed' : 'task.reopened',
      handler: async (id) => {
        const task = await ctx.db.one(
          'SELECT * FROM tasks WHERE id = $1 AND organisation_id = $2', [id, ctx.organisationId]
        );
        if (!task) return { ok: false, reason: 'not found' };
        if (body.action === 'complete') {
          if (task.status === 'done') return { ok: false, reason: 'already done' };
          await ctx.db.query(
            "UPDATE tasks SET status = 'done', completed_at = now(), updated_at = now() WHERE id = $1", [id]
          );
        } else {
          if (task.status !== 'done' && task.status !== 'cancelled') return { ok: false, reason: 'not closed' };
          await ctx.db.query(
            "UPDATE tasks SET status = 'open', completed_at = NULL, updated_at = now() WHERE id = $1", [id]
          );
        }
        return { ok: true, branchId: task.branch_id };
      }
    });
  }, { permission: 'tasks.manage.daycare' });

  router.get('/tasks/:id', async (ctx) => {
    const task = await ctx.db.one('SELECT * FROM tasks WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!task) throw new AppError('NOT_FOUND');
    if (!has(ctx, 'tasks.read.daycare') && task.assigned_to !== ctx.user.id) throw new AppError('FORBIDDEN');
    const comments = await ctx.db.many(
      `SELECT tc.*, u.display_name AS author_name FROM task_comments tc
       JOIN users u ON u.id = tc.author_user_id WHERE tc.task_id = $1 ORDER BY tc.created_at`, [task.id]
    );
    const assignee = task.assigned_to ? await ctx.db.one('SELECT id, display_name, email FROM users WHERE id = $1', [task.assigned_to]) : null;
    const checklist = await ctx.db.many(
      `SELECT ci.*, u.display_name AS completed_by_name FROM task_checklist_items ci
       LEFT JOIN users u ON u.id = ci.completed_by
       WHERE ci.task_id = $1 ORDER BY ci.sort_order, ci.created_at`, [task.id]
    );
    return { ...task, comments, assignee, checklist };
  }, { permission: ['tasks.read.own', 'tasks.read.daycare'], permissionMode: 'any' });

  router.post('/tasks/:id/comments', async (ctx) => {
    const body = validate(ctx.body, { body: { type: 'string', min: 1, max: 4000 } });
    const task = await ctx.db.one('SELECT * FROM tasks WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!task) throw new AppError('NOT_FOUND');
    if (!has(ctx, 'tasks.read.daycare') && task.assigned_to !== ctx.user.id) throw new AppError('FORBIDDEN');
    const comment = await ctx.db.one(
      'INSERT INTO task_comments (task_id, author_user_id, body) VALUES ($1,$2,$3) RETURNING *',
      [task.id, ctx.user.id, body.body]
    );
    return comment;
  }, { permission: ['tasks.read.own', 'tasks.read.daycare'], permissionMode: 'any' });

  router.post('/tasks/:id/checklist', async (ctx) => {
    const body = validate(ctx.body, { items: { type: 'array', max: 60 } });
    const task = await taskFor(ctx, ctx.params.id);
    const items = checklistLabels(body.items);
    if (!items.length) fail('VALIDATION', [{ field: 'items', message: 'Add at least one checklist item.' }]);
    const existing = await ctx.db.one(
      'SELECT COALESCE(MAX(sort_order), -1)::int AS last FROM task_checklist_items WHERE task_id = $1', [task.id]
    );
    let order = Number(existing.last) + 1;
    const created = [];
    for (const label of items) {
      created.push(await ctx.db.one(
        `INSERT INTO task_checklist_items (organisation_id, task_id, label, sort_order)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [ctx.organisationId, task.id, label, order++]
      ));
    }
    await recordAudit(ctx.db, ctx, {
      action: 'task.checklist_added', resourceType: 'task', resourceId: task.id,
      metadata: { items: created.length }
    });
    ctx.status = 201;
    return created;
  }, { permission: ['tasks.read.own', 'tasks.manage.daycare'], permissionMode: 'any' });

  router.patch('/tasks/:id/checklist/:itemId', async (ctx) => {
    const body = validate(ctx.body, { completed: { type: 'boolean' } });
    const task = await taskFor(ctx, ctx.params.id);
    const item = await ctx.db.one(
      'SELECT * FROM task_checklist_items WHERE id = $1 AND task_id = $2 AND organisation_id = $3',
      [ctx.params.itemId, task.id, ctx.organisationId]
    );
    if (!item) throw new AppError('NOT_FOUND');
    const updated = await ctx.db.one(
      `UPDATE task_checklist_items
       SET completed_at = CASE WHEN $1::boolean THEN now() ELSE NULL END,
           completed_by = CASE WHEN $1::boolean THEN $2::uuid ELSE NULL END
       WHERE id = $3::uuid RETURNING *`,
      [body.completed, body.completed ? ctx.user.id : null, item.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: body.completed ? 'task.checklist_completed' : 'task.checklist_reopened',
      resourceType: 'task_checklist_item', resourceId: item.id, metadata: { taskId: task.id }
    });
    return updated;
  }, { permission: ['tasks.read.own', 'tasks.manage.daycare'], permissionMode: 'any' });

  router.delete('/tasks/:id/checklist/:itemId', async (ctx) => {
    const task = await taskFor(ctx, ctx.params.id);
    const item = await ctx.db.one(
      'SELECT * FROM task_checklist_items WHERE id = $1 AND task_id = $2 AND organisation_id = $3',
      [ctx.params.itemId, task.id, ctx.organisationId]
    );
    if (!item) throw new AppError('NOT_FOUND');
    if (!has(ctx, 'tasks.manage.daycare') && task.assigned_to !== ctx.user.id) throw new AppError('FORBIDDEN');
    await ctx.db.query('DELETE FROM task_checklist_items WHERE id = $1', [item.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'task.checklist_removed', resourceType: 'task_checklist_item', resourceId: item.id,
      metadata: { taskId: task.id }
    });
    return { deleted: true };
  }, { permission: ['tasks.read.own', 'tasks.manage.daycare'], permissionMode: 'any' });

  router.get('/tasks/overview/counts', async (ctx) => {
    const scopeAll = has(ctx, 'tasks.read.daycare');
    const filter = scopeAll ? '' : ' AND assigned_to = $2';
    const params = scopeAll ? [ctx.organisationId] : [ctx.organisationId, ctx.user.id];
    const counts = await ctx.db.one(
      `SELECT
        COUNT(CASE WHEN status = 'open' THEN 1 END)::int AS open,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END)::int AS blocked,
        COUNT(CASE WHEN status = 'done' AND completed_at > now() - interval '7 days' THEN 1 END)::int AS recently_done,
        COUNT(CASE WHEN due_at < CURRENT_DATE AND status NOT IN ('done','cancelled') THEN 1 END)::int AS overdue
       FROM tasks WHERE organisation_id = $1${filter}`, params
    );
    return counts;
  }, { permission: ['tasks.read.own', 'tasks.read.daycare'], permissionMode: 'any' });

  // --- Website ------------------------------------------------------------

  router.get('/website', async (ctx) => {
    const config = await ctx.db.one(
      'SELECT * FROM website_configs WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]
    );
    const domainRows = await ctx.db.many(
      'SELECT * FROM domains WHERE organisation_id = $1 ORDER BY created_at DESC', [ctx.organisationId]
    );
    const domains = domainRows.map((row) => domainService.present(row, ctx.organisation));
    const content = websiteContent.normalise(config ? config.draft_content : null, ctx.organisation);
    return {
      config,
      domains,
      content,
      seo: content.seo,
      pages: websiteContent.pages(),
      branding: branding.themeFromOrganisation(ctx.organisation),
      organisation: {
        id: ctx.organisation.id,
        name: ctx.organisation.name,
        slug: ctx.organisation.slug,
        logoUrl: ctx.organisation.logo_url || null,
        currency: ctx.organisation.currency || 'ZAR',
        freeSubdomain: domainService.freeSubdomain(ctx.organisation.slug)
      }
    };
  }, { permission: 'website.read.daycare' });

  /**
   * Whether the two addresses the editor advertises can actually be opened.
   * Kept out of GET /website so a DNS/TLS probe never delays the editor itself.
   */
  router.get('/website/addresses', async (ctx) => domainService.addressReadiness(ctx.organisation),
    { permission: 'website.read.daycare' });

  router.patch('/website', async (ctx) => {
    const body = validate(ctx.body, {
      theme: { type: 'string', max: 40, optional: true },
      draftContent: { type: 'object' }
    });
    let config = await ctx.db.one(
      'SELECT * FROM website_configs WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]
    );
    const current = websiteContent.normalise(config ? config.draft_content : null, ctx.organisation);
    // Deep-merge so an editor tab that saves one section never wipes another.
    const mergedRaw = websiteContent.deepMerge(current, body.draftContent);
    // SEO title/description are optional overrides. The editor pre-fills them
    // with the derived values, so if the incoming value still matches what the
    // previous content derived, blank it and let it follow the new copy.
    const derivedBefore = websiteContent.deriveSeo(Object.assign({}, current, { seo: {} }), ctx.organisation);
    const incomingSeo = (body.draftContent && body.draftContent.seo) || {};
    const mergedSeo = Object.assign({}, mergedRaw.seo);
    if (incomingSeo.title === undefined || incomingSeo.title === derivedBefore.title) mergedSeo.title = '';
    if (incomingSeo.description === undefined || incomingSeo.description === derivedBefore.description) mergedSeo.description = '';
    mergedRaw.seo = mergedSeo;
    const merged = websiteContent.normalise(mergedRaw, ctx.organisation);
    if (!config) {
      const branch = await ctx.db.one('SELECT id FROM branches WHERE organisation_id = $1 ORDER BY created_at LIMIT 1',
        [ctx.organisationId]);
      config = await ctx.db.one(
        `INSERT INTO website_configs (organisation_id, branch_id, slug, theme, draft_content)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [ctx.organisationId, branch ? branch.id : null, ctx.organisation.slug,
          body.theme || 'nature', JSON.stringify(merged)]
      );
    } else {
      await ctx.db.query(
        'UPDATE website_configs SET theme = COALESCE($1,theme), draft_content = $2, updated_at = now() WHERE id = $3',
        [body.theme || null, JSON.stringify(merged), config.id]
      );
      config = await ctx.db.one('SELECT * FROM website_configs WHERE id = $1', [config.id]);
    }
    await recordAudit(ctx.db, ctx, {
      action: 'website.draft_updated', resourceType: 'website_config', resourceId: config.id
    });
    return Object.assign({}, config, {
      content: merged,
      seo: merged.seo,
      pages: websiteContent.pages()
    });
  }, { permission: 'website.manage.daycare' });

  router.post('/website/publish', async (ctx) => {
    const config = await ctx.db.one(
      'SELECT * FROM website_configs WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]
    );
    if (!config) fail('CONFLICT', null, 'Configure the website before publishing.');
    const content = websiteContent.normalise(config.draft_content, ctx.organisation);
    if (!content.hero.headline) {
      fail('VALIDATION', null, 'Add a hero headline before publishing.');
    }
    if (!content.about.body) {
      fail('VALIDATION', null, 'Add an introduction before publishing.');
    }
    await ctx.db.query(
      `UPDATE website_configs SET published_content = $1, status = 'published', published_at = now(),
        updated_at = now() WHERE id = $2`, [JSON.stringify(content), config.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'website.published', resourceType: 'website_config', resourceId: config.id
    });
    return ctx.db.one('SELECT * FROM website_configs WHERE id = $1', [config.id]);
  }, { permission: 'website.manage.daycare' });

  router.post('/website/unpublish', async (ctx) => {
    const config = await ctx.db.one(
      'SELECT * FROM website_configs WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]
    );
    if (!config) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      "UPDATE website_configs SET status = 'unpublished', updated_at = now() WHERE id = $1", [config.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'website.unpublished', resourceType: 'website_config', resourceId: config.id
    });
    return { success: true };
  }, { permission: 'website.manage.daycare' });

  router.post('/website/domains', async (ctx) => {
    const body = validate(ctx.body, {
      domainName: { type: 'string', min: 4, max: 255 }
    });
    const domainName = domainService.normaliseHost(body.domainName);
    if (!domainName) {
      fail('VALIDATION', [{ field: 'domainName', message: 'Enter a public domain such as www.example.co.za.' }]);
    }
    const existing = await ctx.db.one('SELECT id FROM domains WHERE lower(domain_name) = $1', [domainName]);
    if (existing) fail('CONFLICT', null, 'That domain is already registered.');

    const domain = await ctx.db.one(
      `INSERT INTO domains (organisation_id, domain_name, verification_token, verification_method,
         verification_status, ssl_status)
       VALUES ($1,$2,$3,'cname','pending','pending') RETURNING *`,
      [ctx.organisationId, domainName, domainService.generateToken()]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'website.domain_added', resourceType: 'domain', resourceId: domain.id,
      metadata: { domainName }
    });
    ctx.status = 201;
    return domainService.present(domain, ctx.organisation);
  }, { permission: 'website.manage.daycare' });

  router.get('/website/domains/:id', async (ctx) => {
    const domain = await ctx.db.one(
      'SELECT * FROM domains WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]
    );
    if (!domain) throw new AppError('NOT_FOUND');
    return domainService.present(domain, ctx.organisation);
  }, { permission: 'website.read.daycare' });

  router.post('/website/domains/:id/verify', async (ctx) => {
    const domain = await ctx.db.one(
      'SELECT * FROM domains WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]
    );
    if (!domain) throw new AppError('NOT_FOUND');

    const check = await domainService.verifyDomain(domain);
    const verified = check.verified;
    // A CNAME proves traffic is pointed at the Re-EL edge, so TLS can be marked
    // active. A TXT-only verification proves ownership but not routing, so the
    // certificate stays pending until the edge attachment is confirmed.
    const sslStatus = verified && check.method === 'cname' ? 'active' : 'pending';
    const updated = await ctx.db.one(
      `UPDATE domains
       SET verification_status = $2,
           verification_method = $3,
           ssl_status = $4,
           verified_at = CASE WHEN $6 THEN now() ELSE NULL END,
           last_checked_at = now(),
           failure_reason = $5,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [domain.id, verified ? 'verified' : 'failed', check.method || 'cname', sslStatus, check.reason, verified]
    );
    await recordAudit(ctx.db, ctx, {
      action: verified ? 'website.domain_verified' : 'website.domain_verification_failed',
      resourceType: 'domain', resourceId: domain.id,
      metadata: { domainName: domain.domain_name, method: check.method, sslStatus }
    });
    return Object.assign(domainService.present(updated, ctx.organisation), { check });
  }, { permission: 'website.manage.daycare' });

  router.delete('/website/domains/:id', async (ctx) => {
    const domain = await ctx.db.one(
      'SELECT * FROM domains WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]
    );
    if (!domain) throw new AppError('NOT_FOUND');
    await ctx.db.query('DELETE FROM domains WHERE id = $1 AND organisation_id = $2', [domain.id, ctx.organisationId]);
    await recordAudit(ctx.db, ctx, {
      action: 'website.domain_removed', resourceType: 'domain', resourceId: domain.id,
      metadata: { domainName: domain.domain_name }
    });
    return { success: true, domainName: domain.domain_name };
  }, { permission: 'website.manage.daycare' });

  // --- Reports ------------------------------------------------------------

  router.get('/reports', async (ctx) => {
    const available = REPORT_CATALOGUE.filter((report) => has(ctx, report.permission));
    const jobs = await ctx.db.many(
      `SELECT rj.*, u.display_name AS requested_by_name FROM report_jobs rj
       LEFT JOIN users u ON u.id = rj.requested_by
       WHERE rj.organisation_id = $1 ORDER BY rj.created_at DESC LIMIT 20`, [ctx.organisationId]
    );
    return { catalogue: available, jobs };
  }, { permission: ['reports.read.daycare', 'reports.read.assigned'], permissionMode: 'any' });

  router.get('/reports/:key', async (ctx) => {
    const report = REPORT_CATALOGUE.find((r) => r.key === ctx.params.key);
    if (!report) throw new AppError('NOT_FOUND');
    if (!has(ctx, report.permission)) throw new AppError('FORBIDDEN');
    const from = ctx.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = ctx.query.to || today();
    const rows = await buildReport(ctx, report.key, from, to);
    const format = String(ctx.query.format || '').toLowerCase();
    if (['csv', 'xlsx', 'pdf'].includes(format)) {
      const keys = rows.length ? Object.keys(rows[0]) : ['no_data'];
      const columns = keys.map((key) => ({
        key,
        label: String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        format: inferExportFormat(key),
        align: /amount|total|paid|outstanding|balance|cost|fee|count|quantity|minutes|hours|rate|percent/.test(String(key).toLowerCase()) ? 'right' : undefined
      }));
      const organisation = await ctx.db.one('SELECT name FROM organisations WHERE id = $1', [ctx.organisationId]);
      let buffer;
      let type;
      let ext;
      if (format === 'csv') {
        buffer = exportService.toCsv(columns, rows);
        type = 'text/csv; charset=utf-8';
        ext = 'csv';
      } else if (format === 'xlsx') {
        buffer = exportService.toXlsx(columns, rows, report.key);
        type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        ext = 'xlsx';
      } else {
        buffer = exportService.toPdf({
          title: report.name,
          subtitle: 'From ' + from + ' to ' + to,
          columns,
          rows,
          footer: 'Re-EL ECD — ' + (organisation ? organisation.name : ''),
          generatedAt: new Date()
        });
        type = 'application/pdf';
        ext = 'pdf';
      }
      await recordAudit(ctx.db, ctx, {
        action: 'report.exported', resourceType: 'report', resourceId: null,
        metadata: { report: report.key, format, rowCount: rows.length }
      });
      ctx.rawResponse = true;
      ctx.res.statusCode = 200;
      ctx.res.setHeader('Content-Type', type);
      ctx.res.setHeader('Content-Disposition', 'attachment; filename="re-el-' + report.key + '.' + ext + '"');
      ctx.res.setHeader('Cache-Control', 'no-store');
      ctx.res.end(buffer);
      return;
    }
    return { report: { key: report.key, name: report.name }, from, to, rows, generatedAt: new Date().toISOString() };
  }, { permission: ['reports.read.daycare', 'reports.read.assigned'], permissionMode: 'any' });

  router.post('/reports/jobs', async (ctx) => {
    const body = validate(ctx.body, {
      reportKey: { type: 'string', min: 2, max: 80 },
      parameters: { type: 'object', optional: true }
    });
    const report = REPORT_CATALOGUE.find((r) => r.key === body.reportKey);
    if (!report) fail('VALIDATION', [{ field: 'reportKey', message: 'Unknown report.' }]);
    if (!has(ctx, report.permission)) throw new AppError('FORBIDDEN');
    const job = await ctx.db.one(
      `INSERT INTO report_jobs (organisation_id, report_key, parameters, status, requested_by, completed_at, row_count)
       VALUES ($1,$2,$3,'completed',$4,now(),0) RETURNING *`,
      [ctx.organisationId, body.reportKey, JSON.stringify(body.parameters || {}), ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'report.job_created', resourceType: 'report_job', resourceId: job.id,
      metadata: { reportKey: body.reportKey }
    });
    ctx.status = 201;
    return job;
  }, { permission: 'reports.export.daycare' });

  // --- Automation ---------------------------------------------------------

  router.get('/automation-rules', async (ctx) => {
    return ctx.db.many('SELECT * FROM automation_rules WHERE organisation_id = $1 ORDER BY created_at DESC', [ctx.organisationId]);
  }, { permission: 'organisation.settings.manage' });

  router.post('/automation-rules', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 150 },
      triggerEvent: { type: 'string', min: 3, max: 120 },
      conditions: { type: 'object', optional: true },
      action: { type: 'object' },
      active: { type: 'boolean', optional: true }
    });
    const rule = await ctx.db.one(
      `INSERT INTO automation_rules (organisation_id, name, trigger_event, conditions, action, active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.organisationId, body.name, body.triggerEvent, JSON.stringify(body.conditions || {}),
        JSON.stringify(body.action), body.active !== false, ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'automation.rule_created', resourceType: 'automation_rule', resourceId: rule.id
    });
    ctx.status = 201;
    return rule;
  }, { permission: 'organisation.settings.manage' });

  // --- Reminder sweep ------------------------------------------------------
  // On-demand "who needs a nudge?" pass. Built-in checks: children without a
  // recent observation, lesson plans waiting too long for review, and scheduled
  // activities that were never completed. Every notification is in-app and is
  // de-duplicated by only notifying when something is actually outstanding.

  router.post('/automation/sweep', async (ctx) => {
    const summary = { childrenWithoutObservations: 0, observationNotifications: 0, plansAwaitingReview: 0, planReminderNotifications: 0, overdueActivities: 0, activityReminderNotifications: 0 };

    const missing = await ctx.db.many(
      `SELECT l.id, l.first_name, l.last_name, l.classroom_id
       FROM learners l
       WHERE l.organisation_id = $1 AND l.status = 'enrolled'
         AND NOT EXISTS (SELECT 1 FROM learner_observations o WHERE o.learner_id = l.id AND o.observation_date > CURRENT_DATE - 60)`,
      [ctx.organisationId]
    );
    summary.childrenWithoutObservations = missing.length;
    const byClassroom = new Map();
    for (const child of missing) {
      const key = child.classroom_id || 'unassigned';
      if (!byClassroom.has(key)) byClassroom.set(key, []);
      byClassroom.get(key).push(child);
    }
    for (const [classId, children] of byClassroom) {
      let recipients = [];
      if (classId !== 'unassigned') {
        const staff = await ctx.db.many(
          `SELECT DISTINCT sp.user_id FROM staff_classrooms sc
           JOIN staff_profiles sp ON sp.id = sc.staff_id AND sp.organisation_id = $1
           WHERE sc.classroom_id = $2`,
          [ctx.organisationId, classId]
        );
        recipients = staff.map((s) => s.user_id).filter(Boolean);
      }
      if (!recipients.length) {
        const leadership = await ctx.db.many(
          `SELECT DISTINCT m.user_id FROM memberships m
           JOIN membership_roles mr ON mr.membership_id = m.id
           JOIN roles r ON r.id = mr.role_id
           WHERE m.organisation_id = $1 AND m.status = 'active'
             AND r.role_key IN ('OWNER','PRINCIPAL','ADMINISTRATOR','MANAGER','CURRICULUM_COORDINATOR')`,
          [ctx.organisationId]
        );
        recipients = leadership.map((s) => s.user_id);
      }
      if (!recipients.length) continue;
      const names = children.slice(0, 5).map((c) => c.first_name + ' ' + c.last_name).join(', ');
      await createNotification(ctx.db, ctx, {
        recipientUserIds: recipients,
        type: 'observation_due',
        title: 'Children need observations (' + children.length + ')',
        body: 'No observation in 60 days for: ' + names + (children.length > 5 ? ' and ' + (children.length - 5) + ' more.' : '.'),
        resourceType: 'classroom',
        resourceId: classId === 'unassigned' ? null : classId
      });
      summary.observationNotifications += recipients.length;
    }

    const awaiting = await ctx.db.many(
      `SELECT lp.id, lp.title, lp.status FROM lesson_plans lp
       WHERE lp.organisation_id = $1 AND lp.status IN ('submitted','approved') AND lp.updated_at < now() - interval '7 days'`,
      [ctx.organisationId]
    );
    summary.plansAwaitingReview = awaiting.length;
    if (awaiting.length) {
      const leadership = await ctx.db.many(
        `SELECT DISTINCT m.user_id FROM memberships m
         JOIN membership_roles mr ON mr.membership_id = m.id
         JOIN roles r ON r.id = mr.role_id
         WHERE m.organisation_id = $1 AND m.status = 'active'
           AND r.role_key IN ('OWNER','PRINCIPAL','ADMINISTRATOR','MANAGER','CURRICULUM_COORDINATOR')`,
        [ctx.organisationId]
      );
      if (leadership.length) {
        await createNotification(ctx.db, ctx, {
          recipientUserIds: leadership.map((s) => s.user_id),
          type: 'plan_review_due',
          title: 'Lesson plans waiting for review (' + awaiting.length + ')',
          body: awaiting.slice(0, 5).map((p) => p.title).join('; ') + (awaiting.length > 5 ? '…' : ''),
          resourceType: 'lesson_plan',
          resourceId: null
        });
        summary.planReminderNotifications = leadership.length;
      }
    }

    const overdue = await ctx.db.many(
      `SELECT sa.id, sa.title, sa.assigned_staff_id FROM scheduled_activities sa
       WHERE sa.organisation_id = $1 AND sa.status IN ('scheduled','in_progress') AND sa.starts_at < now() - interval '1 day'`,
      [ctx.organisationId]
    );
    summary.overdueActivities = overdue.length;
    for (const event of overdue) {
      if (!event.assigned_staff_id) continue;
      const staffUser = await ctx.db.one('SELECT sp.user_id FROM staff_profiles sp WHERE sp.id = $1', [event.assigned_staff_id]);
      if (!staffUser || !staffUser.user_id) continue;
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [staffUser.user_id],
        type: 'activity_overdue',
        title: 'An activity is still awaiting completion',
        body: event.title + ' was scheduled and has not been marked complete. Please mark it complete or cancel it.',
        resourceType: 'scheduled_activity',
        resourceId: event.id
      });
      summary.activityReminderNotifications += 1;
    }

    await recordAudit(ctx.db, ctx, {
      action: 'automation.sweep', resourceType: 'organisation', resourceId: ctx.organisationId, metadata: summary
    });
    return summary;
  }, { permission: 'organisation.settings.manage' });

  // --- Family engagement: the silent 20% -----------------------------------
  // Staff see who is enjoying the app; guardians get a gentle nudge before
  // the silence turns into a withdrawn child and an unpaid balance.

  async function quietFamilyRows(db, organisationId, days, limit) {
    const windowDays = Math.max(1, Math.min(30, Number(days) || 7));
    const rows = await db.many(
      `SELECT g.id AS user_id,
              g.display_name AS guardian_name,
              array_agg(DISTINCT l.first_name ORDER BY l.first_name) AS children,
              m.digest_opened_at,
              MAX(GREATEST(
                COALESCE(o.parent_viewed_at, 'epoch'::timestamptz),
                COALESCE(r.parent_viewed_at, 'epoch'::timestamptz)
              )) AS last_content_view,
              MAX((m.activation->>'lastVisitAt')::timestamptz) AS last_visit
       FROM memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles rol ON rol.id = mr.role_id AND rol.role_key = 'parent_guardian'
       JOIN users g ON g.id = m.user_id
       JOIN learner_guardians lg ON lg.organisation_id = $1 AND lg.portal_access_status = 'active'
         AND (lg.ends_at IS NULL OR lg.ends_at >= CURRENT_DATE)
       JOIN guardians gg ON gg.id = lg.guardian_id AND gg.user_id = g.id
       JOIN learners l ON l.id = lg.learner_id
       LEFT JOIN learner_observations o ON o.learner_id = l.id
       LEFT JOIN daily_reports r ON r.learner_id = l.id
       WHERE m.organisation_id = $1 AND m.status = 'active' AND g.email IS NOT NULL
       GROUP BY g.id, g.display_name, m.digest_opened_at, m.activation
       ORDER BY 5 ASC NULLS FIRST
       LIMIT 200`,
      [organisationId]
    );
    const cutoff = Date.now() - windowDays * 86400000;
    const out = [];
    for (const row of rows) {
      const lastContent = row.last_content_view && new Date(row.last_content_view).getTime() > 0 ? new Date(row.last_content_view) : null;
      const lastVisit = row.last_visit ? new Date(row.last_visit) : null;
      const lastDigest = row.digest_opened_at ? new Date(row.digest_opened_at) : null;
      const candidates = [lastContent, lastVisit, lastDigest].filter(Boolean);
      const lastEngagement = candidates.length ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;
      if (lastEngagement && lastEngagement.getTime() >= cutoff) continue;
      out.push({
        userId: row.user_id,
        guardianName: row.guardian_name,
        children: row.children,
        lastEngagement: lastEngagement ? lastEngagement.toISOString() : null,
        daysQuiet: lastEngagement ? Math.floor((Date.now() - lastEngagement.getTime()) / 86400000) : null
      });
      if (out.length >= (limit || 100)) break;
    }
    return out;
  }

  router.get('/reports/engagement/quiet', async (ctx) => {
    const days = Math.max(1, Math.min(30, Number(ctx.query.days || 7)));
    const families = await quietFamilyRows(ctx.db, ctx.organisationId, days, 100);
    return { families, count: families.length, windowDays: days };
  }, { permission: 'reports.read.daycare' });

  async function nudgeFamily(db, organisation, userId, days) {
    const guardian = await db.one(
      `SELECT u.display_name, u.email FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.organisation_id = $2 AND m.status = 'active'
       WHERE u.id = $1`, [userId, organisation.id]);
    if (!guardian || !guardian.email) return { sent: false, error: 'No email address on file.' };
    const children = await db.many(
      `SELECT l.first_name FROM learner_guardians lg
       JOIN guardians g ON g.id = lg.guardian_id
       JOIN learners l ON l.id = lg.learner_id
       WHERE lg.organisation_id = $1 AND g.user_id = $2 AND lg.portal_access_status = 'active'
         AND (lg.ends_at IS NULL OR lg.ends_at >= CURRENT_DATE) ORDER BY l.first_name`,
      [organisation.id, userId]);
    const firstChild = children[0] ? children[0].first_name : 'your child';
    const childList = children.map((c) => c.first_name).join(', ') || firstChild;
    try {
      const { sendTemplate } = require('../services/email-service');
      const result = await sendTemplate(db, 'familyNudge', {
        to: guardian.email,
        organisationId: organisation.id,
        data: {
          organisationName: organisation.name,
          guardianName: guardian.display_name,
          firstChild,
          message: childList + ' had a wonderful week and the app has more than the numbers tell — fresh photos, little moments and Friday’s note are all on the family portal. Open it when you have a quiet minute.'
        },
        metadata: { kind: 'family_nudge', days: days || 7 }
      });
      await createNotification(db, null, {
        recipientUserIds: [userId], type: 'family_nudge', organisationId: organisation.id,
        title: 'A note from your centre',
        body: childList + ' had a wonderful week — the photos and moments are waiting on the family portal.',
        url: '/parent/overview'
      });
      return { sent: !!(result && result.status === 'sent'), emailed: guardian.email };
    } catch (error) {
      return { sent: false, error: error.message };
    }
  }

  router.post('/reports/engagement/nudge', async (ctx) => {
    const body = validate(ctx.body, {
      userId: { type: 'string', uuid: true },
      days: { type: 'number', optional: true }
    });
    const result = await nudgeFamily(ctx.db, ctx.organisation, body.userId, body.days || 7);
    if (!result.emailed && result.error) throw new AppError('NOT_FOUND', null, result.error);
    await recordAudit(ctx.db, ctx, { action: 'reports.family_nudged', resourceType: 'user', resourceId: body.userId, metadata: { days: body.days || 7 } });
    return result;
  }, { permission: 'organisation.settings.manage' });

  router.post('/reports/engagement/nudge-all', async (ctx) => {
    const days = Math.max(1, Math.min(30, Number((ctx.body && ctx.body.days) || 7)));
    const families = await quietFamilyRows(ctx.db, ctx.organisationId, days, 100);
    let sent = 0;
    const failed = [];
    for (const family of families) {
      const result = await nudgeFamily(ctx.db, ctx.organisation, family.userId, days);
      if (result.sent) sent += 1; else failed.push({ userId: family.userId, error: result.error || 'not sent' });
    }
    await recordAudit(ctx.db, ctx, { action: 'reports.family_nudge_all', resourceType: 'organisation', resourceId: ctx.organisationId, metadata: { sent, total: families.length, days } });
    return { sent, total: families.length, failed };
  }, { permission: 'organisation.settings.manage' });

  // --- Family onboarding cohort (first 60 days) ------------------------------
  // Three markers of value landed: push enabled, a report opened, a return
  // visit. The owner watches the cohort; the silent households get a nudge.

  router.get('/reports/family-onboarding', async (ctx) => {
    const rows = await ctx.db.many(
      `SELECT g.id AS user_id,
              g.display_name AS guardian_name,
              m.created_at AS joined_at,
              m.digest_opened_at,
              jsonb_array_length(COALESCE(m.activation->'visitDates', '[]'::jsonb)) AS visit_days,
              EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = g.id) AS push_enabled,
              EXISTS (
                SELECT 1 FROM learners l
                JOIN learner_guardians lg ON lg.learner_id = l.id AND lg.organisation_id = $1 AND lg.portal_access_status = 'active'
                JOIN guardians gg ON gg.id = lg.guardian_id AND gg.user_id = g.id
                WHERE (SELECT COUNT(*) FROM daily_reports dr WHERE dr.learner_id = l.id AND dr.parent_viewed_at IS NOT NULL)
                    + (SELECT COUNT(*) FROM learner_observations o WHERE o.learner_id = l.id AND o.parent_viewed_at IS NOT NULL) > 0
              ) AS report_opened,
              (SELECT array_agg(l.first_name ORDER BY l.first_name) FROM learners l
               JOIN learner_guardians lg2 ON lg2.learner_id = l.id AND lg2.organisation_id = $1 AND lg2.portal_access_status = 'active'
               JOIN guardians gg2 ON gg2.id = lg2.guardian_id AND gg2.user_id = g.id) AS children
       FROM memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles rol ON rol.id = mr.role_id AND rol.role_key = 'parent_guardian'
       JOIN users g ON g.id = m.user_id
       WHERE m.organisation_id = $1 AND m.status = 'active'
         AND m.created_at > now() - interval '60 days'
       ORDER BY m.created_at DESC`,
      [ctx.organisationId]
    );
    const families = rows.map((row) => ({
      userId: row.user_id,
      guardianName: row.guardian_name,
      joinedAt: row.joined_at,
      daysSinceJoin: Math.floor((Date.now() - new Date(row.joined_at).getTime()) / 86400000),
      pushEnabled: Boolean(row.push_enabled),
      reportOpened: Boolean(row.report_opened),
      returnVisit: Number(row.visit_days) >= 2,
      visitDays: Number(row.visit_days) || 0,
      digestOpenedAt: row.digest_opened_at || null,
      children: row.children
    }));
    const total = families.length;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    return {
      total,
      pushPct: pct(families.filter((f) => f.pushEnabled).length),
      reportOpenedPct: pct(families.filter((f) => f.reportOpened).length),
      returnVisitPct: pct(families.filter((f) => f.returnVisit).length),
      digestOpenedPct: pct(families.filter((f) => f.digestOpenedAt).length),
      families
    };
  }, { permission: 'reports.read.daycare' });

  // --- Pickup brief (15:00 on weekdays) --------------------------------------
  // Three lines a parent can read while unbuckling the child seat: mood,
  // meals, and one question about the week's most recent moment.

  async function pickupAll(innerCtx, triggeredBy) {
    const organisations = await innerCtx.db.many("SELECT * FROM organisations WHERE status = 'active'");
    let sent = 0;
    const detail = [];
    for (const organisation of organisations) {
      const candidates = await innerCtx.db.many(
        `SELECT l.id AS learner_id, l.first_name, l.last_name
         FROM learners l
         WHERE l.organisation_id = $1 AND l.status = 'enrolled'
           AND (EXISTS (SELECT 1 FROM daily_reports r WHERE r.learner_id = l.id AND r.report_date = CURRENT_DATE)
             OR EXISTS (SELECT 1 FROM learner_observations o WHERE o.learner_id = l.id
                        AND o.assessment_status IN ('published','amended')
                        AND o.observation_date >= CURRENT_DATE - interval '7 days'))`,
        [organisation.id]
      );
      let orgSent = 0;
      for (const child of candidates) {
        const report = await innerCtx.db.one(
          'SELECT * FROM daily_reports WHERE learner_id = $1 AND report_date = CURRENT_DATE',
          [child.learner_id]
        );
        const moment = await innerCtx.db.one(
          `SELECT o.id, o.observation_text, o.context, o.observation_date,
                  d.name AS domain_name, ob.description AS objective_description
           FROM learner_observations o
           LEFT JOIN learning_objectives ob ON ob.id = o.objective_id
           LEFT JOIN curriculum_domains d ON d.id = ob.domain_id
           WHERE o.learner_id = $1 AND o.organisation_id = $2
             AND o.assessment_status IN ('published','amended')
           ORDER BY o.observation_date DESC, o.created_at DESC LIMIT 1`,
          [child.learner_id, organisation.id]
        );
        const guardians = await innerCtx.db.many(
          `SELECT DISTINCT g.user_id, g.first_name
           FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
           WHERE lg.learner_id = $1 AND lg.organisation_id = $2 AND lg.portal_access_status = 'active'
             AND lg.can_receive_reports = true AND g.user_id IS NOT NULL`,
          [child.learner_id, organisation.id]
        );
        if (!guardians.length) continue;
        const first = child.first_name;
        const lines = ['🌤 ' + first + ' had ' + (report && report.mood ? 'a ' + report.mood + ' day' : 'a lovely day') + '.'];
        if (report && report.meals) lines.push('🍎 Meals: ' + String(report.meals).replace(/\s+/g, ' ').slice(0, 110) + '.');
        if (report && report.naps) lines.push('😴 Naps: ' + String(report.naps).replace(/\s+/g, ' ').slice(0, 90) + '.');
        const subject = moment
          ? String(moment.objective_description || moment.context || moment.domain_name || String(moment.observation_text).split('\n')[0])
              .replace(/[.…]\s*$/, '').trim().slice(0, 80)
          : null;
        lines.push(subject
          ? '💬 Ask ' + first + ' about “' + subject + '” — dinner will bring out something special.'
          : '💬 Ask ' + first + ' to show you something from today — the moment is in the app.');
        const title = 'Tonight at pickup: ' + first;
        const body = lines.join('\n');
        for (const guardian of guardians) {
          const dupe = await innerCtx.db.one(
            `SELECT 1 FROM notifications
             WHERE recipient_user_id = $1 AND notification_type = 'pickup_brief'
               AND title = $2 AND created_at::date = CURRENT_DATE LIMIT 1`,
            [guardian.user_id, title]
          ).catch(() => null);
          if (dupe) continue;
          await createNotification(innerCtx.db, innerCtx, {
            recipientUserIds: [guardian.user_id], type: 'pickup_brief', organisationId: organisation.id,
            title, body, url: '/parent/activities',
            resourceType: moment ? 'learner_observation' : 'daily_report',
            resourceId: moment ? moment.id : (report && report.id) || null
          });
          orgSent += 1;
        }
      }
      detail.push({ organisation: organisation.name, sent: orgSent });
      sent += orgSent;
    }
    await recordAudit(innerCtx.db, innerCtx, { action: 'automation.pickup_brief', resourceType: 'organisation', resourceId: innerCtx.organisationId, metadata: { sent, organisations: detail.length, triggeredBy } });
    return { sent, organisations: detail };
  }

  router.post('/automation/pickup-brief', async (ctx) => {
    return pickupAll(ctx, 'manual');
  }, { permission: 'organisation.settings.manage' });

  router.post('/cron/pickup-brief', async (ctx) => {
    const secret = String(process.env.CRON_SECRET || '').trim();
    const header = String((ctx.req.headers['authorization'] || ctx.req.headers['x-cron-secret'] || '')).trim();
    const presented = header.replace(/^Bearer\s+/i, '');
    if (!secret || presented !== secret) throw new AppError('FORBIDDEN');
    return pickupAll(ctx, 'cron');
  }, { public: true });

  // --- Week-one onboarding sweep (daily 07:00) --------------------------------
  // Day 1: welcome. Day 3: the first moment. Day 5: preview digest.
  // Day 7: the first-week recap. Markers are stored on the membership.

  async function onboardingAll(innerCtx, triggeredBy) {
    const organisations = await innerCtx.db.many("SELECT * FROM organisations WHERE status = 'active'");
    const { sendTemplate } = require('../services/email-service');
    const summary = { welcome: 0, day3: 0, preview: 0, day7: 0, organisations: organisations.length };
    for (const organisation of organisations) {
      const guardians = await innerCtx.db.many(
        `SELECT DISTINCT m.user_id, u.email, u.display_name, m.created_at AS joined_at,
                COALESCE(m.activation, '{}'::jsonb) AS activation
         FROM memberships m JOIN users u ON u.id = m.user_id
         JOIN membership_roles mr ON mr.membership_id = m.id
         JOIN roles rol ON rol.id = mr.role_id AND rol.role_key = 'parent_guardian'
         WHERE m.organisation_id = $1 AND m.status = 'active' AND u.email IS NOT NULL`,
        [organisation.id]
      );
      for (const guardian of guardians) {
        const days = Math.floor((Date.now() - new Date(guardian.joined_at).getTime()) / 86400000);
        const activation = guardian.activation || {};
        // Existing families predate the journey — stamp the markers instead
        // of sending "your first week" two months in, then skip them for good.
        if (days > 7 && !(activation.welcomeSentAt && activation.day3SentAt && activation.previewDigestSentAt && activation.day7SentAt)) {
          await innerCtx.db.query(
            `UPDATE memberships SET activation = COALESCE(activation, '{}'::jsonb) || $1::jsonb
             WHERE user_id = $2 AND organisation_id = $3`,
            [JSON.stringify({ welcomeSentAt: activation.welcomeSentAt || new Date().toISOString(), day3SentAt: activation.day3SentAt || new Date().toISOString(), previewDigestSentAt: activation.previewDigestSentAt || new Date().toISOString(), day7SentAt: activation.day7SentAt || new Date().toISOString() }), guardian.user_id, organisation.id]
          );
          continue;
        }
        const children = await innerCtx.db.many(
          `SELECT l.id, l.first_name FROM learner_guardians lg
           JOIN guardians g ON g.id = lg.guardian_id
           JOIN learners l ON l.id = lg.learner_id
           WHERE lg.organisation_id = $1 AND g.user_id = $2 AND lg.portal_access_status = 'active'
             AND (lg.ends_at IS NULL OR lg.ends_at >= CURRENT_DATE)`,
          [organisation.id, guardian.user_id]
        );
        if (!children.length) continue;
        const firstChild = children[0].first_name;
        const childIds = children.map((c) => c.id);
        const saveActivation = (patch) => innerCtx.db.query(
          `UPDATE memberships SET activation = COALESCE(activation, '{}'::jsonb) || $1::jsonb
           WHERE user_id = $2 AND organisation_id = $3`,
          [JSON.stringify(patch), guardian.user_id, organisation.id]
        );
        try {
          if (days >= 1 && !activation.welcomeSentAt) {
            await sendTemplate(innerCtx.db, 'parentWelcome', {
              to: guardian.email, organisationId: organisation.id,
              data: { organisationName: organisation.name, guardianName: guardian.display_name, firstChild },
              metadata: { kind: 'parent_welcome' }
            });
            await createNotification(innerCtx.db, innerCtx, {
              recipientUserIds: [guardian.user_id], type: 'parent_welcome', organisationId: organisation.id,
              title: 'Welcome to ' + organisation.name,
              body: 'Your family portal is ready — photos and moments from ' + firstChild + '’s classroom are on the way.',
              url: '/parent/overview'
            });
            await saveActivation({ welcomeSentAt: new Date().toISOString() });
            summary.welcome += 1;
          } else if (days >= 3 && !activation.day3SentAt) {
            const moment = await innerCtx.db.one(
              `SELECT o.id, o.observation_text FROM learner_observations o
               WHERE o.organisation_id = $1 AND o.learner_id = ANY($2::uuid[])
                 AND o.assessment_status IN ('published','amended')
               ORDER BY o.observation_date DESC, o.created_at DESC LIMIT 1`,
              [organisation.id, childIds]
            );
            if (moment) {
              await createNotification(innerCtx.db, innerCtx, {
                recipientUserIds: [guardian.user_id], type: 'moment', organisationId: organisation.id,
                title: 'A moment from ' + firstChild,
                body: String(moment.observation_text).split('\n')[0].slice(0, 140),
                resourceType: 'learner_observation', resourceId: moment.id, url: '/parent/activities'
              });
            } else {
              await sendTemplate(innerCtx.db, 'parentFirstMoment', {
                to: guardian.email, organisationId: organisation.id,
                data: { organisationName: organisation.name, guardianName: guardian.display_name, firstChild },
                metadata: { kind: 'parent_day3' }
              });
            }
            await saveActivation({ day3SentAt: new Date().toISOString() });
            summary.day3 += 1;
          } else if (days >= 5 && !activation.previewDigestSentAt) {
            const { sendWeeklyDigest } = require('../services/digest-service');
            await sendWeeklyDigest(innerCtx.db, { organisation, triggeredBy: 'onboarding', onlyUserId: guardian.user_id, includeOptedOut: true, preview: true });
            await saveActivation({ previewDigestSentAt: new Date().toISOString() });
            summary.preview += 1;
          } else if (days >= 7 && !activation.day7SentAt) {
            const attendance = await innerCtx.db.one(
              `SELECT COUNT(*)::int AS recorded,
                      COUNT(CASE WHEN attendance_status IN ('present','late') THEN 1 END)::int AS present
               FROM learner_attendance
               WHERE organisation_id = $1 AND learner_id = ANY($2::uuid[])
                 AND attendance_date >= CURRENT_DATE - interval '7 days'`,
              [organisation.id, childIds]
            );
            const observations = await innerCtx.db.one(
              `SELECT COUNT(*)::int AS count FROM learner_observations
               WHERE organisation_id = $1 AND learner_id = ANY($2::uuid[])
                 AND assessment_status IN ('published','amended')
                 AND observation_date >= CURRENT_DATE - interval '7 days'`,
              [organisation.id, childIds]
            );
            await sendTemplate(innerCtx.db, 'parentFirstWeek', {
              to: guardian.email, organisationId: organisation.id,
              data: {
                organisationName: organisation.name, guardianName: guardian.display_name, firstChild,
                stats: [
                  { label: 'Days at the centre this week', value: String(attendance.present || 0) + ' of ' + String(attendance.recorded || 0) },
                  { label: 'Moments shared with you', value: String(observations.count || 0) },
                  { label: 'Fridays from now on', value: 'Every week' }
                ]
              },
              metadata: { kind: 'parent_day7' }
            });
            await saveActivation({ day7SentAt: new Date().toISOString() });
            summary.day7 += 1;
          }
        } catch (error) {
          console.warn(JSON.stringify({ level: 'warn', message: 'onboarding step failed', organisationId: organisation.id, userId: guardian.user_id, error: error.message }));
        }
      }
    }
    await recordAudit(innerCtx.db, innerCtx, { action: 'automation.parent_onboarding', resourceType: 'organisation', resourceId: innerCtx.organisationId, metadata: { ...summary, triggeredBy } });
    return summary;
  }

  exportedOnboardingAll = onboardingAll;

  router.post('/automation/parent-onboarding', async (ctx) => {
    return onboardingAll(ctx, 'manual');
  }, { permission: 'organisation.settings.manage' });

  router.post('/cron/parent-onboarding', async (ctx) => {
    const secret = String(process.env.CRON_SECRET || '').trim();
    const header = String((ctx.req.headers['authorization'] || ctx.req.headers['x-cron-secret'] || '')).trim();
    const presented = header.replace(/^Bearer\s+/i, '');
    if (!secret || presented !== secret) throw new AppError('FORBIDDEN');
    return onboardingAll(ctx, 'cron');
  }, { public: true });

  // --- Weekly family digest -------------------------------------------------
  // Sends Friday's “week at the centre” email to every parent who opted in.
  // Called by Vercel Cron (Authorization: Bearer CRON_SECRET) or manually.

  async function digestAll(innerCtx, triggeredBy) {
    const { sendWeeklyDigest } = require('../services/digest-service');
    const organisations = await innerCtx.db.many("SELECT * FROM organisations WHERE status = 'active' ORDER BY created_at");
    let sent = 0;
    const detail = [];
    for (const organisation of organisations) {
      const result = await sendWeeklyDigest(innerCtx.db, { organisation, triggeredBy });
      sent += result.sent;
      detail.push({ organisation: organisation.name, recipients: result.recipients, sent: result.sent });
    }
    await recordAudit(innerCtx.db, innerCtx, { action: 'automation.weekly_digest', resourceType: 'organisation', resourceId: innerCtx.organisationId, metadata: { sent, organisations: detail.length, triggeredBy } });
    return { sent, organisations: detail };
  }

  router.post('/automation/weekly-digest', async (ctx) => {
    return digestAll(ctx, 'manual');
  }, { permission: 'organisation.settings.manage' });

  router.post('/cron/weekly-digest', async (ctx) => {
    const secret = String(process.env.CRON_SECRET || '').trim();
    const header = String((ctx.req.headers['authorization'] || ctx.req.headers['x-cron-secret'] || '')).trim();
    const presented = header.replace(/^Bearer\s+/i, '');
    if (!secret || presented !== secret) throw new AppError('FORBIDDEN');
    return digestAll(ctx, 'cron');
  }, { public: true });

  // --- Monthly portfolio digest ------------------------------------------------
  // Branded per-child PDF of the month's observations, emailed to every
  // guardian opted in to communication. Vercel Cron on the 15th of the month;
  // manual trigger for the platform team.

  async function portfolioAll(innerCtx, triggeredBy) {
    const { sendPortfolioDigest } = require('../services/digest-service');
    const organisations = await innerCtx.db.many("SELECT * FROM organisations WHERE status = 'active' ORDER BY created_at");
    let sent = 0;
    const detail = [];
    for (const organisation of organisations) {
      const result = await sendPortfolioDigest(innerCtx.db, { organisation, triggeredBy });
      sent += result.sent;
      detail.push({ organisation: organisation.name, recipients: result.recipients, sent: result.sent });
    }
    await recordAudit(innerCtx.db, innerCtx, { action: 'automation.portfolio_digest', resourceType: 'organisation', resourceId: innerCtx.organisationId, metadata: { sent, organisations: detail.length, triggeredBy } });
    return { sent, organisations: detail };
  }

  router.post('/automation/portfolio-digest', async (ctx) => {
    return portfolioAll(ctx, 'manual');
  }, { permission: 'organisation.settings.manage' });

  router.post('/cron/portfolio-digest', async (ctx) => {
    const secret = String(process.env.CRON_SECRET || '').trim();
    const header = String((ctx.req.headers['authorization'] || ctx.req.headers['x-cron-secret'] || '')).trim();
    const presented = header.replace(/^Bearer\s+/i, '');
    if (!secret || presented !== secret) throw new AppError('FORBIDDEN');
    return portfolioAll(ctx, 'cron');
  }, { public: true });
}

async function buildReport(ctx, key, from, to) {
  switch (key) {
    case 'enrolment_summary': {
      return ctx.db.many(
        `SELECT b.name AS branch, COALESCE(c.name,'Unassigned') AS classroom, l.status,
          COUNT(*)::int AS learners,
          COUNT(CASE WHEN l.date_of_birth > CURRENT_DATE - interval '3 years' THEN 1 END)::int AS under_three
         FROM learners l
         JOIN branches b ON b.id = l.branch_id
         LEFT JOIN classrooms c ON c.id = l.classroom_id
         WHERE l.organisation_id = $1
         GROUP BY b.name, c.name, l.status ORDER BY b.name, c.name, l.status`,
        [ctx.organisationId]
      );
    }
    case 'attendance_summary': {
      return ctx.db.many(
        `SELECT a.attendance_date, COALESCE(c.name,'Unassigned') AS classroom,
          COUNT(*)::int AS marked,
          COUNT(CASE WHEN a.attendance_status IN ('present','late','collected') THEN 1 END)::int AS present,
          COUNT(CASE WHEN a.attendance_status = 'absent' THEN 1 END)::int AS absent,
          COUNT(CASE WHEN a.attendance_status = 'excused' THEN 1 END)::int AS excused
         FROM learner_attendance a
         JOIN learners l ON l.id = a.learner_id
         LEFT JOIN classrooms c ON c.id = l.classroom_id
         WHERE a.organisation_id = $1 AND a.attendance_date BETWEEN $2::date AND $3::date
         GROUP BY a.attendance_date, c.name ORDER BY a.attendance_date DESC, c.name`,
        [ctx.organisationId, from, to]
      );
    }
    case 'finance_summary': {
      const invoices = await ctx.db.many(
        `SELECT i.invoice_number, i.status, i.total_amount, i.amount_paid, i.due_at,
          l.first_name || ' ' || l.last_name AS learner, g.email AS guardian_email
         FROM invoices i LEFT JOIN learners l ON l.id = i.learner_id
         LEFT JOIN guardians g ON g.id = i.guardian_id
         WHERE i.organisation_id = $1 AND i.created_at::date BETWEEN $2::date AND $3::date
         ORDER BY i.created_at DESC`, [ctx.organisationId, from, to]
      );
      return invoices.map((i) => ({
        ...i,
        total_amount: roundMoney(i.total_amount),
        amount_paid: roundMoney(i.amount_paid),
        outstanding: roundMoney(Number(i.total_amount) - Number(i.amount_paid))
      }));
    }
    case 'learner_progress': {
      return ctx.db.many(
        `SELECT l.learner_reference, l.first_name, l.last_name, c.name AS classroom,
          COUNT(o.id)::int AS observations,
          COUNT(CASE WHEN o.assessment_status = 'published' THEN 1 END)::int AS published_observations,
          MAX(o.observation_date) AS last_observation
         FROM learners l
         LEFT JOIN classrooms c ON c.id = l.classroom_id
         LEFT JOIN learner_observations o ON o.learner_id = l.id AND o.observation_date BETWEEN $2::date AND $3::date
         WHERE l.organisation_id = $1 AND l.status = 'enrolled'
         GROUP BY l.learner_reference, l.first_name, l.last_name, c.name
         ORDER BY observations, l.last_name`, [ctx.organisationId, from, to]
      );
    }
    case 'staff_register': {
      return ctx.db.many(
        `SELECT s.employee_reference, u.display_name, u.email, s.job_title, s.employment_status, s.start_date,
          (SELECT COUNT(*)::int FROM staff_classrooms sc WHERE sc.staff_id = s.id) AS classrooms,
          (SELECT COUNT(*)::int FROM staff_documents sd WHERE sd.staff_id = s.id AND sd.verification_status = 'verified') AS verified_documents
         FROM staff_profiles s LEFT JOIN users u ON u.id = s.user_id
         WHERE s.organisation_id = $1 ORDER BY u.display_name`, [ctx.organisationId]
      );
    }
    case 'safety_register': {
      return ctx.db.many(
        `SELECT i.incident_type, i.severity, i.status, i.occurred_at, i.guardian_notified_at,
          b.name AS branch, COUNT(ia.id)::int AS actions
         FROM incidents i
         LEFT JOIN branches b ON b.id = i.branch_id
         LEFT JOIN incident_actions ia ON ia.incident_id = i.id
         WHERE i.organisation_id = $1 AND i.occurred_at::date BETWEEN $2::date AND $3::date
         GROUP BY i.id, i.incident_type, i.severity, i.status, i.occurred_at, i.guardian_notified_at, b.name
         ORDER BY i.occurred_at DESC`, [ctx.organisationId, from, to]
      );
    }
    case 'occupancy': {
      return ctx.db.many(
        `SELECT b.name AS branch, c.name AS classroom, c.age_group, c.configured_capacity,
          COUNT(CASE WHEN l.status = 'enrolled' THEN 1 END)::int AS enrolled,
          GREATEST(0, c.configured_capacity - COUNT(CASE WHEN l.status = 'enrolled' THEN 1 END))::int AS available
         FROM classrooms c
         JOIN branches b ON b.id = c.branch_id
         LEFT JOIN learners l ON l.classroom_id = c.id
         WHERE c.organisation_id = $1 AND c.status = 'active'
         GROUP BY b.name, c.name, c.age_group, c.configured_capacity
         ORDER BY b.name, c.name`, [ctx.organisationId]
      );
    }
    case 'admissions_funnel': {
      return ctx.db.many(
        `SELECT 'enquiry' AS stage, status, COUNT(*)::int AS total FROM admission_enquiries
         WHERE organisation_id = $1 AND created_at::date BETWEEN $2::date AND $3::date
         GROUP BY status
         UNION ALL
         SELECT 'application', status, COUNT(*)::int FROM admission_applications
         WHERE organisation_id = $1 AND submitted_at::date BETWEEN $2::date AND $3::date
         GROUP BY status
         ORDER BY stage, status`, [ctx.organisationId, from, to]
      );
    }
    default:
      return [];
  }
}

// Exported for direct verification of the cron branches. Captured when
// register() runs, so tests can drive the real sweep without an HTTP server.
let exportedOnboardingAll = null;
module.exports = { register, REPORT_CATALOGUE };
module.exports._onboardingAll = (innerCtx, triggeredBy) => {
  if (!exportedOnboardingAll) throw new Error('register() has not run yet.');
  return exportedOnboardingAll(innerCtx, triggeredBy);
};

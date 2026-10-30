'use strict';

const { validate, csvCell } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { sendTemplate, appLink } = require('../services/email-service');
const payfast = require('../services/payfast-service');
const { createInvoiceIntent, outstandingFor, isPayable, guardianForInvoice, learnerName } = require('../services/payment-intent-service');
const { parsePagination, sendText } = require('../utils/http');
const bulk = require('../services/bulk-service');
const { has, nextInvoiceNumber, paging, roundMoney, today } = require('./helpers');

async function recomputeInvoice(client, invoiceId) {
  const invoice = (await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId])).rows[0];
  if (!invoice) return null;
  const paid = (await client.query(
    'SELECT COALESCE(SUM(allocated_amount),0)::float AS paid FROM payment_allocations WHERE invoice_id = $1', [invoiceId]
  )).rows[0].paid;
  const total = Number(invoice.total_amount);
  const amountPaid = roundMoney(Math.min(Number(paid), total));
  let status = invoice.status;
  if (!['void', 'cancelled', 'written_off'].includes(status)) {
    if (amountPaid <= 0) {
      status = invoice.issued_at ? (invoice.due_at && new Date(invoice.due_at) < new Date() ? 'overdue' : 'issued') : 'draft';
    } else if (amountPaid + 0.005 >= total) {
      status = 'paid';
    } else {
      status = 'partially_paid';
    }
  }
  await client.query(
    'UPDATE invoices SET amount_paid = $1, status = $2, updated_at = now() WHERE id = $3',
    [amountPaid, status, invoiceId]
  );
  return { ...invoice, amount_paid: amountPaid, status };
}

async function allocatePayment(ctx, client, payment, requestedAllocations) {
  const allocations = [];
  if (requestedAllocations && requestedAllocations.length) {
    for (const entry of requestedAllocations) {
      const invoice = (await client.query(
        'SELECT * FROM invoices WHERE id = $1 AND organisation_id = $2', [entry.invoiceId, ctx.organisationId]
      )).rows[0];
      if (!invoice) fail('VALIDATION', [{ field: 'allocations', message: 'Unknown invoice in allocation.' }]);
      if (['void', 'cancelled', 'written_off'].includes(invoice.status)) {
        fail('CONFLICT', null, 'Cannot allocate a payment to a void or cancelled invoice.');
      }
      const outstanding = roundMoney(Number(invoice.total_amount) - Number(invoice.amount_paid));
      const amount = roundMoney(Math.min(Number(entry.amount), outstanding));
      if (amount <= 0) continue;
      await client.query(
        'INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount) VALUES ($1,$2,$3)',
        [payment.id, invoice.id, amount]
      );
      await recomputeInvoice(client, invoice.id);
      allocations.push({ invoiceId: invoice.id, amount });
    }
    return allocations;
  }
  let remaining = roundMoney(Number(payment.amount));
  const invoices = (await client.query(
    `SELECT * FROM invoices WHERE organisation_id = $1 AND guardian_id IS NOT DISTINCT FROM $2
       AND status IN ('issued','partially_paid','overdue')
     ORDER BY COALESCE(due_at, CURRENT_DATE), created_at`,
    [ctx.organisationId, payment.guardian_id]
  )).rows;
  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const outstanding = roundMoney(Number(invoice.total_amount) - Number(invoice.amount_paid));
    if (outstanding <= 0) continue;
    const amount = roundMoney(Math.min(remaining, outstanding));
    await client.query(
      'INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount) VALUES ($1,$2,$3)',
      [payment.id, invoice.id, amount]
    );
    await recomputeInvoice(client, invoice.id);
    allocations.push({ invoiceId: invoice.id, amount });
    remaining = roundMoney(remaining - amount);
  }
  return allocations;
}

function register(router) {
  router.get('/finance/overview', async (ctx) => {
    const invoices = await ctx.db.one(
      `SELECT
        COALESCE(SUM(CASE WHEN status IN ('issued','partially_paid','overdue') THEN total_amount - amount_paid ELSE 0 END),0)::float AS outstanding,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount - amount_paid ELSE 0 END),0)::float AS overdue,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END),0)::float AS paid_total,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END)::int AS overdue_count,
        COUNT(CASE WHEN status = 'draft' THEN 1 END)::int AS draft_count
       FROM invoices WHERE organisation_id = $1`, [ctx.organisationId]
    );
    const month = today().slice(0, 7);
    const collected = await ctx.db.one(
      `SELECT COALESCE(SUM(amount),0)::float AS total FROM payments
       WHERE organisation_id = $1 AND status IN ('confirmed','reconciled') AND received_at::date >= $2::date`,
      [ctx.organisationId, `${month}-01`]
    );
    const expenses = await ctx.db.one(
      `SELECT COALESCE(SUM(amount),0)::float AS total FROM expenses
       WHERE organisation_id = $1 AND approval_status IN ('approved','paid') AND expense_date >= $2::date`,
      [ctx.organisationId, `${month}-01`]
    );
    const aging = await ctx.db.many(
      `SELECT id, invoice_number, total_amount, amount_paid, due_at, status FROM invoices
       WHERE organisation_id = $1 AND status IN ('issued','partially_paid','overdue')`, [ctx.organisationId]
    );
    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, older: 0 };
    for (const invoice of aging) {
      const outstanding = Number(invoice.total_amount) - Number(invoice.amount_paid);
      const days = invoice.due_at ? Math.floor((Date.now() - new Date(invoice.due_at).getTime()) / 86400000) : 0;
      if (days <= 0) buckets.current += outstanding;
      else if (days <= 30) buckets.days30 += outstanding;
      else if (days <= 60) buckets.days60 += outstanding;
      else if (days <= 90) buckets.days90 += outstanding;
      else buckets.older += outstanding;
    }
    const recentPayments = await ctx.db.many(
      `SELECT p.*, g.first_name || ' ' || g.last_name AS guardian_name FROM payments p
       LEFT JOIN guardians g ON g.id = p.guardian_id
       WHERE p.organisation_id = $1 ORDER BY p.received_at DESC LIMIT 8`, [ctx.organisationId]
    );
    return {
      outstanding: roundMoney(invoices.outstanding),
      overdue: roundMoney(invoices.overdue),
      overdueCount: invoices.overdue_count,
      draftCount: invoices.draft_count,
      collectedThisMonth: roundMoney(collected.total),
      expensesThisMonth: roundMoney(expenses.total),
      netThisMonth: roundMoney(collected.total - expenses.total),
      aging: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, roundMoney(v)])),
      recentPayments
    };
  }, { permission: 'finance.read.daycare' });

  router.get('/finance/aging', async (ctx) => {
    const rows = await ctx.db.many(
      `SELECT i.id, i.invoice_number, i.due_at, i.total_amount, i.amount_paid, i.status,
        l.first_name, l.last_name, g.first_name || ' ' || g.last_name AS guardian_name, g.email AS guardian_email
       FROM invoices i
       LEFT JOIN learners l ON l.id = i.learner_id
       LEFT JOIN guardians g ON g.id = i.guardian_id
       WHERE i.organisation_id = $1 AND i.status IN ('issued','partially_paid','overdue')
       ORDER BY i.due_at`, [ctx.organisationId]
    );
    return rows.map((row) => {
      const days = row.due_at ? Math.floor((Date.now() - new Date(row.due_at).getTime()) / 86400000) : 0;
      return { ...row, outstanding: roundMoney(Number(row.total_amount) - Number(row.amount_paid)), days_overdue: Math.max(0, days) };
    });
  }, { permission: 'finance.read.daycare' });

  // --- Fee plans ----------------------------------------------------------

  router.get('/fee-plans', async (ctx) => {
    const plans = await ctx.db.many(
      'SELECT * FROM fee_plans WHERE organisation_id = $1 ORDER BY status, name', [ctx.organisationId]
    );
    for (const plan of plans) {
      plan.items = await ctx.db.many('SELECT * FROM fee_plan_items WHERE fee_plan_id = $1 ORDER BY description', [plan.id]);
      plan.monthly_total = roundMoney(plan.items.reduce((sum, item) => sum + Number(item.amount), 0));
    }
    return plans;
  }, { permission: 'finance.read.daycare' });

  router.post('/fee-plans', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 150 },
      billingFrequency: { type: 'string', enum: ['weekly', 'monthly', 'termly', 'annual'], optional: true },
      currency: { type: 'string', min: 3, max: 3, optional: true },
      items: { type: 'array', max: 30, optional: true }
    });
    const result = await ctx.db.withTransaction(async (client) => {
      const plan = (await client.query(
        `INSERT INTO fee_plans (organisation_id, name, billing_frequency, currency) VALUES ($1,$2,$3,$4) RETURNING *`,
        [ctx.organisationId, body.name, body.billingFrequency || 'monthly', body.currency || ctx.organisation.currency || 'ZAR']
      )).rows[0];
      for (const raw of body.items || []) {
        const item = validate(raw, {
          description: { type: 'string', min: 2, max: 200 },
          amount: { type: 'number', min: 0 },
          billingRule: { type: 'string', max: 60, optional: true }
        });
        await client.query(
          'INSERT INTO fee_plan_items (fee_plan_id, description, amount, billing_rule) VALUES ($1,$2,$3,$4)',
          [plan.id, item.description, roundMoney(item.amount), item.billingRule || 'per_month']
        );
      }
      return plan;
    });
    await recordAudit(ctx.db, ctx, { action: 'finance.fee_plan_created', resourceType: 'fee_plan', resourceId: result.id });
    ctx.status = 201;
    return result;
  }, { permission: 'finance.manage.daycare' });

  // --- Invoices -----------------------------------------------------------

  router.get('/invoices', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const status = ctx.query.status || null;
    const term = ctx.query.q ? `%${ctx.query.q}%` : null;
    const learnerId = ctx.query.learnerId || null;
    const guardianId = ctx.query.guardianId || null;
    const from = ctx.query.from || null;
    const to = ctx.query.to || null;
    const conditions = [
      'i.organisation_id = $1',
      '($2::text IS NULL OR i.status = $2)',
      '($3::text IS NULL OR i.invoice_number ILIKE $3 OR l.first_name ILIKE $3 OR l.last_name ILIKE $3)',
      '($4::uuid IS NULL OR i.learner_id = $4::uuid)',
      '($5::uuid IS NULL OR i.guardian_id = $5::uuid)',
      '($6::date IS NULL OR i.created_at::date >= $6::date)',
      '($7::date IS NULL OR i.created_at::date <= $7::date)'
    ];
    const params = [ctx.organisationId, status, term, learnerId, guardianId, from, to];
    const where = conditions.join(' AND ');
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM invoices i LEFT JOIN learners l ON l.id = i.learner_id WHERE ${where}`, params
    );
    const rows = await ctx.db.many(
      `SELECT i.*, l.first_name, l.last_name, g.first_name || ' ' || g.last_name AS guardian_name,
        g.email AS guardian_email, b.name AS branch_name
       FROM invoices i
       LEFT JOIN learners l ON l.id = i.learner_id
       LEFT JOIN guardians g ON g.id = i.guardian_id
       LEFT JOIN branches b ON b.id = i.branch_id
       WHERE ${where}
       ORDER BY i.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    paging(ctx, total.total, page, pageSize);
    return rows;
  }, { permission: 'finance.read.daycare' });

  router.post('/invoices', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      learnerId: { type: 'string', uuid: true, optional: true },
      guardianId: { type: 'string', uuid: true, optional: true },
      description: { type: 'string', max: 255, optional: true },
      dueAt: { type: 'string', date: true, optional: true },
      items: { type: 'array', max: 50 },
      issueNow: { type: 'boolean', optional: true },
      discountTotal: { type: 'number', min: 0, optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    if (!body.items.length) fail('VALIDATION', [{ field: 'items', message: 'At least one line item is required.' }]);
    if (body.learnerId) {
      const learner = await ctx.db.one('SELECT id FROM learners WHERE id = $1 AND organisation_id = $2',
        [body.learnerId, ctx.organisationId]);
      if (!learner) fail('VALIDATION', [{ field: 'learnerId', message: 'Unknown learner.' }]);
    }
    if (body.guardianId) {
      const guardian = await ctx.db.one('SELECT id FROM guardians WHERE id = $1 AND organisation_id = $2',
        [body.guardianId, ctx.organisationId]);
      if (!guardian) fail('VALIDATION', [{ field: 'guardianId', message: 'Unknown guardian.' }]);
    }
    const items = body.items.map((raw) => validate(raw, {
      description: { type: 'string', min: 2, max: 200 },
      quantity: { type: 'number', min: 0.01, max: 10000, optional: true },
      unitAmount: { type: 'number', min: 0 }
    }));
    const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unitAmount), 0));
    const discount = roundMoney(Math.min(body.discountTotal || 0, subtotal));
    const totalAmount = roundMoney(subtotal - discount);
    const number = await nextInvoiceNumber(ctx);
    const issueNow = body.issueNow === true;
    const invoice = await ctx.db.withTransaction(async (client) => {
      const row = (await client.query(
        `INSERT INTO invoices (organisation_id, branch_id, invoice_number, learner_id, guardian_id, currency, subtotal,
          discount_total, total_amount, status, description, issued_at, due_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [ctx.organisationId, body.branchId, number, body.learnerId || null, body.guardianId || null,
          ctx.organisation.currency || 'ZAR', subtotal, discount, totalAmount,
          issueNow ? 'issued' : 'draft', body.description || null,
          issueNow ? new Date().toISOString() : null, body.dueAt || null, ctx.user.id]
      )).rows[0];
      for (const item of items) {
        const quantity = Number(item.quantity || 1);
        await client.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_amount, line_total)
           VALUES ($1,$2,$3,$4,$5)`,
          [row.id, item.description, quantity, roundMoney(item.unitAmount), roundMoney(quantity * Number(item.unitAmount))]
        );
      }
      return row;
    });
    if (issueNow && body.guardianId) await notifyGuardianInvoice(ctx, invoice);
    await recordAudit(ctx.db, ctx, {
      action: issueNow ? 'finance.invoice_issued' : 'finance.invoice_created', resourceType: 'invoice',
      resourceId: invoice.id, branchId: body.branchId, metadata: { invoiceNumber: number, totalAmount }
    });
    ctx.status = 201;
    return invoice;
  }, { permission: 'finance.invoice.create.daycare' });

  router.get('/invoices/:id', async (ctx) => {
    const invoice = await ctx.db.one('SELECT * FROM invoices WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!invoice) throw new AppError('NOT_FOUND');
    const items = await ctx.db.many('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [invoice.id]);
    const allocations = await ctx.db.many(
      `SELECT pa.*, p.amount AS payment_amount, p.payment_method, p.received_at, p.status AS payment_status
       FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id WHERE pa.invoice_id = $1
       ORDER BY p.received_at`, [invoice.id]
    );
    const learner = invoice.learner_id ? await ctx.db.one('SELECT id, first_name, last_name, learner_reference FROM learners WHERE id = $1', [invoice.learner_id]) : null;
    const guardian = invoice.guardian_id ? await ctx.db.one('SELECT id, first_name, last_name, email, phone FROM guardians WHERE id = $1', [invoice.guardian_id]) : null;
    const branch = await ctx.db.one('SELECT id, name, address, contact_email, contact_phone FROM branches WHERE id = $1', [invoice.branch_id]);
    return { ...invoice, items, allocations, learner, guardian, branch, organisation: { name: ctx.organisation.name, legalName: ctx.organisation.legal_name, logoUrl: ctx.organisation.logo_url } };
  }, { permission: 'finance.read.daycare' });

  router.patch('/invoices/:id', async (ctx) => {
    const body = validate(ctx.body, {
      description: { type: 'string', max: 255, optional: true },
      dueAt: { type: 'string', date: true, optional: true },
      status: { type: 'string', enum: ['draft', 'issued', 'overdue', 'void', 'cancelled', 'written_off'], optional: true }
    });
    const invoice = await ctx.db.one('SELECT * FROM invoices WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!invoice) throw new AppError('NOT_FOUND');
    if (['paid', 'void', 'cancelled', 'written_off'].includes(invoice.status) && body.status && body.status !== invoice.status) {
      fail('CONFLICT', null, 'This invoice can no longer change status.');
    }
    if (Number(invoice.amount_paid) > 0 && body.status === 'void') {
      fail('CONFLICT', null, 'Invoices with payments cannot be voided. Reverse the payment first.');
    }
    await ctx.db.query(
      `UPDATE invoices SET description = COALESCE($1,description), due_at = COALESCE($2,due_at),
        status = COALESCE($3,status),
        issued_at = CASE WHEN $3 = 'issued' AND issued_at IS NULL THEN now() ELSE issued_at END,
        updated_at = now() WHERE id = $4`,
      [body.description || null, body.dueAt || null, body.status || null, invoice.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'finance.invoice_updated', resourceType: 'invoice', resourceId: invoice.id,
      metadata: { status: body.status || null }
    });
    return ctx.db.one('SELECT * FROM invoices WHERE id = $1', [invoice.id]);
  }, { permission: 'finance.invoice.issue.daycare' });

  router.post('/invoices/:id/issue', async (ctx) => {
    const invoice = await ctx.db.one('SELECT * FROM invoices WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!invoice) throw new AppError('NOT_FOUND');
    if (invoice.status !== 'draft') fail('CONFLICT', null, 'Only draft invoices can be issued.');
    const body = validate(ctx.body || {}, { dueAt: { type: 'string', date: true, optional: true } });
    await ctx.db.query(
      "UPDATE invoices SET status = 'issued', issued_at = now(), due_at = COALESCE($1,due_at), updated_at = now() WHERE id = $2",
      [body.dueAt || null, invoice.id]
    );
    if (invoice.guardian_id) await notifyGuardianInvoice(ctx, invoice);
    await recordAudit(ctx.db, ctx, {
      action: 'finance.invoice_issued', resourceType: 'invoice', resourceId: invoice.id
    });
    return ctx.db.one('SELECT * FROM invoices WHERE id = $1', [invoice.id]);
  }, { permission: 'finance.invoice.issue.daycare' });

  router.post('/invoices/bulk', async (ctx) => {
    const body = bulk.parse(ctx.body, ['issue', 'void']);
    return bulk.run(ctx, {
      ids: body.ids,
      action: body.action,
      resourceType: 'invoice',
      auditAction: body.action === 'issue' ? 'finance.invoice_issued' : 'finance.invoice_voided',
      handler: async (id) => {
        const invoice = await ctx.db.one(
          'SELECT * FROM invoices WHERE id = $1 AND organisation_id = $2', [id, ctx.organisationId]
        );
        if (!invoice) return { ok: false, reason: 'not found' };
        if (body.action === 'issue') {
          if (invoice.status !== 'draft') return { ok: false, reason: 'only draft invoices can be issued' };
          await ctx.db.query(
            "UPDATE invoices SET status = 'issued', issued_at = now(), updated_at = now() WHERE id = $1", [id]
          );
          if (invoice.guardian_id) await notifyGuardianInvoice(ctx, invoice);
          return { ok: true, metadata: { invoiceNumber: invoice.invoice_number } };
        }
        if (['paid', 'void', 'cancelled', 'written_off'].includes(invoice.status)) {
          return { ok: false, reason: 'invoice is already closed' };
        }
        if (Number(invoice.amount_paid) > 0) return { ok: false, reason: 'invoices with payments cannot be voided' };
        await ctx.db.query("UPDATE invoices SET status = 'void', updated_at = now() WHERE id = $1", [id]);
        return { ok: true, metadata: { invoiceNumber: invoice.invoice_number } };
      }
    });
  }, { permission: 'finance.invoice.issue.daycare' });

  router.post('/invoices/:id/payfast-link', async (ctx) => {
    if (!payfast.isConfigured()) {
      fail('CONFLICT', null, 'Online payments are not configured. Set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY.');
    }
    const body = validate(ctx.body || {}, {
      amount: { type: 'number', min: 0.01, optional: true },
      sendEmail: { type: 'boolean', optional: true }
    });
    const invoice = await ctx.db.one('SELECT * FROM invoices WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!invoice) throw new AppError('NOT_FOUND');
    if (!isPayable(invoice)) fail('CONFLICT', null, 'This invoice is not open for payment.');
    const outstanding = outstandingFor(invoice);
    const amount = body.amount ? roundMoney(Math.min(Number(body.amount), outstanding)) : outstanding;
    if (amount <= 0) fail('CONFLICT', null, 'There is nothing left to pay on this invoice.');

    const guardian = await guardianForInvoice(ctx.db, invoice);
    const { intent, checkout } = await createInvoiceIntent(ctx.db, {
      organisation: ctx.organisation,
      invoice,
      guardian,
      amount,
      createdBy: ctx.user.id,
      req: ctx.req,
      scope: 'staff',
      itemName: 'Invoice ' + invoice.invoice_number
    });

    if (body.sendEmail !== false && guardian) {
      await sendTemplate(ctx.db, 'invoiceIssued', {
        to: guardian.email,
        organisationId: ctx.organisationId,
        metadata: { invoiceId: invoice.id, intentId: intent.id },
        data: {
          organisationName: ctx.organisation.name,
          invoiceNumber: invoice.invoice_number,
          learnerName: await learnerName(ctx.db, invoice),
          amount: outstanding,
          paid: Number(invoice.amount_paid || 0),
          currency: invoice.currency,
          dueDate: invoice.due_at ? new Date(invoice.due_at).toLocaleDateString('en-ZA') : 'On receipt',
          payUrl: checkout.action + '?' + checkout.query,
          viewUrl: appLink('/#/app/finance')
        }
      });
    }

    await recordAudit(ctx.db, ctx, {
      action: 'finance.payment_link_created', resourceType: 'invoice', resourceId: invoice.id,
      metadata: { intentId: intent.id, amount, reference: intent.reference }
    });
    return { intent, checkout };
  }, { permission: 'finance.payment.record.daycare' });

  router.post('/invoices/generate', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true, optional: true },
      feePlanId: { type: 'string', uuid: true },
      dueAt: { type: 'string', date: true, optional: true },
      description: { type: 'string', max: 255, optional: true }
    });
    const plan = await ctx.db.one('SELECT * FROM fee_plans WHERE id = $1 AND organisation_id = $2',
      [body.feePlanId, ctx.organisationId]);
    if (!plan) throw new AppError('NOT_FOUND');
    const items = await ctx.db.many('SELECT * FROM fee_plan_items WHERE fee_plan_id = $1', [plan.id]);
    if (!items.length) fail('CONFLICT', null, 'The fee plan has no line items.');
    const enrolments = await ctx.db.many(
      `SELECT e.*, l.first_name, l.last_name,
        (SELECT lg.guardian_id FROM learner_guardians lg WHERE lg.learner_id = e.learner_id
          AND lg.can_receive_financial_information = true ORDER BY lg.is_primary_contact DESC LIMIT 1) AS guardian_id
       FROM enrolments e JOIN learners l ON l.id = e.learner_id
       WHERE e.organisation_id = $1 AND e.status = 'active' AND l.status = 'enrolled'
         AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)`,
      [ctx.organisationId, body.branchId || null]
    );
    const created = [];
    for (const enrolment of enrolments) {
      const number = await nextInvoiceNumber(ctx);
      const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.amount), 0));
      const invoice = await ctx.db.withTransaction(async (client) => {
        const row = (await client.query(
          `INSERT INTO invoices (organisation_id, branch_id, invoice_number, learner_id, guardian_id, currency, subtotal,
            total_amount, status, description, issued_at, due_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'issued',$8,now(),$9,$10) RETURNING *`,
          [ctx.organisationId, enrolment.branch_id, number, enrolment.learner_id, enrolment.guardian_id || null,
            plan.currency || ctx.organisation.currency || 'ZAR', subtotal,
            body.description || `${plan.name} fees`, body.dueAt || null, ctx.user.id]
        )).rows[0];
        for (const item of items) {
          await client.query(
            `INSERT INTO invoice_items (invoice_id, description, quantity, unit_amount, line_total)
             VALUES ($1,$2,1,$3,$3)`, [row.id, item.description, roundMoney(item.amount)]
          );
        }
        return row;
      });
      created.push(invoice);
    }
    await recordAudit(ctx.db, ctx, {
      action: 'finance.invoices_generated', resourceType: 'invoice', resourceId: null,
      metadata: { feePlanId: plan.id, count: created.length }
    });
    return { generated: created.length, invoices: created };
  }, { permission: 'finance.invoice.create.daycare' });

  router.post('/invoices/:id/write-off', async (ctx) => {
    const body = validate(ctx.body, { reason: { type: 'string', min: 5, max: 1000 } });
    const invoice = await ctx.db.one('SELECT * FROM invoices WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!invoice) throw new AppError('NOT_FOUND');
    if (['void', 'cancelled', 'written_off'].includes(invoice.status)) fail('CONFLICT', null, 'This invoice is already closed.');
    await ctx.db.query(
      "UPDATE invoices SET status = 'written_off', updated_at = now() WHERE id = $1", [invoice.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'finance.invoice_written_off', resourceType: 'invoice', resourceId: invoice.id,
      metadata: { reason: body.reason }
    });
    return ctx.db.one('SELECT * FROM invoices WHERE id = $1', [invoice.id]);
  }, { permission: 'finance.manage.daycare' });

  // --- Payments -----------------------------------------------------------

  router.get('/payments', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const status = ctx.query.status || null;
    const guardianId = ctx.query.guardianId || null;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM payments
       WHERE organisation_id = $1 AND ($2::text IS NULL OR status = $2) AND ($3::uuid IS NULL OR guardian_id = $3::uuid)`,
      [ctx.organisationId, status, guardianId]
    );
    const rows = await ctx.db.many(
      `SELECT p.*, g.first_name || ' ' || g.last_name AS guardian_name, u.display_name AS recorded_by_name
       FROM payments p LEFT JOIN guardians g ON g.id = p.guardian_id
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.organisation_id = $1 AND ($2::text IS NULL OR p.status = $2)
         AND ($3::uuid IS NULL OR p.guardian_id = $3::uuid)
       ORDER BY p.received_at DESC LIMIT $4 OFFSET $5`,
      [ctx.organisationId, status, guardianId, pageSize, offset]
    );
    for (const payment of rows) {
      payment.allocations = await ctx.db.many(
        `SELECT pa.*, i.invoice_number FROM payment_allocations pa JOIN invoices i ON i.id = pa.invoice_id
         WHERE pa.payment_id = $1`, [payment.id]
      );
    }
    paging(ctx, total.total, page, pageSize);
    return rows;
  }, { permission: 'finance.read.daycare' });

  router.post('/payments', async (ctx) => {
    const body = validate(ctx.body, {
      guardianId: { type: 'string', uuid: true, optional: true },
      amount: { type: 'number', min: 0.01 },
      paymentMethod: { type: 'string', enum: ['eft', 'cash', 'card', 'debit_order', 'snapscan', 'payfast', 'other'] },
      providerReference: { type: 'string', max: 200, optional: true },
      receivedAt: { type: 'string', datetime: true, optional: true },
      notes: { type: 'string', max: 1000, optional: true },
      allocations: { type: 'array', max: 50, optional: true }
    });
    if (body.guardianId) {
      const guardian = await ctx.db.one('SELECT id FROM guardians WHERE id = $1 AND organisation_id = $2',
        [body.guardianId, ctx.organisationId]);
      if (!guardian) fail('VALIDATION', [{ field: 'guardianId', message: 'Unknown guardian.' }]);
    }
    const idempotencyKey = ctx.req.headers['idempotency-key'] || ctx.body.idempotencyKey || null;
    if (idempotencyKey) {
      const existing = await ctx.db.one(
        'SELECT * FROM payments WHERE organisation_id = $1 AND idempotency_key = $2',
        [ctx.organisationId, String(idempotencyKey).slice(0, 150)]
      );
      if (existing) {
        ctx.status = 200;
        return existing;
      }
    }
    const requested = (body.allocations || []).map((raw) => validate(raw, {
      invoiceId: { type: 'string', uuid: true },
      amount: { type: 'number', min: 0.01 }
    }));
    const result = await ctx.db.withTransaction(async (client) => {
      const payment = (await client.query(
        `INSERT INTO payments (organisation_id, guardian_id, currency, amount, payment_method, provider_reference, status,
          received_at, idempotency_key, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'confirmed',$7,$8,$9,$10) RETURNING *`,
        [ctx.organisationId, body.guardianId || null, ctx.organisation.currency || 'ZAR', roundMoney(body.amount),
          body.paymentMethod, body.providerReference || null, body.receivedAt || new Date().toISOString(),
          idempotencyKey ? String(idempotencyKey).slice(0, 150) : null, body.notes || null, ctx.user.id]
      )).rows[0];
      const allocations = await allocatePayment(ctx, client, payment, requested);
      const allocated = roundMoney(allocations.reduce((sum, a) => sum + a.amount, 0));
      return { payment, allocations, unallocated: roundMoney(Number(payment.amount) - allocated) };
    });
    await recordAudit(ctx.db, ctx, {
      action: 'finance.payment_recorded', resourceType: 'payment', resourceId: result.payment.id,
      metadata: { amount: result.payment.amount, method: body.paymentMethod, allocations: result.allocations.length }
    });
    ctx.status = 201;
    return result;
  }, { permission: 'finance.payment.record.daycare' });

  router.post('/payments/:id/reconcile', async (ctx) => {
    const payment = await ctx.db.one('SELECT * FROM payments WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!payment) throw new AppError('NOT_FOUND');
    if (payment.status === 'reconciled') fail('CONFLICT', null, 'This payment is already reconciled.');
    if (payment.status === 'reversed') fail('CONFLICT', null, 'Reversed payments cannot be reconciled.');
    await ctx.db.query(
      "UPDATE payments SET status = 'reconciled', reconciled_by = $1, reconciled_at = now() WHERE id = $2",
      [ctx.user.id, payment.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'finance.payment_reconciled', resourceType: 'payment', resourceId: payment.id
    });
    return ctx.db.one('SELECT * FROM payments WHERE id = $1', [payment.id]);
  }, { permission: 'finance.payment.reconcile.daycare' });

  router.post('/payments/:id/reverse', async (ctx) => {
    const body = validate(ctx.body, { reason: { type: 'string', min: 5, max: 1000 } });
    const payment = await ctx.db.one('SELECT * FROM payments WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!payment) throw new AppError('NOT_FOUND');
    if (payment.status === 'reversed') fail('CONFLICT', null, 'This payment is already reversed.');
    await ctx.db.withTransaction(async (client) => {
      const allocations = (await client.query('SELECT * FROM payment_allocations WHERE payment_id = $1', [payment.id])).rows;
      await client.query('DELETE FROM payment_allocations WHERE payment_id = $1', [payment.id]);
      await client.query("UPDATE payments SET status = 'reversed' WHERE id = $1", [payment.id]);
      for (const allocation of allocations) await recomputeInvoice(client, allocation.invoice_id);
    });
    await recordAudit(ctx.db, ctx, {
      action: 'finance.payment_reversed', resourceType: 'payment', resourceId: payment.id,
      metadata: { reason: body.reason }
    });
    return ctx.db.one('SELECT * FROM payments WHERE id = $1', [payment.id]);
  }, { permission: 'finance.manage.daycare' });

  router.get('/finance/statements/:guardianId', async (ctx) => {
    const guardian = await ctx.db.one('SELECT * FROM guardians WHERE id = $1 AND organisation_id = $2',
      [ctx.params.guardianId, ctx.organisationId]);
    if (!guardian) throw new AppError('NOT_FOUND');
    const invoices = await ctx.db.many(
      `SELECT * FROM invoices WHERE guardian_id = $1 AND organisation_id = $2 AND status NOT IN ('draft','void')
       ORDER BY created_at`, [guardian.id, ctx.organisationId]
    );
    const payments = await ctx.db.many(
      `SELECT * FROM payments WHERE guardian_id = $1 AND organisation_id = $2 AND status <> 'failed'
       ORDER BY received_at`, [guardian.id, ctx.organisationId]
    );
    const balance = roundMoney(
      invoices.reduce((sum, i) => sum + Number(i.total_amount) - Number(i.amount_paid), 0)
    );
    return { guardian, invoices, payments, balance };
  }, { permission: 'finance.read.daycare' });

  // --- Expenses, suppliers, categories ------------------------------------

  router.get('/suppliers', async (ctx) => {
    return ctx.db.many('SELECT * FROM suppliers WHERE organisation_id = $1 ORDER BY name', [ctx.organisationId]);
  }, { permission: ['expenses.read.daycare', 'expenses.manage.daycare'], permissionMode: 'any' });

  router.post('/suppliers', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200 },
      contactDetails: { type: 'object', optional: true }
    });
    const supplier = await ctx.db.one(
      'INSERT INTO suppliers (organisation_id, name, contact_details) VALUES ($1,$2,$3) RETURNING *',
      [ctx.organisationId, body.name, JSON.stringify(body.contactDetails || {})]
    );
    await recordAudit(ctx.db, ctx, { action: 'finance.supplier_created', resourceType: 'supplier', resourceId: supplier.id });
    ctx.status = 201;
    return supplier;
  }, { permission: 'expenses.manage.daycare' });

  router.get('/expense-categories', async (ctx) => {
    return ctx.db.many('SELECT * FROM expense_categories WHERE organisation_id = $1 ORDER BY name', [ctx.organisationId]);
  }, { permission: ['expenses.read.daycare', 'expenses.manage.daycare'], permissionMode: 'any' });

  router.post('/expense-categories', async (ctx) => {
    const body = validate(ctx.body, { name: { type: 'string', min: 2, max: 120 } });
    const category = await ctx.db.one(
      'INSERT INTO expense_categories (organisation_id, name) VALUES ($1,$2) RETURNING *',
      [ctx.organisationId, body.name]
    );
    ctx.status = 201;
    return category;
  }, { permission: 'expenses.manage.daycare' });

  router.get('/expenses', async (ctx) => {
    const status = ctx.query.status || null;
    const from = ctx.query.from || null;
    const to = ctx.query.to || null;
    return ctx.db.many(
      `SELECT e.*, ec.name AS category_name, s.name AS supplier_name, b.name AS branch_name,
        u.display_name AS created_by_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN suppliers s ON s.id = e.supplier_id
       LEFT JOIN branches b ON b.id = e.branch_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.organisation_id = $1 AND ($2::text IS NULL OR e.approval_status = $2)
         AND ($3::date IS NULL OR e.expense_date >= $3::date)
         AND ($4::date IS NULL OR e.expense_date <= $4::date)
       ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 200`,
      [ctx.organisationId, status, from, to]
    );
  }, { permission: 'expenses.read.daycare' });

  router.post('/expenses', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      categoryId: { type: 'string', uuid: true, optional: true },
      supplierId: { type: 'string', uuid: true, optional: true },
      description: { type: 'string', min: 3, max: 255 },
      amount: { type: 'number', min: 0 },
      expenseDate: { type: 'string', date: true, optional: true },
      submit: { type: 'boolean', optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    const expense = await ctx.db.one(
      `INSERT INTO expenses (organisation_id, branch_id, category_id, supplier_id, description, amount, currency,
        expense_date, approval_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [ctx.organisationId, body.branchId, body.categoryId || null, body.supplierId || null, body.description,
        roundMoney(body.amount), ctx.organisation.currency || 'ZAR', body.expenseDate || today(),
        body.submit === true ? 'submitted' : 'draft', ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'finance.expense_created', resourceType: 'expense', resourceId: expense.id, branchId: body.branchId
    });
    ctx.status = 201;
    return expense;
  }, { permission: 'expenses.manage.daycare' });

  router.post('/expenses/:id/review', async (ctx) => {
    const body = validate(ctx.body, {
      decision: { type: 'string', enum: ['approved', 'rejected', 'paid'] },
      reason: { type: 'string', max: 1000, optional: true }
    });
    const expense = await ctx.db.one('SELECT * FROM expenses WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!expense) throw new AppError('NOT_FOUND');
    if (['paid', 'rejected'].includes(expense.approval_status)) {
      fail('CONFLICT', null, 'This expense has already been closed.');
    }
    await ctx.db.query(
      'UPDATE expenses SET approval_status = $1, approved_by = $2 WHERE id = $3',
      [body.decision, ctx.user.id, expense.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: `finance.expense_${body.decision}`, resourceType: 'expense', resourceId: expense.id,
      metadata: { reason: body.reason || null }
    });
    return ctx.db.one('SELECT * FROM expenses WHERE id = $1', [expense.id]);
  }, { permission: 'finance.manage.daycare' });

  // --- Inventory ----------------------------------------------------------

  router.get('/inventory', async (ctx) => {
    const branchId = ctx.query.branchId || null;
    const lowOnly = ctx.query.low === 'true';
    const rows = await ctx.db.many(
      `SELECT i.*, b.name AS branch_name FROM inventory_items i
       LEFT JOIN branches b ON b.id = i.branch_id
       WHERE i.organisation_id = $1 AND i.status = 'active'
         AND ($2::uuid IS NULL OR i.branch_id = $2::uuid)
       ORDER BY i.name`, [ctx.organisationId, branchId]
    );
    const mapped = rows.map((r) => ({ ...r, is_low: Number(r.quantity_on_hand) <= Number(r.minimum_quantity) }));
    return lowOnly ? mapped.filter((r) => r.is_low) : mapped;
  }, { permission: 'inventory.read.daycare' });

  router.post('/inventory', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      name: { type: 'string', min: 2, max: 150 },
      category: { type: 'string', max: 80, optional: true },
      quantityOnHand: { type: 'number', min: 0, optional: true },
      minimumQuantity: { type: 'number', min: 0, optional: true },
      unit: { type: 'string', max: 30, optional: true },
      storageLocation: { type: 'string', max: 120, optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    const item = await ctx.db.one(
      `INSERT INTO inventory_items (organisation_id, branch_id, name, category, quantity_on_hand, minimum_quantity,
        unit, storage_location) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [ctx.organisationId, body.branchId, body.name, body.category || 'general', body.quantityOnHand || 0,
        body.minimumQuantity || 0, body.unit || 'units', body.storageLocation || null]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'inventory.item_created', resourceType: 'inventory_item', resourceId: item.id, branchId: body.branchId
    });
    ctx.status = 201;
    return item;
  }, { permission: 'inventory.manage.daycare' });

  router.patch('/inventory/:id', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 150, optional: true },
      minimumQuantity: { type: 'number', min: 0, optional: true },
      unit: { type: 'string', max: 30, optional: true },
      storageLocation: { type: 'string', max: 120, optional: true },
      status: { type: 'string', enum: ['active', 'archived'], optional: true }
    });
    const item = await ctx.db.one('SELECT * FROM inventory_items WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!item) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `UPDATE inventory_items SET name = COALESCE($1,name), minimum_quantity = COALESCE($2,minimum_quantity),
        unit = COALESCE($3,unit), storage_location = COALESCE($4,storage_location), status = COALESCE($5,status),
        updated_at = now() WHERE id = $6`,
      [body.name || null, body.minimumQuantity === undefined ? null : body.minimumQuantity, body.unit || null,
        body.storageLocation || null, body.status || null, item.id]
    );
    return ctx.db.one('SELECT * FROM inventory_items WHERE id = $1', [item.id]);
  }, { permission: 'inventory.manage.daycare' });

  router.post('/inventory/:id/transactions', async (ctx) => {
    const body = validate(ctx.body, {
      transactionType: { type: 'string', enum: ['received', 'issued', 'adjustment', 'write_off'] },
      quantity: { type: 'number', min: 0.01 },
      reference: { type: 'string', max: 120, optional: true },
      notes: { type: 'string', max: 1000, optional: true }
    });
    const item = await ctx.db.one('SELECT * FROM inventory_items WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!item) throw new AppError('NOT_FOUND');
    let delta = body.quantity;
    if (body.transactionType === 'issued' || body.transactionType === 'write_off') delta = -body.quantity;
    if (body.transactionType === 'adjustment') delta = body.quantity - Number(item.quantity_on_hand);
    const next = Number(item.quantity_on_hand) + delta;
    if (next < 0) fail('CONFLICT', null, 'This transaction would take stock below zero.');
    const transaction = await ctx.db.withTransaction(async (client) => {
      const row = (await client.query(
        `INSERT INTO inventory_transactions (organisation_id, inventory_item_id, transaction_type, quantity_delta,
          reference, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [ctx.organisationId, item.id, body.transactionType, delta, body.reference || null, body.notes || null, ctx.user.id]
      )).rows[0];
      await client.query(
        'UPDATE inventory_items SET quantity_on_hand = $1, updated_at = now() WHERE id = $2', [next, item.id]
      );
      return row;
    });
    await recordAudit(ctx.db, ctx, {
      action: 'inventory.transaction_recorded', resourceType: 'inventory_item', resourceId: item.id,
      metadata: { type: body.transactionType, delta }
    });
    ctx.status = 201;
    return { transaction, quantityOnHand: next };
  }, { permission: 'inventory.manage.daycare' });

  router.get('/inventory/:id/transactions', async (ctx) => {
    const item = await ctx.db.one('SELECT * FROM inventory_items WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!item) throw new AppError('NOT_FOUND');
    return ctx.db.many(
      `SELECT t.*, u.display_name AS created_by_name FROM inventory_transactions t
       LEFT JOIN users u ON u.id = t.created_by WHERE t.inventory_item_id = $1 ORDER BY t.created_at DESC`, [item.id]
    );
  }, { permission: 'inventory.read.daycare' });

  // --- Finance reports ----------------------------------------------------

  router.get('/finance/reports', async (ctx) => {
    const from = ctx.query.from || `${today().slice(0, 4)}-01-01`;
    const to = ctx.query.to || today();
    const invoiced = await ctx.db.one(
      `SELECT COALESCE(SUM(total_amount),0)::float AS total, COUNT(*)::int AS count FROM invoices
       WHERE organisation_id = $1 AND issued_at::date BETWEEN $2::date AND $3::date
         AND status NOT IN ('draft','void','cancelled')`, [ctx.organisationId, from, to]
    );
    const collected = await ctx.db.one(
      `SELECT COALESCE(SUM(amount),0)::float AS total, COUNT(*)::int AS count FROM payments
       WHERE organisation_id = $1 AND status IN ('confirmed','reconciled')
         AND received_at::date BETWEEN $2::date AND $3::date`, [ctx.organisationId, from, to]
    );
    const expenses = await ctx.db.one(
      `SELECT COALESCE(SUM(amount),0)::float AS total, COUNT(*)::int AS count FROM expenses
       WHERE organisation_id = $1 AND approval_status IN ('approved','paid')
         AND expense_date BETWEEN $2::date AND $3::date`, [ctx.organisationId, from, to]
    );
    const byMethod = await ctx.db.many(
      `SELECT payment_method, COALESCE(SUM(amount),0)::float AS total, COUNT(*)::int AS count FROM payments
       WHERE organisation_id = $1 AND status IN ('confirmed','reconciled')
         AND received_at::date BETWEEN $2::date AND $3::date
       GROUP BY payment_method ORDER BY total DESC`, [ctx.organisationId, from, to]
    );
    const expenseByCategory = await ctx.db.many(
      `SELECT COALESCE(ec.name,'Uncategorised') AS category, COALESCE(SUM(e.amount),0)::float AS total
       FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.organisation_id = $1 AND e.approval_status IN ('approved','paid')
         AND e.expense_date BETWEEN $2::date AND $3::date
       GROUP BY ec.name ORDER BY total DESC`, [ctx.organisationId, from, to]
    );
    const monthly = await ctx.db.many(
      `SELECT issued_at, total_amount, amount_paid FROM invoices
       WHERE organisation_id = $1 AND issued_at IS NOT NULL AND status NOT IN ('draft','void','cancelled')
         AND issued_at::date BETWEEN $2::date AND $3::date`, [ctx.organisationId, from, to]
    );
    const months = new Map();
    for (const invoice of monthly) {
      const key = new Date(invoice.issued_at).toISOString().slice(0, 7);
      const entry = months.get(key) || { month: key, invoiced: 0, collected: 0 };
      entry.invoiced += Number(invoice.total_amount);
      entry.collected += Number(invoice.amount_paid);
      months.set(key, entry);
    }
    return {
      from, to,
      invoiced: roundMoney(invoiced.total),
      invoiceCount: invoiced.count,
      collected: roundMoney(collected.total),
      paymentCount: collected.count,
      expenses: roundMoney(expenses.total),
      expenseCount: expenses.count,
      net: roundMoney(collected.total - expenses.total),
      collectionRate: invoiced.total ? Math.round((collected.total / invoiced.total) * 100) : null,
      byMethod, expenseByCategory,
      monthly: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month))
    };
  }, { permission: 'finance.reports.daycare' });

  router.get('/finance/export/invoices', async (ctx) => {
    const rows = await ctx.db.many(
      `SELECT i.invoice_number, i.status, i.total_amount, i.amount_paid, i.due_at, i.created_at,
        l.first_name, l.last_name, g.email
       FROM invoices i LEFT JOIN learners l ON l.id = i.learner_id
       LEFT JOIN guardians g ON g.id = i.guardian_id
       WHERE i.organisation_id = $1 ORDER BY i.created_at DESC LIMIT 5000`, [ctx.organisationId]
    );
    const header = 'invoice_number,status,learner,guardian_email,total,paid,outstanding,due_date,created_at';
    const lines = rows.map((r) => [
      r.invoice_number, r.status, `${r.first_name || ''} ${r.last_name || ''}`.trim(), r.email || '',
      Number(r.total_amount).toFixed(2), Number(r.amount_paid).toFixed(2),
      (Number(r.total_amount) - Number(r.amount_paid)).toFixed(2), r.due_at || '', r.created_at
    ].map(csvCell).join(','));
    await recordAudit(ctx.db, ctx, { action: 'finance.invoices_exported', resourceType: 'invoice', resourceId: null });
    ctx.rawResponse = true;
    sendText(ctx.res, 200, [header, ...lines].join('\n'), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="re-el-invoices.csv"'
    });
  }, { permission: 'finance.reports.daycare' });

  // --- PayFast hosted checkout --------------------------------------------

  router.post('/public/payfast/itn', async (ctx) => {
    ctx.rawResponse = true;
    const ack = (text) => sendText(ctx.res, 200, text || 'OK');

    if (!payfast.isConfigured()) return ack('IGNORED');
    if (!payfast.ipAllowed(ctx.ip)) {
      console.error(JSON.stringify({ level: 'warn', message: 'payfast itn from unlisted ip', ip: ctx.ip }));
      return sendText(ctx.res, 403, 'FORBIDDEN');
    }

    const pairs = ctx.formPairs || [];
    const body = ctx.body || {};
    const verification = payfast.verifyItn(pairs);
    if (!verification.valid) {
      console.error(JSON.stringify({ level: 'warn', message: 'payfast itn rejected', reason: verification.reason, ip: ctx.ip }));
      return sendText(ctx.res, 400, 'INVALID');
    }
    const data = verification.data;
    if (!data.reference) return sendText(ctx.res, 400, 'INVALID');

    const intents = await ctx.db.many('SELECT * FROM payment_intents WHERE reference = $1', [data.reference]);
    if (intents.length !== 1) {
      console.error(JSON.stringify({ level: 'warn', message: 'payfast itn for unknown reference', reference: data.reference }));
      return ack('UNKNOWN');
    }
    const intent = intents[0];

    const serverCheck = await payfast.validateWithPayfast(ctx.rawBody);
    if (serverCheck.status === 'invalid') {
      console.error(JSON.stringify({ level: 'warn', message: 'payfast itn failed server validation', reference: data.reference }));
      return sendText(ctx.res, 400, 'INVALID');
    }

    const eventId = 'payfast:' + (data.providerReference || data.reference) + ':' + (data.paymentStatus || 'unknown');
    const event = await ctx.db.one(
      `INSERT INTO payment_webhook_events (organisation_id, provider, event_id, payload)
       VALUES ($1,'payfast',$2,$3) ON CONFLICT (event_id) DO NOTHING RETURNING id`,
      [intent.organisation_id, eventId, JSON.stringify({ ...body, serverValidation: serverCheck.status })]
    );
    if (!event) return ack('DUPLICATE');

    if (data.paymentStatus !== 'COMPLETE') {
      const nextStatus = data.paymentStatus === 'CANCELLED' ? 'cancelled' : 'failed';
      await ctx.db.query(
        "UPDATE payment_intents SET status = $1 WHERE id = $2 AND status = 'pending'",
        [nextStatus, intent.id]
      );
      await ctx.db.query('UPDATE payment_webhook_events SET processed_at = now() WHERE id = $1', [event.id]);
      return ack('ACKNOWLEDGED');
    }

    if (Math.abs(Number(data.amountGross) - Number(intent.amount)) > 0.01) {
      await ctx.db.query('UPDATE payment_webhook_events SET processed_at = now() WHERE id = $1', [event.id]);
      console.error(JSON.stringify({
        level: 'error', message: 'payfast amount mismatch', reference: intent.reference,
        expected: Number(intent.amount), received: Number(data.amountGross)
      }));
      return ack('REJECTED');
    }

    if (intent.status === 'paid' && intent.payment_id) {
      await ctx.db.query('UPDATE payment_webhook_events SET processed_at = now() WHERE id = $1', [event.id]);
      return ack('ALREADY_PAID');
    }

    const invoice = intent.invoice_id
      ? await ctx.db.one('SELECT * FROM invoices WHERE id = $1', [intent.invoice_id])
      : null;

    const result = await ctx.db.withTransaction(async (client) => {
      const payment = (await client.query(
        `INSERT INTO payments (organisation_id, guardian_id, currency, amount, payment_method, provider_reference,
          status, received_at, idempotency_key, notes)
         VALUES ($1,$2,$3,$4,'payfast',$5,'confirmed',now(),$6,$7) RETURNING *`,
        [intent.organisation_id, intent.guardian_id, intent.currency, Number(intent.amount),
          data.providerReference || null, 'payfast:' + (data.providerReference || intent.reference),
          'PayFast ' + (data.providerReference || intent.reference)]
      )).rows[0];

      let allocations = [];
      if (invoice) {
        const outstanding = Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_paid));
        if (outstanding > 0) {
          allocations = await allocatePayment({ organisationId: intent.organisation_id }, client, payment, [
            { invoiceId: invoice.id, amount: Math.min(Number(intent.amount), outstanding) }
          ]);
        }
      }

      await client.query(
        `UPDATE payment_intents SET status = 'paid', payment_id = $1, provider_reference = $2, completed_at = now()
         WHERE id = $3`,
        [payment.id, data.providerReference || null, intent.id]
      );
      await client.query('UPDATE payment_webhook_events SET processed_at = now() WHERE id = $1', [event.id]);
      return { payment, allocations };
    });

    const [guardian, organisation] = await Promise.all([
      intent.guardian_id ? ctx.db.one('SELECT * FROM guardians WHERE id = $1', [intent.guardian_id]) : null,
      ctx.db.one('SELECT * FROM organisations WHERE id = $1', [intent.organisation_id])
    ]);
    if (guardian && guardian.email && organisation) {
      await sendTemplate(ctx.db, 'paymentReceipt', {
        to: guardian.email,
        organisationId: intent.organisation_id,
        metadata: { paymentId: result.payment.id, intentId: intent.id },
        data: {
          organisationName: organisation.name,
          invoiceNumber: invoice ? invoice.invoice_number : null,
          amount: Number(result.payment.amount),
          currency: result.payment.currency,
          method: 'PayFast card payment',
          reference: data.providerReference || intent.reference,
          paidAt: new Date(result.payment.received_at).toLocaleString('en-ZA')
        }
      });
    }

    await recordAudit(ctx.db, { requestId: ctx.requestId, ip: ctx.ip }, {
      action: 'finance.payment_received', resourceType: 'payment', resourceId: result.payment.id,
      organisationId: intent.organisation_id,
      metadata: { provider: 'payfast', reference: intent.reference, intentId: intent.id }
    });
    return ack('OK');
  }, { public: true, skipCsrf: true });

  router.get('/public/payfast/return', async (ctx) => {
    const reference = ctx.query.ref || ctx.query.m_payment_id || '';
    const status = ctx.query.payment || 'return';
    ctx.rawResponse = true;
    const target = payfast.frontendBaseUrl() + '/#/parent/finance?payment='
      + encodeURIComponent(String(status)) + '&ref=' + encodeURIComponent(String(reference));
    ctx.res.statusCode = 302;
    ctx.res.setHeader('Location', target);
    ctx.res.setHeader('Cache-Control', 'no-store');
    ctx.res.end();
  }, { public: true });
}

async function notifyGuardianInvoice(ctx, invoice) {
  const guardian = await ctx.db.one('SELECT * FROM guardians WHERE id = $1', [invoice.guardian_id]);
  if (!guardian) return;
  if (guardian.user_id) {
    await createNotification(ctx.db, ctx, {
      recipientUserIds: [guardian.user_id], type: 'invoice_issued',
      title: `Invoice ${invoice.invoice_number}`,
      body: `A new invoice has been issued to your account.`,
      resourceType: 'invoice', resourceId: invoice.id
    });
  }
  const learner = invoice.learner_id
    ? await ctx.db.one('SELECT first_name, last_name FROM learners WHERE id = $1', [invoice.learner_id])
    : null;
  await sendTemplate(ctx.db, 'invoiceIssued', {
    to: guardian.email,
    organisationId: ctx.organisationId,
    metadata: { invoiceId: invoice.id },
    data: {
      organisationName: ctx.organisation.name,
      invoiceNumber: invoice.invoice_number,
      learnerName: learner ? `${learner.first_name} ${learner.last_name}` : null,
      amount: Number(invoice.total_amount) - Number(invoice.amount_paid || 0),
      paid: Number(invoice.amount_paid || 0),
      currency: invoice.currency,
      dueDate: invoice.due_at ? new Date(invoice.due_at).toLocaleDateString('en-ZA') : 'On receipt',
      viewUrl: appLink('/#/parent/finance')
    }
  });
}

module.exports = { register };

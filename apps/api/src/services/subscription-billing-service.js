'use strict';

/**
 * Re-EL subscription billing, wired end to end:
 *   - one invoice per billing period (issued lazily, idempotently);
 *   - a tenant pays through the platform's PayFast account;
 *   - the ITN settles the invoice and extends the subscription;
 *   - statuses flip to past_due lazily so no cron is required, with an
 *     optional reminder endpoint for deployments that want email nudges.
 *
 * Money for the subscription always flows through the platform account;
 * tenant fee collection is handled separately by payment-accounts-service.
 */

const crypto = require('node:crypto');
const { AppError } = require('../../../../packages/contracts/errors');

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateString(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function addDays(dateValue, days) {
  const base = dateValue ? new Date(String(dateString(dateValue)) + 'T00:00:00Z') : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function invoiceNumber() {
  return 'PSUB-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

async function currentSubscription(db, organisationId) {
  const subscription = await db.one(
    `SELECT ps.*, sp.name AS plan_name, sp.plan_key, sp.monthly_price, sp.currency AS plan_currency
     FROM platform_subscriptions ps JOIN subscription_plans sp ON sp.id = ps.plan_id
     WHERE ps.organisation_id = $1
     ORDER BY ps.created_at DESC LIMIT 1`,
    [organisationId]
  );
  if (subscription
    && (subscription.status === 'trial' || subscription.status === 'active')
    && subscription.current_period_end
    && dateString(subscription.current_period_end) < todayDate()) {
    await db.query("UPDATE platform_subscriptions SET status = 'past_due' WHERE id = $1", [subscription.id]);
    subscription.status = 'past_due';
  }
  return subscription;
}

function periodFor(subscription) {
  const start = subscription.current_period_start ? dateString(subscription.current_period_start) : todayDate();
  const end = subscription.current_period_end
    ? dateString(subscription.current_period_end)
    : addDays(start, subscription.billing_period === 'annual' ? 365 : 30);
  return { start, end };
}

function invoiceAmountFor(subscription) {
  const monthly = Number(subscription.monthly_price || 0);
  if (!(monthly > 0)) return 0;
  return Math.round((subscription.billing_period === 'annual' ? monthly * 12 : monthly) * 100) / 100;
}

/**
 * Issue the invoice for the current period when it does not exist yet. Safe
 * to call from reads: the unique (subscription_id, period_start) index makes
 * concurrent calls a no-op.
 */
async function ensureInvoice(db, organisation, subscription) {
  if (!subscription || subscription.status === 'cancelled') return null;
  const { start, end } = periodFor(subscription);
  const amount = invoiceAmountFor(subscription);
  if (!(amount > 0)) return null;
  const due = addDays(start, subscription.billing_period === 'annual' ? 14 : 7);
  const inserted = await db.one(
    `INSERT INTO platform_subscription_invoices
       (organisation_id, subscription_id, invoice_number, amount, currency, period_start, period_end, status, due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'issued',$8)
     ON CONFLICT (subscription_id, period_start) DO NOTHING RETURNING *`,
    [organisation.id, subscription.id, invoiceNumber(), amount,
      subscription.plan_currency || organisation.currency || 'ZAR', start, end, due]
  );
  if (inserted) return inserted;
  return db.one(
    `SELECT * FROM platform_subscription_invoices
     WHERE subscription_id = $1 AND period_start = $2`,
    [subscription.id, start]
  );
}

/**
 * Settle the outstanding invoice for a subscription that was just paid.
 * Extends the period from today (or from the previous period end when it is
 * still in the future), marks the invoice paid and returns everything the
 * receipt email and audit trail need. Runs on the client supplied by the
 * caller, so the ITN can compose it into its own transaction.
 */
async function settleSubscriptionPayment(db, intent) {
  const metadata = intent.metadata || {};
  const subscriptionId = metadata.subscriptionId;
  if (!subscriptionId) {
    throw new AppError('CONFLICT', null, 'A subscription payment is missing its subscription id.');
  }
  const subscription = (await db.query(
    `SELECT ps.*, sp.monthly_price FROM platform_subscriptions ps
     JOIN subscription_plans sp ON sp.id = ps.plan_id WHERE ps.id = $1`, [subscriptionId]
  )).rows[0];
  if (!subscription) return null;
  const annual = subscription.billing_period === 'annual';
  const days = annual ? 365 : 30;
  const today = todayDate();
  const previousEnd = dateString(subscription.current_period_end);
  const base = previousEnd && previousEnd > today ? previousEnd : today;
  const nextEnd = addDays(base, days);
  const updated = (await db.query(
    `UPDATE platform_subscriptions SET status = 'active', current_period_start = $1, current_period_end = $2
     WHERE id = $3 RETURNING *`,
    [base, nextEnd, subscription.id]
  )).rows[0];
  let invoice = null;
  if (metadata.invoiceId) {
    invoice = (await db.query(
      `UPDATE platform_subscription_invoices
       SET status = 'paid', paid_at = now(), payment_intent_id = $1
       WHERE id = $2 AND organisation_id = $3 RETURNING *`,
      [intent.id, metadata.invoiceId, subscription.organisation_id]
    )).rows[0] || null;
  }
  if (!invoice) {
    invoice = (await db.query(
      `UPDATE platform_subscription_invoices
       SET status = 'paid', paid_at = now(), payment_intent_id = $1
       WHERE id = (SELECT id FROM platform_subscription_invoices
         WHERE subscription_id = $2 AND status = 'issued'
         ORDER BY period_start DESC LIMIT 1) RETURNING *`,
      [intent.id, subscription.id]
    )).rows[0] || null;
  }
  return { subscription: updated, invoice };
}

/**
 * Record a subscription payment made outside PayFast (for example an EFT to
 * the platform). Marks the current period's invoice as paid (issuing it
 * first if missing) and extends the subscription exactly once.
 */
async function recordManualPayment(db, organisationId, { amount, reference, notes } = {}) {
  const organisation = await db.one('SELECT * FROM organisations WHERE id = $1', [organisationId]);
  if (!organisation) throw new AppError('NOT_FOUND');
  const subscription = await currentSubscription(db, organisationId);
  if (!subscription) throw new AppError('CONFLICT', null, 'This organisation has no subscription to pay.');
  const invoice = await ensureInvoice(db, organisation, subscription);
  const paidAmount = amount === undefined ? (invoice ? Number(invoice.amount) : invoiceAmountFor(subscription)) : Number(amount);
  return db.withTransaction(async (client) => {
    const paidInvoice = invoice
      ? (await client.query(
        `UPDATE platform_subscription_invoices
         SET status = 'paid', paid_at = now(), payment_reference = $2
         WHERE id = $1 AND status <> 'void' RETURNING *`,
        [invoice.id, reference ? String(reference).slice(0, 60) : null]
      )).rows[0]
      : null;
    const annual = subscription.billing_period === 'annual';
    const days = annual ? 365 : 30;
    const today = todayDate();
    const previousEnd = dateString(subscription.current_period_end);
    const base = previousEnd && previousEnd > today ? previousEnd : today;
    const nextEnd = addDays(base, days);
    const updated = (await client.query(
      `UPDATE platform_subscriptions SET status = 'active', current_period_start = $1, current_period_end = $2
       WHERE id = $3 RETURNING *`,
      [base, nextEnd, subscription.id]
    )).rows[0];
    return { subscription: updated, invoice: paidInvoice, organisation, amount: paidAmount, notes: notes || null };
  });
}

module.exports = {
  currentSubscription,
  ensureInvoice,
  invoiceAmountFor,
  settleSubscriptionPayment,
  recordManualPayment,
  periodFor,
  todayDate,
  dateString
};

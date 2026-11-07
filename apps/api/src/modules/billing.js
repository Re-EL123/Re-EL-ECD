'use strict';

/**
 * Tenant billing: how the organisation pays Re-EL, and how it collects parent
 * fees.
 *
 *   GET  /billing/summary            plan, invoices, fee-collection mode, payout status
 *   POST /billing/subscription/pay   hosted checkout for the oldest unpaid subscription invoice
 *   GET  /billing/payouts            payout history for platform-collected organisations
 *   PUT  /billing/payment-account    fee-collection mode, own PayFast credentials, payout details
 *   GET  /internal/subscription-reminders   optional, guarded by CRON_SECRET
 *
 * Tenants never see their secrets back; only booleans and last-4 values.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const payfast = require('../services/payfast-service');
const { createPaymentIntent } = require('../services/payment-intent-service');
const {
  currentSubscription,
  ensureInvoice,
  todayDate,
  invoiceAmountFor,
  runSubscriptionSweep
} = require('../services/subscription-billing-service');
const { maskedAccount, savePaymentAccount } = require('../services/payment-accounts-service');

const MANAGE = 'organisation.settings.manage';

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function collectionsOutstanding(db, organisationId) {
  return db.one(
    `WITH collected AS (
       SELECT COALESCE(SUM(amount), 0) AS gross FROM payment_intents
       WHERE organisation_id = $1 AND status = 'paid'
         AND purpose IN ('invoice','statement','application_fee','form_payment')
         AND (metadata->>'settlement') IS DISTINCT FROM 'own_payfast'
     ),
     settled AS (
       SELECT COALESCE(SUM(net_amount), 0) AS net, COALESCE(SUM(fee_amount), 0) AS fee,
              MAX(paid_at) AS last_payout_at
       FROM platform_payouts WHERE organisation_id = $1 AND status = 'paid'
     )
     SELECT collected.gross AS collected_gross, settled.net AS settled_net, settled.fee AS fees_paid,
            settled.last_payout_at,
            GREATEST(collected.gross - settled.net - settled.fee, 0) AS outstanding
     FROM collected, settled`,
    [organisationId]
  );
}

function register(router) {
  router.get('/billing/summary', async (ctx) => {
    const organisation = ctx.organisation;
    const subscription = await currentSubscription(ctx.db, ctx.organisationId);
    let invoices = [];
    let openInvoice = null;
    if (subscription) {
      if (subscription.status !== 'cancelled') {
        const issued = await ensureInvoice(ctx.db, organisation, subscription);
        openInvoice = issued && issued.status === 'issued' ? issued : null;
      }
      invoices = await ctx.db.many(
        `SELECT id, invoice_number, amount, currency, period_start, period_end, status, issued_at, due_at, paid_at, payment_reference
         FROM platform_subscription_invoices WHERE subscription_id = $1 ORDER BY period_start DESC LIMIT 12`,
        [subscription.id]
      );
    }
    const account = await ctx.db.one(
      'SELECT * FROM organisation_payment_accounts WHERE organisation_id = $1', [ctx.organisationId]
    );
    const collections = await collectionsOutstanding(ctx.db, ctx.organisationId);
    const payouts = await ctx.db.many(
      `SELECT id, period_start, period_end, gross_amount, fee_amount, net_amount, currency, reference, notes, paid_at
       FROM platform_payouts WHERE organisation_id = $1 AND status = 'paid'
       ORDER BY paid_at DESC LIMIT 10`,
      [ctx.organisationId]
    );
    return {
      organisation: { id: organisation.id, name: organisation.name, currency: organisation.currency || 'ZAR' },
      payfast: { platformAvailable: payfast.isConfigured() },
      workspaceSuspended: organisation.status === 'suspended',
      subscription: subscription ? {
        id: subscription.id,
        planName: subscription.plan_name,
        planKey: subscription.plan_key,
        status: subscription.status,
        billingPeriod: subscription.billing_period,
        amount: invoiceAmountFor(subscription),
        currency: subscription.plan_currency || organisation.currency || 'ZAR',
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        daysRemaining: subscription.current_period_end
          ? Math.max(0, Math.round((new Date(String(subscription.current_period_end).slice(0, 10) + 'T00:00:00Z') - new Date(todayDate() + 'T00:00:00Z')) / 86400000))
          : null
      } : null,
      invoices,
      openInvoice,
      paymentAccount: maskedAccount(account),
      collections: {
        collectedGross: money(collections.collected_gross),
        feesPaid: money(collections.fees_paid),
        settledNet: money(collections.settled_net),
        outstanding: money(collections.outstanding),
        lastPayoutAt: collections.last_payout_at || null,
        feePercent: Number((account && account.fee_percent) || 0),
        mode: account ? account.mode : 'platform_collected'
      },
      payouts
    };
  }, { permission: MANAGE, allowSuspended: true });

  router.post('/billing/subscription/pay', async (ctx) => {
    if (!payfast.isConfigured()) {
      fail('CONFLICT', null, 'Online subscription payments are not configured. Set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY on the API.');
    }
    const body = validate(ctx.body || {}, {
      invoiceId: { type: 'string', uuid: true, optional: true }
    });
    const organisation = ctx.organisation;
    const subscription = await currentSubscription(ctx.db, ctx.organisationId);
    if (!subscription) fail('CONFLICT', null, 'This organisation has no plan to pay.');
    if (subscription.status === 'cancelled') {
      fail('CONFLICT', null, 'This subscription is cancelled. Contact support to reinstate it.');
    }
    let invoice = null;
    if (body.invoiceId) {
      invoice = await ctx.db.one(
        "SELECT * FROM platform_subscription_invoices WHERE id = $1 AND organisation_id = $2",
        [body.invoiceId, ctx.organisationId]
      );
      if (!invoice) throw new AppError('NOT_FOUND');
      if (invoice.status !== 'issued') fail('CONFLICT', null, 'That invoice is not awaiting payment.');
    } else {
      invoice = await ensureInvoice(ctx.db, organisation, subscription);
    }
    if (!invoice) fail('CONFLICT', null, 'This plan has no amount to charge. Contact support to set one up.');

    const amount = Number(invoice.amount);
    // A double-click must not create two intents: reuse the pending one.
    const pending = await ctx.db.one(
      `SELECT * FROM payment_intents
       WHERE organisation_id = $1 AND purpose = 'platform_subscription' AND status = 'pending'
         AND (metadata->>'invoiceId') = $2
       ORDER BY created_at DESC LIMIT 1`,
      [ctx.organisationId, invoice.id]
    );
    const itemName = 'Re-EL ECD — ' + subscription.plan_name + ' (' + subscription.billing_period + ')';
    if (pending) {
      const checkout = payfast.buildCheckout({
        amount: Number(pending.amount),
        itemName: String(itemName).slice(0, 100),
        itemDescription: organisation.name,
        reference: pending.reference,
        email: undefined,
        organisationId: organisation.id,
        returnUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=return',
        cancelUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=cancelled',
        notifyUrl: payfast.apiBaseUrl(ctx.req) + '/api/v1/public/payfast/itn'
      });
      return { invoice, amount: Number(pending.amount), currency: pending.currency, checkout, reused: true };
    }

    const nameParts = String(ctx.user.display_name || '').trim().split(/\s+/).filter(Boolean);
    const payer = {
      email: ctx.user.email,
      first_name: nameParts[0] || organisation.name,
      last_name: nameParts.slice(1).join(' ')
    };
    const { intent, checkout } = await createPaymentIntent(ctx.db, {
      organisation,
      amount,
      currency: invoice.currency,
      purpose: 'platform_subscription',
      metadata: {
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        organisationId: organisation.id,
        payerEmail: payer.email,
        planName: subscription.plan_name,
        billingPeriod: subscription.billing_period
      },
      payer,
      createdBy: ctx.user.id,
      req: ctx.req,
      scope: 'staff',
      itemName,
      itemDescription: organisation.name,
      returnUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=return',
      cancelUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=cancelled'
    });
    await recordAudit(ctx.db, ctx, {
      action: 'billing.subscription_checkout_created', resourceType: 'platform_subscription_invoice',
      resourceId: invoice.id, organisationId: ctx.organisationId,
      metadata: { intentId: intent.id, amount, invoice: invoice.invoice_number }
    });
    return { invoice, amount, currency: invoice.currency, checkout, intent: { id: intent.id, reference: intent.reference } };
  }, { permission: MANAGE, allowSuspended: true });

  router.get('/billing/payouts', async (ctx) => {
    const outstanding = await collectionsOutstanding(ctx.db, ctx.organisationId);
    const payouts = await ctx.db.many(
      `SELECT id, period_start, period_end, gross_amount, fee_amount, net_amount, currency, reference, notes, paid_at
       FROM platform_payouts WHERE organisation_id = $1 AND status = 'paid'
       ORDER BY paid_at DESC LIMIT 50`,
      [ctx.organisationId]
    );
    return {
      outstanding: money(outstanding.outstanding),
      collectedGross: money(outstanding.collected_gross),
      feesPaid: money(outstanding.fees_paid),
      settledNet: money(outstanding.settled_net),
      lastPayoutAt: outstanding.last_payout_at || null,
      payouts
    };
  }, { permission: MANAGE });

  router.put('/billing/payment-account', async (ctx) => {
    const body = validate(ctx.body, {
      mode: { type: 'string', enum: ['own_payfast', 'platform_collected'], optional: true },
      merchantId: { type: 'string', min: 2, max: 60, optional: true },
      merchantKey: { type: 'string', min: 4, max: 200, optional: true },
      passphrase: { type: 'string', max: 200, optional: true },
      clearCredentials: { type: 'boolean', optional: true },
      payoutAccountHolder: { type: 'string', max: 120, optional: true },
      payoutBankName: { type: 'string', max: 120, optional: true },
      payoutBranchCode: { type: 'string', min: 4, max: 20, optional: true },
      payoutAccountNumber: { type: 'string', min: 4, max: 40, optional: true },
      payoutAccountType: { type: 'string', enum: ['cheque', 'savings', 'transmission', 'bond'], optional: true }
    });
    const { account, mode, clearedCredentials, payoutAccountSet } = await savePaymentAccount(
      ctx.db, ctx.organisationId, body, { allowFeePercent: false }
    );
    await recordAudit(ctx.db, ctx, {
      action: 'billing.payment_account_saved', resourceType: 'organisation_payment_account',
      resourceId: ctx.organisationId, organisationId: ctx.organisationId,
      metadata: {
        mode, ownPayfast: mode === 'own_payfast', clearedCredentials,
        payoutAccountSet
      }
    });
    return maskedAccount(account);
  }, { permission: MANAGE });

  // --- Optional reminder digest --------------------------------------------
  // Deployments can point Vercel Cron, GitHub Actions or an uptime monitor at
  // this endpoint. It does nothing unless CRON_SECRET is configured, and it
  // only ever flips statuses and emails owners — it never moves money.
  router.get('/internal/subscription-reminders', async (ctx) => {
    const secret = String(process.env.CRON_SECRET || '').trim();
    const auth = String(ctx.req.headers.authorization || '');
    if (!secret || auth !== 'Bearer ' + secret) {
      ctx.status = 404;
      return { error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } };
    }
    return runSubscriptionSweep(ctx.db);
  }, { public: true });
}

module.exports = { register };

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
const { safeEqual } = require('../../../../packages/auth/password');
const { recordAudit } = require('../services/audit-service');
const payfast = require('../services/payfast-service');
const payfastFees = require('../services/payfast-fees');
const { createPaymentIntent } = require('../services/payment-intent-service');
const {
  currentSubscription,
  ensureInvoice,
  todayDate,
  invoiceAmountFor,
  runSubscriptionSweep,
  applyUpgrade
} = require('../services/subscription-billing-service');
const { maskedAccount, savePaymentAccount } = require('../services/payment-accounts-service');
const entitlements = require('../services/entitlements-service');
const {
  SETUP_FEE_BASE_AMOUNT,
  SETUP_FEE_INCLUDES,
  ensureSetupFee,
  saveVisitDetails,
  summaryView: setupFeeSummaryView
} = require('../services/setup-fee-service');

const MANAGE = 'organisation.settings.manage';

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function daysUntil(value) {
  if (!value) return null;
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return null;
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const today = new Date(String(todayDate()).slice(0, 10) + 'T00:00:00Z').getTime();
  if (Number.isNaN(today)) return null;
  return Math.max(0, Math.round((endDay - today) / 86400000));
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
    const baseAmount = subscription ? invoiceAmountFor(subscription) : 0;
    const recoverFees = payfast.isConfigured() && payfastFees.recoveryEnabledForSubscriptions();
    const payfastRecovery = (subscription && baseAmount > 0)
      ? payfastFees.estimate(baseAmount, process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card')
      : null;

    const planUsage = await entitlements.status(ctx.db, ctx.organisationId);
    const currentPrice = Number((subscription && subscription.monthly_price) || 0);
    const rawUpgradePlans = await ctx.db.many(
      `SELECT plan_key, name, description, features, monthly_price, currency,
              max_learners, max_staff, max_storage_bytes
       FROM subscription_plans WHERE status = 'active' AND monthly_price > $1
       ORDER BY monthly_price LIMIT 12`, [currentPrice]
    ).catch(() => []);
    // Quote each plan with the exact same fee logic the upgrade endpoint uses,
    // so the amount shown in the modal is the amount PayFast will request.
    const feeProfile = process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card';
    const feeMethod = payfastFees.METHODS[payfastFees.resolveMethodKey(feeProfile)];
    const upgradeQuote = (base) => {
      const quoted = payfastFees.estimate(base, feeProfile);
      return {
        base: quoted.base,
        fee: recoverFees ? quoted.fee : 0,
        total: recoverFees ? quoted.gross : quoted.base
      };
    };
    const upgradePlans = rawUpgradePlans.map((plan) => {
      const monthlyBase = Math.round(Number(plan.monthly_price || 0) * 100) / 100;
      const annualBase = Math.round(monthlyBase * 12 * 100) / 100;
      return {
        ...plan,
        checkout: {
          monthly: upgradeQuote(monthlyBase),
          annual: upgradeQuote(annualBase),
          feeLabel: feeMethod ? feeMethod.label : 'Card payments'
        }
      };
    });
    const setupFeeRow = await ensureSetupFee(ctx.db, organisation);
    const setupBaseAmount = setupFeeRow ? Number(setupFeeRow.amount) : 0;
    const setupPayfastRecovery = (setupFeeRow && setupFeeRow.status === 'issued' && setupBaseAmount > 0)
      ? payfastFees.estimate(setupBaseAmount, process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card')
      : null;
    return {
      organisation: { id: organisation.id, name: organisation.name, currency: organisation.currency || 'ZAR' },
      payfast: {
        platformAvailable: payfast.isConfigured(),
        recoverSubscriptionFees: recoverFees,
        recoveryProfile: payfastFees.resolveMethodKey(process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card')
      },
      workspaceSuspended: organisation.status === 'suspended',
      subscription: subscription ? {
        id: subscription.id,
        planName: subscription.plan_name,
        planKey: subscription.plan_key,
        status: subscription.status,
        billingPeriod: subscription.billing_period,
        amount: baseAmount,
        currency: subscription.plan_currency || organisation.currency || 'ZAR',
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        // pg returns a Date object; slicing String(date) gives "Tue Dec 15",
        // which is not parseable. Normalise both sides to a UTC calendar day.
        daysRemaining: daysUntil(subscription.current_period_end),
        payfast: payfastRecovery ? {
          baseAmount: payfastRecovery.base,
          processingFee: recoverFees ? payfastRecovery.fee : 0,
          totalDue: recoverFees ? payfastRecovery.gross : payfastRecovery.base,
          estimatedNet: recoverFees ? payfastRecovery.net : payfastRecovery.netIfUnrecovered,
          method: payfastRecovery.method,
          methodLabel: payfastRecovery.methodLabel,
          includesPayout: payfastRecovery.includesPayout,
          recovered: recoverFees
        } : null
      } : null,
      invoices,
      openInvoice: openInvoice ? Object.assign({}, openInvoice, payfastRecovery ? {
        payfastBaseAmount: payfastRecovery.base,
        payfastProcessingFee: recoverFees ? payfastRecovery.fee : 0,
        payfastTotalDue: recoverFees ? payfastRecovery.gross : payfastRecovery.base
      } : {}) : null,
      setupFee: setupFeeRow ? Object.assign({}, setupFeeSummaryView(setupFeeRow), {
        payfast: setupPayfastRecovery ? {
          baseAmount: setupPayfastRecovery.base,
          processingFee: (payfast.isConfigured() && recoverFees) ? setupPayfastRecovery.fee : 0,
          totalDue: (payfast.isConfigured() && recoverFees) ? setupPayfastRecovery.gross : setupPayfastRecovery.base,
          estimatedNet: (payfast.isConfigured() && recoverFees) ? setupPayfastRecovery.net : setupPayfastRecovery.netIfUnrecovered,
          method: setupPayfastRecovery.method,
          methodLabel: setupPayfastRecovery.methodLabel,
          recovered: payfast.isConfigured() && recoverFees
        } : null
      }) : null,
      planUsage,
      upgradePlans,
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

    const baseAmount = Number(invoice.amount);
    const recoverFees = payfastFees.recoveryEnabledForSubscriptions();
    const feeQuote = recoverFees
      ? payfastFees.estimate(baseAmount, process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card')
      : null;
    const amount = feeQuote ? feeQuote.gross : baseAmount;

    // A double-click must not create two intents: reuse the pending one.
    const pending = await ctx.db.one(
      `SELECT * FROM payment_intents
       WHERE organisation_id = $1 AND purpose = 'platform_subscription' AND status = 'pending'
         AND (metadata->>'invoiceId') = $2
       ORDER BY created_at DESC LIMIT 1`,
      [ctx.organisationId, invoice.id]
    );
    const itemName = 'Re-EL ECD — ' + subscription.plan_name + ' (' + subscription.billing_period + ')';
    const itemDescription = feeQuote
      ? organisation.name + ' (includes R' + payfastFees.round2(feeQuote.fee).toFixed(2) + ' secure online processing)'
      : organisation.name;
    if (pending) {
      const checkout = payfast.buildCheckout({
        amount: Number(pending.amount),
        itemName: String(itemName).slice(0, 100),
        itemDescription,
        reference: pending.reference,
        email: undefined,
        organisationId: organisation.id,
        returnUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=return',
        cancelUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=cancelled',
        notifyUrl: payfast.apiBaseUrl(ctx.req) + '/api/v1/public/payfast/itn'
      });
      return {
        invoice, baseAmount, processingFee: payfastFees.round2(Number(pending.amount) - baseAmount),
        amount: Number(pending.amount), currency: pending.currency, checkout, reused: true
      };
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
        billingPeriod: subscription.billing_period,
        baseAmount,
        processingFee: feeQuote ? feeQuote.fee : 0,
        processingFeeMethod: feeQuote ? feeQuote.method : null,
        processingFeeRecovered: Boolean(feeQuote)
      },
      payer,
      createdBy: ctx.user.id,
      req: ctx.req,
      scope: 'staff',
      itemName,
      itemDescription,
      returnUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=return',
      cancelUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=cancelled'
    });
    await recordAudit(ctx.db, ctx, {
      action: 'billing.subscription_checkout_created', resourceType: 'platform_subscription_invoice',
      resourceId: invoice.id, organisationId: ctx.organisationId,
      metadata: { intentId: intent.id, amount, baseAmount, processingFee: feeQuote ? feeQuote.fee : 0, invoice: invoice.invoice_number }
    });
    return {
      invoice, baseAmount, processingFee: feeQuote ? feeQuote.fee : 0,
      amount, currency: invoice.currency, checkout, intent: { id: intent.id, reference: intent.reference }
    };
  }, { permission: MANAGE, allowSuspended: true });


  // Tenant-initiated upgrade: pay first, apply the new plan on PayFast ITN.
  router.post('/billing/subscription/upgrade', async (ctx) => {
    if (!payfast.isConfigured()) {
      fail('CONFLICT', null, 'Online payments are not configured. Contact support to upgrade your plan.');
    }
    const body = validate(ctx.body || {}, {
      planKey: { type: 'string', min: 2, max: 60 },
      billingPeriod: { type: 'string', enum: ['monthly', 'annual'], default: 'monthly' }
    });
    const plan = await ctx.db.one(
      "SELECT * FROM subscription_plans WHERE plan_key = $1 AND status = 'active'", [body.planKey]
    );
    if (!plan) fail('VALIDATION', [{ field: 'planKey', message: 'That plan is not available.' }]);
    const current = await currentSubscription(ctx.db, ctx.organisationId);
    if (current && Number(plan.monthly_price) <= Number(current.monthly_price || 0)) {
      fail('CONFLICT', null, 'Choose a plan with a higher monthly price than your current plan.');
    }
    const annual = body.billingPeriod === 'annual';
    const baseAmount = Math.round(Number(plan.monthly_price) * (annual ? 12 : 1) * 100) / 100;
    if (!(baseAmount > 0)) fail('CONFLICT', null, 'That plan has no price to charge.');
    const recoverFees = payfastFees.recoveryEnabledForSubscriptions();
    const feeQuote = recoverFees
      ? payfastFees.estimate(baseAmount, process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card') : null;
    const amount = feeQuote ? feeQuote.gross : baseAmount;

    const nameParts = String(ctx.user.display_name || '').trim().split(/\s+/).filter(Boolean);
    const payer = {
      email: ctx.user.email,
      first_name: nameParts[0] || ctx.organisation.name,
      last_name: nameParts.slice(1).join(' ')
    };
    const { intent, checkout } = await createPaymentIntent(ctx.db, {
      organisation: ctx.organisation,
      amount,
      currency: plan.currency || ctx.organisation.currency || 'ZAR',
      purpose: 'platform_subscription_upgrade',
      metadata: {
        organisationId: ctx.organisationId,
        newPlanKey: plan.plan_key,
        billingPeriod: body.billingPeriod,
        createdBy: ctx.user.id,
        payerEmail: payer.email,
        baseAmount,
        processingFee: feeQuote ? feeQuote.fee : 0
      },
      payer,
      createdBy: ctx.user.id,
      req: ctx.req,
      scope: 'staff',
      itemName: 'Re-EL ECD — upgrade to ' + plan.name + ' (' + body.billingPeriod + ')',
      itemDescription: ctx.organisation.name,
      returnUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=return',
      cancelUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=cancelled'
    });
    await recordAudit(ctx.db, ctx, {
      action: 'billing.subscription_upgrade_checkout', resourceType: 'platform_subscription',
      resourceId: current ? current.id : null, organisationId: ctx.organisationId,
      metadata: { planKey: plan.plan_key, amount, intentId: intent.id }
    });
    return { plan, amount, currency: plan.currency || ctx.organisation.currency || 'ZAR', checkout };
  }, { permission: MANAGE, allowSuspended: true });

  router.post('/billing/setup/pay', async (ctx) => {
    if (!payfast.isConfigured()) {
      fail('CONFLICT', null, 'Online payments are not configured. Set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY on the API.');
    }
    const visit = validate(ctx.body || {}, {
      contactName: { type: 'string', min: 2, max: 120 },
      contactPhone: { type: 'string', min: 5, max: 40 },
      contactEmail: { type: 'string', email: true, optional: true },
      centreAddress: { type: 'string', min: 5, max: 300 },
      preferredVisitDate: { type: 'string', date: true, optional: true },
      preferredVisitTime: { type: 'string', max: 60, optional: true },
      alternatePhone: { type: 'string', max: 40, optional: true },
      notes: { type: 'string', max: 1000, optional: true }
    });
    const organisation = ctx.organisation;
    let setupFee = await ensureSetupFee(ctx.db, organisation);
    if (!setupFee) fail('CONFLICT', null, 'This organisation does not have a setup fee.');
    if (setupFee.status === 'paid') fail('CONFLICT', null, 'The setup fee is already paid.');
    if (setupFee.status === 'waived') fail('CONFLICT', null, 'The setup fee has been waived.');
    if (setupFee.status === 'void') fail('CONFLICT', null, 'The setup fee is void.');

    // Save visit/on-site details so Re-EL representatives can come to the centre.
    setupFee = await saveVisitDetails(ctx.db, organisation.id, Object.assign({}, visit, { capturedAt: new Date().toISOString() })) || setupFee;

    const baseAmount = Number(setupFee.amount);
    const recoverFees = payfastFees.recoveryEnabledForSubscriptions();
    const feeQuote = recoverFees
      ? payfastFees.estimate(baseAmount, process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card')
      : null;
    const amount = feeQuote ? feeQuote.gross : baseAmount;

    const pending = await ctx.db.one(
      `SELECT * FROM payment_intents
       WHERE organisation_id = $1 AND purpose = 'platform_setup' AND status = 'pending'
         AND (metadata->>'setupFeeId') = $2
       ORDER BY created_at DESC LIMIT 1`,
      [ctx.organisationId, setupFee.id]
    );
    const itemName = 'Re-EL ECD — Once-off setup & launch package';
    const itemDescription = feeQuote
      ? organisation.name + ' (R' + baseAmount.toFixed(2) + ' setup + R' + payfastFees.round2(feeQuote.fee).toFixed(2) + ' secure online processing)'
      : organisation.name + ' — once-off R' + baseAmount.toFixed(2) + ' setup';
    if (pending) {
      const checkout = payfast.buildCheckout({
        amount: Number(pending.amount),
        itemName: String(itemName).slice(0, 100),
        itemDescription,
        reference: pending.reference,
        email: undefined,
        organisationId: organisation.id,
        returnUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=return',
        cancelUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=cancelled',
        notifyUrl: payfast.apiBaseUrl(ctx.req) + '/api/v1/public/payfast/itn'
      });
      return {
        setupFee: setupFeeSummaryView(setupFee), baseAmount,
        processingFee: payfastFees.round2(Number(pending.amount) - baseAmount),
        amount: Number(pending.amount), currency: pending.currency, checkout, reused: true
      };
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
      currency: setupFee.currency || 'ZAR',
      purpose: 'platform_setup',
      metadata: {
        setupFeeId: setupFee.id,
        organisationId: organisation.id,
        payerEmail: payer.email,
        baseAmount,
        processingFee: feeQuote ? feeQuote.fee : 0,
        processingFeeMethod: feeQuote ? feeQuote.method : null,
        processingFeeRecovered: Boolean(feeQuote),
        visitContactName: visit.contactName,
        visitContactPhone: visit.contactPhone,
        visitPreferredDate: visit.preferredVisitDate || null
      },
      payer,
      createdBy: ctx.user.id,
      req: ctx.req,
      scope: 'staff',
      itemName,
      itemDescription,
      returnUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=return',
      cancelUrl: payfast.frontendBaseUrl() + '/#/app/settings?tab=billing&payment=cancelled'
    });
    await recordAudit(ctx.db, ctx, {
      action: 'billing.setup_fee_checkout_created', resourceType: 'platform_setup_fee',
      resourceId: setupFee.id, organisationId: ctx.organisationId,
      metadata: { intentId: intent.id, amount, baseAmount, processingFee: feeQuote ? feeQuote.fee : 0 }
    });
    return {
      setupFee: setupFeeSummaryView(setupFee), baseAmount,
      processingFee: feeQuote ? feeQuote.fee : 0,
      amount, currency: setupFee.currency || 'ZAR',
      checkout, intent: { id: intent.id, reference: intent.reference }
    };
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
    if (!secret || !safeEqual(auth, 'Bearer ' + secret)) {
      ctx.status = 404;
      return { error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } };
    }
    return runSubscriptionSweep(ctx.db);
  }, { public: true });
}

module.exports = { register };

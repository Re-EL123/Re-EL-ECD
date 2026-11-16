'use strict';

/**
 * Once-off R700 launch/setup package for each organisation.
 *
 * Includes (as sold on the homepage): 3 days staff training, platform setup,
 * public website setup, curriculum template, module templates, activities
 * templates, launch marketing.
 *
 * The fee is paid to the Re-EL platform (not a tenant-collected fee). Online
 * payment goes through the platform PayFast account with processing-fee
 * recovery so Re-EL nets the base amount; it can also be recorded manually or
 * waived by the platform.
 */

const { AppError } = require('../../../../packages/contracts/errors');

const SETUP_FEE_BASE_AMOUNT = 700;
const SETUP_FEE_CURRENCY = 'ZAR';
const SETUP_FEE_INCLUDES = [
  '3 days staff training',
  'Platform setup',
  'Public website setup',
  'Curriculum template',
  'Module templates',
  'Activities templates',
  'Launch marketing'
];

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function getSetupFee(db, organisationId) {
  return db.one('SELECT * FROM platform_setup_fees WHERE organisation_id = $1', [organisationId]);
}

async function ensureSetupFee(db, organisation) {
  if (!organisation || organisation.slug === 're-el-platform') return null;
  const inserted = await db.one(
    `INSERT INTO platform_setup_fees (organisation_id, amount, currency, status, includes)
     VALUES ($1,$2,$3,'issued',$4::jsonb)
     ON CONFLICT (organisation_id) DO NOTHING RETURNING *`,
    [organisation.id, SETUP_FEE_BASE_AMOUNT, organisation.currency || SETUP_FEE_CURRENCY, JSON.stringify(SETUP_FEE_INCLUDES)]
  );
  if (inserted) return inserted;
  return getSetupFee(db, organisation.id);
}

/**
 * Settle a setup fee that was just paid online (PayFast ITN). Idempotent-ish:
 * marks the record paid and stores the intent/payment reference.
 */
async function settleSetupFeePayment(db, intent) {
  const metadata = intent.metadata || {};
  const setupFeeId = metadata.setupFeeId;
  if (!setupFeeId) {
    throw new AppError('CONFLICT', null, 'A setup-fee payment is missing its setup fee id.');
  }
  const paid = (await db.query(
    `UPDATE platform_setup_fees
     SET status = 'paid', paid_at = COALESCE(paid_at, now()), payment_intent_id = $1,
         payment_reference = COALESCE(payment_reference, $2), updated_at = now()
     WHERE id = $3 AND organisation_id = $4 AND status IN ('issued','paid')
     RETURNING *`,
    [intent.id, intent.reference || null, setupFeeId, intent.organisation_id]
  )).rows[0] || null;
  return paid;
}

async function recordManualSetupPayment(db, organisationId, { amount, reference, notes } = {}) {
  const organisation = await db.one('SELECT * FROM organisations WHERE id = $1', [organisationId]);
  if (!organisation) throw new AppError('NOT_FOUND');
  const fee = await ensureSetupFee(db, organisation);
  if (!fee) throw new AppError('CONFLICT', null, 'This organisation does not have a setup fee.');
  if (fee.status === 'void') throw new AppError('CONFLICT', null, 'This setup fee is void.');
  const paidAmount = amount === undefined ? Number(fee.amount) : roundMoney(amount);
  const updated = (await db.query(
    `UPDATE platform_setup_fees
     SET status = 'paid', paid_at = COALESCE(paid_at, now()),
         payment_reference = COALESCE($2, payment_reference),
         notes = COALESCE($3, notes), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [fee.id, reference ? String(reference).slice(0, 60) : null, notes || null]
  )).rows[0];
  return { setupFee: updated, organisation, amount: paidAmount };
}

async function waiveSetupFee(db, organisationId, { reason, notes } = {}) {
  const organisation = await db.one('SELECT * FROM organisations WHERE id = $1', [organisationId]);
  if (!organisation) throw new AppError('NOT_FOUND');
  const fee = await ensureSetupFee(db, organisation);
  if (!fee) throw new AppError('CONFLICT', null, 'This organisation does not have a setup fee.');
  if (fee.status === 'paid') throw new AppError('CONFLICT', null, 'A paid setup fee cannot be waived.');
  const updated = (await db.query(
    `UPDATE platform_setup_fees
     SET status = 'waived', waived_at = now(), waived_reason = $2,
         notes = COALESCE($3, notes), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [fee.id, reason || null, notes || null]
  )).rows[0];
  return { setupFee: updated, organisation };
}

function summaryView(fee) {
  if (!fee) return null;
  return {
    id: fee.id,
    amount: Number(fee.amount),
    currency: fee.currency || SETUP_FEE_CURRENCY,
    status: fee.status,
    includes: Array.isArray(fee.includes) ? fee.includes : SETUP_FEE_INCLUDES,
    visitDetails: fee.visit_details || null,
    paidAt: fee.paid_at || null,
    waivedAt: fee.waived_at || null,
    waivedReason: fee.waived_reason || null,
    paymentReference: fee.payment_reference || null,
    createdAt: fee.created_at || null
  };
}

async function saveVisitDetails(db, organisationId, details) {
  const updated = (await db.query(
    `UPDATE platform_setup_fees
     SET visit_details = $2::jsonb, updated_at = now()
     WHERE organisation_id = $1
     RETURNING *`,
    [organisationId, JSON.stringify(details || {})]
  )).rows[0] || null;
  return updated;
}

module.exports = {
  SETUP_FEE_BASE_AMOUNT,
  SETUP_FEE_CURRENCY,
  SETUP_FEE_INCLUDES,
  getSetupFee,
  ensureSetupFee,
  settleSetupFeePayment,
  recordManualSetupPayment,
  waiveSetupFee,
  saveVisitDetails,
  summaryView
};

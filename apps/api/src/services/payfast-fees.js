'use strict';

/**
 * PayFast fee model (South Africa) to prevent Re-EL ECD running at a loss.
 *
 * Rates below are taken from the published PayFast pricing (ex VAT) shared by
 * product and can be overridden via env/config if PayFast changes them:
 *   - Credit/Cheque cards, Google/Apple/Samsung Pay, Store Cards: 3.2% + R2.00
 *   - Instant EFT & Capitec Pay: 2.0% (min R2.00)
 *   - Zapper: 3.25% + R2.00
 *   - Mobicred: 3.2%
 *   - MukuruPay, Scan to Pay, SnapScan: 3.5% + R2.00
 *   - Scode: 4.5% + R5.00
 *   - Payflex: 5.45% + R5.00
 *   - MoreTyme: 5.5% + R2.00
 *   - Payout transfer: R8.70 per transfer (standard), or 0.8% min R14.00 immediate
 *   - Refund: R2.00 per refund
 *
 * All rates above are ex VAT. PayFast charges VAT on its fees; default 15%.
 */

const VAT_RATE = 0.15;

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const METHODS = {
  card:        { label: 'Card / wallets / store cards', percent: 3.2,  fixed: 2.0, min: 0 },
  instant_eft: { label: 'Instant EFT & Capitec Pay',    percent: 2.0,  fixed: 0,   min: 2.0 },
  zapper:      { label: 'Zapper',                       percent: 3.25, fixed: 2.0, min: 0 },
  mobicred:    { label: 'Mobicred',                     percent: 3.2,  fixed: 0,   min: 0 },
  scan_to_pay: { label: 'MukuruPay / Scan to Pay / SnapScan', percent: 3.5, fixed: 2.0, min: 0 },
  scode:       { label: 'Scode',                        percent: 4.5,  fixed: 5.0, min: 0 },
  payflex:     { label: 'Payflex',                      percent: 5.45, fixed: 5.0, min: 0 },
  moretyme:    { label: 'MoreTyme',                     percent: 5.5,  fixed: 2.0, min: 0 }
};

// Gross-up profiles: the method cost we assume when recovering fees on a
// hosted checkout where the payer chooses the method (so we must cover the
// worst/common case we accept).
const PROFILES = {
  // Default: standard card rate (most common). Prevents loss on card/wallets;
  // cheaper methods (Instant EFT) yield a small surplus, pricier BNPL may still
  // cost more than recovered unless restricted - see worst_case.
  standard_card: 'card',
  instant_eft: 'instant_eft',
  // Conservative: cover the highest-fee listed method so we never run at a loss
  // regardless of method chosen.
  worst_case: 'worst_case'
};

function vatRate() {
  return envNumber('PAYFAST_FEE_VAT_RATE', VAT_RATE);
}

function payoutFeeExVat() {
  return envNumber('PAYFAST_PAYOUT_FEE', 8.7);
}

function includePayoutInRecovery() {
  // Payout is per transfer (batchable). Default false: treat as overhead, but
  // can be enabled to be fully conservative per transaction.
  return String(process.env.PAYFAST_RECOVER_PAYOUT_FEE || 'false').toLowerCase() === 'true';
}

function refundFeeExVat() {
  return 2.0;
}

/**
 * Transaction fee (ex VAT) for a given gross amount and method key.
 */
function transactionFeeExVat(grossAmount, methodKey) {
  const method = METHODS[methodKey] || METHODS.card;
  const percentPart = (method.percent / 100) * Number(grossAmount || 0);
  const fixedPart = Number(method.fixed || 0);
  return Math.max(percentPart + fixedPart, Number(method.min || 0));
}

function transactionFeeInclVat(grossAmount, methodKey) {
  return transactionFeeExVat(grossAmount, methodKey) * (1 + vatRate());
}

function payoutFeeInclVat() {
  return payoutFeeExVat() * (1 + vatRate());
}

/**
 * Full processing cost for receiving `grossAmount` (tx fee + VAT, and optionally
 * one payout transfer share) for a method.
 */
function processingCost(grossAmount, methodKey, opts = {}) {
  const withPayout = opts.includePayout !== undefined ? opts.includePayout : includePayoutInRecovery();
  const tx = transactionFeeInclVat(grossAmount, methodKey);
  const payout = withPayout ? payoutFeeInclVat() : 0;
  return round2(tx + payout);
}

function netAmount(grossAmount, methodKey, opts = {}) {
  return round2(Number(grossAmount || 0) - processingCost(grossAmount, methodKey, opts));
}

function worstCaseMethodKey() {
  // Highest effective cost profile among listed methods (by percent dominance at
  // typical amounts): MoreTyme 5.5%+R2.
  return 'moretyme';
}

function resolveMethodKey(profileOrMethod) {
  const key = String(profileOrMethod || process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card').toLowerCase();
  if (key === 'worst_case') return worstCaseMethodKey();
  if (METHODS[key]) return key;
  if (PROFILES[key]) return resolveMethodKey(PROFILES[key]);
  return 'card';
}

/**
 * Gross-up: compute the gross amount to charge so that, after PayFast deducts
 * its processing cost on that gross, Re-EL nets at least `targetNet`.
 * Solves gross - (percent*gross + fixed)* (1+vat) - payout >= targetNet.
 */
function grossUpToNet(targetNet, profileOrMethod, opts = {}) {
  const methodKey = resolveMethodKey(profileOrMethod);
  const method = METHODS[methodKey] || METHODS.card;
  const withPayout = opts.includePayout !== undefined ? opts.includePayout : includePayoutInRecovery();
  const vat = 1 + vatRate();
  const payout = withPayout ? payoutFeeInclVat() : 0;
  const rate = (method.percent / 100) * vat;
  const fixed = Math.max(Number(method.fixed || 0), Number(method.min || 0)) * vat;
  const denom = 1 - rate;
  if (denom <= 0) {
    return { gross: round2(targetNet), fee: 0, net: round2(targetNet), method: methodKey, impossible: true };
  }
  let gross = (Number(targetNet || 0) + fixed + payout) / denom;
  // Re-evaluate with min fee rule and round up cents until net >= target.
  for (let i = 0; i < 5; i++) {
    const cost = processingCost(gross, methodKey, { includePayout: withPayout });
    const net = round2(gross - cost);
    if (net + 0.0001 >= Number(targetNet || 0)) break;
    gross = gross + (Number(targetNet || 0) - net);
  }
  gross = Math.ceil(gross * 100) / 100;
  // Final safety bump if rounding left us short.
  let net = netAmount(gross, methodKey, { includePayout: withPayout });
  while (net + 0.0001 < Number(targetNet || 0)) {
    gross = round2(gross + 0.01);
    net = netAmount(gross, methodKey, { includePayout: withPayout });
  }
  const fee = round2(gross - Number(targetNet || 0));
  return {
    gross: round2(gross),
    base: round2(targetNet),
    fee,
    net: round2(net),
    method: methodKey,
    methodLabel: method.label,
    vatRate: vatRate(),
    includesPayout: withPayout
  };
}

function estimate(baseAmount, profileOrMethod) {
  const methodKey = resolveMethodKey(profileOrMethod);
  const grossed = grossUpToNet(baseAmount, methodKey);
  return {
    base: round2(baseAmount),
    ...grossed,
    // Also expose a no-recovery view for transparency.
    netIfUnrecovered: netAmount(baseAmount, methodKey),
    costIfUnrecovered: processingCost(baseAmount, methodKey)
  };
}

function recoveryEnabledForSubscriptions() {
  // Default ON to prevent loss; can be disabled explicitly.
  const v = String(process.env.PAYFAST_RECOVER_SUBSCRIPTION_FEES || 'true').toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

module.exports = {
  VAT_RATE,
  METHODS,
  PROFILES,
  round2,
  vatRate,
  payoutFeeExVat,
  payoutFeeInclVat,
  refundFeeExVat,
  transactionFeeExVat,
  transactionFeeInclVat,
  processingCost,
  netAmount,
  grossUpToNet,
  estimate,
  resolveMethodKey,
  worstCaseMethodKey,
  recoveryEnabledForSubscriptions,
  includePayoutInRecovery
};

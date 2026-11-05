'use strict';

/**
 * Tenant fee-collection accounts.
 *
 * Two modes are supported, both explicit and per organisation:
 *   - platform_collected: the platform's PayFast account is charged. The
 *     platform holds the money until it pays the tenant by EFT (see the
 *     settlements module and platform_payouts).
 *   - own_payfast: the tenant's own PayFast merchant account is charged, so
 *     PayFast settles directly to the tenant's bank account. The merchant key
 *     and passphrase are sealed at rest; only the checkout signer and the ITN
 *     verifier can open them.
 *
 * The settlement mode is recorded on every payment intent, so the ITN can
 * verify the notification against the same account that produced the checkout.
 */

const { AppError } = require('../../../../packages/contracts/errors');
const secretbox = require('./secretbox');

const OWN_PURPOSES = new Set(['invoice', 'statement', 'application_fee', 'form_payment']);

async function accountFor(db, organisationId) {
  return db.one('SELECT * FROM organisation_payment_accounts WHERE organisation_id = $1', [organisationId]);
}

function hasOwnCredentials(account) {
  return Boolean(account && account.mode === 'own_payfast' && account.status === 'active'
    && account.merchant_id && account.merchant_key_encrypted);
}

/**
 * The account a tenant payment must use. Falls back to the platform account
 * whenever there is no usable own account; throws instead of silently sending
 * a tenant's money to the platform when a configured own account is unreadable.
 */
async function resolveCheckoutAccount(db, organisation, purpose) {
  if (purpose === 'platform_subscription') {
    return { settlement: 'platform', credentials: null, account: null };
  }
  if (!OWN_PURPOSES.has(purpose)) {
    return { settlement: 'platform', credentials: null, account: null };
  }
  const account = await accountFor(db, organisation.id);
  if (!hasOwnCredentials(account)) {
    return { settlement: 'platform', credentials: null, account: account || null };
  }
  return {
    settlement: 'own_payfast',
    account,
    credentials: {
      merchantId: account.merchant_id,
      merchantKey: secretbox.decrypt(account.merchant_key_encrypted),
      passphrase: account.passphrase_encrypted ? secretbox.decrypt(account.passphrase_encrypted) : ''
    }
  };
}

/**
 * The account an incoming ITN must be verified against. Driven by the intent's
 * stored settlement mode so in-flight payments still verify after an account
 * is reconfigured.
 */
async function resolveItnAccount(db, intent) {
  const settlement = (intent.metadata && intent.metadata.settlement) || 'platform';
  if (settlement !== 'own_payfast') return { settlement: 'platform', credentials: null };
  const account = await accountFor(db, intent.organisation_id);
  if (!hasOwnCredentials(account)) {
    throw new AppError('CONFLICT', null,
      'This payment was started on a tenant PayFast account that is no longer configured.');
  }
  return {
    settlement,
    credentials: {
      merchantId: account.merchant_id,
      merchantKey: secretbox.decrypt(account.merchant_key_encrypted),
      passphrase: account.passphrase_encrypted ? secretbox.decrypt(account.passphrase_encrypted) : ''
    }
  };
}

function maskedAccount(account) {
  const accountNumber = account && account.payout_account_number_encrypted
    ? secretbox.decrypt(account.payout_account_number_encrypted) : null;
  return {
    mode: account ? account.mode : 'platform_collected',
    status: account ? account.status : 'active',
    merchantId: account ? account.merchant_id : null,
    merchantKeySet: Boolean(account && account.merchant_key_encrypted),
    passphraseSet: Boolean(account && account.passphrase_encrypted),
    feePercent: Number((account && account.fee_percent) || 0),
    verifiedAt: account ? account.verified_at : null,
    payout: account ? {
      accountHolder: account.payout_account_holder || null,
      bankName: account.payout_bank_name || null,
      branchCode: account.payout_branch_code || null,
      accountType: account.payout_account_type || null,
      accountNumberLast4: accountNumber ? accountNumber.slice(-4) : null
    } : null
  };
}

const PAYOUT_TYPES = ['cheque', 'savings', 'transmission', 'bond'];

/**
 * Create or update an organisation's payment account. Shared by the tenant
 * settings endpoint and the platform console; only the platform may change
 * the collection fee (`allowFeePercent`).
 */
async function savePaymentAccount(db, organisationId, body, { allowFeePercent = false } = {}) {
  const existing = await accountFor(db, organisationId);
  const mode = body.mode || (existing ? existing.mode : 'platform_collected');

  const merchantId = body.merchantId === undefined
    ? (existing ? existing.merchant_id : null)
    : (String(body.merchantId || '').trim() || null);
  if (merchantId && !/^[0-9A-Za-z]+$/.test(merchantId)) {
    throw new AppError('VALIDATION', [{ field: 'merchantId', message: 'The merchant id must contain only letters and digits.' }]);
  }

  const clearing = body.clearCredentials === true;
  const merchantKeyEncrypted = body.merchantKey !== undefined
    ? (String(body.merchantKey).trim() ? secretbox.encrypt(String(body.merchantKey).trim()) : null)
    : (clearing ? null : (existing ? existing.merchant_key_encrypted : null));
  const passphraseEncrypted = body.passphrase !== undefined
    ? (body.passphrase ? secretbox.encrypt(body.passphrase) : null)
    : (clearing ? null : (existing ? existing.passphrase_encrypted : null));

  if (mode === 'own_payfast') {
    if (!merchantId) {
      throw new AppError('VALIDATION', [{ field: 'merchantId', message: 'Your PayFast merchant id is required.' }]);
    }
    if (!merchantKeyEncrypted) {
      throw new AppError('VALIDATION', [{ field: 'merchantKey', message: 'Your PayFast merchant key is required.' }]);
    }
    if (!secretbox.isConfigured()) {
      throw new AppError('CONFLICT', null,
        'Online payment accounts cannot be stored on this deployment: set PAYMENT_CREDENTIALS_KEY.');
    }
  }

  const payoutAccountHolder = body.payoutAccountHolder === undefined
    ? (existing ? existing.payout_account_holder : null) : (String(body.payoutAccountHolder || '').trim() || null);
  const payoutBankName = body.payoutBankName === undefined
    ? (existing ? existing.payout_bank_name : null) : (String(body.payoutBankName || '').trim() || null);
  const payoutBranchCode = body.payoutBranchCode === undefined
    ? (existing ? existing.payout_branch_code : null) : (String(body.payoutBranchCode || '').trim() || null);
  const payoutAccountNumberEncrypted = body.payoutAccountNumber === undefined
    ? (existing ? existing.payout_account_number_encrypted : null)
    : (String(body.payoutAccountNumber || '').trim() ? secretbox.encrypt(String(body.payoutAccountNumber).trim()) : null);
  const payoutAccountType = body.payoutAccountType === undefined
    ? (existing ? existing.payout_account_type : null) : body.payoutAccountType;

  let feePercent = existing ? Number(existing.fee_percent) : 0;
  if (allowFeePercent && body.feePercent !== undefined) {
    feePercent = Number(body.feePercent);
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 50) {
      throw new AppError('VALIDATION', [{ field: 'feePercent', message: 'The fee must be between 0 and 50 percent.' }]);
    }
  }

  const saved = await db.one(
    `INSERT INTO organisation_payment_accounts
       (organisation_id, mode, status, merchant_id, merchant_key_encrypted, passphrase_encrypted,
        fee_percent, payout_account_holder, payout_bank_name, payout_branch_code, payout_account_number_encrypted,
        payout_account_type, verified_at, updated_at)
     VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $12 = 'own_payfast' THEN now() ELSE NULL END, now())
     ON CONFLICT (organisation_id) DO UPDATE SET
       mode = EXCLUDED.mode, status = 'active',
       merchant_id = EXCLUDED.merchant_id,
       merchant_key_encrypted = EXCLUDED.merchant_key_encrypted,
       passphrase_encrypted = EXCLUDED.passphrase_encrypted,
       fee_percent = EXCLUDED.fee_percent,
       payout_account_holder = EXCLUDED.payout_account_holder,
       payout_bank_name = EXCLUDED.payout_bank_name,
       payout_branch_code = EXCLUDED.payout_branch_code,
       payout_account_number_encrypted = EXCLUDED.payout_account_number_encrypted,
       payout_account_type = EXCLUDED.payout_account_type,
       verified_at = CASE WHEN EXCLUDED.mode = 'own_payfast'
         THEN COALESCE(organisation_payment_accounts.verified_at, now())
         ELSE organisation_payment_accounts.verified_at END,
       updated_at = now()
     RETURNING *`,
    [organisationId, mode, merchantId, merchantKeyEncrypted, passphraseEncrypted, feePercent,
      payoutAccountHolder, payoutBankName, payoutBranchCode, payoutAccountNumberEncrypted, payoutAccountType, mode]
  );
  return { account: saved, mode, clearedCredentials: clearing, payoutAccountSet: Boolean(payoutAccountNumberEncrypted) };
}

module.exports = {
  accountFor, hasOwnCredentials, resolveCheckoutAccount, resolveItnAccount, maskedAccount, savePaymentAccount, OWN_PURPOSES, PAYOUT_TYPES
};

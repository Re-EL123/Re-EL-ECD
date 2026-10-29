'use strict';

/**
 * PayFast (South Africa) hosted checkout.
 *
 * The platform never touches card details: a guardian is redirected to
 * PayFast's hosted payment page, and the invoice is settled when PayFast posts
 * an ITN (Instant Transaction Notification) back to the API.
 *
 * Two signature rules matter and they are different:
 *   - Checkout fields are sorted alphabetically before signing.
 *   - ITN fields are signed in the order PayFast posted them.
 * `verifyItn` therefore takes the ordered pairs captured by `readBody`, not a
 * plain object.
 */

const crypto = require('node:crypto');

const LIVE_PROCESS = 'https://www.payfast.co.za/eng/process';
const SANDBOX_PROCESS = 'https://sandbox.payfast.co.za/eng/process';
const LIVE_VALIDATE = 'https://www.payfast.co.za/eng/query/validate';
const SANDBOX_VALIDATE = 'https://sandbox.payfast.co.za/eng/query/validate';

function isSandbox() {
  return String(process.env.PAYFAST_SANDBOX || '').toLowerCase() === 'true';
}

function isConfigured() {
  return Boolean(process.env.PAYFAST_MERCHANT_ID && process.env.PAYFAST_MERCHANT_KEY);
}

function processUrl() {
  return isSandbox() ? SANDBOX_PROCESS : LIVE_PROCESS;
}

function validateUrl() {
  return isSandbox() ? SANDBOX_VALIDATE : LIVE_VALIDATE;
}

function passphrase() {
  return process.env.PAYFAST_PASSPHRASE || '';
}

/**
 * PHP `urlencode` equivalent, which is what PayFast signs with. The difference
 * from `encodeURIComponent` is `!*'()~` and space-as-plus.
 */
function pfEncode(value) {
  return encodeURIComponent(String(value === undefined || value === null ? '' : value).trim())
    .replace(/%20/g, '+')
    .replace(/[!'()~*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

function signature(fields, secret = passphrase()) {
  const keys = Object.keys(fields)
    .filter((key) => key !== 'signature')
    .filter((key) => fields[key] !== undefined && fields[key] !== null && fields[key] !== '')
    .sort();
  const parts = keys.map((key) => key + '=' + pfEncode(fields[key]));
  if (secret) parts.push('passphrase=' + pfEncode(secret));
  return md5(parts.join('&'));
}

/**
 * Signature of an ITN in the exact order the fields were posted.
 */
function itnSignature(pairs, secret = passphrase()) {
  const parts = [];
  for (const [key, value] of pairs) {
    if (key === 'signature') continue;
    if (value === undefined || value === null || value === '') continue;
    parts.push(key + '=' + pfEncode(value));
  }
  if (secret) parts.push('passphrase=' + pfEncode(secret));
  return md5(parts.join('&'));
}

function money(amount) {
  return Number(amount).toFixed(2);
}

function frontendBaseUrl() {
  const configured = process.env.APP_BASE_URL
    || (process.env.FRONTEND_ORIGIN || '').split(',')[0]
    || 'https://ecd.re-el.co.za';
  return String(configured).trim().replace(/\/+$/, '');
}

function apiBaseUrl(req) {
  if (process.env.API_BASE_URL) return String(process.env.API_BASE_URL).replace(/\/+$/, '');
  const proto = (req && (req.headers['x-forwarded-proto'] || 'https')) + '';
  const host = req && (req.headers['x-forwarded-host'] || req.headers.host);
  if (host) return proto.split(',')[0] + '://' + String(host).split(',')[0];
  return 'https://re-el-ecd-api.vercel.app';
}

/**
 * Build a signed checkout payload. Returns both the action URL and the fields
 * so the SPA can either render a hidden form or link to a GET URL.
 */
function buildCheckout(options) {
  const fields = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID || '',
    merchant_key: process.env.PAYFAST_MERCHANT_KEY || '',
    return_url: options.returnUrl,
    cancel_url: options.cancelUrl,
    notify_url: options.notifyUrl,
    name_first: options.nameFirst || 'Parent',
    name_last: options.nameLast || 'Guardian',
    email_address: options.email || '',
    m_payment_id: options.reference,
    amount: money(options.amount),
    item_name: String(options.itemName || 'School fees').slice(0, 100),
    item_description: options.itemDescription ? String(options.itemDescription).slice(0, 255) : undefined,
    email_confirmation: options.email ? '1' : undefined,
    confirmation_address: options.email || undefined,
    custom_str1: options.organisationId || undefined,
    custom_str2: options.invoiceId || undefined
  };
  const signed = signature(fields);
  return {
    action: processUrl(),
    method: 'POST',
    fields: { ...fields, signature: signed },
    query: Object.keys(fields)
      .filter((key) => fields[key] !== undefined && fields[key] !== null && fields[key] !== '')
      .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(fields[key]))
      .concat(['signature=' + encodeURIComponent(signed)])
      .join('&')
  };
}

function field(pairs, key) {
  const found = pairs.find(([name]) => name === key);
  return found ? found[1] : undefined;
}

/**
 * Validate an ITN. Checks the signature, the merchant id and, when an amount is
 * supplied, that PayFast collected what we asked for.
 */
function verifyItn(pairs, options = {}) {
  if (!Array.isArray(pairs) || !pairs.length) return { valid: false, reason: 'Empty notification' };
  const supplied = field(pairs, 'signature');
  if (!supplied) return { valid: false, reason: 'Missing signature' };
  const expected = itnSignature(pairs);
  if (supplied.toLowerCase() !== expected.toLowerCase()) {
    return { valid: false, reason: 'Signature mismatch' };
  }
  const merchantId = field(pairs, 'merchant_id');
  if (process.env.PAYFAST_MERCHANT_ID && merchantId !== process.env.PAYFAST_MERCHANT_ID) {
    return { valid: false, reason: 'Merchant mismatch' };
  }
  if (options.amount !== undefined) {
    const gross = Number(field(pairs, 'amount_gross'));
    if (!Number.isFinite(gross) || Math.abs(gross - Number(options.amount)) > 0.01) {
      return { valid: false, reason: 'Amount mismatch' };
    }
  }
  return {
    valid: true,
    data: {
      reference: field(pairs, 'm_payment_id'),
      providerReference: field(pairs, 'pf_payment_id'),
      paymentStatus: field(pairs, 'payment_status'),
      amountGross: Number(field(pairs, 'amount_gross')),
      amountFee: Number(field(pairs, 'amount_fee')),
      amountNet: Number(field(pairs, 'amount_net')),
      itemName: field(pairs, 'item_name'),
      email: field(pairs, 'email_address'),
      nameFirst: field(pairs, 'name_first'),
      nameLast: field(pairs, 'name_last'),
      custom1: field(pairs, 'custom_str1'),
      custom2: field(pairs, 'custom_str2')
    }
  };
}

/**
 * Server-to-server confirmation. PayFast recommends posting the ITN straight
 * back to their validate endpoint so a forged notification cannot be replayed.
 * A network failure is reported as `unavailable` rather than rejecting an
 * otherwise correctly signed payment.
 */
async function validateWithPayfast(rawBody) {
  if (String(process.env.PAYFAST_VALIDATE || 'true').toLowerCase() === 'false') {
    return { status: 'skipped' };
  }
  try {
    const response = await fetch(validateUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: rawBody,
      signal: AbortSignal.timeout(Number(process.env.PAYFAST_TIMEOUT_MS || 10000))
    });
    const text = (await response.text()).trim();
    if (text.toUpperCase().startsWith('VALID')) return { status: 'valid' };
    return { status: 'invalid', detail: text.slice(0, 200) };
  } catch (error) {
    return { status: 'unavailable', detail: error.message };
  }
}

function ipAllowed(ip) {
  const configured = (process.env.PAYFAST_IP_ALLOWLIST || '')
    .split(',').map((entry) => entry.trim()).filter(Boolean);
  if (!configured.length) return true;
  return configured.includes(String(ip || ''));
}

/**
 * Build the URLs PayFast should use for one checkout.
 */
function checkoutUrls(req, reference, scope) {
  const api = apiBaseUrl(req);
  const web = frontendBaseUrl();
  const landing = scope === 'parent' ? '/#/parent/finance' : '/#/app/finance';
  return {
    notifyUrl: api + '/api/v1/public/payfast/itn',
    returnUrl: web + landing + '?payment=return&ref=' + encodeURIComponent(reference),
    cancelUrl: web + landing + '?payment=cancelled&ref=' + encodeURIComponent(reference)
  };
}

function newReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(5).toString('hex').toUpperCase();
  return 'ECD-' + stamp + '-' + random;
}

module.exports = {
  isConfigured,
  isSandbox,
  processUrl,
  validateUrl,
  pfEncode,
  signature,
  itnSignature,
  buildCheckout,
  verifyItn,
  validateWithPayfast,
  ipAllowed,
  checkoutUrls,
  newReference,
  frontendBaseUrl,
  apiBaseUrl,
  money
};

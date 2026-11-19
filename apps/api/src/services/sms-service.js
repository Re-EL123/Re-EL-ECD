'use strict';

/**
 * SMS delivery — provider-agnostic, best-effort, auditable.
 *
 * Providers (SMS_PROVIDER):
 *   textbee        - keyless-to-start Android gateway, dev/staging (300 SMS/month free)
 *   africastalking - South African production provider with local sender IDs
 *   twilio         - global production provider
 *
 * Pattern follows email-service.js: never throw, record every attempt in
 * notification_deliveries when a notification id is supplied, and treat a
 * provider outage as a logged miss rather than a failed business request.
 */

const TEXTBEE_ENDPOINT = 'https://api.textbee.dev/api/v1/gateway/send-sms';
const AFRICASTALKING_ENDPOINT = 'https://api.africastalking.com/version1/messaging';
const MAX_SMS_LENGTH = 480; // ~3 GSM segments; keeps incidental alerts sane

function configuredProvider() {
  const declared = String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
  if (['textbee', 'africastalking', 'twilio'].includes(declared)) return declared;
  // Convenience: infer from whichever credentials exist when unset.
  if (process.env.SMS_TEXTBEE_API_KEY) return 'textbee';
  if (process.env.SMS_AT_API_KEY && process.env.SMS_AT_USERNAME) return 'africastalking';
  if (process.env.SMS_TWILIO_SID && process.env.SMS_TWILIO_TOKEN && process.env.SMS_TWILIO_FROM) return 'twilio';
  return null;
}

function isConfigured() {
  if (process.env.SMS_ENABLED === 'false') return false;
  const provider = configuredProvider();
  if (provider === 'textbee') return Boolean(process.env.SMS_TEXTBEE_API_KEY);
  if (provider === 'africastalking') return Boolean(process.env.SMS_AT_API_KEY && process.env.SMS_AT_USERNAME);
  if (provider === 'twilio') return Boolean(process.env.SMS_TWILIO_SID && process.env.SMS_TWILIO_TOKEN && process.env.SMS_TWILIO_FROM);
  return false;
}

/** SA-friendly: 082… -> +2782…, 2782… -> +2782…, keep international as given. */
function normalisePhone(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d{7,15}$/.test(cleaned)) return null;
  let number = cleaned;
  if (number.startsWith('+')) return number;
  if (/^0\d{9}$/.test(number)) return '+27' + number.slice(1);
  if (/^27\d{9}$/.test(number)) return '+' + number;
  return number;
}

/** Read an SMS opt-in from the organisation's notification preferences. */
async function smsPreference(db, organisationId, key) {
  if (!organisationId || !db || typeof db.one !== 'function') return false;
  try {
    const row = await db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [organisationId]);
    let settings = row && row.settings;
    if (typeof settings === 'string') settings = JSON.parse(settings);
    const prefs = (settings && settings.notificationPreferences) || {};
    return prefs[key] === true;
  } catch {
    return false;
  }
}

async function recordDelivery(db, notificationId, status, error, providerReference) {
  if (!notificationId || !db || typeof db.query !== 'function') return;
  try {
    await db.query(
      `INSERT INTO notification_deliveries (notification_id, channel, delivery_status, attempt_count,
        last_attempt_at, provider_reference, last_error)
       VALUES ($1,'sms',$2,1,now(),$3,$4)`,
      [notificationId, status, providerReference || null, error ? String(error).slice(0, 500) : null]
    );
  } catch (recordError) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(JSON.stringify({ level: 'warn', message: 'sms delivery log failed', error: recordError.message }));
    }
  }
}

async function dispatch(provider, phone, message) {
  const timeout = Number(process.env.SMS_TIMEOUT_MS || 10000);
  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined;

  if (provider === 'textbee') {
    const payload = {
      message,
      recipients: [phone]
    };
    if (process.env.SMS_TEXTBEE_DEVICE_ID) payload.deviceId = process.env.SMS_TEXTBEE_DEVICE_ID;
    const response = await fetch(TEXTBEE_ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': process.env.SMS_TEXTBEE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((body && (body.message || body.error)) || 'textbee HTTP ' + response.status);
    const data = body && body.data;
    // textbee accepts into a device queue; "accepted" is not "delivered".
    if (data && data.success === false) throw new Error(data.message || 'textbee refused the message');
    return { reference: (data && data.smsBatchId) || null };
  }

  if (provider === 'africastalking') {
    const form = new URLSearchParams({
      username: process.env.SMS_AT_USERNAME,
      to: phone,
      message
    });
    if (process.env.SMS_AT_FROM) form.set('from', process.env.SMS_AT_FROM);
    const response = await fetch(AFRICASTALKING_ENDPOINT, {
      method: 'POST',
      headers: { apiKey: process.env.SMS_AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((body && (body.error || body.message)) || 'Africa\'s Talking HTTP ' + response.status);
    const recipients = body && body.SMSMessageData && body.SMSMessageData.Recipients;
    if (Array.isArray(recipients) && recipients.some((r) => r && r.status && !/^success$/i.test(r.status))) {
      throw new Error(recipients.find((r) => r.status && !/^success$/i.test(r.status)).statusMessage || 'SMS rejected');
    }
    return { reference: (body && body.SMSMessageData && body.SMSMessageData.Message) || null };
  }

  const account = process.env.SMS_TWILIO_SID;
  const endpoint = 'https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(account) + '/Messages.json';
  const form = new URLSearchParams({ To: phone, From: process.env.SMS_TWILIO_FROM, Body: message });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(account + ':' + process.env.SMS_TWILIO_TOKEN).toString('base64') },
    body: form,
    signal
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body && body.message) || 'Twilio HTTP ' + response.status);
  return { reference: body.sid || null };
}

/**
 * Send one SMS. Always resolves; outcomes are { status, error?, reference? }.
 * `notificationId` links the attempt to an existing notification for audit.
 */
async function sendSms(db, options) {
  const opts = options || {};
  const phone = normalisePhone(opts.to);
  const notificationId = opts.notificationId || null;
  if (!phone) {
    await recordDelivery(db, notificationId, 'skipped', 'invalid recipient');
    return { status: 'skipped', reason: 'invalid recipient' };
  }
  if (opts.preference === false) {
    await recordDelivery(db, notificationId, 'skipped', 'recipient opted out');
    return { status: 'skipped', reason: 'recipient opted out' };
  }
  if (!isConfigured()) {
    await recordDelivery(db, notificationId, 'skipped', 'no sms provider configured');
    return { status: 'skipped', reason: 'no sms provider configured' };
  }
  const message = String(opts.message || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SMS_LENGTH);
  if (!message) {
    await recordDelivery(db, notificationId, 'skipped', 'empty message');
    return { status: 'skipped', reason: 'empty message' };
  }
  try {
    const result = await dispatch(configuredProvider(), phone, message);
    await recordDelivery(db, notificationId, 'sent', null, result.reference);
    return { status: 'sent', reference: result.reference };
  } catch (error) {
    await recordDelivery(db, notificationId, 'failed', error.message);
    if (process.env.NODE_ENV !== 'test') {
      console.warn(JSON.stringify({ level: 'warn', message: 'sms send failed', provider: configuredProvider(), error: error.message }));
    }
    return { status: 'failed', error: error.message };
  }
}

module.exports = {
  isConfigured,
  configuredProvider,
  normalisePhone,
  smsPreference,
  sendSms,
  MAX_SMS_LENGTH
};

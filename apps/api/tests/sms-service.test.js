'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sms = require('../src/services/sms-service');

test('normalisePhone handles SA local and international formats', () => {
  assert.equal(sms.normalisePhone('082 123 4567'), '+27821234567');
  assert.equal(sms.normalisePhone('082-123-4567'), '+27821234567');
  assert.equal(sms.normalisePhone('27821234567'), '+27821234567');
  assert.equal(sms.normalisePhone('+27 82 123 4567'), '+27821234567');
  assert.equal(sms.normalisePhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(sms.normalisePhone('not a number'), null);
  assert.equal(sms.normalisePhone(''), null);
});

test('sendSms skips without throwing when no provider is configured', async () => {
  const saved = { ...process.env };
  for (const key of ['SMS_PROVIDER', 'SMS_ENABLED', 'SMS_TEXTBEE_API_KEY', 'SMS_AT_API_KEY', 'SMS_AT_USERNAME', 'SMS_TWILIO_SID', 'SMS_TWILIO_TOKEN', 'SMS_TWILIO_FROM']) delete process.env[key];
  try {
    const calls = [];
    const db = { query: async (sql, params) => { calls.push({ sql, params }); } };
    const result = await sms.sendSms(db, { to: '0821234567', message: 'Test', notificationId: 'notif-1' });
    assert.equal(result.status, 'skipped');
    assert.equal(calls.length, 1, 'skip is still recorded for audit');
    assert.match(calls[0].sql, /notification_deliveries/);
    assert.equal(calls[0].params[1], 'skipped');
  } finally {
    process.env = saved;
  }
});

test('textbee send posts the expected payload and records acceptance', async () => {
  const saved = { ...process.env };
  process.env.SMS_PROVIDER = 'textbee';
  process.env.SMS_TEXTBEE_API_KEY = 'test-key';
  process.env.SMS_TEXTBEE_DEVICE_ID = 'device-1';
  const originalFetch = global.fetch;
  let request = null;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { success: true, smsBatchId: 'batch-1' } })
    };
  };
  try {
    const calls = [];
    const db = { query: async (sql, params) => { calls.push({ sql, params }); } };
    const result = await sms.sendSms(db, { to: '0821234567', message: '  Safety   incident reported ', notificationId: 'notif-1' });
    assert.equal(result.status, 'sent');
    assert.equal(result.reference, 'batch-1');
    assert.equal(request.url, 'https://api.textbee.dev/api/v1/gateway/send-sms');
    assert.equal(request.options.headers['x-api-key'], 'test-key');
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.recipients, ['+27821234567']);
    assert.equal(body.deviceId, 'device-1');
    assert.equal(body.message, 'Safety incident reported');
    assert.equal(calls[0].params[1], 'sent');
    assert.equal(calls[0].params[2], 'batch-1');
  } finally {
    global.fetch = originalFetch;
    process.env = saved;
  }
});

test('provider errors resolve to failed and are logged, never thrown', async () => {
  const saved = { ...process.env };
  process.env.SMS_PROVIDER = 'textbee';
  process.env.SMS_TEXTBEE_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 429, json: async () => ({ message: 'quota reached' }) });
  try {
    const calls = [];
    const db = { query: async (sql, params) => { calls.push({ sql, params }); } };
    const result = await sms.sendSms(db, { to: '+27821234567', message: 'Test', notificationId: 'notif-1' });
    assert.equal(result.status, 'failed');
    assert.match(result.error, /quota reached/);
    assert.equal(calls[0].params[1], 'failed');
  } finally {
    global.fetch = originalFetch;
    process.env = saved;
  }
});

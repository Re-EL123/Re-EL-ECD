'use strict';

/**
 * Shared harness for API integration tests.
 *
 * Boots the real request pipeline on an ephemeral port against the embedded
 * PostgreSQL-compatible database, then seeds the demonstration dataset.
 * No mocks: every assertion exercises routing, authentication, RBAC, tenancy
 * and SQL exactly as the deployed application does.
 */

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const http = require('node:http');
const db = require('../../../packages/database');
const { seedDevelopment } = require('../../../packages/database/seeds/development');
const { handle } = require('../src/app');
const { resetRateLimit } = require('../src/middleware/rate-limit');

let server = null;
let baseUrl = null;

async function start() {
  if (server) return baseUrl;
  const pool = await db.getPool();
  await db.runMigrations(pool);
  await seedDevelopment({ force: true });
  server = http.createServer((req, res) => handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stop() {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = null;
  baseUrl = null;
}

function parseCookies(response) {
  const jar = {};
  const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  for (const value of values) {
    const [pair] = value.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return jar;
}

function createClient() {
  const cookies = {};
  let csrfToken = null;

  async function request(method, path, options = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    const cookie = Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ');
    if (cookie) headers.Cookie = cookie;
    if (options.organisationId) headers['X-Organisation-Id'] = options.organisationId;
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const csrf = options.csrf !== undefined ? options.csrf : csrfToken;
    if (csrf && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = csrf;

    const response = await fetch(baseUrl + '/api/v1' + path, { method, headers, body });
    Object.assign(cookies, parseCookies(response));
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (payload && payload.data && payload.data.csrfToken) csrfToken = payload.data.csrfToken;
    return {
      status: response.status,
      data: payload && payload.data,
      meta: payload && payload.meta,
      error: payload && payload.error,
      text,
      headers: response.headers
    };
  }

  return {
    cookies,
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, Object.assign({ body }, options)),
    patch: (path, body, options) => request('PATCH', path, Object.assign({ body }, options)),
    delete: (path, options) => request('DELETE', path, options),
    get csrf() { return csrfToken; },
    async login(email, password = 'Re-EL-Demo-2026!') {
      resetRateLimit('login:');
      const result = await request('POST', '/auth/login', { body: { email, password }, csrf: null });
      if (result.status !== 200) throw new Error(`Login failed for ${email}: ${result.status} ${result.text}`);
      return result.data;
    },
    logout() {
      return request('POST', '/auth/logout');
    }
  };
}

module.exports = { start, stop, createClient, db, seedDevelopment };

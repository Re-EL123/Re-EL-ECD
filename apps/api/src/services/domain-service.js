'use strict';

/**
 * Custom website domains.
 *
 * A tenant proves that it controls a hostname by publishing one of two DNS
 * records:
 *
 *   CNAME  www.example.co.za          -> cname.vercel-dns.com
 *   TXT    _reel-verify.example.co.za -> reel-verify=<token>
 *
 * The CNAME is the normal choice for `www` and other subdomains. A TXT record
 * is the correct choice for an apex domain such as `example.co.za`, because the
 * DNS standard does not allow a CNAME at the zone apex. Either record is
 * sufficient; the CNAME additionally proves that traffic is pointed at the
 * Re-EL edge, so it is the only one that marks TLS as active immediately.
 *
 * The default target is the edge provider's own CNAME host, which resolves for
 * every tenant. A branded host such as `sites.re-el.co.za` is only safe as the
 * target once its own DNS record exists — otherwise every tenant that follows
 * the instructions points at a name that goes nowhere.
 *
 * Verification is intentionally server-side: a browser cannot read CNAME or
 * TXT records, and the token must never be trusted from the client.
 */

const crypto = require('node:crypto');
const dns = require('node:dns');
const https = require('node:https');

const DEFAULT_CNAME_TARGET = 'cname.vercel-dns.com';
const DEFAULT_SUBDOMAIN_BASE = 're-el.co.za';
const DEFAULT_PLATFORM_HOSTS = 'ecd.re-el.co.za,www.re-el.co.za,re-el.co.za';
const RESERVED_LABELS = new Set(['www', 'api', 'app', 'sites', 'media', 'cdn', 'assets', 'static']);

const DEFAULT_PROBE_TIMEOUT_MS = 2500;
const DEFAULT_PROBE_TTL_MS = 10 * 60 * 1000;

let resolver = dns.promises;
let tlsProbe = defaultTlsProbe;
const probeCache = new Map();

function cnameTarget() {
  return String(process.env.WEBSITE_CNAME_TARGET || DEFAULT_CNAME_TARGET)
    .trim().toLowerCase().replace(/\.+$/, '');
}

function subdomainBase() {
  return String(process.env.WEBSITE_SUBDOMAIN_BASE || DEFAULT_SUBDOMAIN_BASE)
    .trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

function platformHosts() {
  return String(process.env.WEBSITE_PLATFORM_HOSTS || DEFAULT_PLATFORM_HOSTS)
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
}

/**
 * Turn user input (`https://WWW.Example.co.za/hello`) into a canonical
 * hostname (`www.example.co.za`). Returns null for anything that is not a
 * public DNS name, including IP addresses and localhost.
 */
function normaliseHost(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.split(/[/?#]/, 1)[0];
  if (value.startsWith('[')) return null;
  value = value.replace(/:\d+$/, '');
  value = value.replace(/\.+$/, '');
  if (!value || value.length > 253) return null;
  if (value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return null;
  const labels = value.split('.');
  if (labels.length < 2) return null;
  const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!labels.every((label) => labelPattern.test(label))) return null;
  if (platformHosts().includes(value)) return null;
  return value;
}

function generateToken() {
  return crypto.randomBytes(18).toString('hex');
}

/**
 * The DNS records the tenant must create. Both are returned so the editor can
 * show the CNAME and the TXT fallback without a second request.
 */
function recordsFor(domainName, token) {
  const host = normaliseHost(domainName);
  const target = cnameTarget();
  if (!host) return null;
  return {
    cname: {
      type: 'CNAME',
      host,
      value: target,
      note: 'Use this for www and other subdomains.'
    },
    txt: {
      type: 'TXT',
      host: '_reel-verify.' + host,
      value: 'reel-verify=' + String(token || ''),
      note: 'Use this for an apex domain, or as a fallback.'
    },
    target,
    subdomainBase: subdomainBase()
  };
}

async function safeResolve(method, name) {
  try {
    return { values: await resolver[method](name), error: null };
  } catch (error) {
    return { values: [], error: (error && error.code) || (error && error.message) || 'DNS_ERROR' };
  }
}

function cleanName(value) {
  return String(value || '').trim().toLowerCase().replace(/\.+$/, '');
}

function flattenTxt(values) {
  return (Array.isArray(values) ? values : []).map((entry) =>
    Array.isArray(entry) ? entry.join('') : String(entry || '')
  ).map((entry) => entry.trim()).filter(Boolean);
}

function probeTimeout() {
  const value = Number(process.env.WEBSITE_PROBE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROBE_TIMEOUT_MS;
}

function probeTtl() {
  const value = Number(process.env.WEBSITE_PROBE_TTL_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_PROBE_TTL_MS;
}

/**
 * A TLS handshake is the only honest test of "can a family open this address?".
 * DNS can resolve while the certificate still covers a different host, which is
 * exactly what produces SSL_ERROR_BAD_CERT_DOMAIN. `rejectUnauthorized` stays
 * on, so a wrong or expired certificate fails the probe.
 */
function defaultTlsProbe(host, timeoutMs) {
  return new Promise((resolve) => {
    const request = https.request({
      host, port: 443, path: '/', method: 'HEAD', servername: host,
      timeout: timeoutMs, rejectUnauthorized: true
    }, (response) => {
      response.resume();
      resolve({ ok: true, status: response.statusCode || 0 });
    });
    request.on('timeout', () => { request.destroy(); resolve({ ok: false, error: 'TIMEOUT' }); });
    request.on('error', (error) => resolve({ ok: false, error: (error && error.code) || 'TLS_ERROR' }));
    request.end();
  });
}

/**
 * Resolve and TLS-check one host, memoised for a short window so a page load
 * never pays for the same handshake twice.
 */
async function probeHost(host, options) {
  const opts = options || {};
  const target = normaliseHost(host);
  const checkedAt = new Date().toISOString();
  if (!target) {
    return { host: null, resolves: false, tlsValid: false, reason: 'INVALID_HOST', checkedAt };
  }
  const cached = probeCache.get(target);
  if (cached && (Date.now() - cached.at) < probeTtl()) {
    return Object.assign({}, cached.value, { checkedAt });
  }
  const [ipv4, ipv6] = await Promise.all([
    safeResolve('resolve4', target),
    safeResolve('resolve6', target)
  ]);
  const resolves = ipv4.values.length > 0 || ipv6.values.length > 0;
  const handshake = resolves
    ? await (opts.tlsProbe || tlsProbe)(target, probeTimeout())
    : { ok: false, error: 'NO_DNS' };
  const value = {
    host: target,
    resolves,
    tlsValid: Boolean(resolves && handshake && handshake.ok),
    reason: !resolves ? 'NO_DNS' : ((handshake && handshake.ok) ? null : ((handshake && handshake.error) || 'TLS_ERROR')),
    checkedAt
  };
  probeCache.set(target, { at: Date.now(), value });
  return value;
}

/**
 * The facts the website editor needs to tell an owner the truth about the two
 * addresses it advertises: the platform-managed free subdomain, and the CNAME
 * target every custom domain is told to publish.
 */
async function addressReadiness(organisation) {
  const slug = organisation && organisation.slug;
  const freeHost = slug ? freeSubdomain(slug) : null;
  const target = cnameTarget();
  const [free, cname] = await Promise.all([
    freeHost ? probeHost(freeHost) : Promise.resolve(null),
    probeHost(target)
  ]);
  return {
    freeSubdomain: freeHost,
    freeSubdomainReady: Boolean(free && free.tlsValid),
    freeSubdomainReason: free ? free.reason : 'NO_SLUG',
    cnameTarget: target,
    cnameTargetResolves: Boolean(cname && cname.resolves),
    cnameTargetTlsValid: Boolean(cname && cname.tlsValid),
    checkedAt: new Date().toISOString()
  };
}

/**
 * Check the DNS records for one domain row. `options.resolver` exists so the
 * verification logic can be tested without touching the public DNS.
 */
async function verifyDomain(record, options) {
  const opts = options || {};
  const domainName = normaliseHost(record && (record.domain_name || record.domainName));
  const token = String((record && (record.verification_token || record.verificationToken)) || '');
  const checkedAt = new Date().toISOString();
  if (!domainName) {
    return {
      verified: false, method: null, checkedAt,
      reason: 'The domain name is not valid.',
      cname: { host: '', target: cnameTarget(), values: [], ok: false, error: 'INVALID_HOST' },
      txt: { host: '', expected: '', values: [], ok: false, error: 'INVALID_HOST' }
    };
  }
  if (!token) {
    return {
      verified: false, method: null, checkedAt,
      reason: 'This domain has no verification token. Remove it and add it again.',
      cname: { host: domainName, target: cnameTarget(), values: [], ok: false, error: 'NO_TOKEN' },
      txt: { host: '_reel-verify.' + domainName, expected: '', values: [], ok: false, error: 'NO_TOKEN' }
    };
  }

  const target = cleanName(opts.target || cnameTarget());
  const cname = await safeResolve('resolveCname', domainName);
  const cnameValues = cname.values.map(cleanName).filter(Boolean);
  const cnameOk = cnameValues.includes(target);

  const txtHost = '_reel-verify.' + domainName;
  const txt = await safeResolve('resolveTxt', txtHost);
  const txtValues = flattenTxt(txt.values);
  const expected = 'reel-verify=' + token;
  const txtOk = txtValues.some((value) => value === expected || value === token);

  const verified = cnameOk || txtOk;
  const method = cnameOk ? 'cname' : (txtOk ? 'txt' : null);
  let reason = null;
  if (!verified) {
    const lookupFailed = [cname.error, txt.error].some((code) => code && code !== 'ENOTFOUND' && code !== 'ENODATA');
    reason = lookupFailed
      ? 'The DNS lookup did not complete. Check the records and try again in a few minutes.'
      : 'No matching DNS record was found yet. DNS changes can take a few hours to propagate.';
  }

  return {
    verified,
    method,
    checkedAt,
    reason,
    cname: {
      host: domainName,
      target,
      values: cnameValues,
      ok: cnameOk,
      error: cname.error
    },
    txt: {
      host: txtHost,
      expected,
      values: txtValues,
      ok: txtOk,
      error: txt.error
    }
  };
}

/**
 * A free, platform-controlled address for every organisation. This works
 * without the tenant touching DNS, and is the address shown before a custom
 * domain is verified.
 */
function freeSubdomain(slug) {
  const clean = String(slug || '').trim().toLowerCase();
  if (!clean || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(clean)) return null;
  if (RESERVED_LABELS.has(clean)) return null;
  return clean + '.' + subdomainBase();
}

function slugFromFreeSubdomain(host) {
  const normalised = normaliseHost(host);
  if (!normalised) return null;
  const suffix = '.' + subdomainBase();
  if (!normalised.endsWith(suffix)) return null;
  const label = normalised.slice(0, -suffix.length).replace(/^www\./, '');
  if (!label || label.includes('.') || RESERVED_LABELS.has(label)) return null;
  return label;
}

/**
 * Shape a database row for the API. Never leak another tenant's fields, and
 * always include the DNS records so the editor can render instructions.
 */
function present(row, organisation) {
  if (!row) return null;
  const records = recordsFor(row.domain_name, row.verification_token);
  return Object.assign({}, row, {
    records,
    freeSubdomain: organisation && organisation.slug ? freeSubdomain(organisation.slug) : null,
    verified: row.verification_status === 'verified',
    failureReason: row.failure_reason || null,
    lastCheckedAt: row.last_checked_at || null,
    verifiedAt: row.verified_at || null
  });
}

function setResolverForTesting(next) {
  resolver = next || dns.promises;
}

function resetResolverForTesting() {
  resolver = dns.promises;
}

function setTlsProbeForTesting(next) {
  tlsProbe = next || defaultTlsProbe;
  probeCache.clear();
}

function resetProbeCacheForTesting() {
  probeCache.clear();
}

module.exports = {
  normaliseHost,
  generateToken,
  recordsFor,
  verifyDomain,
  freeSubdomain,
  slugFromFreeSubdomain,
  present,
  probeHost,
  addressReadiness,
  cnameTarget,
  subdomainBase,
  setResolverForTesting,
  resetResolverForTesting,
  setTlsProbeForTesting,
  resetProbeCacheForTesting
};

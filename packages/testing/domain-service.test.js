'use strict';

/**
 * Domain verification is security-sensitive: it decides whether a hostname may
 * serve a tenant's public website. These tests pin the normalisation rules and
 * both DNS proof paths without touching the public DNS.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const domainService = require('../../apps/api/src/services/domain-service');

test.afterEach(() => domainService.resetResolverForTesting());

test('hosts are normalised from pasted URLs and rejected when unsafe', () => {
  assert.equal(domainService.normaliseHost('https://WWW.Example.co.za/hello?x=1'), 'www.example.co.za');
  assert.equal(domainService.normaliseHost('Example.CO.ZA.'), 'example.co.za');
  assert.equal(domainService.normaliseHost('example.co.za:8443'), 'example.co.za');
  assert.equal(domainService.normaliseHost('  www.example.co.za  '), 'www.example.co.za');

  assert.equal(domainService.normaliseHost(''), null);
  assert.equal(domainService.normaliseHost('localhost'), null);
  assert.equal(domainService.normaliseHost('app.local'), null);
  assert.equal(domainService.normaliseHost('127.0.0.1'), null);
  assert.equal(domainService.normaliseHost('example'), null);
  assert.equal(domainService.normaliseHost('bad_label.example.co.za'), null);
  assert.equal(domainService.normaliseHost('ecd.re-el.co.za'), null, 'platform hosts cannot be claimed');
  assert.equal(domainService.normaliseHost('www.re-el.co.za'), null);
});

test('the editor receives both a CNAME and a TXT record', () => {
  const records = domainService.recordsFor('https://www.example.co.za/path', 'token-123');
  assert.equal(records.cname.type, 'CNAME');
  assert.equal(records.cname.host, 'www.example.co.za');
  assert.equal(records.cname.value, domainService.cnameTarget());
  assert.equal(records.txt.type, 'TXT');
  assert.equal(records.txt.host, '_reel-verify.www.example.co.za');
  assert.equal(records.txt.value, 'reel-verify=token-123');
  assert.equal(domainService.recordsFor('not a host', 'token'), null);
});

test('a matching CNAME verifies the domain and activates TLS', async () => {
  domainService.setResolverForTesting({
    resolveCname: async () => ['sites.re-el.co.za.'],
    resolveTxt: async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); }
  });
  const result = await domainService.verifyDomain({
    domain_name: 'www.example.co.za', verification_token: 'abc123'
  });
  assert.equal(result.verified, true);
  assert.equal(result.method, 'cname');
  assert.equal(result.reason, null);
  assert.equal(result.cname.ok, true);
  assert.equal(result.txt.ok, false);
});

test('a matching TXT record proves ownership without a CNAME', async () => {
  domainService.setResolverForTesting({
    resolveCname: async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); },
    resolveTxt: async () => [['reel-verify=abc123']]
  });
  const result = await domainService.verifyDomain({
    domain_name: 'example.co.za', verification_token: 'abc123'
  });
  assert.equal(result.verified, true);
  assert.equal(result.method, 'txt');
  assert.equal(result.txt.ok, true);
});

test('a TXT record with the wrong token is not accepted', async () => {
  domainService.setResolverForTesting({
    resolveCname: async () => ['somewhere-else.example.net'],
    resolveTxt: async () => [['reel-verify=wrong-token']]
  });
  const result = await domainService.verifyDomain({
    domain_name: 'www.example.co.za', verification_token: 'abc123'
  });
  assert.equal(result.verified, false);
  assert.equal(result.method, null);
  assert.match(result.reason, /DNS changes can take a few hours/);
});

test('a domain without a token can never verify', async () => {
  domainService.setResolverForTesting({
    resolveCname: async () => ['sites.re-el.co.za'],
    resolveTxt: async () => [['reel-verify=']]
  });
  const result = await domainService.verifyDomain({
    domain_name: 'www.example.co.za', verification_token: ''
  });
  assert.equal(result.verified, false);
  assert.match(result.reason, /verification token/);
});

test('free subdomains are derived from the organisation slug only', () => {
  assert.equal(domainService.freeSubdomain('little-sprouts'), 'little-sprouts.re-el.co.za');
  assert.equal(domainService.freeSubdomain('Sunrise Kids'), null);
  assert.equal(domainService.freeSubdomain('www'), null, 'reserved labels cannot be free addresses');
  assert.equal(domainService.slugFromFreeSubdomain('little-sprouts.re-el.co.za'), 'little-sprouts');
  assert.equal(domainService.slugFromFreeSubdomain('www.little-sprouts.re-el.co.za'), 'little-sprouts');
  assert.equal(domainService.slugFromFreeSubdomain('re-el.co.za'), null);
  assert.equal(domainService.slugFromFreeSubdomain('www.re-el.co.za'), null);
  assert.equal(domainService.slugFromFreeSubdomain('www.example.co.za'), null);
});

test('a presented domain carries records and the free address', () => {
  const presented = domainService.present({
    id: 'd1', domain_name: 'www.example.co.za', verification_token: 'abc123',
    verification_status: 'verified', verification_method: 'cname', ssl_status: 'active',
    failure_reason: null, last_checked_at: '2026-11-01T10:00:00.000Z',
    verified_at: '2026-11-01T10:00:00.000Z', created_at: '2026-10-31T10:00:00.000Z'
  }, { slug: 'little-sprouts' });
  assert.equal(presented.verified, true);
  assert.equal(presented.records.cname.value, domainService.cnameTarget());
  assert.equal(presented.freeSubdomain, 'little-sprouts.re-el.co.za');
});

'use strict';

/**
 * Organisation website tests.
 *
 * The public website is a real, editable product surface, not a demo page.
 * These tests cover the content normaliser (the contract the editor and public
 * pages share), the published payload and SEO metadata, the draft/publish flow
 * and the write permission boundary.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');
const websiteContent = require('../src/services/website-content');
const domainService = require('../src/services/domain-service');

test.before(start);
test.after(stop);

async function principal() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  return { client, session, organisationId: session.activeOrganisationId };
}

test('website content is normalised into a complete, safe shape', () => {
  const content = websiteContent.normalise({
    hero: { headline: 'Where little minds grow', image: 'javascript:alert(1)' },
    fees: 'Full-day care from R4 850 per month.',
    gallery: ['https://cdn.example.com/one.jpg'],
    facilities: ['Outdoor play garden'],
    seo: { keywords: 'creche rosebank, preschool' },
    contact: { email: 'HELLO@EXAMPLE.CO.ZA', phone: '011 447 8890' }
  }, { name: 'Little Sprouts', slug: 'little-sprouts' });

  assert.equal(content.hero.headline, 'Where little minds grow');
  assert.equal(content.hero.image, '', 'javascript: URLs are dropped');
  assert.equal(content.fees.summary, 'Full-day care from R4 850 per month.');
  assert.equal(content.gallery[0].url, 'https://cdn.example.com/one.jpg');
  assert.equal(content.facilities[0].name, 'Outdoor play garden');
  assert.equal(content.contact.email, 'hello@example.co.za');
  assert.ok(content.about.body.length > 0, 'default about copy fills the page');
  assert.ok(content.about.values.length >= 3, 'default values fill the home page');
  assert.ok(content.admissions.steps.length >= 3, 'default admissions steps exist');
  assert.ok(content.admissions.checklist.length >= 3, 'default checklist exists');
  assert.ok(content.seo.keywords.includes('creche rosebank'));
  assert.ok(content.seo.keywords.includes('Little Sprouts'));
  assert.ok(content.seo.keywords.includes('daycare'));
  assert.equal(content.seo.title, 'Where little minds grow | Little Sprouts');
  assert.equal(content.seo.image, 'https://cdn.example.com/one.jpg');
});

test('gallery items keep video markers and default to images', () => {
  const content = websiteContent.normalise({
    gallery: [
      { url: 'https://cdn.example.com/tour.mp4', caption: 'A video tour', kind: 'video' },
      { url: 'https://cdn.example.com/photo.jpg', caption: 'A photo' },
      'https://cdn.example.com/legacy.jpg'
    ]
  }, { name: 'Little Sprouts', slug: 'little-sprouts' });

  assert.equal(content.gallery[0].kind, 'video');
  assert.equal(content.gallery[0].caption, 'A video tour');
  assert.equal(content.gallery[1].kind, undefined);
  assert.equal(content.gallery[2].kind, undefined);
});

test('button links keep safe destinations and reject script URLs', () => {
  const content = websiteContent.normalise({
    hero: {
      headline: 'Where little minds grow',
      ctaHref: '/apply',
      secondaryHref: 'https://example.com/programmes'
    },
    admissions: { ctaHref: 'mailto:hello@example.co.za' }
  }, { name: 'Little Sprouts', slug: 'little-sprouts' });

  assert.equal(content.hero.ctaHref, '/apply');
  assert.equal(content.hero.secondaryHref, 'https://example.com/programmes');
  assert.equal(content.admissions.ctaHref, 'mailto:hello@example.co.za');
  assert.equal(websiteContent.safeLink('/forms/learner-admission'), '/forms/learner-admission');

  const unsafe = websiteContent.normalise({
    hero: { ctaHref: 'javascript:alert(1)', secondaryHref: 'data:text/html,hi' },
    admissions: { ctaHref: 'javascript:alert(2)' }
  }, { name: 'Little Sprouts', slug: 'little-sprouts' });

  assert.equal(unsafe.hero.ctaHref, '');
  assert.equal(unsafe.hero.secondaryHref, '');
  assert.equal(unsafe.admissions.ctaHref, '');
});

test('the public payload carries normalised content, pages and SEO', async () => {
  const client = createClient();
  const site = await client.get('/public/daycares/little-sprouts');
  assert.equal(site.status, 200);
  assert.equal(site.data.published, true);
  assert.equal(site.data.organisation.slug, 'little-sprouts');
  assert.ok(site.data.content.hero.headline.length > 0);
  assert.ok(site.data.content.about.body.length > 0);
  assert.ok(Array.isArray(site.data.content.programmes));
  assert.ok(Array.isArray(site.data.pages));
  assert.equal(site.data.pages.length, 6);
  assert.deepEqual(site.data.pages.map((page) => page.key),
    ['home', 'about', 'programmes', 'admissions', 'gallery', 'contact']);
  assert.ok(site.data.seo.keywords.includes('Little Sprouts ECD'));
  assert.ok(site.data.seo.canonical.includes('/site/little-sprouts'));
  assert.ok(site.data.updatedAt, 'the payload says when it was published');
});

test('a principal can edit, preview and publish the whole website', async () => {
  const { client, organisationId } = await principal();
  const before = await client.get('/website', { organisationId });
  assert.equal(before.status, 200);
  assert.ok(before.data.content);
  assert.equal(before.data.pages.length, 6);
  assert.ok(before.data.branding.primary);

  const draft = await client.patch('/website', {
    theme: 'nature',
    draftContent: {
      announcement: 'Now enrolling for 2027',
      hero: {
        headline: 'Bright beginnings start here',
        subheadline: 'A warm, play-based home in Rosebank.',
        image: 'https://cdn.example.com/hero.jpg',
        ctaHref: '/programmes',
        secondaryHref: 'https://example.com/tour'
      },
      about: { body: 'Our educators know every child by name and follow their lead.' },
      programmes: [
        { name: 'Seedlings', ages: '18 months – 3 years', description: 'Gentle settling and sensory play.', image: 'https://cdn.example.com/seedlings.jpg', price: 'From R4 200' }
      ],
      gallery: [{ url: 'https://cdn.example.com/garden.jpg', caption: 'The play garden' }],
      admissions: { checklist: ['Birth certificate', 'Allergy information'], ctaHref: 'mailto:admissions@example.com' },
      seo: { keywords: 'creche rosebank, preschool johannesburg', description: 'A warm, play-based ECD centre in Rosebank.' }
    }
  }, { organisationId });
  assert.equal(draft.status, 200);
  assert.equal(draft.data.content.hero.headline, 'Bright beginnings start here');
  assert.equal(draft.data.content.hero.image, 'https://cdn.example.com/hero.jpg');
  assert.equal(draft.data.content.hero.ctaHref, '/programmes');
  assert.equal(draft.data.content.hero.secondaryHref, 'https://example.com/tour');
  assert.equal(draft.data.content.admissions.ctaHref, 'mailto:admissions@example.com');
  assert.equal(draft.data.content.gallery[0].caption, 'The play garden');
  assert.equal(draft.data.content.admissions.checklist.length, 2);
  assert.ok(draft.data.content.seo.keywords.includes('creche rosebank'));
  assert.equal(draft.data.content.seo.title, 'Bright beginnings start here | Little Sprouts ECD');
  assert.equal(draft.data.content.seo.description, 'A warm, play-based ECD centre in Rosebank.');

  const reread = await client.get('/website', { organisationId });
  assert.equal(reread.data.content.hero.headline, 'Bright beginnings start here');
  assert.equal(reread.data.content.programmes[0].name, 'Seedlings');

  const published = await client.post('/website/publish', {}, { organisationId });
  assert.equal(published.status, 200);
  assert.equal(published.data.status, 'published');

  const site = await client.get('/public/daycares/little-sprouts');
  assert.equal(site.status, 200);
  assert.equal(site.data.content.hero.headline, 'Bright beginnings start here');
  assert.equal(site.data.content.hero.ctaHref, '/programmes');
  assert.equal(site.data.content.hero.secondaryHref, 'https://example.com/tour');
  assert.equal(site.data.content.admissions.ctaHref, 'mailto:admissions@example.com');
  assert.equal(site.data.content.gallery[0].caption, 'The play garden');
  assert.ok(site.data.seo.keywords.includes('preschool johannesburg'));
  assert.equal(site.data.seo.description, 'A warm, play-based ECD centre in Rosebank.');
});

test('the editor cannot store an unsafe image or social URL', async () => {
  const { client, organisationId } = await principal();
  const draft = await client.patch('/website', {
    draftContent: {
      hero: { image: 'javascript:alert(1)' },
      social: { facebook: 'javascript:alert(2)', instagram: 'https://instagram.com/littlesprouts' }
    }
  }, { organisationId });
  assert.equal(draft.status, 200);
  assert.equal(draft.data.content.hero.image, '');
  assert.equal(draft.data.content.social.facebook, '');
  assert.equal(draft.data.content.social.instagram, 'https://instagram.com/littlesprouts');
});

test('website writes require the website management permission', async () => {
  const teacher = createClient();
  const session = await teacher.login('teacher@littlesprouts.local');
  const denied = await teacher.patch('/website', { draftContent: { hero: { headline: 'Nope' } } },
    { organisationId: session.activeOrganisationId });
  assert.equal(denied.status, 403);

  const read = await teacher.get('/website', { organisationId: session.activeOrganisationId });
  assert.equal(read.status, 403, 'teachers do not receive the website module');
});

test('a custom domain is added, verified and then serves the public site', async () => {
  const { client, organisationId } = await principal();
  const created = await client.post('/website/domains',
    { domainName: 'https://WWW.Example.co.za/hello' }, { organisationId });
  assert.equal(created.status, 201);
  assert.equal(created.data.domain_name, 'www.example.co.za');
  assert.equal(created.data.verification_status, 'pending');
  assert.equal(created.data.records.cname.value, domainService.cnameTarget());
  assert.equal(created.data.records.txt.host, '_reel-verify.www.example.co.za');
  assert.match(created.data.records.txt.value, /^reel-verify=[a-f0-9]{20,}$/);
  assert.equal(created.data.freeSubdomain, 'little-sprouts.re-el.co.za');

  const duplicate = await client.post('/website/domains', { domainName: 'www.example.co.za' }, { organisationId });
  assert.equal(duplicate.status, 409);

  const listed = await client.get('/website', { organisationId });
  assert.ok(listed.data.domains.some((domain) => domain.id === created.data.id));

  const unverified = await client.get('/public/daycares/by-domain/www.example.co.za');
  assert.equal(unverified.status, 404, 'a pending domain is not served');

  // Prove control through a CNAME without touching the public DNS.
  domainService.setResolverForTesting({
    resolveCname: async () => [domainService.cnameTarget()],
    resolveTxt: async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); },
    resolve4: async () => ['76.76.21.21'],
    resolve6: async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); }
  });
  domainService.setTlsProbeForTesting(async () => ({ ok: true, status: 200 }));
  const verified = await client.post('/website/domains/' + created.data.id + '/verify', {}, { organisationId });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.verified, true);
  assert.equal(verified.data.verification_method, 'cname');
  assert.equal(verified.data.ssl_status, 'active');
  assert.ok(verified.data.verified_at);

  const publicSite = await client.get('/public/daycares/by-domain/www.example.co.za');
  assert.equal(publicSite.status, 200);
  assert.equal(publicSite.data.organisation.slug, 'little-sprouts');
  assert.equal(publicSite.data.canonicalHost, 'www.example.co.za');
  assert.equal(publicSite.data.domain, 'www.example.co.za');
  assert.ok(publicSite.data.seo.canonical.startsWith('https://www.example.co.za/'));
  assert.equal(publicSite.headers.get('access-control-allow-origin'), '*');

  const free = await client.get('/public/daycares/by-domain/little-sprouts.re-el.co.za');
  assert.equal(free.status, 200);
  assert.equal(free.data.organisation.slug, 'little-sprouts');
  assert.equal(free.data.canonicalHost, 'little-sprouts.re-el.co.za');

  const removed = await client.delete('/website/domains/' + created.data.id, { organisationId });
  assert.equal(removed.status, 200);
  const gone = await client.get('/public/daycares/by-domain/www.example.co.za');
  assert.equal(gone.status, 404);
});

test('the free address is only canonical once it actually serves', async () => {
  const client = createClient();

  // Nothing published for that host: the platform address must not be
  // advertised as canonical, or every shared link points at a dead address.
  domainService.setResolverForTesting({
    resolve4: async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); },
    resolve6: async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); }
  });
  domainService.setTlsProbeForTesting(async () => ({ ok: true, status: 200 }));
  const unreachable = await client.get('/public/daycares/by-domain/little-sprouts.re-el.co.za');
  assert.equal(unreachable.status, 200);
  assert.equal(unreachable.data.canonicalHost, null);
  assert.ok(unreachable.data.seo.canonical.includes('ecd.re-el.co.za'));

  // Resolves, but the certificate covers a different host — the exact shape of
  // SSL_ERROR_BAD_CERT_DOMAIN. Still not good enough to be canonical.
  domainService.setResolverForTesting({
    resolve4: async () => ['185.199.108.153'],
    resolve6: async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); }
  });
  domainService.setTlsProbeForTesting(async () => ({ ok: false, error: 'ERR_TLS_CERT_ALTNAME_INVALID' }));
  const badCert = await client.get('/public/daycares/by-domain/little-sprouts.re-el.co.za');
  assert.equal(badCert.data.canonicalHost, null);

  // Once the wildcard certificate serves the host, it becomes canonical.
  domainService.setTlsProbeForTesting(async () => ({ ok: true, status: 200 }));
  const live = await client.get('/public/daycares/by-domain/little-sprouts.re-el.co.za');
  assert.equal(live.data.canonicalHost, 'little-sprouts.re-el.co.za');
});

test('address readiness reports the free address and the CNAME target', async () => {
  const { client, organisationId } = await principal();
  domainService.setResolverForTesting({
    resolve4: async () => ['76.76.21.21'],
    resolve6: async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); }
  });
  domainService.setTlsProbeForTesting(async (name) => (
    name === 'little-sprouts.re-el.co.za' ? { ok: true, status: 200 } : { ok: false, error: 'TIMEOUT' }
  ));
  const ready = await client.get('/website/addresses', { organisationId });
  assert.equal(ready.status, 200);
  assert.equal(ready.data.freeSubdomain, 'little-sprouts.re-el.co.za');
  assert.equal(ready.data.freeSubdomainReady, true);
  assert.equal(ready.data.cnameTarget, domainService.cnameTarget());
  assert.equal(ready.data.cnameTargetResolves, true);
  assert.equal(ready.data.cnameTargetTlsValid, false, 'resolving is not the same as answering');
});

test('custom domains require the website management permission', async () => {
  const teacher = createClient();
  const session = await teacher.login('teacher@littlesprouts.local');
  const denied = await teacher.post('/website/domains',
    { domainName: 'teacher.example.co.za' }, { organisationId: session.activeOrganisationId });
  assert.equal(denied.status, 403);

  const read = await teacher.get('/website', { organisationId: session.activeOrganisationId });
  assert.equal(read.status, 403);
});

test('an invalid or platform domain is rejected with a validation error', async () => {
  const { client, organisationId } = await principal();
  for (const domainName of ['not a host', 'localhost', '127.0.0.1', 'ecd.re-el.co.za']) {
    const result = await client.post('/website/domains', { domainName }, { organisationId });
    assert.equal(result.status, 422, domainName + ' must be rejected');
    assert.equal(result.error.code, 'VALIDATION_ERROR');
  }
});

test('a slug request only adopts a custom host that the organisation owns', async () => {
  const client = createClient();
  const spoofed = await client.get('/public/daycares/little-sprouts?host=evil.example.net');
  assert.equal(spoofed.status, 200);
  assert.equal(spoofed.data.canonicalHost, null);
  assert.ok(spoofed.data.seo.canonical.includes('ecd.re-el.co.za'));
});

test('an onboarding centre still serves its public enquiry and form endpoints', async () => {
  // Newly provisioned centres are born 'onboarding'. The public site itself
  // loads for them, so enquiries and public forms must not 404 as well —
  // otherwise the centre's own #/apply and #/forms links break.
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  const slug = 'onboarding-web-' + Date.now();
  const provisioned = await admin.post('/platform/organisations', {
    name: 'Onboarding Web Centre',
    slug,
    ownerName: 'Onboarding Owner',
    ownerEmail: 'owner@' + slug + '.local',
    temporaryPassword: 'onboarding-pass-123'
  });
  assert.equal(provisioned.status, 201, provisioned.text);
  assert.equal(provisioned.data.status, 'onboarding');

  const anon = createClient();
  const site = await anon.get('/public/daycares/' + slug);
  assert.equal(site.status, 200, site.text);

  const enquiryForm = await anon.get('/public/daycares/' + slug + '/enquiry-form');
  assert.equal(enquiryForm.status, 200, enquiryForm.text);

  const enquiry = await anon.post('/public/enquiries', {
    organisationSlug: slug,
    guardianName: 'Test Parent',
    guardianEmail: 'parent@example.com',
    message: 'Would love a tour.'
  });
  assert.equal(enquiry.status, 200, enquiry.text);
  assert.equal(enquiry.data.received, true);

  const owner = createClient();
  await owner.login('owner@' + slug + '.local', 'onboarding-pass-123');
  const form = await owner.post('/forms', {
    name: 'Learner admission',
    slug: 'learner-admission',
    formType: 'enrolment',
    fields: [{ key: 'child_name', label: 'Child name', type: 'text', required: true }]
  });
  assert.equal(form.status, 201, form.text);
  const published = await owner.post('/forms/' + form.data.id + '/publish', { isPublic: true });
  assert.equal(published.status, 200, published.text);

  const publicForm = await anon.get('/public/forms/' + slug + '/learner-admission');
  assert.equal(publicForm.status, 200, publicForm.text);
  assert.equal(publicForm.data.form.name, 'Learner admission');
  const submission = await anon.post('/public/forms/' + slug + '/learner-admission/submit', {
    data: { child_name: 'Amelia' },
    email: 'parent@example.com'
  });
  assert.equal(submission.status, 200, submission.text);
});

test.after(() => {
  domainService.resetResolverForTesting();
  domainService.setTlsProbeForTesting(null);
});

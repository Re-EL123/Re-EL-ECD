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
        image: 'https://cdn.example.com/hero.jpg'
      },
      about: { body: 'Our educators know every child by name and follow their lead.' },
      programmes: [
        { name: 'Seedlings', ages: '18 months – 3 years', description: 'Gentle settling and sensory play.', image: 'https://cdn.example.com/seedlings.jpg', price: 'From R4 200' }
      ],
      gallery: [{ url: 'https://cdn.example.com/garden.jpg', caption: 'The play garden' }],
      admissions: { checklist: ['Birth certificate', 'Allergy information'] },
      seo: { keywords: 'creche rosebank, preschool johannesburg', description: 'A warm, play-based ECD centre in Rosebank.' }
    }
  }, { organisationId });
  assert.equal(draft.status, 200);
  assert.equal(draft.data.content.hero.headline, 'Bright beginnings start here');
  assert.equal(draft.data.content.hero.image, 'https://cdn.example.com/hero.jpg');
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

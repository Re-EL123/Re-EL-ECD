'use strict';

/**
 * Media and branding integration tests.
 *
 * These exercise the real router, RBAC, tenancy and SQL. Object storage itself
 * is external, so the tests assert the contract the API promises: uploads are
 * refused cleanly when R2 is absent, media rows never cross a tenant boundary,
 * and a theme is validated, applied and reflected in the session and website.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

const DEFAULT_PRIMARY = '#3A7D44';
const DEFAULT_SECONDARY = '#C97A12';
const DEFAULT_ACCENT = '#3D8FAE';

async function principal() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  return { client, session, organisationId: session.activeOrganisationId };
}

test('media config reports the scopes and limits the UI relies on', async () => {
  const { client, organisationId } = await principal();
  const response = await client.get('/media/config', { organisationId });
  assert.equal(response.status, 200);
  assert.equal(response.data.configured, false);
  assert.ok(response.data.scopes.includes('branding'));
  assert.ok(response.data.scopes.includes('staff-document'));
  assert.equal(response.data.maxBytes['image/jpeg'], 15 * 1024 * 1024);
  assert.equal(response.data.maxBytes['video/mp4'], 150 * 1024 * 1024);
});

test('an upload request is refused with a clear conflict when R2 is not configured', async () => {
  const { client, organisationId } = await principal();
  const response = await client.post('/media/uploads', {
    filename: 'logo.png', contentType: 'image/png', size: 2048, scope: 'branding'
  }, { organisationId });
  assert.equal(response.status, 409);
  assert.match(response.error.message, /storage is not configured/i);
});

test('media assets are scoped to the organisation that owns them', async () => {
  const { client, organisationId } = await principal();
  const sunrise = createClient();
  const sunriseSession = await sunrise.login('principal@sunrise.local');
  const sunriseOrganisationId = sunriseSession.activeOrganisationId;
  assert.notEqual(organisationId, sunriseOrganisationId);

  const key = `org/${organisationId}/branding/test-${Date.now()}.png`;
  const inserted = await db.one(
    `INSERT INTO media_assets (organisation_id, scope, original_filename, storage_key, url, mime_type, size_bytes, kind, status)
     VALUES ($1,'branding','test.png',$2,'https://media.example.com/test.png','image/png',2048,'image','ready')
     RETURNING *`,
    [organisationId, key]
  );

  const own = await client.get('/media/assets', { organisationId });
  assert.equal(own.status, 200);
  assert.ok(own.data.some((asset) => asset.id === inserted.id));

  const other = await sunrise.get('/media/assets', { organisationId: sunriseOrganisationId });
  assert.equal(other.status, 200);
  assert.equal(other.data.some((asset) => asset.id === inserted.id), false);

  // A different tenant cannot complete or delete the asset either.
  const denied = await sunrise.post(`/media/assets/${inserted.id}/complete`, {}, { organisationId: sunriseOrganisationId });
  assert.equal(denied.status, 404);
  const deniedDelete = await sunrise.delete(`/media/assets/${inserted.id}`, { organisationId: sunriseOrganisationId });
  assert.equal(deniedDelete.status, 404);

  await db.query('DELETE FROM media_assets WHERE id = $1', [inserted.id]);
});

test('themes are validated, created, applied to the session and website, then deleted', async () => {
  const { client, organisationId } = await principal();

  const invalid = await client.post('/organisation/themes', {
    name: 'Bad palette', tokens: { primary: 'red' }
  }, { organisationId });
  assert.equal(invalid.status, 422);

  const created = await client.post('/organisation/themes', {
    name: 'Ocean test', isDefault: false,
    tokens: {
      primary: '#123456', secondary: '#654321', accent: '#ABCDEF',
      background: '#F4F7FA', surface: '#FFFFFF', text: '#101820',
      injected: 'url(javascript:alert(1))'
    }
  }, { organisationId });
  assert.equal(created.status, 201);
  const theme = created.data;
  assert.equal(theme.tokens.primary, '#123456');
  assert.equal(theme.tokens.accent, '#ABCDEF');
  assert.equal(theme.tokens.injected, undefined);
  assert.equal(theme.tokens.onPrimary, '#FFFFFF');

  const applied = await client.post(`/organisation/themes/${theme.id}/apply`, {}, { organisationId });
  assert.equal(applied.status, 200);
  assert.equal(applied.data.primary_colour, '#123456');
  assert.equal(applied.data.applied_theme_id, theme.id);

  const fresh = await principal();
  const membership = fresh.session.memberships.find((m) => m.organisation.id === organisationId);
  assert.equal(membership.organisation.theme.primary, '#123456');
  assert.equal(membership.organisation.theme.background, '#F4F7FA');
  assert.equal(membership.organisation.appliedThemeId, theme.id);

  const site = await client.get('/public/daycares/little-sprouts');
  assert.equal(site.status, 200);
  assert.equal(site.data.branding.primary, '#123456');
  assert.equal(site.data.branding.accent, '#ABCDEF');

  const sunrise = createClient();
  const sunriseSession = await sunrise.login('principal@sunrise.local');
  const stolen = await sunrise.post(`/organisation/themes/${theme.id}/apply`, {},
    { organisationId: sunriseSession.activeOrganisationId });
  assert.equal(stolen.status, 404);

  const deleted = await client.delete(`/organisation/themes/${theme.id}`, { organisationId });
  assert.equal(deleted.status, 200);
  const list = await client.get('/organisation/themes', { organisationId });
  assert.equal(list.data.themes.some((row) => row.id === theme.id), false);

  // Restore the demo organisation so later test files start from a known state.
  await client.patch('/organisations/current', {
    primaryColour: DEFAULT_PRIMARY, secondaryColour: DEFAULT_SECONDARY, accentColour: DEFAULT_ACCENT
  }, { organisationId });
});

test('incident and announcement attachments round-trip through JSONB', async () => {
  const { client, organisationId } = await principal();
  const branches = await client.get('/branches', { organisationId });
  const branchId = branches.data[0].id;
  const photo = 'https://media.example.com/org/demo/incident/photo.jpg';
  const file = 'https://media.example.com/org/demo/announcement/letter.pdf';

  const incident = await client.post('/incidents', {
    branchId, incidentType: 'near_miss', severity: 'medium',
    description: 'A child slipped near the sandpit but was not hurt.',
    attachmentUrls: [photo]
  }, { organisationId });
  assert.equal(incident.status, 201);
  assert.deepEqual(incident.data.attachment_urls, [photo]);

  const detail = await client.get(`/incidents/${incident.data.id}`, { organisationId });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.data.attachment_urls, [photo]);

  const cleared = await client.patch(`/incidents/${incident.data.id}`, { attachmentUrls: [] }, { organisationId });
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.data.attachment_urls, []);

  const announcement = await client.post('/announcements', {
    title: 'Attachment test notice', body: 'Please see the attached letter.',
    audienceType: 'all', attachmentUrls: [file], publish: true
  }, { organisationId });
  assert.equal(announcement.status, 201);
  assert.deepEqual(announcement.data.attachment_urls, [file]);

  const list = await client.get('/announcements', { organisationId });
  assert.equal(list.status, 200);
  const found = list.data.find((row) => row.id === announcement.data.id);
  assert.ok(found);
  assert.deepEqual(found.attachment_urls, [file]);
});

test('editing brand colours rejects invalid hex and keeps tokens in sync', async () => {
  const { client, organisationId } = await principal();

  const invalid = await client.patch('/organisations/current', { primaryColour: '#12' }, { organisationId });
  assert.equal(invalid.status, 422);

  const updated = await client.patch('/organisations/current', {
    primaryColour: '#0A0B0C', secondaryColour: '#111213', accentColour: '#141516'
  }, { organisationId });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.primary_colour, '#0A0B0C');
  assert.equal(updated.data.theme_tokens.primary, '#0A0B0C');
  assert.equal(updated.data.theme_tokens.onPrimary, '#FFFFFF');

  await client.patch('/organisations/current', {
    primaryColour: DEFAULT_PRIMARY, secondaryColour: DEFAULT_SECONDARY, accentColour: DEFAULT_ACCENT
  }, { organisationId });
});

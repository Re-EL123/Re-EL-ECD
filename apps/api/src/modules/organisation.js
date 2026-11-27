'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { parsePagination } = require('../utils/http');
const branding = require('../services/branding-service');
const { assignedClassroomIds, has, today } = require('./helpers');

// Organisation-added nursery rhymes live in a dedicated, strictly shaped
// setting. The generic object-settings validator below only allows flat
// strings/numbers/booleans, so this list gets its own normaliser.
const RHYME_TAGS = new Set(['Calm down', 'Energise', 'Transition', 'Bedtime', 'Circle time']);
const RHYME_CATEGORIES = new Set(['Actions', 'Animals', 'Classics', 'Counting', 'Learning', 'Lullabies', 'Time', 'Weather', 'Other']);

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function shortText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normaliseCustomRhymes(value) {
  if (!Array.isArray(value)) {
    fail('VALIDATION', [{ field: 'settings.nurseryRhymes', message: 'Expected a list of rhymes.' }]);
  }
  if (value.length > 100) {
    fail('VALIDATION', [{ field: 'settings.nurseryRhymes', message: 'A centre can store up to 100 rhymes.' }]);
  }
  return value.map((row, index) => {
    const item = plainObject(row);
    const id = shortText(item.id, 80);
    const title = shortText(item.title, 140);
    const lyrics = Array.isArray(item.lyrics)
      ? item.lyrics.map((line) => shortText(line, 400)).filter(Boolean).slice(0, 120)
      : [];
    const errors = [];
    if (!/^[a-z0-9-]{3,80}$/.test(id)) {
      errors.push({ field: 'settings.nurseryRhymes.' + index + '.id', message: 'Use an id of letters, numbers and dashes.' });
    }
    if (!title) errors.push({ field: 'settings.nurseryRhymes.' + index + '.title', message: 'Give the rhyme a title.' });
    if (!lyrics.length) errors.push({ field: 'settings.nurseryRhymes.' + index + '.lyrics', message: 'Add at least one lyric line.' });
    if (errors.length) fail('VALIDATION', errors);
    const tags = Array.isArray(item.tags) ? item.tags.filter((tag) => RHYME_TAGS.has(tag)).slice(0, 5) : [];
    const minutes = Number(item.minutes);
    return {
      id,
      title,
      category: RHYME_CATEGORIES.has(item.category) ? item.category : 'Other',
      tags,
      minutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 ? Math.round(minutes) : 2,
      lyrics,
      actions: shortText(item.actions, 300),
      source: shortText(item.source, 500),
      custom: true
    };
  });
}

function safeRhymeAudioUrl(value) {
  const url = String(value || '').trim();
  if (!url || url.length > 500) return false;
  return /^https?:\/\//i.test(url) || /^\/api\/v1\/media\/object\?key=(?:shared(?:%2F|\/)|org(?:%2F|\/)[0-9a-f-]{36}(?:%2F|\/))/i.test(url);
}
async function readOrganisationSettings(db, organisationId) {
  const row = await db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [organisationId]);
  return row && plainObject(row.settings) ? row.settings : {};
}
async function writeOrganisationSettings(db, organisationId, settings) {
  const existing = await db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [organisationId]);
  if (existing) {
    await db.query('UPDATE organisation_settings SET settings = $1, updated_at = now() WHERE organisation_id = $2',
      [JSON.stringify(settings), organisationId]);
  } else {
    await db.query('INSERT INTO organisation_settings (organisation_id, settings) VALUES ($1,$2)',
      [organisationId, JSON.stringify(settings)]);
  }
}

function register(router) {
  router.get('/organisations/current', async (ctx) => {
    const organisation = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.organisationId]);
    const branches = await ctx.db.many('SELECT * FROM branches WHERE organisation_id = $1 ORDER BY name', [ctx.organisationId]);
    const settings = await ctx.db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [ctx.organisationId]);
    return { ...organisation, branches, settings: settings ? settings.settings : {} };
  }, { permission: 'organisation.read.daycare' });

  router.patch('/organisations/current', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200, optional: true },
      legalName: { type: 'string', max: 200, optional: true },
      registrationNumber: { type: 'string', max: 100, optional: true },
      logoUrl: { type: 'string', max: 500, optional: true },
      primaryColour: { type: 'string', max: 9, regex: branding.HEX, optional: true, message: 'Primary colour must be a hex colour such as #3A7D44.' },
      secondaryColour: { type: 'string', max: 9, regex: branding.HEX, optional: true, message: 'Secondary colour must be a hex colour such as #C97A12.' },
      accentColour: { type: 'string', max: 9, regex: branding.HEX, optional: true, message: 'Accent colour must be a hex colour such as #3D8FAE.' },
      themeTokens: { type: 'object', optional: true },
      timezone: { type: 'string', max: 64, optional: true },
      currency: { type: 'string', min: 3, max: 3, optional: true },
      locale: { type: 'string', max: 10, optional: true }
    });
    const tokens = body.themeTokens ? branding.normalizeTokens(body.themeTokens) : null;
    await ctx.db.query(
      `UPDATE organisations SET name = COALESCE($1,name), legal_name = COALESCE($2,legal_name),
        registration_number = COALESCE($3,registration_number), logo_url = COALESCE($4,logo_url),
        primary_colour = COALESCE($5,primary_colour), secondary_colour = COALESCE($6,secondary_colour),
        accent_colour = COALESCE($7,accent_colour),
        theme_tokens = CASE WHEN $8::jsonb IS NULL THEN theme_tokens ELSE $8::jsonb END,
        timezone = COALESCE($9,timezone), currency = COALESCE($10,currency), locale = COALESCE($11,locale),
        updated_at = now()
       WHERE id = $12`,
      [body.name || null, body.legalName || null, body.registrationNumber || null, body.logoUrl || null,
        body.primaryColour || null, body.secondaryColour || null, body.accentColour || null,
        tokens && Object.keys(tokens).length ? JSON.stringify(tokens) : null,
        body.timezone || null, body.currency || null, body.locale || null, ctx.organisationId]
    );
    if (body.primaryColour || body.secondaryColour || body.accentColour) {
      const current = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.organisationId]);
      const merged = branding.mergeTokens(branding.themeFromOrganisation(current), tokens || {});
      await ctx.db.query(
        'UPDATE organisations SET theme_tokens = $1, updated_at = now() WHERE id = $2',
        [JSON.stringify(merged), ctx.organisationId]
      );
    }
    await recordAudit(ctx.db, ctx, { action: 'organisation.updated', resourceType: 'organisation', resourceId: ctx.organisationId });
    return ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.organisationId]);
  }, { permission: 'organisation.update.daycare' });

  router.get('/organisation/themes', async (ctx) => {
    const themes = await ctx.db.many(
      'SELECT * FROM organisation_themes WHERE organisation_id = $1 ORDER BY is_default DESC, created_at ASC',
      [ctx.organisationId]
    );
    const organisation = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.organisationId]);
    return {
      themes,
      appliedThemeId: organisation ? organisation.applied_theme_id : null,
      current: branding.themeFromOrganisation(organisation)
    };
  }, { permission: 'organisation.read.daycare' });

  router.post('/organisation/themes', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 80 },
      tokens: { type: 'object' },
      isDefault: { type: 'boolean', optional: true }
    });
    const tokens = branding.normalizeTokens(body.tokens);
    if (!tokens.primary) {
      throw new AppError('VALIDATION', [{ field: 'tokens', message: 'A theme needs a primary colour.' }]);
    }
    const clash = await ctx.db.one(
      'SELECT id FROM organisation_themes WHERE organisation_id = $1 AND lower(name) = lower($2)',
      [ctx.organisationId, body.name]
    );
    if (clash) throw new AppError('CONFLICT', null, 'A theme with that name already exists.');
    tokens.onPrimary = branding.onColour(tokens.primary);
    const theme = await ctx.db.withTransaction(async (client) => {
      if (body.isDefault === true) {
        await client.query('UPDATE organisation_themes SET is_default = false WHERE organisation_id = $1', [ctx.organisationId]);
      }
      return (await client.query(
        `INSERT INTO organisation_themes (organisation_id, name, tokens, is_default, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [ctx.organisationId, body.name, JSON.stringify(tokens), body.isDefault === true, ctx.user.id]
      )).rows[0];
    });
    await recordAudit(ctx.db, ctx, {
      action: 'organisation.theme_created', resourceType: 'organisation_theme', resourceId: theme.id
    });
    ctx.status = 201;
    return theme;
  }, { permission: 'organisation.update.daycare' });

  router.patch('/organisation/themes/:id', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 80, optional: true },
      tokens: { type: 'object', optional: true },
      isDefault: { type: 'boolean', optional: true }
    });
    const theme = await ctx.db.one(
      'SELECT * FROM organisation_themes WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]
    );
    if (!theme) throw new AppError('NOT_FOUND');
    if (body.name && body.name.toLowerCase() !== String(theme.name).toLowerCase()) {
      const clash = await ctx.db.one(
        'SELECT id FROM organisation_themes WHERE organisation_id = $1 AND lower(name) = lower($2) AND id <> $3',
        [ctx.organisationId, body.name, theme.id]
      );
      if (clash) throw new AppError('CONFLICT', null, 'A theme with that name already exists.');
    }
    const tokens = body.tokens ? { ...branding.normalizeTokens(theme.tokens), ...branding.normalizeTokens(body.tokens) } : null;
    if (tokens && tokens.primary) tokens.onPrimary = branding.onColour(tokens.primary);
    const updated = await ctx.db.withTransaction(async (client) => {
      if (body.isDefault === true) {
        await client.query('UPDATE organisation_themes SET is_default = false WHERE organisation_id = $1', [ctx.organisationId]);
      }
      return (await client.query(
        `UPDATE organisation_themes SET name = COALESCE($1,name),
          tokens = CASE WHEN $2::jsonb IS NULL THEN tokens ELSE $2::jsonb END,
          is_default = COALESCE($3,is_default), updated_at = now()
         WHERE id = $4 RETURNING *`,
        [body.name || null, tokens ? JSON.stringify(tokens) : null,
          body.isDefault === undefined ? null : body.isDefault, theme.id]
      )).rows[0];
    });
    await recordAudit(ctx.db, ctx, {
      action: 'organisation.theme_updated', resourceType: 'organisation_theme', resourceId: theme.id
    });
    return updated;
  }, { permission: 'organisation.update.daycare' });

  router.post('/organisation/themes/:id/apply', async (ctx) => {
    const theme = await ctx.db.one(
      'SELECT * FROM organisation_themes WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]
    );
    if (!theme) throw new AppError('NOT_FOUND');
    const tokens = branding.mergeTokens(theme.tokens);
    tokens.onPrimary = branding.onColour(tokens.primary);
    await ctx.db.query(
      `UPDATE organisations SET primary_colour = $1, secondary_colour = $2, accent_colour = $3,
        theme_tokens = $4, applied_theme_id = $5, updated_at = now() WHERE id = $6`,
      [tokens.primary, tokens.secondary, tokens.accent, JSON.stringify(tokens), theme.id, ctx.organisationId]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'organisation.theme_applied', resourceType: 'organisation_theme', resourceId: theme.id
    });
    return ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.organisationId]);
  }, { permission: 'organisation.update.daycare' });

  router.delete('/organisation/themes/:id', async (ctx) => {
    const theme = await ctx.db.one(
      'SELECT * FROM organisation_themes WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]
    );
    if (!theme) throw new AppError('NOT_FOUND');
    await ctx.db.query('DELETE FROM organisation_themes WHERE id = $1', [theme.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'organisation.theme_deleted', resourceType: 'organisation_theme', resourceId: theme.id
    });
    return { success: true };
  }, { permission: 'organisation.update.daycare' });

  router.get('/organisations/current/settings', async (ctx) => {
    const row = await ctx.db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [ctx.organisationId]);
    return row ? row.settings : {};
  }, { permission: 'organisation.read.daycare' });

  // Settings are security-relevant (late-collection cutoff, retention,
  // notification channels). Accept only known keys with known shapes — never
  // a raw client object merged into the security config.
  const ALLOWED_SETTINGS = new Set([
    'academicYear', 'operatingHours', 'attendancePolicy', 'notificationPreferences',
    'publicWebsite', 'dataRetention', 'weather', 'ncf', 'collection.lateCutoff', 'nurseryRhymeAudio', 'nurseryRhymes',
    'attendanceReminders'
  ]);
  const OBJECT_SETTINGS = new Set(['operatingHours', 'attendancePolicy', 'notificationPreferences', 'publicWebsite', 'dataRetention', 'weather', 'ncf', 'nurseryRhymeAudio', 'attendanceReminders']);
  router.patch('/organisations/current/settings', async (ctx) => {
    const body = validate(ctx.body, {
      settings: { type: 'object' }
    });
    const incoming = (body && body.settings) || {};
    const unknown = Object.keys(incoming).filter((key) => !ALLOWED_SETTINGS.has(key));
    if (unknown.length) fail('VALIDATION', unknown.map((key) => ({ field: 'settings.' + key, message: 'Unknown setting.' })));
    for (const [key, value] of Object.entries(incoming)) {
      if (key === 'academicYear' && (typeof value !== 'number' || !Number.isInteger(value) || value < 2000 || value > 2100)) {
        fail('VALIDATION', [{ field: 'settings.academicYear', message: 'Enter a valid year.' }]);
      } else if (key === 'collection.lateCutoff' && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(String(value))) {
        fail('VALIDATION', [{ field: 'settings.collection.lateCutoff', message: 'Use HH:MM, e.g. 17:30.' }]);
      } else if (key === 'nurseryRhymes') {
        body.settings[key] = normaliseCustomRhymes(value);
      } else if (OBJECT_SETTINGS.has(key) && (typeof value !== 'object' || value === null || Array.isArray(value))) {
        fail('VALIDATION', [{ field: 'settings.' + key, message: 'Expected an object.' }]);
      } else if (OBJECT_SETTINGS.has(key)) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          const flat = typeof nestedValue;
          if (key === 'attendanceReminders' && /Time$/.test(nestedKey)
            && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(String(nestedValue))) {
            fail('VALIDATION', [{ field: 'settings.' + key + '.' + nestedKey, message: 'Use HH:MM, e.g. 17:30.' }]);
          } else if (nestedValue === null || !['string', 'number', 'boolean'].includes(flat)) {
            fail('VALIDATION', [{ field: 'settings.' + key + '.' + nestedKey, message: 'Only plain values are allowed here.' }]);
          } else if (flat === 'string' && nestedValue.length > 500) {
            fail('VALIDATION', [{ field: 'settings.' + key + '.' + nestedKey, message: 'Value is too long.' }]);
          }
        }
      } else if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        fail('VALIDATION', [{ field: 'settings.' + key, message: 'Expected a plain value.' }]);
      }
    }
    const existing = await ctx.db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [ctx.organisationId]);
    const merged = { ...(existing ? existing.settings : {}), ...body.settings };
    if (existing) {
      await ctx.db.query('UPDATE organisation_settings SET settings = $1, updated_at = now() WHERE organisation_id = $2',
        [JSON.stringify(merged), ctx.organisationId]);
    } else {
      await ctx.db.query('INSERT INTO organisation_settings (organisation_id, settings) VALUES ($1,$2)',
        [ctx.organisationId, JSON.stringify(merged)]);
    }
    await recordAudit(ctx.db, ctx, {
      action: 'organisation.settings_updated', resourceType: 'organisation', resourceId: ctx.organisationId,
      metadata: { keys: Object.keys(body.settings) }
    });
    return merged;
  }, { permission: 'organisation.settings.manage' });

  // Nursery-rhyme recordings are a shared library: a recording uploaded by any
  // centre is available to every centre by default. The current centre's own
  // entries win if two centres recorded the same rhyme.
  router.get('/nursery-rhyme-audio', async (ctx) => {
    const rows = await ctx.db.many(
      "SELECT organisation_id, settings->'nurseryRhymeAudio' AS audio FROM organisation_settings WHERE settings ? 'nurseryRhymeAudio'"
    ).catch(() => []);
    const audio = {};
    rows.forEach((row) => {
      if (row && plainObject(row.audio) && String(row.organisation_id) !== String(ctx.platformOrganisationId)) {
        Object.assign(audio, row.audio);
      }
    });
    rows.forEach((row) => {
      if (row && plainObject(row.audio) && String(row.organisation_id) === String(ctx.platformOrganisationId)) {
        Object.assign(audio, row.audio);
      }
    });
    const own = await readOrganisationSettings(ctx.db, ctx.organisationId);
    Object.assign(audio, plainObject(own.nurseryRhymeAudio));
    return { audio };
  }, { permission: ['curriculum.read.daycare', 'platform.settings.manage'], permissionMode: 'any' });

  router.patch('/nursery-rhyme-audio', async (ctx) => {
    const body = validate(ctx.body, {
      id: { type: 'string', min: 1, max: 120 },
      url: { type: 'string', min: 1, max: 500 }
    });
    if (!safeRhymeAudioUrl(body.url)) {
      fail('VALIDATION', [{ field: 'url', message: 'Enter a valid audio URL.' }]);
    }
    const settings = await readOrganisationSettings(ctx.db, ctx.platformOrganisationId);
    const map = plainObject(settings.nurseryRhymeAudio);
    map[body.id] = body.url;
    settings.nurseryRhymeAudio = map;
    await writeOrganisationSettings(ctx.db, ctx.platformOrganisationId, settings);
    await recordAudit(ctx.db, ctx, {
      action: 'nursery_rhyme.audio_shared', resourceType: 'organisation',
      resourceId: ctx.platformOrganisationId, metadata: { rhymeId: body.id }
    });
    return { audio: map };
  }, { permission: 'organisation.settings.manage' });

  router.delete('/nursery-rhyme-audio/:id', async (ctx) => {
    const id = String(ctx.params.id || '').slice(0, 120);
    const settings = await readOrganisationSettings(ctx.db, ctx.platformOrganisationId);
    const map = plainObject(settings.nurseryRhymeAudio);
    delete map[id];
    settings.nurseryRhymeAudio = map;
    await writeOrganisationSettings(ctx.db, ctx.platformOrganisationId, settings);
    return { audio: map };
  }, { permission: 'organisation.settings.manage' });

  router.get('/branches', async (ctx) => {
    let rows = await ctx.db.many(
      `SELECT b.*, (SELECT COUNT(*)::int FROM learners l WHERE l.branch_id = b.id AND l.status = 'enrolled') AS learner_count,
              (SELECT COUNT(*)::int FROM classrooms c WHERE c.branch_id = b.id AND c.status = 'active') AS classroom_count
       FROM branches b WHERE b.organisation_id = $1 ORDER BY b.name`, [ctx.organisationId]
    );
    if (!ctx.access.orgWide) rows = rows.filter((b) => ctx.access.branchIds.has(b.id));
    return rows;
  }, { permission: 'branches.read.daycare' });

  router.post('/branches', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 120 },
      slug: { type: 'string', min: 2, max: 100, regex: /^[a-z0-9-]+$/ },
      address: { type: 'string', max: 500, optional: true },
      contactEmail: { type: 'string', email: true, optional: true },
      contactPhone: { type: 'string', max: 50, optional: true },
      imageUrl: { type: 'string', max: 500, optional: true },
      openingTime: { type: 'string', max: 5, optional: true },
      closingTime: { type: 'string', max: 5, optional: true }
    });
    const branch = await ctx.db.one(
      `INSERT INTO branches (organisation_id, name, slug, address, contact_email, contact_phone, image_url, opening_time, closing_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [ctx.organisationId, body.name, body.slug, body.address || null, body.contactEmail || null,
        body.contactPhone || null, body.imageUrl || null, body.openingTime || '06:30', body.closingTime || '18:00']
    );
    await recordAudit(ctx.db, ctx, { action: 'branch.created', resourceType: 'branch', resourceId: branch.id, branchId: branch.id });
    ctx.status = 201;
    return branch;
  }, { permission: 'branches.manage.daycare' });

  router.patch('/branches/:id', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 120, optional: true },
      address: { type: 'string', max: 500, optional: true },
      contactEmail: { type: 'string', email: true, optional: true },
      contactPhone: { type: 'string', max: 50, optional: true },
      imageUrl: { type: 'string', max: 500, optional: true },
      openingTime: { type: 'string', max: 5, optional: true },
      closingTime: { type: 'string', max: 5, optional: true },
      status: { type: 'string', enum: ['active', 'inactive'], optional: true }
    });
    const branch = await ctx.db.one('SELECT * FROM branches WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!branch) throw new AppError('NOT_FOUND');
    if (!ctx.access.orgWide && !ctx.access.branchIds.has(branch.id)) throw new AppError('FORBIDDEN');
    await ctx.db.query(
      `UPDATE branches SET name = COALESCE($1,name), address = COALESCE($2,address),
        contact_email = COALESCE($3,contact_email), contact_phone = COALESCE($4,contact_phone),
        image_url = COALESCE($5,image_url), opening_time = COALESCE($6,opening_time), closing_time = COALESCE($7,closing_time),
        status = COALESCE($8,status), updated_at = now() WHERE id = $9`,
      [body.name || null, body.address || null, body.contactEmail || null, body.contactPhone || null,
        body.imageUrl || null, body.openingTime || null, body.closingTime || null, body.status || null, branch.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'branch.updated', resourceType: 'branch', resourceId: branch.id, branchId: branch.id });
    return ctx.db.one('SELECT * FROM branches WHERE id = $1', [branch.id]);
  }, { permission: 'branches.manage.daycare' });

  router.get('/classrooms', async (ctx) => {
    const branchId = ctx.query.branchId || null;
    const rows = await ctx.db.many(
      `SELECT c.*, b.name AS branch_name,
        (SELECT COUNT(*)::int FROM learners l WHERE l.classroom_id = c.id AND l.status = 'enrolled') AS enrolled,
        (SELECT COUNT(*)::int FROM staff_classrooms sc WHERE sc.classroom_id = c.id) AS staff_count
       FROM classrooms c JOIN branches b ON b.id = c.branch_id
       WHERE c.organisation_id = $1 AND ($2::uuid IS NULL OR c.branch_id = $2::uuid)
       ORDER BY b.name, c.name`,
      [ctx.organisationId, branchId]
    );
    let scoped = rows;
    if (!ctx.access.orgWide && !has(ctx, 'classrooms.manage.daycare')) {
      const allowed = await assignedClassroomIds(ctx);
      scoped = rows.filter((r) => allowed.includes(r.id));
    }
    return scoped.map((r) => ({ ...r, utilisation: r.configured_capacity ? Math.round((r.enrolled / r.configured_capacity) * 100) : 0 }));
  }, { permission: 'classrooms.read.daycare' });

  router.post('/classrooms', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      name: { type: 'string', min: 2, max: 100 },
      ageGroup: { type: 'string', min: 1, max: 60 },
      minAgeMonths: { type: 'number', min: 0, optional: true },
      maxAgeMonths: { type: 'number', min: 0, optional: true },
      configuredCapacity: { type: 'number', min: 0, max: 500 }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) throw new AppError('NOT_FOUND');
    const classroom = await ctx.db.one(
      `INSERT INTO classrooms (organisation_id, branch_id, name, age_group, min_age_months, max_age_months, configured_capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.organisationId, body.branchId, body.name, body.ageGroup, body.minAgeMonths || 0,
        body.maxAgeMonths || 72, body.configuredCapacity]
    );
    await recordAudit(ctx.db, ctx, { action: 'classroom.created', resourceType: 'classroom', resourceId: classroom.id, branchId: body.branchId });
    ctx.status = 201;
    return classroom;
  }, { permission: 'classrooms.manage.daycare' });

  router.patch('/classrooms/:id', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 100, optional: true },
      ageGroup: { type: 'string', min: 1, max: 60, optional: true },
      configuredCapacity: { type: 'number', min: 0, max: 500, optional: true },
      status: { type: 'string', enum: ['active', 'inactive'], optional: true }
    });
    const classroom = await ctx.db.one('SELECT * FROM classrooms WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!classroom) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `UPDATE classrooms SET name = COALESCE($1,name), age_group = COALESCE($2,age_group),
        configured_capacity = COALESCE($3,configured_capacity), status = COALESCE($4,status), updated_at = now()
       WHERE id = $5`,
      [body.name || null, body.ageGroup || null, body.configuredCapacity === undefined ? null : body.configuredCapacity,
        body.status || null, classroom.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'classroom.updated', resourceType: 'classroom', resourceId: classroom.id });
    return ctx.db.one('SELECT * FROM classrooms WHERE id = $1', [classroom.id]);
  }, { permission: 'classrooms.manage.daycare' });

  router.get('/dashboard', async (ctx) => {
    const date = today();
    // A report permission is not a pass to every domain. Only include a
    // section when the caller can also open the workspace it comes from.
    const can = {
      learners: has(ctx, 'learners.read.daycare') || has(ctx, 'learners.read.assigned'),
      staff: has(ctx, 'staff.read.daycare'),
      attendance: has(ctx, 'attendance.read.daycare') || has(ctx, 'attendance.read.assigned'),
      finance: has(ctx, 'finance.read.daycare') || has(ctx, 'finance.reports.daycare'),
      safety: has(ctx, 'safety.read.daycare'),
      admissions: has(ctx, 'admissions.read.daycare'),
      observations: has(ctx, 'assessments.read.daycare') || has(ctx, 'reports.read.daycare'),
      tasks: has(ctx, 'tasks.read.daycare')
    };
    const learners = can.learners ? await ctx.db.one(
      `SELECT COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'enrolled' THEN 1 ELSE 0 END)::int AS enrolled,
        SUM(CASE WHEN status = 'waitlisted' THEN 1 ELSE 0 END)::int AS waitlisted
       FROM learners WHERE organisation_id = $1`, [ctx.organisationId]
    ) : { total: 0, enrolled: 0, waitlisted: 0 };
    const staff = can.staff ? await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM staff_profiles WHERE organisation_id = $1 AND employment_status = 'active'`,
      [ctx.organisationId]
    ) : { total: 0 };
    const attendance = can.attendance ? await ctx.db.one(
      `SELECT COUNT(*)::int AS marked,
              SUM(CASE WHEN attendance_status IN ('present','late','collected') THEN 1 ELSE 0 END)::int AS present,
              SUM(CASE WHEN attendance_status = 'absent' THEN 1 ELSE 0 END)::int AS absent
       FROM learner_attendance WHERE organisation_id = $1 AND attendance_date = $2`,
      [ctx.organisationId, date]
    ) : { marked: 0, present: 0, absent: 0 };
    const finance = can.finance ? await ctx.db.one(
      `SELECT COALESCE(SUM(total_amount - amount_paid), 0)::float AS outstanding,
              COALESCE(SUM(amount_paid), 0)::float AS collected
       FROM invoices WHERE organisation_id = $1 AND status IN ('issued','partially_paid','overdue')`,
      [ctx.organisationId]
    ) : { outstanding: 0, collected: 0 };
    const incidents = can.safety ? await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM incidents
       WHERE organisation_id = $1 AND status <> 'closed'`, [ctx.organisationId]
    ) : { total: 0 };
    const tasks = can.tasks ? await ctx.db.many(
      `SELECT t.*, u.display_name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.organisation_id = $1 AND t.status IN ('open','in_progress','blocked')
       ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         t.due_at ASC LIMIT 6`,
      [ctx.organisationId]
    ) : [];
    const applications = can.admissions ? await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM admission_applications
       WHERE organisation_id = $1 AND status IN ('submitted','under_review')`, [ctx.organisationId]
    ) : { total: 0 };
    const observations = can.observations ? await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM learner_observations
       WHERE organisation_id = $1 AND observation_date > CURRENT_DATE - 7`, [ctx.organisationId]
    ) : { total: 0 };
    const upcoming = has(ctx, 'curriculum.read.daycare') ? await ctx.db.many(
      `SELECT sa.id, sa.title, sa.starts_at, sa.status, c.name AS classroom_name
       FROM scheduled_activities sa LEFT JOIN classrooms c ON c.id = sa.classroom_id
       WHERE sa.organisation_id = $1 AND sa.starts_at >= now() - interval '1 hour'
       ORDER BY sa.starts_at LIMIT 5`, [ctx.organisationId]
    ) : [];
    const attendanceTrend = can.attendance ? await ctx.db.many(
      `SELECT attendance_date,
        SUM(CASE WHEN attendance_status IN ('present','late','collected') THEN 1 ELSE 0 END)::int AS present,
        COUNT(*)::int AS marked
       FROM learner_attendance WHERE organisation_id = $1 AND attendance_date > CURRENT_DATE - 14
       GROUP BY attendance_date ORDER BY attendance_date`,
      [ctx.organisationId]
    ) : [];
    const revenueByMonth = can.finance ? await ctx.db.many(
      `SELECT issued_at, total_amount, amount_paid FROM invoices
       WHERE organisation_id = $1 AND issued_at IS NOT NULL`, [ctx.organisationId]
    ) : [];
    const monthMap = new Map();
    for (const invoice of revenueByMonth) {
      const month = new Date(invoice.issued_at).toISOString().slice(0, 7);
      const entry = monthMap.get(month) || { month, invoiced: 0, collected: 0 };
      entry.invoiced += Number(invoice.total_amount);
      entry.collected += Number(invoice.amount_paid);
      monthMap.set(month, entry);
    }
    const revenueSeries = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
    const alerts = [];
    if (can.attendance && attendance.marked === 0) alerts.push({ severity: 'warning', message: "Today's attendance register has not been started.", link: '#/app/learner-attendance' });
    if (can.finance && finance.outstanding > 0) alerts.push({ severity: 'info', message: `R${finance.outstanding.toFixed(2)} in fees is outstanding.`, link: '#/app/finance' });
    if (can.admissions && applications.total > 0) alerts.push({ severity: 'info', message: `${applications.total} application${applications.total === 1 ? '' : 's'} await${applications.total === 1 ? 's' : ''} review.`, link: '#/app/admissions' });
    return {
      date,
      learners,
      staff,
      attendance: { ...attendance, rate: attendance.marked ? Math.round((attendance.present / attendance.marked) * 100) : null },
      finance,
      incidents,
      tasks,
      applications,
      observations,
      upcoming,
      attendanceTrend,
      revenueByMonth: revenueSeries,
      alerts
    };
  }, { permission: 'reports.read.daycare' });

  router.get('/notifications', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query, { defaultSize: 20 });
    const total = await ctx.db.one('SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_user_id = $1', [ctx.user.id]);
    const rows = await ctx.db.many(
      `SELECT * FROM notifications WHERE recipient_user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [ctx.user.id, pageSize, offset]
    );
    const unread = await ctx.db.one(
      'SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL', [ctx.user.id]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    ctx.meta.unread = unread.total;
    return rows;
  }, { authenticated: true });

  router.post('/notifications/:id/read', async (ctx) => {
    await ctx.db.query('UPDATE notifications SET read_at = now() WHERE id = $1 AND recipient_user_id = $2',
      [ctx.params.id, ctx.user.id]);
    return { success: true };
  }, { authenticated: true });

  router.post('/notifications/read-all', async (ctx) => {
    await ctx.db.query('UPDATE notifications SET read_at = now() WHERE recipient_user_id = $1 AND read_at IS NULL', [ctx.user.id]);
    return { success: true };
  }, { authenticated: true });

  router.get('/notifications/unread-count', async (ctx) => {
    const row = await ctx.db.one(
      'SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL', [ctx.user.id]
    );
    return { unread: row.total };
  }, { authenticated: true });

  router.get('/search', async (ctx) => {
    const raw = (ctx.query.q || '').trim();
    if (raw.length < 2) return { learners: [], staff: [], pages: [] };
    const term = `%${raw}%`;
    let learners = [];
    if (has(ctx, 'learners.read.daycare') || has(ctx, 'learners.read.assigned')) {
      learners = await ctx.db.many(
        `SELECT id, first_name, last_name, learner_reference, classroom_id
         FROM learners WHERE organisation_id = $1
           AND (first_name ILIKE $2 OR last_name ILIKE $2 OR learner_reference ILIKE $2)
           AND status <> 'archived' LIMIT 8`,
        [ctx.organisationId, term]
      );
      if (!has(ctx, 'learners.read.daycare')) {
        const allowed = await assignedClassroomIds(ctx);
        learners = learners.filter((l) => allowed.includes(l.classroom_id));
      }
    }
    let staff = [];
    if (has(ctx, 'staff.read.daycare')) {
      staff = await ctx.db.many(
        `SELECT s.id, s.employee_reference, s.job_title, u.display_name
         FROM staff_profiles s JOIN users u ON u.id = s.user_id
         WHERE s.organisation_id = $1 AND (u.display_name ILIKE $2 OR s.employee_reference ILIKE $2)
         LIMIT 8`,
        [ctx.organisationId, term]
      );
    }
    const pages = [
      { label: 'Today', route: '#/app/today' },
      { label: 'Learners', route: '#/app/learners' },
      { label: 'Learner attendance', route: '#/app/learner-attendance' },
      { label: 'Curriculum', route: '#/app/curriculum' },
      { label: 'Assessments', route: '#/app/assessments' },
      { label: 'Finance', route: '#/app/finance' },
      { label: 'Reports', route: '#/app/reports' }
    ].filter((p) => p.label.toLowerCase().includes(raw.toLowerCase()));
    return { learners, staff, pages };
  }, { authenticated: true });

  router.get('/audit', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const action = ctx.query.action ? `%${ctx.query.action}%` : null;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM audit_events
       WHERE organisation_id = $1 AND ($2::text IS NULL OR action ILIKE $2)`,
      [ctx.organisationId, action]
    );
    const rows = await ctx.db.many(
      `SELECT ae.*, u.display_name AS actor_name FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id
       WHERE ae.organisation_id = $1 AND ($2::text IS NULL OR ae.action ILIKE $2)
       ORDER BY ae.occurred_at DESC LIMIT $3 OFFSET $4`,
      [ctx.organisationId, action, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return rows;
  }, { permission: 'audit.read.daycare' });

  router.get('/onboarding/checklist', async (ctx) => {
    const org = ctx.organisation;
    const counts = await ctx.db.one(
      `SELECT (SELECT COUNT(*)::int FROM branches WHERE organisation_id = $1) AS branches,
              (SELECT COUNT(*)::int FROM classrooms WHERE organisation_id = $1) AS classrooms,
              (SELECT COUNT(*)::int FROM staff_profiles WHERE organisation_id = $1) AS staff`,
      [ctx.organisationId]
    );
    const website = await ctx.db.one('SELECT status FROM website_configs WHERE organisation_id = $1', [ctx.organisationId]);
    const settings = await ctx.db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [ctx.organisationId]);
    const feePlan = await ctx.db.one('SELECT COUNT(*)::int AS total FROM fee_plans WHERE organisation_id = $1', [ctx.organisationId]);
    const items = [
      { key: 'organisation', label: 'Organisation details', complete: Boolean(org && org.legal_name) },
      { key: 'branch', label: 'First branch created', complete: counts.branches > 0 },
      { key: 'classrooms', label: 'Classrooms configured', complete: counts.classrooms > 0 },
      { key: 'fees', label: 'Fee plan configured', complete: feePlan.total > 0 },
      { key: 'staff', label: 'Staff invited', complete: counts.staff > 0 },
      { key: 'website', label: 'Public website published', complete: Boolean(website && website.status === 'published') },
      { key: 'settings', label: 'Operating hours configured', complete: Boolean(settings && settings.settings && settings.settings.operatingHours) }
    ];
    return { items, completed: items.filter((i) => i.complete).length, total: items.length };
  }, { permission: 'organisation.read.daycare' });
}

module.exports = { register, normaliseCustomRhymes };

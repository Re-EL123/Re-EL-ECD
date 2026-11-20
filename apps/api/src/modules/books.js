'use strict';

/**
 * Books in Teaching.
 *
 * Book Dash defaults (CC BY 4.0) are stored in the platform organisation's
 * settings so every centre receives them. Centres can add their own books,
 * and platform admins can publish more books for everyone. Only metadata and
 * short media-proxy URLs live here — the PDFs are stored in R2.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { hasPermission } = require('../../../../packages/auth/permissions');

const MAX_BOOKS = 1000;
const MEDIA_URL = /^\/api\/v1\/media\/object\?key=(?:shared(?:%2F|\/)|org(?:%2F|\/)[0-9a-f-]{36}(?:%2F|\/))/i;

function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeUrl(value, max) {
  const url = String(value || '').trim();
  if (!url || url.length > (max || 1000)) return '';
  if (/^https?:\/\//i.test(url) || MEDIA_URL.test(url)) return url;
  return '';
}
function cleanBook(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const book = {
    id: text(raw.id, 120) || require('node:crypto').randomUUID(),
    title: text(raw.title, 200),
    language: text(raw.language, 60) || 'English',
    description: text(raw.description, 600),
    theme: text(raw.theme, 80),
    author: text(raw.author, 120),
    illustrator: text(raw.illustrator, 120),
    designer: text(raw.designer, 120),
    editor: text(raw.editor, 120),
    sourceUrl: safeUrl(raw.sourceUrl, 1000),
    licence: text(raw.licence, 120) || 'CC BY 4.0',
    pdfUrl: safeUrl(raw.pdfUrl, 1000),
    coverUrl: safeUrl(raw.coverUrl, 1000),
    kind: raw.kind === 'custom' ? 'custom' : 'bookdash'
  };
  book.editions = (Array.isArray(raw.editions) ? raw.editions : []).map((e) => ({
    language: text(e && e.language, 60) || 'English',
    pdfUrl: safeUrl(e && e.pdfUrl, 1000),
    coverUrl: safeUrl(e && e.coverUrl, 1000)
  })).filter((e) => e.pdfUrl).slice(0, 40);
  if (!book.title || (!book.pdfUrl && !book.editions.length)) return null;
  if (!book.pdfUrl && book.editions.length) book.pdfUrl = book.editions[0].pdfUrl;
  if (!book.coverUrl && book.editions.length) {
    const withCover = book.editions.find((e) => e.coverUrl);
    book.coverUrl = withCover ? withCover.coverUrl : '';
  }
  return book;
}
async function readSettings(db, organisationId) {
  const row = await db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [organisationId]);
  return row && row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings) ? row.settings : {};
}
async function writeSettings(db, organisationId, settings) {
  const existing = await db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [organisationId]);
  if (existing) {
    await db.query('UPDATE organisation_settings SET settings = $1, updated_at = now() WHERE organisation_id = $2',
      [JSON.stringify(settings), organisationId]);
  } else {
    await db.query('INSERT INTO organisation_settings (organisation_id, settings) VALUES ($1,$2)',
      [organisationId, JSON.stringify(settings)]);
  }
}
function platform(ctx) {
  return hasPermission(ctx.access && ctx.access.permissions, 'platform.settings.manage');
}
function target(ctx) {
  return platform(ctx) ? ctx.platformOrganisationId : ctx.organisationId;
}

function register(router) {
  router.get('/books', async (ctx) => {
    const shared = await readSettings(ctx.db, ctx.platformOrganisationId);
    const isPlatformOrg = String(ctx.organisationId) === String(ctx.platformOrganisationId);
    const own = isPlatformOrg ? {} : await readSettings(ctx.db, ctx.organisationId);
    return {
      platform: Array.isArray(shared.books) ? shared.books : [],
      custom: Array.isArray(own.books) ? own.books : [],
      canPublish: platform(ctx)
    };
  }, { permission: ['organisation.read.daycare', 'platform.settings.manage'], permissionMode: 'any' });

  router.post('/books', async (ctx) => {
    const body = validate(ctx.body, { book: { type: 'object' } });
    const book = cleanBook(body && body.book);
    if (!book) fail('VALIDATION', [{ field: 'book', message: 'A title and a PDF are required.' }]);
    const orgId = target(ctx);
    const settings = await readSettings(ctx.db, orgId);
    const list = Array.isArray(settings.books) ? settings.books.slice() : [];
    list.push(book);
    settings.books = list.slice(-MAX_BOOKS);
    await writeSettings(ctx.db, orgId, settings);
    await recordAudit(ctx.db, ctx, {
      action: platform(ctx) ? 'book.published' : 'book.added', resourceType: 'book', resourceId: book.id,
      metadata: { title: book.title, language: book.language }
    });
    ctx.status = 201;
    return { book, platform: platform(ctx) };
  }, { permission: ['organisation.settings.manage', 'platform.settings.manage'], permissionMode: 'any' });

  router.post('/books/import', async (ctx) => {
    const body = validate(ctx.body, { books: { type: 'array' } });
    const books = (body.books || []).map(cleanBook).filter(Boolean);
    if (!books.length) fail('VALIDATION', [{ field: 'books', message: 'No valid books were supplied.' }]);
    const settings = await readSettings(ctx.db, ctx.platformOrganisationId);
    settings.books = books.slice(0, MAX_BOOKS);
    await writeSettings(ctx.db, ctx.platformOrganisationId, settings);
    await recordAudit(ctx.db, ctx, {
      action: 'book.imported', resourceType: 'book', metadata: { count: books.length }
    });
    return { count: books.length };
  }, { permission: 'platform.settings.manage' });

  router.patch('/books/:id', async (ctx) => {
    const body = validate(ctx.body, { book: { type: 'object' } });
    const orgId = target(ctx);
    const settings = await readSettings(ctx.db, orgId);
    const list = Array.isArray(settings.books) ? settings.books : [];
    const at = list.findIndex((b) => b && b.id === ctx.params.id);
    if (at === -1) fail('NOT_FOUND');
    const updated = cleanBook(Object.assign({}, list[at], body.book, { id: ctx.params.id }));
    if (!updated) fail('VALIDATION', [{ field: 'book', message: 'A title and a PDF are required.' }]);
    list[at] = updated;
    settings.books = list;
    await writeSettings(ctx.db, orgId, settings);
    return { book: updated };
  }, { permission: ['organisation.settings.manage', 'platform.settings.manage'], permissionMode: 'any' });

  router.delete('/books/:id', async (ctx) => {
    const orgId = target(ctx);
    const settings = await readSettings(ctx.db, orgId);
    const list = Array.isArray(settings.books) ? settings.books : [];
    settings.books = list.filter((b) => b && b.id !== ctx.params.id);
    await writeSettings(ctx.db, orgId, settings);
    await recordAudit(ctx.db, ctx, { action: 'book.deleted', resourceType: 'book', resourceId: ctx.params.id });
    return { success: true };
  }, { permission: ['organisation.settings.manage', 'platform.settings.manage'], permissionMode: 'any' });
}

module.exports = { register, cleanBook, MAX_BOOKS };

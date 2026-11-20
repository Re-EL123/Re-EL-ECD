'use strict';

/**
 * Import downloaded Book Dash ebook PDFs into Re-EL ECD.
 *
 * Usage:
 *   node scripts/import-bookdash.mjs /path/to/extracted-books
 *
 * The input directory needs a manifest.json produced when extracting the
 * Book Dash ebook zips. Each entry must have { book, lang, pdf, cover? }.
 * PDFs and covers are uploaded to R2 with the shared 'book' scope, then the
 * full catalogue is published for every tenant via POST /books/import.
 *
 * Book Dash books are CC BY 4.0. Creator credits, the Book Dash logo/link and
 * the licence are stored with every book and shown in the UI.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API = process.env.REEL_API_URL || 'https://re-el-ecd-api.vercel.app/api/v1';
const EMAIL = process.env.REEL_IMPORT_EMAIL || 'platform@re-el-ecd.local';
const PASSWORD = process.env.REEL_IMPORT_PASSWORD || 'Re-EL-Demo-2026!';

const LANG = {
  en_english: 'English', 'en-english': 'English', e_book_en_english: 'English',
  af_afrikaans: 'Afrikaans', 'af-afrikaans': 'Afrikaans',
  nr_ndebele: 'isiNdebele', nr_isindebele: 'isiNdebele',
  nso_sepedi: 'Sepedi', ss_siswati: 'SiSwati',
  st_sotho: 'Sesotho', 'st-LS_lesotho-sesotho': 'Sesotho',
  tn_setswana: 'Setswana', 'tn-setswana': 'Setswana',
  ts_xitsonga: 'Xitsonga', ve_tshivenda: 'Tshivenḓa',
  xh_xhosa: 'isiXhosa', xh_isixhosa: 'isiXhosa',
  zu_zulu: 'isiZulu', zu_isizulu: 'isiZulu'
};

const META = {
  'a-beautiful-day': {
    title: 'A Beautiful Day', description: 'It’s a beautiful day for a picnic. Everyone wants to join in the fun.',
    author: 'Elana Bregin', illustrator: 'Lindy Pelzl', designer: 'Raeesah Vawda', editor: '',
    themes: ['Family, friends and home', 'Adventure'], licence: 'CC BY 4.0'
  },
  'a-day-out': {
    title: 'A Day Out', description: 'Ruby and her family have a fun day at the beach.',
    author: 'Helen Brain', illustrator: 'El Marto', designer: 'Annika Brandow', editor: 'Margot Bertelsmann',
    themes: ['Adventure', 'Nature and our planet'], licence: 'CC BY 4.0'
  },
  'a-house-for-mouse': {
    title: 'A house for Mouse', description: 'Mouse is looking for a new house. Friendly animals offer to share their homes with him.',
    author: 'Michele Fry', illustrator: 'Amy Richards (Uzzell)', designer: 'Jennifer Jacobs', editor: '',
    themes: ['Animals', 'Family, friends and home'], licence: 'CC BY 4.0'
  },
  'a-tiny-seed': {
    title: 'A Tiny Seed', description: 'A little girl on the slopes of Mount Kenya knows the power of a tiny seed.',
    author: 'Nicola Rijsdijk', illustrator: 'Maya Marshak', designer: 'Tarryn-Anne Anderson', editor: '',
    themes: ['Nature and our planet', 'Powerful female characters'], licence: 'CC BY 4.0'
  },
  'amo-and-the-missing-mielies': {
    title: 'Amo and the missing mielies', description: 'Amo loves her mielie garden. One day the mielies start to disappear.',
    author: 'Makgethwa Phala', illustrator: 'Neil Badenhorst', designer: 'Luke Mateman', editor: 'David Mann',
    themes: ['Animals', 'Let’s learn!', 'Nature and our planet'], licence: 'CC BY 4.0'
  },
  'can-we-eat-a-rainbow': {
    title: 'Can we eat a rainbow?', description: 'Pabi and Boo want to eat a rainbow. Can they find one?',
    author: 'Marion Drew', illustrator: 'Kelly Brown', designer: 'Katlego Modubu', editor: 'Ester Levinrad',
    themes: ['Animals', 'Food and eating', 'Let’s learn!'], licence: 'CC BY 4.0'
  },
  'ga-mohana-the-hill-of-wonders': {
    title: 'Ga-Mohana – The Hill of Wonders', description: 'Luvo explores Ga-Mohana Hill and finds new creatures — and a surprise treasure.',
    author: 'Pelonomi Itumeleng', illustrator: 'Oratiloe Lebethe', designer: 'Bronwyn Webb', editor: 'David Mann',
    themes: ['Animals', 'Nature and our planet'], licence: 'CC BY 4.0'
  },
  'i-can-do-it': {
    title: 'I can do it!', description: 'Livhu is thankful for help, but sometimes she just wants to do things herself.',
    author: 'Wandile Mathe', illustrator: 'Elliot Taylor', designer: 'Terri Lourens', editor: 'Cherie Wright',
    themes: ['Emotions and life skills', 'Diversity and inclusivity'], licence: 'CC BY 4.0'
  },
  'khumos-big-trip': {
    title: 'Khumo’s Big Trip', description: 'Khumo, Mum and Dad are driving to Kimberley. What will they discover?',
    author: 'Mogale Sedibe', illustrator: 'Musonda Kabwe', designer: 'Tamsin Lotz', editor: 'Ester Levinrad',
    themes: ['Diversity and inclusivity', 'Adventure'], licence: 'CC BY 4.0'
  },
  'play-with-me': {
    title: 'Play with me', description: 'All Jabu wants to do is play diketo. But everyone is busy.',
    author: 'Sabina Mutangadura Seldon', illustrator: 'Heleen Steyn van der Merwe', designer: 'Jamie Calf', editor: 'David Mann',
    themes: ['Emotions and life skills', 'Family, friends and home', 'Let’s play!'], licence: 'CC BY 4.0'
  },
  'who-ate-my-hat': {
    title: 'Who ate my hat?', description: 'I love my hat. But who ate my hat?',
    author: 'Griffin Shea', illustrator: 'El Marto', designer: 'Thembelihle Radebe', editor: 'Tiffany Mac Sherry',
    themes: ['Animals', 'Emotions and life skills', 'Food and eating'], licence: 'CC BY 4.0'
  },
  'zuko-and-the-crying-tap': {
    title: 'Zuko and the crying tap', description: 'Zuko hears a tap tap tap outside his window. What could it be?',
    author: 'Sewela Langeni', illustrator: 'Linta Anish', designer: 'Heath White', editor: 'David Mann',
    themes: ['Emotions and life skills', 'Nature and our planet'], licence: 'CC BY 4.0'
  }
};

async function json(res, label) {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body && (body.error && body.error.message || body.message)) || res.statusText;
    throw new Error(label + ': ' + msg + ' (' + res.status + ')');
  }
  return body;
}

let cookie = '', csrf = '';
async function api(method, urlPath, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (body) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (csrf && !['GET', 'HEAD'].includes(method)) headers['x-csrf-token'] = csrf;
  const res = await fetch(API + urlPath, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });
  if (!cookie && res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
  const parsed = await json(res, method + ' ' + urlPath);
  if (parsed && parsed.data && parsed.data.csrfToken) csrf = parsed.data.csrfToken;
  return parsed;
}

let cache = {}, cachePath = '';
function saveCache() { fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2)); }
async function upload(file, lang) {
  const key = path.basename(file);
  if (cache[key]) return cache[key];
  const stat = fs.statSync(file);
  const mime = /\.pdf$/i.test(file) ? 'application/pdf'
    : /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const created = await api('POST', '/media/uploads', {
    filename: path.basename(file), contentType: mime, size: stat.size,
    scope: 'book', shared: true, ownerType: 'book_import'
  });
  const payload = created.data || {};
  const up = payload.upload || {};
  if (!up.url) throw new Error('No upload URL for ' + file);
  const put = await fetch(up.url, { method: 'PUT', headers: up.headers || {}, body: fs.readFileSync(file) });
  if (!put.ok) throw new Error('R2 rejected ' + file + ' (' + put.status + ')');
  const done = await api('POST', '/media/assets/' + encodeURIComponent(payload.asset.id) + '/complete', {});
  const asset = done.data || {};
  if (!asset.url) throw new Error('No media URL for ' + file);
  cache[key] = asset.url;
  saveCache();
  return asset.url;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('Usage: node scripts/import-bookdash.mjs /path/to/extracted-books');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  cachePath = path.join(dir, '.upload-cache.json');
  if (fs.existsSync(cachePath)) cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

  await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (!csrf) throw new Error('Login did not return a CSRF token.');
  console.log('Authenticated.');

  const grouped = new Map();
  for (const item of manifest) {
    if (!grouped.has(item.book)) grouped.set(item.book, []);
    grouped.get(item.book).push(item);
  }

  const books = [];
  for (const [slug, editions] of grouped) {
    const meta = META[slug] || { title: slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '), themes: [] };
    const uploaded = [];
    for (const edition of editions) {
      process.stdout.write('  ' + slug + ' / ' + edition.lang + ' ... ');
      const pdf = await upload(path.join(dir, edition.pdf), edition.lang);
      let cover = '';
      if (edition.cover && fs.existsSync(path.join(dir, edition.cover))) cover = await upload(path.join(dir, edition.cover), edition.lang);
      uploaded.push({ language: LANG[edition.lang] || edition.lang, pdfUrl: pdf, coverUrl: cover });
      console.log('ok');
    }
    uploaded.sort((a, b) => a.language.localeCompare(b.language));
    books.push({
      id: 'bookdash-' + slug,
      title: meta.title,
      description: meta.description || '',
      theme: (meta.themes || []).join(', '),
      author: meta.author || '', illustrator: meta.illustrator || '',
      designer: meta.designer || '', editor: meta.editor || '',
      sourceUrl: 'https://bookdash.org/books/' + slug + '/',
      licence: meta.licence || 'CC BY 4.0',
      kind: 'bookdash',
      editions: uploaded
    });
  }

  const result = await api('POST', '/books/import', { books });
  console.log('Imported', result.count, 'books (' + books.reduce((n, b) => n + b.editions.length, 0) + ' language editions).');

  const out = 'apps/web/src/books-data.js';
  fs.writeFileSync(out, "'use strict';\n/** Book Dash CC BY 4.0 defaults, imported " + new Date().toISOString() + ". */\n" +
    "(function () {\n  const R = window.Reel || (window.Reel = {});\n  R.bookDefaults = " + JSON.stringify(books, null, 2) + ";\n})();\n");
  console.log('Wrote', out);
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

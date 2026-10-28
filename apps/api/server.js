'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handle } = require('./src/app');
const db = require('../../packages/database');
const { seedCatalog } = require('../../packages/database/seeds/development');

const WEB_ROOT = path.join(__dirname, '..', 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const resolved = path.join(root, decoded);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end('Method not allowed');
    return;
  }
  let filePath = safeJoin(WEB_ROOT, pathname === '/' ? '/index.html' : pathname);
  if (!filePath) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // Single-page application fallback.
    if (path.extname(pathname)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    filePath = path.join(WEB_ROOT, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('The web application has not been built.');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  const isProduction = process.env.NODE_ENV === 'production';
  res.setHeader('Cache-Control', isProduction && ext !== '.html' ? 'public, max-age=3600' : 'no-cache');
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

async function ensureDatabase() {
  if (!process.env.DATABASE_URL) return { mode: 'in-memory' };
  const pool = await db.getPool();
  const applied = new Set();
  try {
    const rows = await pool.query('SELECT filename FROM schema_migrations');
    rows.rows.forEach((row) => applied.add(row.filename));
  } catch {
    // Table does not exist yet.
  }
  const pending = db.migrationFiles().filter((file) => !applied.has(file));
  if (pending.length) {
    console.log(JSON.stringify({ level: 'info', message: `Applying ${pending.length} database migration(s)` }));
    await db.runMigrations(pool);
  }
  await seedCatalog();
  return { mode: 'postgres', pending: pending.length };
}

async function main() {
  const port = Number(process.env.PORT || 4000);
  const database = await ensureDatabase();
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/api/') || url === '/api' || url.startsWith('/api?')) {
      handle(req, res);
      return;
    }
    if (url === '/healthz') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ status: 'ok', uptime: Math.floor(process.uptime()) }));
      return;
    }
    serveStatic(req, res, url.split('?')[0]);
  });
  server.listen(port, () => {
    console.log(JSON.stringify({
      level: 'info',
      message: 'Re-EL ECD API listening',
      port,
      database: database.mode,
      environment: process.env.NODE_ENV || 'development'
    }));
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'fatal', message: error.message }));
    process.exit(1);
  });
}

module.exports = { main, serveStatic };

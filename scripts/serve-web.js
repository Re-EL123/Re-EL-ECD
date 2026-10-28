'use strict';

/**
 * Serves only the static SPA (no API). Useful when the API runs elsewhere or
 * when previewing the public website bundle in isolation.
 */

const http = require('node:http');
const { serveStatic } = require('../apps/api/server');

const port = Number(process.env.WEB_PORT || process.env.PORT || 5173);

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url === '/healthz') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  serveStatic(req, res, url.split('?')[0]);
});

server.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', message: 'Re-EL ECD web preview listening', port }));
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

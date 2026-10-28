'use strict';

/**
 * Dependency-free lint pass. Runs `node --check` across every JavaScript file
 * and applies a small set of project rules (no eval, no committed secrets, no
 * debugger statements, no TODOs in shipped code).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', 'coverage', 'dist']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
}

walk(root);

const errors = [];
const warnings = [];

for (const file of files) {
  const relative = path.relative(root, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`${relative}: syntax error\n${String(error.stderr || error.message).split('\n').slice(0, 4).join('\n')}`);
    continue;
  }
  if (relative === 'scripts/lint.js') continue;
  const source = fs.readFileSync(file, 'utf8');
  if (/\beval\s*\(/.test(source)) errors.push(`${relative}: eval() is not allowed`);
  if (/\bdebugger\b/.test(source)) errors.push(`${relative}: debugger statement found`);
  if (/TODO|FIXME|XXX/.test(source) && !relative.startsWith('scripts/')) {
    warnings.push(`${relative}: contains TODO/FIXME marker`);
  }
  if (/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) {
    errors.push(`${relative}: contains a private key`);
  }
  if (/(postgres(ql)?:\/\/)[^\s'"]+:[^\s'"]+@/.test(source) && !relative.includes('.env')) {
    errors.push(`${relative}: contains a database URL with embedded credentials`);
  }
  if (relative.startsWith('apps/web/') && /console\.log\(/.test(source) && !relative.includes('/vendor/')) {
    warnings.push(`${relative}: console.log in browser code`);
  }
}

const report = { level: errors.length ? 'error' : 'info', files: files.length, errors, warnings };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);

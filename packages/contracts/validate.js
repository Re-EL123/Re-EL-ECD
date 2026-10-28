'use strict';

const { AppError } = require('./errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Tiny declarative validator. Returns a sanitised copy of the input and never
 * mutates the caller's object. Unknown keys are stripped so clients cannot
 * inject fields such as organisation_id into writes.
 */
function validate(input, schema) {
  const errors = [];
  const out = {};
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError('VALIDATION', [{ field: '_', message: 'A JSON object body is required.' }]);
  }
  for (const [field, rule] of Object.entries(schema)) {
    let value = input[field];
    if (value === undefined || value === null || value === '') {
      if (rule.default !== undefined) {
        out[field] = typeof rule.default === 'function' ? rule.default() : rule.default;
        continue;
      }
      if (rule.optional || rule.required === false) {
        if (value !== undefined) out[field] = null;
        continue;
      }
      errors.push({ field, message: rule.message || `${field} is required.` });
      continue;
    }
    const result = coerce(value, rule, field, errors);
    if (result.ok) out[field] = result.value;
  }
  if (errors.length) throw new AppError('VALIDATION', errors);
  return out;
}

function coerce(value, rule, field, errors) {
  const add = (message) => errors.push({ field, message });
  if (rule.type === 'string' || !rule.type) {
    if (typeof value !== 'string') return add(`${field} must be text.`), { ok: false };
    value = rule.trim === false ? value : value.trim();
    if (rule.min !== undefined && value.length < rule.min) return add(rule.message || `${field} must be at least ${rule.min} characters.`), { ok: false };
    if (rule.max !== undefined && value.length > rule.max) return add(rule.message || `${field} must be at most ${rule.max} characters.`), { ok: false };
    if (rule.email && !EMAIL_RE.test(value)) return add(rule.message || `${field} must be a valid email address.`), { ok: false };
    if (rule.uuid && !UUID_RE.test(value)) return add(rule.message || `${field} must be a valid identifier.`), { ok: false };
    if (rule.date && !DATE_RE.test(value)) return add(rule.message || `${field} must be a date in YYYY-MM-DD format.`), { ok: false };
    if (rule.datetime && Number.isNaN(Date.parse(value))) return add(`${field} must be a valid date-time.`), { ok: false };
    if (rule.regex && !rule.regex.test(value)) return add(rule.message || `${field} has an invalid format.`), { ok: false };
    if (rule.enum && !rule.enum.includes(value)) return add(rule.message || `${field} must be one of: ${rule.enum.join(', ')}.`), { ok: false };
    return { ok: true, value };
  }
  if (rule.type === 'number' || rule.type === 'integer') {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return add(`${field} must be a number.`), { ok: false };
    if (rule.type === 'integer' && !Number.isInteger(num)) return add(`${field} must be a whole number.`), { ok: false };
    if (rule.min !== undefined && num < rule.min) return add(`${field} must be at least ${rule.min}.`), { ok: false };
    if (rule.max !== undefined && num > rule.max) return add(`${field} must be at most ${rule.max}.`), { ok: false };
    return { ok: true, value: num };
  }
  if (rule.type === 'boolean') {
    if (typeof value === 'boolean') return { ok: true, value };
    if (value === 'true' || value === 1 || value === '1') return { ok: true, value: true };
    if (value === 'false' || value === 0 || value === '0') return { ok: true, value: false };
    return add(`${field} must be true or false.`), { ok: false };
  }
  if (rule.type === 'array') {
    if (!Array.isArray(value)) return add(`${field} must be a list.`), { ok: false };
    if (rule.max !== undefined && value.length > rule.max) return add(`${field} has too many entries.`), { ok: false };
    const items = [];
    for (const entry of value) {
      if (rule.of === 'string') {
        if (typeof entry !== 'string') return add(`${field} must only contain text values.`), { ok: false };
        items.push(entry.trim());
      } else if (rule.of === 'number') {
        const n = Number(entry);
        if (!Number.isFinite(n)) return add(`${field} must only contain numbers.`), { ok: false };
        items.push(n);
      } else if (rule.of === 'uuid') {
        if (typeof entry !== 'string' || !UUID_RE.test(entry)) return add(`${field} must only contain identifiers.`), { ok: false };
        items.push(entry);
      } else {
        items.push(entry);
      }
    }
    return { ok: true, value: items };
  }
  if (rule.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return add(`${field} must be an object.`), { ok: false };
    return { ok: true, value };
  }
  return { ok: true, value };
}

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);
const isEmail = (value) => typeof value === 'string' && EMAIL_RE.test(value);

/** Prevents CSV formula injection in exported files. */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'number') return text;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

module.exports = { validate, isUuid, isEmail, csvCell, UUID_RE, EMAIL_RE };

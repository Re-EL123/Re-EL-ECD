'use strict';

/**
 * Organisation branding.
 *
 * A theme is a small, validated palette. Storing tokens rather than arbitrary
 * CSS keeps a tenant from injecting styles, and lets the same theme drive the
 * workspace, the public website and email accents.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const TOKEN_KEYS = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'onPrimary'];
const DEFAULT_THEME = {
  primary: '#3A7D44',
  secondary: '#C97A12',
  accent: '#3D8FAE',
  background: '#F7F5EF',
  surface: '#FFFFFF',
  text: '#1C2A1E',
  onPrimary: '#FFFFFF'
};

function isHex(value) {
  return typeof value === 'string' && HEX.test(value);
}

function normalizeColour(value) {
  return isHex(value) ? value.toUpperCase() : null;
}

/**
 * Accept only known keys with valid hex values. Unknown keys are dropped rather
 * than stored, so the database cannot accumulate junk that later leaks into CSS.
 */
function normalizeTokens(input) {
  const source = input && typeof input === 'object' ? input : {};
  const tokens = {};
  for (const key of TOKEN_KEYS) {
    const value = normalizeColour(source[key]);
    if (value) tokens[key] = value;
  }
  return tokens;
}

function mergeTokens(...sources) {
  return Object.assign({}, DEFAULT_THEME, ...sources.map(normalizeTokens));
}

/**
 * Pick black or white for text drawn on top of a colour, using the WCAG
 * relative-luminance formula. Yellow brands get dark text instead of unreadable
 * white labels.
 */
function onColour(hex) {
  const value = normalizeColour(hex);
  if (!value) return '#FFFFFF';
  const channels = [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.55 ? '#142016' : '#FFFFFF';
}

function themeFromOrganisation(organisation) {
  const tokens = normalizeTokens(organisation && organisation.theme_tokens);
  const primary = normalizeColour(organisation && organisation.primary_colour) || tokens.primary || DEFAULT_THEME.primary;
  const secondary = normalizeColour(organisation && organisation.secondary_colour) || tokens.secondary || DEFAULT_THEME.secondary;
  const accent = normalizeColour(organisation && organisation.accent_colour) || tokens.accent || DEFAULT_THEME.accent;
  const merged = mergeTokens(tokens, { primary, secondary, accent });
  merged.onPrimary = onColour(primary);
  return merged;
}

module.exports = {
  HEX,
  TOKEN_KEYS,
  DEFAULT_THEME,
  isHex,
  normalizeColour,
  normalizeTokens,
  mergeTokens,
  onColour,
  themeFromOrganisation
};

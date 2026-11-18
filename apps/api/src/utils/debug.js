'use strict';

/**
 * Debug helpers are only ever allowed in the local test harness
 * (NODE_ENV=test) or when explicitly opted in with ALLOW_DEBUG_TOKENS=true.
 * Staging or any deployed environment must never see them.
 */
function debugTokensEnabled() {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_DEBUG_TOKENS === 'true';
}

module.exports = { debugTokensEnabled };

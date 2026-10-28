'use strict';

const ERROR_CODES = {
  UNAUTHENTICATED: { status: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
  INVALID_CREDENTIALS: { status: 401, code: 'INVALID_CREDENTIALS', message: 'The email address or password is incorrect.' },
  SESSION_EXPIRED: { status: 401, code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' },
  ACCOUNT_SUSPENDED: { status: 403, code: 'ACCOUNT_SUSPENDED', message: 'This account is suspended.' },
  FORBIDDEN: { status: 403, code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' },
  TENANT_MISMATCH: { status: 403, code: 'TENANT_MISMATCH', message: 'The requested resource belongs to another organisation.' },
  NOT_FOUND: { status: 404, code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  VALIDATION: { status: 422, code: 'VALIDATION_ERROR', message: 'The submitted data is invalid.' },
  CONFLICT: { status: 409, code: 'CONFLICT', message: 'The action conflicts with the current state of the record.' },
  RATE_LIMITED: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  CSRF: { status: 403, code: 'CSRF_FAILED', message: 'The security token is missing or invalid.' },
  DEPENDENCY: { status: 502, code: 'DEPENDENCY_FAILED', message: 'A downstream service is unavailable.' },
  INTERNAL: { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }
};

class AppError extends Error {
  constructor(key, details, messageOverride) {
    const spec = ERROR_CODES[key] || ERROR_CODES.INTERNAL;
    super(messageOverride || spec.message);
    this.name = 'AppError';
    this.key = key;
    this.status = spec.status;
    this.code = spec.code;
    this.details = details || null;
  }
}

const fail = (key, details, message) => {
  throw new AppError(key, details, message);
};

const assert = (condition, key, details, message) => {
  if (!condition) throw new AppError(key, details, message);
};

module.exports = { ERROR_CODES, AppError, fail, assert };

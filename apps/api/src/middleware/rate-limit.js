'use strict';

const buckets = new Map();

/**
 * Fixed-window rate limiter. Suitable for a single serverless instance and as a
 * first line of defence; production should additionally use an edge/WAF limiter.
 */
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  if (bucket.count > limit) {
    return { allowed: false, remaining, retryAfter: Math.ceil((bucket.reset - now) / 1000) };
  }
  return { allowed: true, remaining, retryAfter: 0 };
}

function resetRateLimit(keyPrefix) {
  for (const key of buckets.keys()) if (key.startsWith(keyPrefix)) buckets.delete(key);
}

module.exports = { rateLimit, resetRateLimit };

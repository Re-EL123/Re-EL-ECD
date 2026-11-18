'use strict';

const buckets = new Map();
let lastSweep = 0;

/**
 * Fixed-window rate limiter. Suitable for a single instance and as a first
 * line of defence; production MUST additionally use an edge/WAF limiter
 * (Vercel Firewall, Cloudflare) since serverless instances are ephemeral and
 * each gets its own map. Keys are swept lazily so the map cannot grow
 * without bound on a long-lived process.
 */
function sweep(now) {
  if (now - lastSweep < 60 * 1000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.reset <= now) buckets.delete(key);
  }
}

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  sweep(now);
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

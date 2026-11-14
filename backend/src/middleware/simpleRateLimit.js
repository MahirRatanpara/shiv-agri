/**
 * Minimal in-memory fixed-window rate limiter for unauthenticated public endpoints.
 *
 * Keyed on nginx's X-Real-IP ($remote_addr — not client-spoofable, unlike the left-most
 * X-Forwarded-For entry). Per-process only, which is fine as a brute-force speed bump on top
 * of nginx's own zone limit; it is not a security boundary (the tokens are 192-bit random).
 */
const logger = require('../utils/logger');

function simpleRateLimit({ windowMs, max, name }) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  if (typeof sweep.unref === 'function') sweep.unref();

  return (req, res, next) => {
    const key = req.get('X-Real-IP') || req.ip || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      if (entry.count === max + 1) {
        logger.warn(`[RateLimit:${name}] limit hit ip=${key} max=${max}/${Math.round(windowMs / 1000)}s path=${req.path}`);
      }
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, error: 'Too many requests. Please try again shortly.' });
    }
    next();
  };
}

module.exports = { simpleRateLimit };

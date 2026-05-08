const https = require('https');
const http = require('http');
const { URL } = require('url');
const logger = require('./logger');

/**
 * Synchronously extract { latitude, longitude } from a Google Maps URL.
 *
 * Handles the URL shapes we get directly (no network call required):
 *   - https://www.google.com/maps?q=23.0225,72.5714
 *   - https://maps.google.com/?ll=23.0225,72.5714
 *   - https://www.google.com/maps/place/.../@23.0225,72.5714,15z
 *   - "23.0225,72.5714" (raw coordinate paste)
 *
 * Shortened share URLs (maps.app.goo.gl, goo.gl/maps) need to be resolved
 * via the redirect first — use resolveAndParseLatLng for those.
 */
function parseLatLngFromMapUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;

  const patterns = [
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidLatLng(lat, lng)) {
        return { latitude: lat, longitude: lng };
      }
    }
  }

  return null;
}

const SHORTLINK_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'g.co'
]);

function isShortlink(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SHORTLINK_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * Follow up to `maxHops` redirects, returning the final URL (or the last URL
 * we got even if it didn't redirect further). Uses HEAD; falls back to GET on
 * 405/501.
 */
function followRedirects(url, maxHops = 6, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let hops = 0;

    const step = (currentUrl, method) => {
      if (hops >= maxHops) return resolve(currentUrl);

      let parsed;
      try {
        parsed = new URL(currentUrl);
      } catch (err) {
        return reject(err);
      }

      const transport = parsed.protocol === 'http:' ? http : https;
      const req = transport.request({
        method,
        host: parsed.host,
        path: `${parsed.pathname}${parsed.search || ''}`,
        // Some Google endpoints serve a different page to non-browser UAs
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ShivAgriBot/1.0)',
          'Accept': '*/*'
        }
      }, (res) => {
        // Drain so the socket can be reused / closed
        res.resume();

        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          hops += 1;
          const next = new URL(res.headers.location, currentUrl).toString();
          return step(next, 'HEAD');
        }

        if ((status === 405 || status === 501) && method === 'HEAD') {
          return step(currentUrl, 'GET');
        }

        resolve(currentUrl);
      });

      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Redirect resolution timed out after ${timeoutMs}ms`));
      });
      req.end();
    };

    step(url, 'HEAD');
  });
}

/**
 * Async wrapper that handles shortened share URLs by following the redirect
 * and then parsing the resolved URL. Falls back to the sync parser for
 * already-direct URLs. Returns null if we can't get coordinates.
 */
async function resolveAndParseLatLng(input) {
  const direct = parseLatLngFromMapUrl(input);
  if (direct) return direct;

  if (typeof input !== 'string' || !isShortlink(input.trim())) return null;

  try {
    const resolved = await followRedirects(input.trim());
    return parseLatLngFromMapUrl(resolved);
  } catch (err) {
    logger?.warn?.(`Failed to resolve map shortlink: ${err.message}`);
    return null;
  }
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90
    && lng >= -180 && lng <= 180;
}

module.exports = {
  parseLatLngFromMapUrl,
  resolveAndParseLatLng,
  isShortlink,
  isValidLatLng
};

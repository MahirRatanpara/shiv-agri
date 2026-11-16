import { UrlMatchResult, UrlSegment } from '@angular/router';

/** Share-link tokens are 24 random bytes in base64url (32 chars); allow some slack. */
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * Pulls the token out of a report-link path, tolerating the shapes the WhatsApp URL button
 * can produce on top of the canonical `/r/<token>`:
 *  • `/r/r/<token>`: the template's base URL already ends in `/r/` and we send `r/<token>`.
 *  • `/r%2F<token>`: Meta URL-encodes the `/` inside the `{{1}}` button variable.
 * Returns null for anything else.
 */
export function extractReportToken(path: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  const parts = decoded.split('/').filter(Boolean);
  if (parts[0] !== 'r') return null;
  const rest = parts[1] === 'r' ? parts.slice(2) : parts.slice(1);
  return rest.length === 1 && TOKEN.test(rest[0]) ? rest[0] : null;
}

/** Router matcher for the public report page; exposes the token as the `token` param. */
export function reportLinkMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  // Angular decodes each segment, so `/r%2F<token>` arrives as ONE segment `r/<token>`.
  const token = extractReportToken(segments.map((s) => s.path).join('/'));
  if (!token) return null;
  return { consumed: segments, posParams: { token: new UrlSegment(token, {}) } };
}

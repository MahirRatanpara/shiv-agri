/**
 * Native app version policy, read once at startup from environment variables.
 *
 * This is the single source of truth for "which app builds may talk to this API".
 * It drives two things:
 *
 *   1. GET /api/app/version — the client asks what the current policy is, and shows
 *      a blocking "update required" screen when its own build is below the minimum.
 *   2. The enforceMinAppVersion middleware — the API itself refuses requests from a
 *      build below the minimum with 426 Upgrade Required. This is what makes the
 *      update *enforced* rather than merely advertised: a user who dismisses or
 *      bypasses the client screen still cannot use the app.
 *
 * Version comparison uses Android's `versionCode` (a monotonically increasing
 * integer in frontend/android/app/build.gradle), never versionName — "5.10.0" vs
 * "5.9.0" string comparison is a trap, integers are not.
 *
 * Environment variables:
 *   ANDROID_MIN_VERSION_CODE     Builds BELOW this are blocked outright. Raise this
 *                                to force every user onto a newer build. Default 0
 *                                (nothing blocked) so the gate is inert until you
 *                                deliberately turn it on.
 *   ANDROID_LATEST_VERSION_CODE  The newest build available. Used to offer an
 *                                optional ("a new version is available") update to
 *                                users who are above the minimum but behind latest.
 *   ANDROID_LATEST_VERSION_NAME  Human-readable name of that build, e.g. "5.1.0".
 *   ANDROID_UPDATE_URL           Where the update screen sends the user. A Play
 *                                Store listing, or a direct .apk URL when you
 *                                distribute outside the store.
 *   ANDROID_UPDATE_MESSAGE       Body text shown on the blocking screen.
 *
 * iOS uses the same shape via the IOS_* variables; the gate is per-platform so you
 * can force an Android rollout without touching iOS.
 */

const parseIntOr = (value, defaultValue) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const DEFAULT_FORCED_MESSAGE =
  'A required update is available. Please update to the latest version to continue using Shiv Agri.';
const DEFAULT_OPTIONAL_MESSAGE = 'A new version of Shiv Agri is available.';

const buildPolicy = (prefix, defaultUpdateUrl) => ({
  // Below this -> hard block (426 from the API, non-dismissible client screen).
  minVersionCode: parseIntOr(process.env[`${prefix}_MIN_VERSION_CODE`], 0),
  // Newest build that exists. Below this but at/above the minimum -> soft prompt.
  latestVersionCode: parseIntOr(process.env[`${prefix}_LATEST_VERSION_CODE`], 0),
  latestVersionName: (process.env[`${prefix}_LATEST_VERSION_NAME`] || '').trim(),
  updateUrl: (process.env[`${prefix}_UPDATE_URL`] || defaultUpdateUrl).trim(),
  forcedMessage: (process.env[`${prefix}_UPDATE_MESSAGE`] || DEFAULT_FORCED_MESSAGE).trim(),
  optionalMessage: DEFAULT_OPTIONAL_MESSAGE
});

const appVersionPolicy = {
  android: buildPolicy('ANDROID', 'https://play.google.com/store/apps/details?id=com.shivagri.app'),
  ios: buildPolicy('IOS', 'https://apps.apple.com/app/id000000000')
};

/**
 * Resolve the policy for a platform string sent by the client.
 * Unknown platforms (including "web") return null — the gate only applies to
 * native builds, since the web app is always served fresh from the CDN.
 */
const policyFor = (platform) => {
  const key = String(platform || '').trim().toLowerCase();
  if (key === 'android') return appVersionPolicy.android;
  if (key === 'ios') return appVersionPolicy.ios;
  return null;
};

/**
 * Classify a client build against the policy.
 * @returns {'unknown'|'blocked'|'outdated'|'current'}
 *   unknown  — not a native client, or it sent no usable version code
 *   blocked  — below the minimum; must update before it may do anything
 *   outdated — usable, but a newer build exists
 *   current  — up to date
 */
const classifyClient = (platform, versionCode) => {
  const policy = policyFor(platform);
  if (!policy) return { status: 'unknown', policy: null };

  const code = parseIntOr(versionCode, NaN);
  if (!Number.isFinite(code)) return { status: 'unknown', policy };

  if (policy.minVersionCode > 0 && code < policy.minVersionCode) {
    return { status: 'blocked', policy, versionCode: code };
  }
  if (policy.latestVersionCode > 0 && code < policy.latestVersionCode) {
    return { status: 'outdated', policy, versionCode: code };
  }
  return { status: 'current', policy, versionCode: code };
};

const describe = (name, policy) =>
  `[appVersion] ${name}: min=${policy.minVersionCode || 'off'} latest=${policy.latestVersionCode || 'unset'}` +
  `${policy.latestVersionName ? ` (${policy.latestVersionName})` : ''}`;

console.log(describe('android', appVersionPolicy.android));
console.log(describe('ios', appVersionPolicy.ios));

module.exports = { appVersionPolicy, policyFor, classifyClient };

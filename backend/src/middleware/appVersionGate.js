/**
 * Server-side enforcement of the minimum native app version.
 *
 * The client also shows a blocking update screen, but that alone is not
 * enforcement — it lives in code the old build already shipped, so it can only be
 * as strict as that old build happened to be. This middleware is the part that
 * actually holds: an app below ANDROID_MIN_VERSION_CODE gets 426 Upgrade Required
 * on every API call, so there is nothing useful it can do regardless of what its
 * UI decides to show.
 *
 * Clients identify themselves with two headers, set by the Angular auth
 * interceptor on native builds only:
 *   X-App-Platform      "android" | "ios"
 *   X-App-Version-Code  the integer Android versionCode / iOS build number
 *
 * A request without those headers is treated as the web app and passes through:
 * the browser always loads the current bundle, so there is no stale build to gate.
 * This also means the gate cannot be escaped by stripping the headers — doing so
 * just makes a native client look like the web client, which is served the current
 * code anyway. If you later need to harden that, pin the headers to the attested
 * app signature rather than trusting the client.
 */

const { classifyClient } = require('../config/appVersion');

// Endpoints that must stay reachable from a blocked build, or the update screen
// has no way to find out what to tell the user.
const ALWAYS_ALLOWED = ['/app/version', '/health'];

const enforceMinAppVersion = (req, res, next) => {
  if (ALWAYS_ALLOWED.some((path) => req.path === path || req.path.startsWith(`${path}/`))) {
    return next();
  }

  const platform = req.get('X-App-Platform');
  const versionCode = req.get('X-App-Version-Code');
  const { status, policy, versionCode: code } = classifyClient(platform, versionCode);

  if (status !== 'blocked') {
    return next();
  }

  console.warn(
    `[appVersion] refused ${platform} build ${code} (< min ${policy.minVersionCode}) for ${req.method} ${req.originalUrl}`
  );

  // 426 is the correct status here: the request is well-formed and may even be
  // authenticated, but the protocol the client speaks is no longer accepted.
  return res.status(426).json({
    error: 'UPGRADE_REQUIRED',
    message: policy.forcedMessage,
    minVersionCode: policy.minVersionCode,
    latestVersionCode: policy.latestVersionCode,
    latestVersionName: policy.latestVersionName,
    updateUrl: policy.updateUrl
  });
};

module.exports = { enforceMinAppVersion };

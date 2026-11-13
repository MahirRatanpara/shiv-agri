/**
 * Public app-version endpoint. Deliberately unauthenticated and exempt from the
 * version gate — a blocked build must still be able to ask why it is blocked and
 * where to get the update.
 */

const express = require('express');
const { classifyClient, policyFor } = require('../config/appVersion');

const router = express.Router();

/**
 * GET /api/app/version?platform=android&versionCode=5
 *
 * Headers (X-App-Platform / X-App-Version-Code) are used when the query string
 * omits them, so the client can rely on the interceptor alone.
 *
 * Response:
 *   {
 *     updateRequired: boolean,   // hard block — show a non-dismissible screen
 *     updateAvailable: boolean,  // soft prompt — a newer build exists
 *     minVersionCode, latestVersionCode, latestVersionName, updateUrl, message
 *   }
 */
router.get('/version', (req, res) => {
  const platform = req.query.platform || req.get('X-App-Platform');
  const versionCode = req.query.versionCode || req.get('X-App-Version-Code');

  const policy = policyFor(platform);
  if (!policy) {
    // Web, or an unrecognised platform: nothing to enforce.
    return res.json({ updateRequired: false, updateAvailable: false });
  }

  const { status } = classifyClient(platform, versionCode);

  res.json({
    updateRequired: status === 'blocked',
    updateAvailable: status === 'blocked' || status === 'outdated',
    minVersionCode: policy.minVersionCode,
    latestVersionCode: policy.latestVersionCode,
    latestVersionName: policy.latestVersionName,
    updateUrl: policy.updateUrl,
    message: status === 'blocked' ? policy.forcedMessage : policy.optionalMessage
  });
});

module.exports = router;

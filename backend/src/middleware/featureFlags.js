const { features } = require('../config/features');

/**
 * Blocks a route when OTP login is disabled (Google-only mode).
 * Defense-in-depth: the frontend hides OTP UI, but the API must refuse too so the
 * endpoints can't be hit directly while the feature is off.
 */
const requireOtpEnabled = (req, res, next) => {
  if (!features.otpLoginEnabled) {
    return res.status(403).json({
      error: 'OTP login is currently disabled.',
      code: 'OTP_DISABLED'
    });
  }
  next();
};

module.exports = { requireOtpEnabled };

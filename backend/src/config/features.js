/**
 * Central feature flags, read once at startup from environment variables.
 *
 * OTP_LOGIN_ENABLED
 *   true  (default) — phone + WhatsApp OTP login is active. The login screen shows the
 *                     phone tab; new Google users attach + OTP-verify their phone.
 *   false           — "Google-only" mode. Phone OTP login is hidden, the OTP endpoints
 *                     are disabled, and new Google users enter their phone number
 *                     MANUALLY (no OTP) in the complete-profile step. Use this while the
 *                     WhatsApp Business number / template isn't production-ready.
 */

const parseBool = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).trim().toLowerCase() === 'true';
};

const features = {
  otpLoginEnabled: parseBool(process.env.OTP_LOGIN_ENABLED, true)
};

// Log the resolved flags once at boot so the active mode is obvious in the logs.
console.log(`[features] OTP login ${features.otpLoginEnabled ? 'ENABLED (phone + WhatsApp OTP)' : 'DISABLED (Google-only, manual phone entry)'}`);

module.exports = { features };

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
 *
 * INVITE_ONLY_LOGIN
 *   true  (default) — only pre-provisioned accounts may sign in. Google sign-in and
 *                     phone OTP both refuse an identity with no User record, and the
 *                     OTP request is refused BEFORE any WhatsApp message is sent.
 *                     Accounts are created by an admin (User Management → Add User)
 *                     or implicitly by registering a farm against a phone/email.
 *   false           — open sign-up: a first-time Google or phone-OTP login creates the
 *                     account automatically, as the system behaved originally.
 *
 *   This gate does NOT affect the authenticated profile phone-attach flow
 *   (`/api/auth/profile/phone/*`). A signed-in user with no phone yet can always
 *   verify one — that number is new to the system by definition.
 */

const parseBool = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).trim().toLowerCase() === 'true';
};

const features = {
  otpLoginEnabled: parseBool(process.env.OTP_LOGIN_ENABLED, true),
  inviteOnlyLogin: parseBool(process.env.INVITE_ONLY_LOGIN, true)
};

// Log the resolved flags once at boot so the active mode is obvious in the logs.
console.log(`[features] OTP login ${features.otpLoginEnabled ? 'ENABLED (phone + WhatsApp OTP)' : 'DISABLED (Google-only, manual phone entry)'}`);
console.log(`[features] Sign-in ${features.inviteOnlyLogin ? 'INVITE-ONLY (unregistered identities refused)' : 'OPEN (first sign-in auto-creates an account)'}`);

module.exports = { features };

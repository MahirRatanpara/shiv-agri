/**
 * Shared OTP delivery — used by both the phone-login flow (otpAuthController)
 * and the profile phone-attach flow (authController).
 *
 * Delivery mode (OTP_DELIVERY_MODE):
 *   "template"    — production. Delegates to the notification-service /otp endpoint, which
 *                   itself picks WhatsApp vs SMS (MSG91) via its `notification.otp.channel`
 *                   property — so the channel switch lives in one place, server-side.
 *   "hello_world" — dev. Sends the no-approval hello_world template AND prints the code.
 *   "console"     — pure dev. Prints the code to stdout, no provider call.
 *                   Auto-upgraded to "template" when NODE_ENV=production.
 */

const notificationClient = require('./notificationClient');

const RAW_DELIVERY_MODE = (process.env.OTP_DELIVERY_MODE || 'template').toLowerCase();
const OTP_DELIVERY_MODE = (RAW_DELIVERY_MODE === 'console' && process.env.NODE_ENV === 'production')
  ? 'template'
  : RAW_DELIVERY_MODE;

if (RAW_DELIVERY_MODE === 'console' && process.env.NODE_ENV === 'production') {
  console.warn('[otp] OTP_DELIVERY_MODE="console" refused in production — falling back to "template".');
}
console.log(`[otp] OTP delivery mode: ${OTP_DELIVERY_MODE}`);

const printOtpToConsole = ({ requestId, e164, code, ttlSeconds }) => {
  console.log(`\n  ╭───────────────────────────────────────────────────────╮`);
  console.log(`  │  DEV OTP — do not use in production                    │`);
  console.log(`  │  [${requestId}]`);
  console.log(`  │  Phone: ${e164}`);
  console.log(`  │  Code:  ${code}   (expires in ${ttlSeconds}s)`);
  console.log(`  ╰───────────────────────────────────────────────────────╯\n`);
};

/**
 * Deliver an OTP to a phone. Throws on provider failure so the caller can roll back
 * the issued code. In "console"/"hello_world" modes the code is always printed first.
 */
const deliverOtp = async ({ e164, code, ttlSeconds, requestId }) => {
  if (OTP_DELIVERY_MODE === 'console') {
    printOtpToConsole({ requestId, e164, code, ttlSeconds });
    return;
  }

  if (OTP_DELIVERY_MODE === 'hello_world') {
    printOtpToConsole({ requestId, e164, code, ttlSeconds });
    try {
      await notificationClient.sendHelloWorldTemplate({ to: e164, requestId });
      console.log(`[${requestId}] hello_world template dispatched to ${e164} (read OTP from box above)`);
    } catch (sendErr) {
      console.warn(`[${requestId}] hello_world send failed (OTP still valid via console):`, sendErr.message, sendErr.body || '');
    }
    return;
  }

  // Default: production. The notification-service routes to WhatsApp or SMS by its own config.
  await notificationClient.sendOtp({ to: e164, code, requestId });
};

module.exports = { OTP_DELIVERY_MODE, deliverOtp };

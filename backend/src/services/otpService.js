/**
 * In-memory OTP service.
 *
 * Stores active OTPs in a Map keyed by normalized phone (digits only, country-code prefixed).
 * Also tracks per-phone rate-limit counters (codes-requested-in-rolling-hour).
 *
 * Policy (user-selected "stricter" but with 4-digit code as explicitly requested):
 *   - 4-digit numeric code
 *   - 3-minute expiry
 *   - max 3 verify attempts per code
 *   - 60-second resend cooldown
 *   - 3 OTPs per phone per rolling hour
 *
 * NOTE: in-memory — codes are lost on backend restart. Single-instance only.
 */

const crypto = require('crypto');

const OTP_LENGTH = 4;
const OTP_TTL_MS = 3 * 60 * 1000;          // 3 minutes
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN_MS = 60 * 1000;       // 60 seconds
const HOURLY_LIMIT = 3;                     // 3 codes / phone / rolling hour
const HOURLY_WINDOW_MS = 60 * 60 * 1000;

// phone -> { codeHash, expiresAt, attempts, issuedAt, requestId }
const activeOtps = new Map();

// phone -> [timestamp, ...] of recent issuances (last hour)
const issuanceLog = new Map();

const sweepIntervalRef = setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of activeOtps) {
    if (entry.expiresAt <= now) activeOtps.delete(phone);
  }
  for (const [phone, timestamps] of issuanceLog) {
    const recent = timestamps.filter((t) => now - t < HOURLY_WINDOW_MS);
    if (recent.length === 0) issuanceLog.delete(phone);
    else issuanceLog.set(phone, recent);
  }
}, 60 * 1000);
if (typeof sweepIntervalRef.unref === 'function') sweepIntervalRef.unref();

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const generateCode = () => {
  // crypto.randomInt is uniform — avoids modulo bias.
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(min, max));
};

const constantTimeEquals = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

/**
 * Decide whether a new OTP can be issued.
 * Returns `{ allowed: true }` or `{ allowed: false, reason, retryAfterSeconds }`.
 */
const canIssueOtp = (phone) => {
  const now = Date.now();
  const existing = activeOtps.get(phone);
  if (existing && now - existing.issuedAt < RESEND_COOLDOWN_MS) {
    return {
      allowed: false,
      reason: 'COOLDOWN',
      message: 'Please wait before requesting another code',
      retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (now - existing.issuedAt)) / 1000)
    };
  }
  const recent = (issuanceLog.get(phone) || []).filter((t) => now - t < HOURLY_WINDOW_MS);
  if (recent.length >= HOURLY_LIMIT) {
    const oldest = recent[0];
    return {
      allowed: false,
      reason: 'HOURLY_LIMIT',
      message: 'Too many OTP requests for this number. Try again later.',
      retryAfterSeconds: Math.ceil((HOURLY_WINDOW_MS - (now - oldest)) / 1000)
    };
  }
  return { allowed: true };
};

/**
 * Issue and store a new OTP for the given phone. Returns the plaintext code so the caller
 * can dispatch it via WhatsApp. The stored value is a SHA-256 hash.
 */
const issueOtp = (phone, requestId) => {
  const code = generateCode();
  const now = Date.now();
  activeOtps.set(phone, {
    codeHash: hashCode(code),
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    issuedAt: now,
    requestId
  });
  const issuances = issuanceLog.get(phone) || [];
  issuances.push(now);
  issuanceLog.set(phone, issuances);
  return {
    code,
    expiresAt: now + OTP_TTL_MS,
    ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendAfterSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000)
  };
};

/**
 * Verify a submitted code against the stored OTP for this phone.
 * Returns `{ valid: true }` on match (and consumes the OTP),
 * or `{ valid: false, reason, attemptsRemaining }` on failure.
 */
const verifyOtp = (phone, submitted) => {
  const entry = activeOtps.get(phone);
  if (!entry) {
    return { valid: false, reason: 'NOT_FOUND', message: 'No active code for this number. Request a new one.' };
  }
  if (entry.expiresAt <= Date.now()) {
    activeOtps.delete(phone);
    return { valid: false, reason: 'EXPIRED', message: 'Code has expired. Request a new one.' };
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    activeOtps.delete(phone);
    return { valid: false, reason: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Request a new code.' };
  }

  entry.attempts += 1;

  const submittedDigits = String(submitted || '').replace(/\D/g, '');
  if (submittedDigits.length !== OTP_LENGTH || !constantTimeEquals(hashCode(submittedDigits), entry.codeHash)) {
    const attemptsRemaining = MAX_ATTEMPTS - entry.attempts;
    if (attemptsRemaining <= 0) {
      activeOtps.delete(phone);
      return { valid: false, reason: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Request a new code.' };
    }
    return { valid: false, reason: 'MISMATCH', message: 'Incorrect code', attemptsRemaining };
  }

  // Success — consume the OTP.
  activeOtps.delete(phone);
  return { valid: true };
};

/**
 * Roll back a just-issued OTP — used when downstream delivery (WhatsApp) fails.
 * Removes the active code and the most-recent issuance-log timestamp so the user
 * is not penalized against the hourly limit or the resend cooldown for a code
 * they never actually received.
 */
const revokeOtp = (phone) => {
  activeOtps.delete(phone);
  const timestamps = issuanceLog.get(phone);
  if (timestamps && timestamps.length > 0) {
    timestamps.pop();
    if (timestamps.length === 0) issuanceLog.delete(phone);
    else issuanceLog.set(phone, timestamps);
  }
};

const peekStatus = (phone) => {
  const entry = activeOtps.get(phone);
  if (!entry) return { active: false };
  return {
    active: true,
    attemptsRemaining: MAX_ATTEMPTS - entry.attempts,
    expiresInSeconds: Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000))
  };
};

module.exports = {
  OTP_LENGTH,
  OTP_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  HOURLY_LIMIT,
  canIssueOtp,
  issueOtp,
  verifyOtp,
  revokeOtp,
  peekStatus
};

/**
 * Phone-OTP login flow.
 *
 *   POST /api/auth/otp/request   { phoneCountryCode, phoneNumber }
 *   POST /api/auth/otp/verify    { phoneCountryCode, phoneNumber, otp }
 *
 * Auto-creates a user with `role: 'user'` on first successful verify when the phone
 * is not yet linked to anyone. Existing users (by metadata.phoneNumberNormalized)
 * are matched and re-used — keeping a single identity across Google + phone sign-in.
 */

const crypto = require('crypto');
const User = require('../models/User');
const Role = require('../models/Role');
const otpService = require('../services/otpService');
const { deliverOtp, OTP_DELIVERY_MODE } = require('../services/otpDelivery');
const { issueSession } = require('../utils/session');

const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_PHONE_COUNTRY_CODE || '+91';
const DEFAULT_PHONE_ROLE = process.env.DEFAULT_PHONE_SIGNUP_ROLE || 'user';

const normalizeDigits = (raw = '') => String(raw).replace(/\D/g, '');

const buildE164 = (countryCodeRaw, nationalNumberRaw) => {
  const cc = normalizeDigits(countryCodeRaw || DEFAULT_COUNTRY_CODE);
  const national = normalizeDigits(nationalNumberRaw);
  if (!cc || !national) return null;
  return `+${cc}${national}`;
};

const buildNormalizedKey = (countryCodeRaw, nationalNumberRaw) =>
  normalizeDigits(`${countryCodeRaw || DEFAULT_COUNTRY_CODE}${nationalNumberRaw}`);

const serializeUser = (user) => ({
  id: user._id,
  email: user.email || '',
  name: user.name,
  role: user.role,
  profilePhoto: user.profilePhoto,
  phoneCountryCode: user.metadata?.phoneCountryCode || '',
  phoneNumber: user.metadata?.phoneNumber || '',
  phoneVerified: !!user.phoneVerified,
  department: user.metadata?.department || '',
  designation: user.metadata?.designation || '',
  roleRef: user.roleRef
});

/**
 * POST /api/auth/otp/request
 * Body: { phoneCountryCode: "+91", phoneNumber: "9876543210" }
 */
const requestOtp = async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const phoneCountryCode = String(req.body.phoneCountryCode || DEFAULT_COUNTRY_CODE).trim();
    const phoneNumber = String(req.body.phoneNumber || '').trim();

    const ccDigits = normalizeDigits(phoneCountryCode);
    const nationalDigits = normalizeDigits(phoneNumber);

    if (!ccDigits || ccDigits.length < 1 || ccDigits.length > 4) {
      return res.status(400).json({ error: 'Enter a valid country code' });
    }
    if (!nationalDigits || nationalDigits.length < 7 || nationalDigits.length > 12) {
      return res.status(400).json({ error: 'Enter a valid mobile number' });
    }

    const normalizedKey = `${ccDigits}${nationalDigits}`;
    const e164 = `+${normalizedKey}`;

    const gate = otpService.canIssueOtp(normalizedKey);
    if (!gate.allowed) {
      console.warn(`[${requestId}] OTP request blocked for ${e164}: ${gate.reason}`);
      const status = gate.reason === 'COOLDOWN' ? 429 : 429;
      return res.status(status).json({
        error: gate.message,
        reason: gate.reason,
        retryAfterSeconds: gate.retryAfterSeconds
      });
    }

    const { code, ttlSeconds, resendAfterSeconds, expiresAt } = otpService.issueOtp(normalizedKey, requestId);

    console.log(`[${requestId}] Issued OTP for ${e164} (ttl=${ttlSeconds}s)`);

    try {
      await deliverOtp({ e164, code, ttlSeconds, requestId });
    } catch (err) {
      // Dispatch failed — revoke the just-issued OTP so the user isn't
      // penalized against the cooldown / hourly limit for a code they never received.
      otpService.revokeOtp(normalizedKey);
      const isConfigError = /not configured/i.test(err.message || '');
      const providerCode = err.body?.error || err.body?.details || '';
      console.error(`[${requestId}] Failed to dispatch OTP via WhatsApp (mode=${OTP_DELIVERY_MODE}):`, err.message, err.body || '');
      const message = isConfigError
        ? 'Verification service is not configured on the server. Please contact support.'
        : 'Could not send the verification code. Please try again in a moment.';
      return res.status(502).json({ error: message, requestId, providerCode });
    }

    res.status(200).json({
      message: 'Verification code sent via WhatsApp',
      requestId,
      phoneCountryCode: `+${ccDigits}`,
      phoneNumber: nationalDigits,
      otpLength: otpService.OTP_LENGTH,
      expiresInSeconds: ttlSeconds,
      expiresAt,
      resendAfterSeconds,
      maxAttempts: otpService.MAX_ATTEMPTS
    });
  } catch (err) {
    console.error(`[${requestId}] requestOtp error:`, err);
    res.status(500).json({ error: 'Failed to issue verification code', requestId });
  }
};

/**
 * POST /api/auth/otp/verify
 * Body: { phoneCountryCode, phoneNumber, otp }
 *
 * On success: returns JWT + user. Auto-creates user if phone is unknown.
 */
const verifyOtp = async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const phoneCountryCode = String(req.body.phoneCountryCode || DEFAULT_COUNTRY_CODE).trim();
    const phoneNumber = String(req.body.phoneNumber || '').trim();
    const submittedOtp = String(req.body.otp || '').trim();

    const ccDigits = normalizeDigits(phoneCountryCode);
    const nationalDigits = normalizeDigits(phoneNumber);

    if (!ccDigits || !nationalDigits) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!submittedOtp) {
      return res.status(400).json({ error: 'OTP is required' });
    }

    const normalizedKey = `${ccDigits}${nationalDigits}`;
    const e164 = `+${normalizedKey}`;

    const result = otpService.verifyOtp(normalizedKey, submittedOtp);
    if (!result.valid) {
      console.warn(`[${requestId}] OTP verify failed for ${e164}: ${result.reason}`);
      const status = result.reason === 'MISMATCH' ? 400 : 410;
      return res.status(status).json({
        error: result.message,
        reason: result.reason,
        attemptsRemaining: result.attemptsRemaining
      });
    }

    // OTP good — find or create user.
    const formattedCountryCode = `+${ccDigits}`;
    const formattedPhone = `${formattedCountryCode} ${nationalDigits}`;

    let user = await User.findOne({
      $or: [
        { 'metadata.phoneNumberNormalized': normalizedKey },
        { 'metadata.phoneNumberNormalized': nationalDigits }
      ]
    }).populate({ path: 'roleRef', populate: { path: 'permissions' } });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        name: 'New User',
        role: DEFAULT_PHONE_ROLE,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        lastLogin: new Date(),
        metadata: {
          phoneCountryCode: formattedCountryCode,
          phoneNumber: formattedPhone,
          phoneNumberNormalized: normalizedKey
        }
      });
      await user.save();

      const roleDoc = await Role.findOne({ name: user.role }).populate('permissions');
      if (roleDoc) {
        user.roleRef = roleDoc._id;
        await user.save();
      }
      await user.populate({ path: 'roleRef', populate: { path: 'permissions' } });
      console.log(`[${requestId}] Auto-created new user ${user._id} via phone OTP (${e164})`);
    } else {
      // Existing user — flag phone as verified, refresh lastLogin, ensure metadata fields are populated.
      user.phoneVerified = true;
      user.phoneVerifiedAt = new Date();
      user.lastLogin = new Date();
      const meta = user.metadata?.toObject ? user.metadata.toObject() : (user.metadata || {});
      user.metadata = {
        ...meta,
        phoneCountryCode: meta.phoneCountryCode || formattedCountryCode,
        phoneNumber: meta.phoneNumber || formattedPhone,
        phoneNumberNormalized: normalizedKey
      };
      if (!user.roleRef) {
        const roleDoc = await Role.findOne({ name: user.role });
        if (roleDoc) user.roleRef = roleDoc._id;
      }
      await user.save();
      await user.populate({ path: 'roleRef', populate: { path: 'permissions' } });
      console.log(`[${requestId}] Phone OTP login for existing user ${user._id} (${e164})`);
    }

    const accessToken = await issueSession(res, user);

    res.status(isNewUser ? 201 : 200).json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      accessToken,
      user: serializeUser(user)
    });
  } catch (err) {
    console.error(`[${requestId}] verifyOtp error:`, err);
    res.status(500).json({ error: 'Verification failed', requestId });
  }
};

module.exports = {
  requestOtp,
  verifyOtp
};

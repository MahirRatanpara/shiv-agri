const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Role = require('../models/Role');
const otpService = require('../services/otpService');
const { deliverOtp } = require('../services/otpDelivery');
const { features } = require('../config/features');
const { generateAccessToken, verifyToken, decodeToken } = require('../utils/jwt');
const { issueSession, findUserByRefreshToken, clearRefreshCookie, REFRESH_COOKIE_NAME } = require('../utils/session');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_PHONE_COUNTRY_CODE || '+91';

const normalizePhoneNumber = (phoneNumber = '') => String(phoneNumber).replace(/\D/g, '');

const serializeUser = (user) => ({
  id: user._id,
  email: user.email,
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
 * Google OAuth login (legacy ID token flow - kept as fallback)
 */
const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Match an existing identity by googleId OR email so a pre-provisioned
    // account (manager-created with this email) is reused rather than duplicated.
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    let isNewUser = false;

    // Invite-only (INVITE_ONLY_LOGIN, default true): a valid Google identity is
    // not enough. The account must have been provisioned first — by an admin in
    // User Management, or implicitly by a manager registering a farm against
    // this email. Otherwise anyone with a Google account could get in.
    if (!user && features.inviteOnlyLogin) {
      console.warn(`Rejected Google sign-in for unregistered email: ${email}`);
      return res.status(403).json({
        error: 'This account is not registered. Please contact Shiv Agri Consultancy to request access.',
        reason: 'NOT_REGISTERED'
      });
    }

    if (!user) {
      // Open sign-up mode — original behaviour.
      isNewUser = true;
      user = new User({
        googleId,
        email,
        name,
        profilePhoto: picture,
        lastLogin: new Date()
      });
      await user.save();

      const roleDoc = await Role.findOne({ name: user.role }).populate('permissions');
      if (roleDoc) {
        user.roleRef = roleDoc._id;
        await user.save();
      }
    } else {
      if (!user.googleId) user.googleId = googleId;
      if (picture) user.profilePhoto = picture;
      user.lastLogin = new Date();

      if (!user.roleRef) {
        const roleDoc = await Role.findOne({ name: user.role });
        if (roleDoc) user.roleRef = roleDoc._id;
      }
    }

    const accessToken = await issueSession(res, user);

    await user.populate({
      path: 'roleRef',
      populate: { path: 'permissions' }
    });

    res.status(isNewUser ? 201 : 200).json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      accessToken,
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
};

/**
 * Google OAuth login with Authorization Code flow
 * Frontend sends an authorization code, backend exchanges it for tokens
 */
const googleLoginWithCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Google token exchange error:', tokenData);
      return res.status(400).json({ error: 'Failed to exchange authorization code', details: tokenData.error_description });
    }

    const { id_token, refresh_token: googleRefreshToken } = tokenData;

    // Verify the id_token to get user info
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Match an existing identity by googleId OR email so a pre-provisioned
    // account (manager-created with this email) is reused rather than duplicated.
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    let isNewUser = false;

    // Invite-only — see googleLogin above. Same gate on the web auth-code flow.
    if (!user && features.inviteOnlyLogin) {
      console.warn(`Rejected Google sign-in for unregistered email: ${email}`);
      return res.status(403).json({
        error: 'This account is not registered. Please contact Shiv Agri Consultancy to request access.',
        reason: 'NOT_REGISTERED'
      });
    }

    if (!user) {
      // Open sign-up mode — original behaviour.
      isNewUser = true;
      user = new User({
        googleId,
        email,
        name,
        profilePhoto: picture,
        lastLogin: new Date()
      });

      if (googleRefreshToken) {
        user.googleRefreshToken = googleRefreshToken;
      }
      await user.save();

      const roleDoc = await Role.findOne({ name: user.role }).populate('permissions');
      if (roleDoc) {
        user.roleRef = roleDoc._id;
        await user.save();
      }
    } else {
      // Update existing user
      if (!user.googleId) {
        user.googleId = googleId;
      }
      if (picture) {
        user.profilePhoto = picture;
      }
      user.lastLogin = new Date();

      // Store Google refresh token (only provided on first consent)
      if (googleRefreshToken) {
        user.googleRefreshToken = googleRefreshToken;
      }

      if (!user.roleRef) {
        const roleDoc = await Role.findOne({ name: user.role });
        if (roleDoc) {
          user.roleRef = roleDoc._id;
        }
      }
    }

    // Issue our own access + refresh token (refresh stored hashed, sent as httpOnly cookie)
    const accessToken = await issueSession(res, user);

    // Populate roleRef with permissions for response
    await user.populate({
      path: 'roleRef',
      populate: { path: 'permissions' }
    });

    res.status(isNewUser ? 201 : 200).json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      accessToken,
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Google code login error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
};

/**
 * Refresh access token using stored Google refresh token
 * Frontend sends the expired/expiring JWT for user identification
 */
const refreshAccessToken = async (req, res) => {
  try {
    // Primary path: opaque backend refresh token from the httpOnly cookie.
    // Works identically for every login method (Google + phone OTP).
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawRefreshToken) {
      const user = await findUserByRefreshToken(User, rawRefreshToken);
      if (!user) {
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Session expired, please login again' });
      }

      // Rotate the refresh token on every use and mint a new access token.
      const accessToken = await issueSession(res, user);
      return res.json({ message: 'Token refreshed', accessToken });
    }

    // Legacy fallback: pre-existing Google sessions that have no backend refresh
    // token cookie yet. Validate via the stored Google refresh token, then upgrade
    // them onto the new backend-token scheme so the next refresh uses the cookie.
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || req.cookies?.accessToken;
    if (!token) {
      return res.status(401).json({ error: 'Session expired, please login again' });
    }

    let decoded;
    try {
      decoded = decodeToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && (now - decoded.exp) > 30 * 24 * 60 * 60) {
      return res.status(401).json({ error: 'Token expired too long ago, please login again' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.googleRefreshToken) {
      return res.status(401).json({ error: 'No active session found, please login again' });
    }

    const googleResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: user.googleRefreshToken,
        grant_type: 'refresh_token'
      })
    });

    const googleData = await googleResponse.json();

    if (googleData.error) {
      console.error('Google refresh token invalid:', googleData.error);
      user.googleRefreshToken = null;
      await user.save();
      return res.status(401).json({ error: 'Google session expired, please login again' });
    }

    // Google says the session is still good — upgrade onto the backend token scheme.
    const accessToken = await issueSession(res, user);
    res.json({ message: 'Token refreshed', accessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ error: 'Token refresh failed' });
  }
};

/**
 * Logout - revoke Google refresh token and clear session
 */
const logout = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (userId) {
      const user = await User.findById(userId);

      if (user) {
        // Revoke Google refresh token if present
        if (user.googleRefreshToken) {
          try {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${user.googleRefreshToken}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
          } catch (revokeError) {
            console.error('Failed to revoke Google token (non-fatal):', revokeError);
          }
          user.googleRefreshToken = null;
        }

        user.refreshToken = null;
        user.refreshTokenExpiresAt = null;
        await user.save();
      }
    }

    // Clear cookies
    res.clearCookie('accessToken');
    clearRefreshCookie(res);

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

/**
 * Get current user
 */
const getCurrentUser = async (req, res) => {
  try {
    const user = req.user;

    res.json({
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
};

/**
 * Admin-only direct phone change.
 *
 * Normal users can never edit a phone number — they may only ATTACH one (when none
 * exists) via the OTP-verified flow below. Changing an already-set number, or setting
 * an arbitrary number without OTP, is an administrative action.
 */
const updateCurrentUserProfile = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        error: 'Mobile number can only be added through OTP verification, and cannot be changed once set. Contact an administrator if it needs correcting.'
      });
    }

    const phoneCountryCode = String(req.body.phoneCountryCode || '+91').trim();
    const nationalPhoneNumber = String(req.body.phoneNumber || '').trim();
    const phoneNumber = nationalPhoneNumber.startsWith('+')
      ? nationalPhoneNumber
      : `${phoneCountryCode} ${nationalPhoneNumber}`.trim();
    const phoneNumberNormalized = normalizePhoneNumber(
      nationalPhoneNumber.startsWith('+') ? nationalPhoneNumber : `${phoneCountryCode}${nationalPhoneNumber}`
    );
    const nationalPhoneNumberNormalized = normalizePhoneNumber(nationalPhoneNumber);

    if (!nationalPhoneNumber) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    if (phoneNumberNormalized.length < 7) {
      return res.status(400).json({ error: 'Enter a valid mobile number' });
    }

    const userId = req.user?._id || req.body.userId || req.body.id;
    const email = String(req.user?.email || req.body.email || '').trim().toLowerCase();
    const userQuery = userId ? { _id: userId } : email ? { email } : null;

    if (!userQuery) {
      return res.status(400).json({ error: 'User identifier is required to update mobile number' });
    }

    const user = await User.findOne(userQuery).populate({
      path: 'roleRef',
      populate: { path: 'permissions' }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const directDuplicate = await User.findOne({
      _id: { $ne: user._id },
      $or: [
        { 'metadata.phoneNumberNormalized': phoneNumberNormalized },
        { 'metadata.phoneNumber': phoneNumber },
        { 'metadata.phoneNumber': phoneNumberNormalized },
        { 'metadata.phoneNumber': nationalPhoneNumber },
        { 'metadata.phoneNumber': nationalPhoneNumberNormalized }
      ]
    }).select('_id');
    const usersWithPhones = directDuplicate ? [] : await User.find({
      _id: { $ne: user._id },
      $or: [
        { 'metadata.phoneNumber': { $exists: true, $ne: '' } },
        { 'metadata.phoneNumberNormalized': { $exists: true, $ne: '' } }
      ]
    }).select('_id metadata.phoneNumber metadata.phoneNumberNormalized');
    const normalizedDuplicate = usersWithPhones.find((candidate) => {
      const candidatePhone = candidate.metadata?.phoneNumberNormalized || normalizePhoneNumber(candidate.metadata?.phoneNumber);
      return candidatePhone === phoneNumberNormalized || candidatePhone === nationalPhoneNumberNormalized;
    });

    if (directDuplicate || normalizedDuplicate) {
      return res.status(409).json({ error: 'This mobile number is already linked to another user' });
    }

    user.metadata = {
      ...(user.metadata?.toObject ? user.metadata.toObject() : user.metadata || {}),
      phoneCountryCode,
      phoneNumber,
      phoneNumberNormalized
    };

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

/**
 * POST /api/auth/profile/phone/request-otp  (authenticated)
 *
 * Sends an OTP so the signed-in user can ATTACH a phone number. Only allowed when the
 * account has no phone yet — numbers are immutable for users once verified (admin-only change).
 */
const requestProfilePhoneOtp = async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    if (req.user.metadata?.phoneNumberNormalized) {
      return res.status(409).json({ error: 'A mobile number is already linked to your account and cannot be changed.' });
    }

    const ccDigits = normalizePhoneNumber(req.body.phoneCountryCode || DEFAULT_COUNTRY_CODE);
    const nationalDigits = normalizePhoneNumber(req.body.phoneNumber);

    if (!ccDigits || ccDigits.length < 1 || ccDigits.length > 4) {
      return res.status(400).json({ error: 'Enter a valid country code' });
    }
    if (!nationalDigits || nationalDigits.length < 7 || nationalDigits.length > 12) {
      return res.status(400).json({ error: 'Enter a valid mobile number' });
    }

    const normalizedKey = `${ccDigits}${nationalDigits}`;
    const e164 = `+${normalizedKey}`;

    // Pre-flight conflict check so the user isn't sent a code for a number they can't claim.
    const existing = await User.findOne({
      _id: { $ne: req.user._id },
      'metadata.phoneNumberNormalized': normalizedKey
    }).select('_id');
    if (existing) {
      return res.status(409).json({ error: 'This mobile number is already linked to another account.' });
    }

    const gate = otpService.canIssueOtp(normalizedKey);
    if (!gate.allowed) {
      return res.status(429).json({ error: gate.message, reason: gate.reason, retryAfterSeconds: gate.retryAfterSeconds });
    }

    const { code, ttlSeconds, resendAfterSeconds, expiresAt } = otpService.issueOtp(normalizedKey, requestId);

    try {
      await deliverOtp({ e164, code, ttlSeconds, requestId });
    } catch (err) {
      otpService.revokeOtp(normalizedKey);
      console.error(`[${requestId}] Failed to dispatch profile OTP:`, err.message, err.body || '');
      return res.status(502).json({ error: 'Could not send the verification code. Please try again in a moment.', requestId });
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
  } catch (error) {
    console.error(`[${requestId}] requestProfilePhoneOtp error:`, error);
    res.status(500).json({ error: 'Failed to issue verification code', requestId });
  }
};

/**
 * POST /api/auth/profile/phone/verify-otp  (authenticated)
 *
 * Verifies the OTP and attaches the phone to the signed-in user. Enforces 1-1 uniqueness:
 * the number must not already belong to another account.
 */
const verifyProfilePhoneOtp = async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const user = await User.findById(req.user._id).populate({ path: 'roleRef', populate: { path: 'permissions' } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.metadata?.phoneNumberNormalized) {
      return res.status(409).json({ error: 'A mobile number is already linked to your account and cannot be changed.' });
    }

    const ccDigits = normalizePhoneNumber(req.body.phoneCountryCode || DEFAULT_COUNTRY_CODE);
    const nationalDigits = normalizePhoneNumber(req.body.phoneNumber);
    const submittedOtp = String(req.body.otp || '').trim();

    if (!ccDigits || !nationalDigits) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!submittedOtp) {
      return res.status(400).json({ error: 'OTP is required' });
    }

    const normalizedKey = `${ccDigits}${nationalDigits}`;
    const formattedCountryCode = `+${ccDigits}`;
    const formattedPhone = `${formattedCountryCode} ${nationalDigits}`;

    const result = otpService.verifyOtp(normalizedKey, submittedOtp);
    if (!result.valid) {
      const status = result.reason === 'MISMATCH' ? 400 : 410;
      return res.status(status).json({ error: result.message, reason: result.reason, attemptsRemaining: result.attemptsRemaining });
    }

    // Final uniqueness guard at attach time (a race could have claimed it since request).
    const existing = await User.findOne({
      _id: { $ne: user._id },
      'metadata.phoneNumberNormalized': normalizedKey
    }).select('_id');
    if (existing) {
      return res.status(409).json({ error: 'This mobile number is already linked to another account.' });
    }

    const meta = user.metadata?.toObject ? user.metadata.toObject() : (user.metadata || {});
    user.metadata = {
      ...meta,
      phoneCountryCode: formattedCountryCode,
      phoneNumber: formattedPhone,
      phoneNumberNormalized: normalizedKey
    };
    user.phoneVerified = true;
    user.phoneVerifiedAt = new Date();

    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'This mobile number is already linked to another account.' });
      }
      throw err;
    }

    res.json({ message: 'Mobile number verified and added.', user: serializeUser(user) });
  } catch (error) {
    console.error(`[${requestId}] verifyProfilePhoneOtp error:`, error);
    res.status(500).json({ error: 'Verification failed', requestId });
  }
};

/**
 * POST /api/auth/profile/email  (authenticated)
 *
 * Lets a signed-in user ADD an email when their account has none yet (e.g. a phone-OTP
 * signup completing their profile). Add-only: an existing email can't be changed here.
 * Enforces the 1-1 email identity — the address must not belong to another account.
 */
const setProfileEmail = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const providedName = String(req.body.name || '').trim();

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    // Lightweight format check — good enough to catch typos without over-validating.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const user = await User.findById(req.user._id).populate({ path: 'roleRef', populate: { path: 'permissions' } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.email) {
      return res.status(409).json({ error: 'An email is already linked to your account and cannot be changed.' });
    }

    const existing = await User.findOne({ _id: { $ne: user._id }, email }).select('_id');
    if (existing) {
      return res.status(409).json({ error: 'This email is already linked to another account.' });
    }

    user.email = email;
    // Capture the real name at the same time so phone-OTP signups stop showing as "New User".
    // Only set it when one was provided and the current name is still the placeholder.
    if (providedName && (!user.name || user.name === 'New User')) {
      user.name = providedName;
    }
    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'This email is already linked to another account.' });
      }
      throw err;
    }

    res.json({ message: 'Email added successfully.', user: serializeUser(user) });
  } catch (error) {
    console.error('Set profile email error:', error);
    res.status(500).json({ error: 'Failed to add email' });
  }
};

/**
 * GET /api/auth/config  (public)
 *
 * Exposes the auth-related feature flags so the frontend can render the correct login
 * options without hardcoding them. Read by the login + complete-profile screens.
 */
const getAuthConfig = (req, res) => {
  res.json({
    googleLoginEnabled: true,
    otpLoginEnabled: features.otpLoginEnabled
  });
};

/**
 * POST /api/auth/profile/phone  (authenticated)
 *
 * MANUAL phone attach — used only when OTP login is disabled (Google-only mode). Captures
 * the number without OTP verification (stored phoneVerified=false). Add-only: an existing
 * number can't be changed here. Enforces the same 1-1 uniqueness as the OTP flow.
 *
 * When OTP login is ENABLED this endpoint is refused — numbers must be OTP-verified instead.
 */
const setProfilePhone = async (req, res) => {
  try {
    if (features.otpLoginEnabled) {
      return res.status(403).json({
        error: 'Please verify your mobile number with the OTP sent on WhatsApp.',
        code: 'OTP_REQUIRED'
      });
    }

    const user = await User.findById(req.user._id).populate({ path: 'roleRef', populate: { path: 'permissions' } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.metadata?.phoneNumberNormalized) {
      return res.status(409).json({ error: 'A mobile number is already linked to your account and cannot be changed.' });
    }

    const ccDigits = normalizePhoneNumber(req.body.phoneCountryCode || DEFAULT_COUNTRY_CODE);
    const nationalDigits = normalizePhoneNumber(req.body.phoneNumber);

    if (!ccDigits || ccDigits.length < 1 || ccDigits.length > 4) {
      return res.status(400).json({ error: 'Enter a valid country code' });
    }
    if (!nationalDigits || nationalDigits.length < 7 || nationalDigits.length > 12) {
      return res.status(400).json({ error: 'Enter a valid mobile number' });
    }

    const normalizedKey = `${ccDigits}${nationalDigits}`;
    const formattedCountryCode = `+${ccDigits}`;
    const formattedPhone = `${formattedCountryCode} ${nationalDigits}`;

    const existing = await User.findOne({
      _id: { $ne: user._id },
      'metadata.phoneNumberNormalized': normalizedKey
    }).select('_id');
    if (existing) {
      return res.status(409).json({ error: 'This mobile number is already linked to another account.' });
    }

    const meta = user.metadata?.toObject ? user.metadata.toObject() : (user.metadata || {});
    user.metadata = {
      ...meta,
      phoneCountryCode: formattedCountryCode,
      phoneNumber: formattedPhone,
      phoneNumberNormalized: normalizedKey
    };
    // Manually entered — not OTP-verified.
    user.phoneVerified = false;

    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'This mobile number is already linked to another account.' });
      }
      throw err;
    }

    res.json({ message: 'Mobile number added.', user: serializeUser(user) });
  } catch (error) {
    console.error('Set profile phone error:', error);
    res.status(500).json({ error: 'Failed to add mobile number' });
  }
};

module.exports = {
  googleLogin,
  googleLoginWithCode,
  refreshAccessToken,
  logout,
  getCurrentUser,
  getAuthConfig,
  updateCurrentUserProfile,
  requestProfilePhoneOtp,
  verifyProfilePhoneOtp,
  setProfilePhone,
  setProfileEmail
};

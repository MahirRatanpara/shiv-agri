const crypto = require('crypto');
const { generateAccessToken } = require('./jwt');

/**
 * Backend-issued session layer shared by every login method (Google + phone OTP).
 *
 * A short-lived JWT access token is paired with a long-lived opaque refresh token.
 * Only the SHA-256 hash of the refresh token is stored on the user document, so a
 * database leak cannot be replayed. The raw token lives in an httpOnly cookie.
 */

const REFRESH_TOKEN_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '60', 10);
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = 'refreshToken';

const hashRefreshToken = (raw) =>
  crypto.createHash('sha256').update(String(raw)).digest('hex');

const generateRefreshToken = () => crypto.randomBytes(48).toString('hex');

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: REFRESH_TOKEN_TTL_MS,
  path: '/'
});

/**
 * Mint a fresh refresh token, persist its hash on the user, set the cookie, and
 * return a new access token. Call this on every successful login and on refresh
 * (token rotation). The caller is responsible for nothing else — the user is saved here.
 */
const issueSession = async (res, user) => {
  const rawRefreshToken = generateRefreshToken();
  user.refreshToken = hashRefreshToken(rawRefreshToken);
  user.refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await user.save();

  if (res) {
    res.cookie(REFRESH_COOKIE_NAME, rawRefreshToken, refreshCookieOptions());
  }

  return generateAccessToken({
    userId: user._id,
    email: user.email || null,
    role: user.role
  });
};

/**
 * Resolve the user that owns the supplied raw refresh token, enforcing expiry.
 * Returns null when the token is unknown or expired.
 */
const findUserByRefreshToken = async (UserModel, rawRefreshToken) => {
  if (!rawRefreshToken) return null;
  const user = await UserModel.findOne({
    refreshToken: hashRefreshToken(rawRefreshToken)
  }).populate({ path: 'roleRef', populate: { path: 'permissions' } });

  if (!user) return null;
  if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt.getTime() < Date.now()) {
    return null;
  }
  return user;
};

const clearRefreshCookie = (res) => {
  if (res) res.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
};

module.exports = {
  REFRESH_COOKIE_NAME,
  hashRefreshToken,
  issueSession,
  findUserByRefreshToken,
  clearRefreshCookie
};

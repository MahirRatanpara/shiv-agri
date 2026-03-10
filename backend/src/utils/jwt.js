const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-dev-jwt-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate access token
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify token
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Decode token without verifying expiry (still validates signature)
 * Used for reading userId from expired tokens during refresh
 */
const decodeToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
  } catch (error) {
    throw new Error('Invalid token');
  }
};

module.exports = {
  generateAccessToken,
  verifyToken,
  decodeToken
};

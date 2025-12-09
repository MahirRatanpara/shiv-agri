const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Authentication middleware - verifies JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header or cookie
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user is approved
    if (!user.isApproved) {
      return res.status(403).json({ error: 'Account pending approval' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Authorization middleware - checks user role
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorize
};

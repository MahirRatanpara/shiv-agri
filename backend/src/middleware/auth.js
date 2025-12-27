const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const Permission = require('../models/Permission');

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

    // Get user from database with role and permissions populated
    const user = await User.findById(decoded.userId)
      .populate({
        path: 'roleRef',
        populate: {
          path: 'permissions'
        }
      });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
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
 * @deprecated Use requirePermission instead for granular permission checking
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

/**
 * Permission-based authorization middleware
 * Checks if user has the required permission(s)
 *
 * @param {string|string[]} requiredPermissions - Permission name(s) required
 * @param {object} options - Additional options
 * @param {boolean} options.requireAll - If true, user must have ALL permissions (default: true)
 * @param {boolean} options.allowAdmin - If true, admin role bypasses check (default: true)
 *
 * @example
 * router.get('/sessions', requirePermission('soil.sessions.view'), getSessions);
 * router.post('/sessions', requirePermission(['soil.sessions.create']), createSession);
 * router.delete('/sessions/:id', requirePermission('soil.sessions.delete'), deleteSession);
 */
const requirePermission = (requiredPermissions, options = {}) => {
  const {
    requireAll = true,
    allowAdmin = true
  } = options;

  // Normalize to array
  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Admin bypass (if enabled)
      if (allowAdmin && req.user.role === 'admin') {
        return next();
      }

      // Get user's permission names from roleRef
      const userPermissions = req.user.roleRef?.permissions || [];
      const userPermissionNames = userPermissions.map(p =>
        typeof p === 'string' ? p : p.name
      );

      // Check permissions
      let hasPermission = false;

      if (requireAll) {
        // User must have ALL required permissions
        hasPermission = permissions.every(perm =>
          userPermissionNames.includes(perm)
        );
      } else {
        // User must have AT LEAST ONE required permission
        hasPermission = permissions.some(perm =>
          userPermissionNames.includes(perm)
        );
      }

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: permissions,
          message: `This action requires the following permission${permissions.length > 1 ? 's' : ''}: ${permissions.join(', ')}`
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

/**
 * Middleware to check if user owns the resource
 * Used in combination with permission checks for user-scoped data
 *
 * @param {string} userIdField - Field name in the resource that contains the user ID
 * @param {string} resourceGetter - Function to get the resource from request
 *
 * @example
 * router.get('/samples/:id',
 *   requirePermission('soil.samples.view'),
 *   requireOwnership('userId'),
 *   getSample
 * );
 */
const requireOwnership = (userIdField = 'userId', resourceGetter = null) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Admin can access all resources
      if (req.user.role === 'admin') {
        return next();
      }

      // Get resource - either from custom getter or from req.resource
      let resource = null;
      if (resourceGetter && typeof resourceGetter === 'function') {
        resource = await resourceGetter(req);
      } else if (req.resource) {
        resource = req.resource;
      }

      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Check ownership
      const resourceUserId = resource[userIdField]?.toString();
      const currentUserId = req.user._id.toString();

      if (resourceUserId !== currentUserId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to access this resource'
        });
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({ error: 'Ownership check failed' });
    }
  };
};

/**
 * Utility function to check if user has permission (for use in route handlers)
 */
const hasPermission = (user, permissionName) => {
  if (!user) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  const userPermissions = user.roleRef?.permissions || [];
  const userPermissionNames = userPermissions.map(p =>
    typeof p === 'string' ? p : p.name
  );

  return userPermissionNames.includes(permissionName);
};

module.exports = {
  authenticate,
  authorize,
  requirePermission,
  requireOwnership,
  hasPermission
};

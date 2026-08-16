const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUser,
  createUser,
  updateUserRole,
  updateUserIdentity,
  deleteUser,
  lookupUserByPhone
} = require('../controllers/userController');
const { authenticate, requirePermission } = require('../middleware/auth');

// Admin-only gate (mirrors the strict admin check used in projects.js).
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role === 'admin') return next();
  return res.status(403).json({
    error: 'Insufficient permissions',
    message: 'This action is restricted to administrators.'
  });
};

// All routes require authentication
router.use(authenticate);

// User data is identity-sensitive — block 304/cached responses so a UI
// refresh always reflects the latest server state after an edit.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.removeHeader && res.removeHeader('ETag');
  next();
});

// ==================== User Management ====================

// Get all users
router.get('/',
  requirePermission('users.view'),
  getAllUsers
);

// Get user by ID
router.get('/lookup/by-phone',
  requirePermission('users.view'),
  lookupUserByPhone
);

// Admin-only: pre-authorise a new account. The system is invite-only, so this
// is the only way in for anyone who doesn't already have a farm registered.
// Declared before '/:id' is irrelevant (different method) but kept grouped.
router.post('/',
  requireAdmin,
  createUser
);

// Get user by ID
router.get('/:id',
  requirePermission('users.view'),
  getUser
);

// Update user role
router.put('/:userId/role',
  requirePermission('users.assign-role'),
  updateUserRole
);

// Admin-only: update a user's identity (name / email / phone). Strict
// uniqueness enforced inside the controller.
router.patch('/:userId/identity',
  requireAdmin,
  updateUserIdentity
);

// Delete user
router.delete('/:userId',
  requirePermission('users.delete'),
  deleteUser
);

module.exports = router;

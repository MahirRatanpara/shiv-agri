const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUser,
  updateUserRole,
  deleteUser
} = require('../controllers/userController');
const { authenticate, requirePermission } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ==================== User Management ====================

// Get all users
router.get('/',
  requirePermission('users.view'),
  getAllUsers
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

// Delete user
router.delete('/:userId',
  requirePermission('users.delete'),
  deleteUser
);

module.exports = router;

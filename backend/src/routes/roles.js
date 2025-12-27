const express = require('express');
const router = express.Router();
const {
  getAllRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getAllPermissions,
  assignRoleToUser
} = require('../controllers/roleController');
const { authenticate, requirePermission } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ==================== Permissions ====================

// Get all permissions (view only)
router.get('/permissions',
  requirePermission('permissions.view'),
  getAllPermissions
);

// ==================== Roles ====================

// Get all roles
router.get('/',
  requirePermission('roles.view'),
  getAllRoles
);

// Get role by ID or name
router.get('/:id',
  requirePermission('roles.view'),
  getRole
);

// Create new role
router.post('/',
  requirePermission('roles.create'),
  createRole
);

// Update role
router.put('/:id',
  requirePermission('roles.update'),
  updateRole
);

// Delete role
router.delete('/:id',
  requirePermission('roles.delete'),
  deleteRole
);

// ==================== User Role Assignment ====================

// Assign role to user
router.post('/assign/:userId',
  requirePermission('users.assign-role'),
  assignRoleToUser
);

module.exports = router;

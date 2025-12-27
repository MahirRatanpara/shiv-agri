const Role = require('../models/Role');
const Permission = require('../models/Permission');
const User = require('../models/User');

/**
 * Get all roles
 */
const getAllRoles = async (req, res) => {
  try {
    const {
      includeInactive = false,
      includePermissions = true
    } = req.query;

    const query = includeInactive === 'true' ? {} : { isActive: true };

    let rolesQuery = Role.find(query).sort({ 'metadata.priority': 1, name: 1 });

    if (includePermissions === 'true') {
      rolesQuery = rolesQuery.populate('permissions');
    }

    const roles = await rolesQuery;

    // Get user count for each role
    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        const userCount = await User.countDocuments({ role: role.name });
        const roleData = role.toClientJSON();
        return { ...roleData, userCount };
      })
    );

    res.json({
      roles: rolesWithCounts,
      total: rolesWithCounts.length
    });
  } catch (error) {
    console.error('Get all roles error:', error);
    res.status(500).json({ error: 'Failed to fetch roles', details: error.message });
  }
};

/**
 * Get role by ID or name
 */
const getRole = async (req, res) => {
  try {
    const { id } = req.params;

    let role;
    // Try to find by ID first, then by name
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      role = await Role.findById(id).populate('permissions');
    } else {
      role = await Role.findOne({ name: id.toLowerCase() }).populate('permissions');
    }

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Get user count
    const userCount = await User.countDocuments({ role: role.name });

    const roleData = role.toClientJSON();
    res.json({
      role: { ...roleData, userCount }
    });
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({ error: 'Failed to fetch role', details: error.message });
  }
};

/**
 * Create new role
 */
const createRole = async (req, res) => {
  try {
    const {
      name,
      displayName,
      description,
      permissions = [],
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!name || !displayName || !description) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['name', 'displayName', 'description']
      });
    }

    // Check if role already exists
    const existingRole = await Role.findOne({ name: name.toLowerCase() });
    if (existingRole) {
      return res.status(409).json({ error: 'Role with this name already exists' });
    }

    // Validate permissions
    const validPermissions = await Permission.find({
      _id: { $in: permissions },
      isActive: true
    });

    if (validPermissions.length !== permissions.length) {
      return res.status(400).json({
        error: 'Some permissions are invalid or inactive',
        validCount: validPermissions.length,
        providedCount: permissions.length
      });
    }

    // Create role
    const role = new Role({
      name: name.toLowerCase(),
      displayName,
      description,
      permissions: validPermissions.map(p => p._id),
      isSystem: false,
      metadata: {
        color: metadata.color || '#6366f1',
        icon: metadata.icon || 'user',
        priority: metadata.priority || 100
      },
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await role.save();

    const populatedRole = await Role.findById(role._id).populate('permissions');

    res.status(201).json({
      message: 'Role created successfully',
      role: populatedRole.toClientJSON()
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Failed to create role', details: error.message });
  }
};

/**
 * Update role
 */
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      displayName,
      description,
      permissions,
      metadata,
      isActive
    } = req.body;

    const role = await Role.findById(id);

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Prevent modification of system roles (unless using force flag)
    if (role.isSystem && !req.body.force) {
      return res.status(403).json({
        error: 'Cannot modify system role',
        message: 'System roles are protected. Use force flag if you really need to update this role.'
      });
    }

    // Update fields
    if (displayName !== undefined) role.displayName = displayName;
    if (description !== undefined) role.description = description;
    if (isActive !== undefined) role.isActive = isActive;

    // Update permissions if provided
    if (permissions !== undefined && Array.isArray(permissions)) {
      const validPermissions = await Permission.find({
        _id: { $in: permissions },
        isActive: true
      });

      if (validPermissions.length !== permissions.length) {
        return res.status(400).json({
          error: 'Some permissions are invalid or inactive',
          validCount: validPermissions.length,
          providedCount: permissions.length
        });
      }

      role.permissions = validPermissions.map(p => p._id);
    }

    // Update metadata
    if (metadata !== undefined) {
      role.metadata = {
        ...role.metadata,
        ...metadata
      };
    }

    role.updatedBy = req.user._id;
    await role.save();

    // Update all users with this role to have the roleRef set (permissions come from role)
    const usersToUpdate = await User.find({ role: role.name, roleRef: { $ne: role._id } });
    if (usersToUpdate.length > 0) {
      await User.updateMany(
        { role: role.name },
        { $set: { roleRef: role._id } }
      );
    }

    const populatedRole = await Role.findById(role._id).populate('permissions');

    res.json({
      message: 'Role updated successfully',
      role: populatedRole.toClientJSON(),
      usersAffected: await User.countDocuments({ role: role.name })
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role', details: error.message });
  }
};

/**
 * Delete role
 */
const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id);

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Prevent deletion of system roles
    if (role.isSystem) {
      return res.status(403).json({
        error: 'Cannot delete system role',
        message: 'System roles (admin, user, assistant) cannot be deleted.'
      });
    }

    // Check if any users have this role
    const userCount = await User.countDocuments({ role: role.name });

    if (userCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete role',
        message: `${userCount} user(s) still have this role. Please reassign them first.`,
        userCount
      });
    }

    await Role.findByIdAndDelete(id);

    res.json({
      message: 'Role deleted successfully',
      deletedRole: role.name
    });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Failed to delete role', details: error.message });
  }
};

/**
 * Get all permissions
 */
const getAllPermissions = async (req, res) => {
  try {
    const {
      resource,
      action,
      category,
      includeInactive = false
    } = req.query;

    const query = {};

    if (includeInactive !== 'true') {
      query.isActive = true;
    }

    if (resource) {
      query.resource = resource;
    }

    if (action) {
      query.action = action;
    }

    if (category) {
      query['metadata.category'] = category;
    }

    const permissions = await Permission.find(query).sort({ resource: 1, action: 1 });

    // Group by resource for better UI display
    const groupedPermissions = permissions.reduce((acc, perm) => {
      const resource = perm.resource;
      if (!acc[resource]) {
        acc[resource] = [];
      }
      acc[resource].push(perm.toClientJSON());
      return acc;
    }, {});

    res.json({
      permissions: permissions.map(p => p.toClientJSON()),
      groupedByResource: groupedPermissions,
      total: permissions.length
    });
  } catch (error) {
    console.error('Get all permissions error:', error);
    res.status(500).json({ error: 'Failed to fetch permissions', details: error.message });
  }
};

/**
 * Assign role to user
 */
const assignRoleToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role: roleName } = req.body;

    if (!roleName) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find role
    const role = await Role.findOne({ name: roleName.toLowerCase(), isActive: true })
      .populate('permissions');

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Update user
    user.role = role.name;
    user.roleRef = role._id;
    await user.save();

    res.json({
      message: 'Role assigned successfully',
      user: user.toClientJSON(),
      role: role.toClientJSON()
    });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ error: 'Failed to assign role', details: error.message });
  }
};

module.exports = {
  getAllRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getAllPermissions,
  assignRoleToUser
};

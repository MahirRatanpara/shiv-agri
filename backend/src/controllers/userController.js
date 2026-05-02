const User = require('../models/User');
const Role = require('../models/Role');

const normalizePhoneNumber = (phoneNumber = '') => String(phoneNumber).replace(/\D/g, '');

/**
 * Get all users with their roles
 */
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      role = ''
    } = req.query;

    // Build query
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      query.role = role;
    }

    // Get users with pagination
    const users = await User.find(query)
      .populate({
        path: 'roleRef',
        select: 'name displayName'
      })
      .select('_id name email role profilePhoto createdAt')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

/**
 * Get single user by ID
 */
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate({
        path: 'roleRef',
        populate: { path: 'permissions' }
      })
      .select('-refreshToken');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

/**
 * Update user role
 */
const updateUserRole = async (req, res) => {
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
    const role = await Role.findOne({ name: roleName }).populate('permissions');
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Update user
    user.role = role.name;
    user.roleRef = role._id;
    await user.save();

    // Return updated user
    const updatedUser = await User.findById(userId)
      .populate({
        path: 'roleRef',
        select: 'name displayName'
      })
      .select('_id name email role profilePhoto createdAt');

    res.json({
      message: `User role updated to ${role.displayName}`,
      user: updatedUser,
      role: {
        name: role.name,
        displayName: role.displayName,
        permissionCount: role.permissions.length
      }
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

/**
 * Delete user (soft delete or hard delete)
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent self-deletion
    if (req.user._id.toString() === userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting last admin
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({
          error: 'Cannot delete the last admin user'
        });
      }
    }

    await User.findByIdAndDelete(userId);

    res.json({
      message: 'User deleted successfully',
      deletedUser: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

/**
 * Lookup user by mobile number
 */
const lookupUserByPhone = async (req, res) => {
  try {
    const phone = String(req.query.phone || '').trim();
    const normalizedPhone = normalizePhoneNumber(phone);
    const localPhone = normalizedPhone.startsWith('91') ? normalizedPhone.slice(2) : normalizedPhone;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const user = await User.findOne({
      $or: [
        { 'metadata.phoneNumberNormalized': normalizedPhone },
        { 'metadata.phoneNumberNormalized': localPhone },
        { 'metadata.phoneNumber': phone },
        { 'metadata.phoneNumber': phone.replace(/\s+/g, '') },
        { 'metadata.phoneNumber': localPhone }
      ]
    }).select('_id name email role metadata.phoneNumber');

    if (!user) {
      return res.status(404).json({ error: 'User not found for this mobile number' });
    }

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.metadata?.phoneNumber || ''
      }
    });
  } catch (error) {
    console.error('Error looking up user by phone:', error);
    res.status(500).json({ error: 'Failed to lookup user' });
  }
};

module.exports = {
  getAllUsers,
  getUser,
  updateUserRole,
  deleteUser,
  lookupUserByPhone
};

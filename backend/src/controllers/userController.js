const User = require('../models/User');
const Role = require('../models/Role');
const logger = require('../utils/logger');
const { propagateIdentityToProjects } = require('../utils/identityPropagation');

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
      .select('_id name email role profilePhoto createdAt metadata.phoneNumber metadata.phoneCountryCode metadata.phoneNumberNormalized')
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

/**
 * Admin-only: update a user's identity (name / email / phone). Strict
 * uniqueness is enforced — the operation fails if the new email or phone
 * already belongs to another user. Empty strings clear the field.
 *
 * Body: { name?, email?, phone?, phoneCountryCode? }
 *   - email: null/'' clears the email
 *   - phone: digits-only, normalized internally; null/'' clears the phone
 */
const updateUserIdentity = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone, phoneCountryCode } = req.body || {};

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Snapshot the BEFORE state so we can detect which denormalized fields
    // need to be propagated to the user's projects after the save.
    const before = {
      name: user.name || '',
      email: user.email || '',
      phone: user.metadata?.phoneNumber || ''
    };

    // ---- Name ----
    if (typeof name === 'string') {
      const trimmed = name.trim();
      if (trimmed) user.name = trimmed;
    }

    // ---- Email ----
    if (email !== undefined) {
      const cleanEmail = email == null ? '' : String(email).trim().toLowerCase();
      if (cleanEmail !== (user.email || '')) {
        if (cleanEmail) {
          const taken = await User.findOne({ email: cleanEmail, _id: { $ne: user._id } })
            .select('_id')
            .lean();
          if (taken) {
            return res.status(409).json({ error: 'This email is already linked to another account.' });
          }
          user.email = cleanEmail;
        } else {
          user.email = undefined;
        }
      }
    }

    // ---- Phone ----
    if (phone !== undefined) {
      const rawPhone = phone == null ? '' : String(phone).trim();
      if (!rawPhone) {
        // Clearing the phone — remove all phone metadata.
        if (user.metadata) {
          user.metadata.phoneNumber = '';
          user.metadata.phoneCountryCode = '';
          user.metadata.phoneNumberNormalized = undefined;
        }
        user.phoneVerified = false;
      } else {
        const allDigits = normalizePhoneNumber(rawPhone);
        if (allDigits.length < 10) {
          return res.status(400).json({ error: 'Phone number must have at least 10 digits.' });
        }
        // Default to +91 if country code wasn't given AND the number is exactly 10 digits.
        const cc = String(phoneCountryCode || '').trim() || (allDigits.length === 10 ? '+91' : '');
        const ccDigits = cc.replace(/\D/g, '');
        const normalizedKey = ccDigits && !allDigits.startsWith(ccDigits)
          ? ccDigits + allDigits
          : allDigits;

        const taken = await User.findOne({
          _id: { $ne: user._id },
          'metadata.phoneNumberNormalized': normalizedKey
        }).select('_id').lean();
        if (taken) {
          return res.status(409).json({ error: 'This phone number is already linked to another account.' });
        }

        user.metadata = {
          ...(user.metadata?.toObject ? user.metadata.toObject() : (user.metadata || {})),
          phoneCountryCode: cc || user.metadata?.phoneCountryCode || '+91',
          phoneNumber: rawPhone,
          phoneNumberNormalized: normalizedKey
        };
      }
    }

    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'Email or phone already in use by another account.' });
      }
      throw err;
    }

    // Detect which identity fields actually changed, then push the new
    // values into every project's denormalized clientName/clientEmail/
    // clientPhone fields. Strict equality is fine here — both sides are
    // already normalised (trimmed, lowercased for email).
    const after = {
      name: user.name || '',
      email: user.email || '',
      phone: user.metadata?.phoneNumber || ''
    };
    const changes = {};
    if (after.name !== before.name) changes.name = after.name;
    if (after.email !== before.email) changes.email = after.email;
    if (after.phone !== before.phone) changes.phone = after.phone;

    // Best-effort denormalization sync to every project anchored on this
    // user. The util swallows its own errors so the admin's primary save
    // isn't blocked by a follow-up failure.
    const projectsUpdated = Object.keys(changes).length
      ? await propagateIdentityToProjects(user._id, changes)
      : 0;

    const fresh = await User.findById(user._id)
      .populate({ path: 'roleRef', select: 'name displayName' })
      .select('_id name email role profilePhoto createdAt metadata');

    res.json({
      success: true,
      message: projectsUpdated > 0
        ? `User identity updated. ${projectsUpdated} project${projectsUpdated === 1 ? '' : 's'} re-synced.`
        : 'User identity updated.',
      user: fresh,
      projectsUpdated
    });
  } catch (error) {
    console.error('Error updating user identity:', error);
    res.status(500).json({ error: 'Failed to update user identity' });
  }
};

/**
 * POST /api/users  (admin only)
 *
 * Pre-authorises someone to sign in. The system is invite-only: the login
 * endpoints refuse any identity that has no User record, so this is how staff
 * and farmers without a farm get access. (Registering a farm already
 * pre-provisions the client — see projectService.findOrCreateFarmerByPhone.)
 *
 * Body: { name, email?, phone?, phoneCountryCode?, role? } — at least one of
 * email or phone is required, since those are the two ways to authenticate.
 */
const createUser = async (req, res) => {
  try {
    const { name, email, phone, phoneCountryCode, role } = req.body || {};

    const cleanName = String(name || '').trim();
    const cleanEmail = email == null ? '' : String(email).trim().toLowerCase();
    const rawPhone = phone == null ? '' : String(phone).trim();

    if (!cleanName) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    if (!cleanEmail && !rawPhone) {
      return res.status(400).json({ error: 'Provide an email address, a mobile number, or both.' });
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    // ---- Phone normalisation, mirroring updateUserIdentity ----
    let phoneFields = null;
    if (rawPhone) {
      const allDigits = normalizePhoneNumber(rawPhone);
      if (allDigits.length < 10) {
        return res.status(400).json({ error: 'Phone number must have at least 10 digits.' });
      }
      const cc = String(phoneCountryCode || '').trim() || (allDigits.length === 10 ? '+91' : '');
      const ccDigits = cc.replace(/\D/g, '');
      const normalizedKey = ccDigits && !allDigits.startsWith(ccDigits)
        ? ccDigits + allDigits
        : allDigits;
      phoneFields = {
        phoneCountryCode: cc || '+91',
        phoneNumber: rawPhone,
        phoneNumberNormalized: normalizedKey
      };
    }

    // ---- Uniqueness: both identities are 1-1 with an account ----
    if (cleanEmail) {
      const taken = await User.findOne({ email: cleanEmail }).select('_id').lean();
      if (taken) {
        return res.status(409).json({ error: 'This email is already linked to an account.' });
      }
    }
    if (phoneFields) {
      const taken = await User.findOne({
        'metadata.phoneNumberNormalized': phoneFields.phoneNumberNormalized
      }).select('_id').lean();
      if (taken) {
        return res.status(409).json({ error: 'This phone number is already linked to an account.' });
      }
    }

    const requestedRole = String(role || 'user').trim() || 'user';
    const roleDoc = await Role.findOne({ name: requestedRole });
    if (!roleDoc) {
      return res.status(400).json({ error: `Unknown role "${requestedRole}".` });
    }

    const user = new User({
      name: cleanName,
      email: cleanEmail || undefined,
      role: requestedRole,
      roleRef: roleDoc._id,
      // Not verified yet — that happens when they complete an OTP sign-in.
      phoneVerified: false,
      ...(phoneFields ? { metadata: phoneFields } : {})
    });

    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'Email or phone already in use by another account.' });
      }
      throw err;
    }

    logger.info(`Admin ${req.user?._id} pre-authorised user ${user._id} (${cleanEmail || phoneFields?.phoneNumber})`);

    const fresh = await User.findById(user._id)
      .populate({ path: 'roleRef', select: 'name displayName' })
      .select('_id name email role profilePhoto createdAt metadata');

    res.status(201).json({
      success: true,
      message: 'User added. They can now sign in with the email or mobile number you provided.',
      user: fresh
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to add user' });
  }
};

module.exports = {
  getAllUsers,
  getUser,
  createUser,
  updateUserRole,
  updateUserIdentity,
  deleteUser,
  lookupUserByPhone
};

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    default: 'New User'
  },
  email: {
    // Optional — phone-only signups won't have one. Sparse unique allows multiple docs without email.
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    index: true
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  phoneVerifiedAt: {
    type: Date
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  profilePhoto: {
    type: String
  },
  role: {
    type: String,
    enum: ['admin', 'user', 'end_user', 'assistant', 'lab_technician', 'manager'],
    default: 'user',
    index: true
  },
  // Reference to Role document for RBAC
  roleRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  refreshToken: {
    // SHA-256 hash of the active opaque refresh token (see utils/session.js)
    type: String
  },
  refreshTokenExpiresAt: {
    type: Date
  },
  googleRefreshToken: {
    type: String
  },
  lastLogin: {
    type: Date
  },
  metadata: {
    department: String,
    designation: String,
    phoneCountryCode: String,
    phoneNumber: String,
    phoneNumberNormalized: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for performance
userSchema.index({ role: 1 });
// Phone is a unique identity just like email — one phone maps to exactly one user.
// Sparse so phone-less (Google-only) accounts don't collide on a missing value.
// NOTE: requires the migration in scripts/migrate-phone-email-unique.js to drop the
// legacy non-unique index and unset empty-string values before this can build.
userSchema.index({ 'metadata.phoneNumberNormalized': 1 }, { unique: true, sparse: true });

// Instance Methods
userSchema.methods.toClientJSON = function() {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    role: this.role,
    profilePhoto: this.profilePhoto,
    department: this.metadata?.department,
    designation: this.metadata?.designation,
    phoneCountryCode: this.metadata?.phoneCountryCode,
    phoneNumber: this.metadata?.phoneNumber,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt
  };
};

userSchema.methods.hasPermission = async function(permissionName) {
  // Admin has all permissions
  if (this.role === 'admin') {
    return true;
  }

  // Populate role with permissions if not already populated
  if (!this.roleRef || !this.roleRef.permissions) {
    await this.populate('roleRef');
    if (this.roleRef) {
      await this.roleRef.populate('permissions');
    }
  }

  if (!this.roleRef || !this.roleRef.permissions) {
    return false;
  }

  // Check if permission exists in role's permissions
  return this.roleRef.permissions.some(p => p.name === permissionName);
};

// Static Methods
userSchema.statics.findByRole = function(role) {
  return this.find({ role });
};

module.exports = mongoose.model('User', userSchema);

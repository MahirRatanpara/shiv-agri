const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    default: 'New User'
  },
  email: {
    // Optional — phone-only signups won't have one. Uniqueness is enforced
    // by an explicit *partial* index further down so the constraint only
    // applies to non-empty string values. `sparse: true` is NOT enough on
    // its own: Mongo sparse indexes still include documents where the field
    // is null or empty string, which would collide as soon as a second
    // blank-email user is created.
    type: String,
    required: false,
    lowercase: true,
    trim: true
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  phoneVerifiedAt: {
    type: Date
  },
  googleId: {
    // Uniqueness enforced by an explicit partial index below — same reason
    // as `email`: Mongo's sparse-unique still collides on null/empty values.
    type: String
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

// Identity uniqueness via *partial* indexes — they only cover documents
// where the field is a non-empty string. This is the only correct way to
// allow many phone-less / email-less / Google-less accounts without
// collisions on null or empty values (sparse alone won't do it).
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string', $gt: '' } }
  }
);
userSchema.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: { googleId: { $type: 'string', $gt: '' } }
  }
);
userSchema.index(
  { 'metadata.phoneNumberNormalized': 1 },
  {
    unique: true,
    partialFilterExpression: { 'metadata.phoneNumberNormalized': { $type: 'string', $gt: '' } }
  }
);

/**
 * Pre-save hygiene: strip empty strings on identity fields so the document
 * lands in the partial index's exclusion zone (and so `email === ''` can't
 * be saved by accident from a careless caller).
 */
userSchema.pre('save', function(next) {
  if (this.email === '' || this.email === null) this.email = undefined;
  if (this.googleId === '' || this.googleId === null) this.googleId = undefined;
  if (this.metadata) {
    if (this.metadata.phoneNumberNormalized === '' || this.metadata.phoneNumberNormalized === null) {
      this.metadata.phoneNumberNormalized = undefined;
    }
    if (this.metadata.phoneNumber === null) this.metadata.phoneNumber = '';
  }
  next();
});

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

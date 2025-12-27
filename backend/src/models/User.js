const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
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
    enum: ['admin', 'user', 'assistant', 'lab_technician', 'manager'],
    default: 'user',
    index: true
  },
  // Reference to Role document for RBAC
  roleRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  refreshToken: {
    type: String
  },
  lastLogin: {
    type: Date
  },
  metadata: {
    department: String,
    designation: String,
    phoneNumber: String
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

const mongoose = require('mongoose');

/**
 * Role Schema
 * Defines roles with their associated permissions
 */
const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    // Format: snake_case (e.g., 'admin', 'lab_technician')
    match: /^[a-z_]+$/,
    index: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  permissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission'
  }],
  isSystem: {
    type: Boolean,
    default: false,
    // System roles (admin, user, assistant) cannot be deleted
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  metadata: {
    color: {
      type: String,
      default: '#6366f1', // Default indigo color
      match: /^#[0-9A-Fa-f]{6}$/
    },
    icon: {
      type: String,
      default: 'user'
    },
    priority: {
      type: Number,
      default: 100,
      // Lower number = higher priority (for display ordering)
      min: 0
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
roleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for performance
roleSchema.index({ isActive: 1, name: 1 });
roleSchema.index({ isSystem: 1, isActive: 1 });
roleSchema.index({ 'metadata.priority': 1 });

// Virtual for user count
roleSchema.virtual('userCount', {
  ref: 'User',
  localField: 'name',
  foreignField: 'role',
  count: true
});

// Instance Methods
roleSchema.methods.toClientJSON = function() {
  return {
    id: this._id,
    name: this.name,
    displayName: this.displayName,
    description: this.description,
    permissions: this.permissions,
    isSystem: this.isSystem,
    isActive: this.isActive,
    color: this.metadata?.color,
    icon: this.metadata?.icon,
    priority: this.metadata?.priority,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

roleSchema.methods.hasPermission = function(permissionId) {
  return this.permissions.some(p => p.toString() === permissionId.toString());
};

roleSchema.methods.addPermission = function(permissionId) {
  if (!this.hasPermission(permissionId)) {
    this.permissions.push(permissionId);
  }
  return this;
};

roleSchema.methods.removePermission = function(permissionId) {
  this.permissions = this.permissions.filter(p => p.toString() !== permissionId.toString());
  return this;
};

// Static Methods
roleSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ 'metadata.priority': 1, name: 1 });
};

roleSchema.statics.findByName = function(name) {
  return this.findOne({ name: name.toLowerCase(), isActive: true });
};

roleSchema.statics.findSystemRoles = function() {
  return this.find({ isSystem: true, isActive: true }).sort({ 'metadata.priority': 1 });
};

roleSchema.statics.findCustomRoles = function() {
  return this.find({ isSystem: false, isActive: true }).sort({ 'metadata.priority': 1, name: 1 });
};

// Prevent deletion of system roles
roleSchema.pre('remove', function(next) {
  if (this.isSystem) {
    const error = new Error('Cannot delete system role');
    error.name = 'ValidationError';
    return next(error);
  }
  next();
});

roleSchema.pre('findOneAndDelete', async function(next) {
  const role = await this.model.findOne(this.getQuery());
  if (role && role.isSystem) {
    const error = new Error('Cannot delete system role');
    error.name = 'ValidationError';
    return next(error);
  }
  next();
});

module.exports = mongoose.model('Role', roleSchema);

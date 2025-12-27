const mongoose = require('mongoose');

/**
 * Permission Schema
 * Defines granular permissions for RBAC system
 */
const permissionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    // Format: resource.action (e.g., 'users.view', 'soil.sessions.create')
    match: /^[a-z]+(\.[a-z-]+)+$/,
    index: true
  },
  resource: {
    type: String,
    required: true,
    trim: true,
    // The resource this permission applies to (e.g., 'users', 'soil-sessions')
    index: true
  },
  action: {
    type: String,
    required: true,
    trim: true,
    // The action allowed (e.g., 'view', 'create', 'update', 'delete')
    enum: ['view', 'create', 'update', 'delete', 'approve', 'assign-role', 'generate', 'download', 'send', 'upload', 'export', 'assign'],
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  metadata: {
    // Additional metadata for future extensibility
    category: {
      type: String,
      enum: ['user-management', 'testing', 'projects', 'billing', 'files', 'reports', 'system', 'other'],
      default: 'other'
    },
    tags: [String]
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
permissionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for performance
permissionSchema.index({ resource: 1, action: 1 });
permissionSchema.index({ isActive: 1, resource: 1 });

// Instance Methods
permissionSchema.methods.toClientJSON = function() {
  return {
    id: this._id,
    name: this.name,
    resource: this.resource,
    action: this.action,
    description: this.description,
    isActive: this.isActive,
    category: this.metadata?.category,
    tags: this.metadata?.tags || []
  };
};

// Static Methods
permissionSchema.statics.findByResource = function(resource) {
  return this.find({ resource, isActive: true }).sort({ action: 1 });
};

permissionSchema.statics.findByAction = function(action) {
  return this.find({ action, isActive: true }).sort({ resource: 1 });
};

permissionSchema.statics.findByNames = function(names) {
  return this.find({ name: { $in: names }, isActive: true });
};

module.exports = mongoose.model('Permission', permissionSchema);

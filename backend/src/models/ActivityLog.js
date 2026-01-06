const mongoose = require('mongoose');

/**
 * ActivityLog Schema
 * Tracks all activities/changes related to projects
 */
const activityLogSchema = new mongoose.Schema({
  // Reference to project
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },

  // User who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  userName: {
    type: String // Denormalized for faster retrieval
  },

  userAvatar: {
    type: String // Denormalized for faster retrieval
  },

  // Action details
  actionType: {
    type: String,
    required: true,
    enum: [
      'created',
      'updated',
      'deleted',
      'visit_recorded',
      'expense_added',
      'payment_received',
      'document_uploaded',
      'comment_posted',
      'team_member_assigned',
      'team_member_removed',
      'contact_added',
      'contact_updated',
      'contact_removed',
      'milestone_added',
      'milestone_completed',
      'status_changed',
      'budget_updated',
      'cover_photo_changed',
      'other'
    ],
    index: true
  },

  // Human-readable description
  description: {
    type: String,
    required: true
  },

  // Action-specific metadata (flexible)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Changes made (for update actions)
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },

  // IP address and user agent for audit trail
  ipAddress: String,
  userAgent: String,

  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false } // Only need createdAt
});

// ========================
// Indexes for Performance
// ========================

// Compound index for project activity queries (most common)
activityLogSchema.index({ projectId: 1, timestamp: -1 });

// Compound index for user activity queries
activityLogSchema.index({ userId: 1, timestamp: -1 });

// Compound index for filtering by action type
activityLogSchema.index({ projectId: 1, actionType: 1, timestamp: -1 });

// TTL index to auto-delete old logs after 2 years (optional)
// activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 }); // 2 years

// ========================
// Static Methods
// ========================

/**
 * Log a project activity
 */
activityLogSchema.statics.logActivity = async function(projectId, userId, actionType, description, metadata = {}) {
  const User = mongoose.model('User');
  const user = await User.findById(userId).select('fullName avatar').lean();

  return this.create({
    projectId,
    userId,
    userName: user?.fullName || 'Unknown User',
    userAvatar: user?.avatar || null,
    actionType,
    description,
    metadata
  });
};

/**
 * Get activity log for a project
 */
activityLogSchema.statics.getProjectActivity = function(projectId, options = {}) {
  const {
    page = 1,
    limit = 50,
    actionType = null
  } = options;

  const query = { projectId };
  if (actionType) {
    query.actionType = Array.isArray(actionType) ? { $in: actionType } : actionType;
  }

  const skip = (page - 1) * limit;

  return this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Get activity count for a project
 */
activityLogSchema.statics.getProjectActivityCount = function(projectId, actionType = null) {
  const query = { projectId };
  if (actionType) {
    query.actionType = actionType;
  }
  return this.countDocuments(query);
};

/**
 * Get recent activities across all projects
 */
activityLogSchema.statics.getRecentActivities = function(userId = null, limit = 20) {
  const query = userId ? { userId } : {};
  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('projectId', 'name projectType status coverImage')
    .lean();
};

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;

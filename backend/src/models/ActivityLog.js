const mongoose = require('mongoose');
const { Schema } = mongoose;

const ACTION_TYPES = [
  'created', 'updated', 'deleted',
  'status_changed', 'budget_updated', 'cover_photo_changed',
  'contact_added', 'contact_updated', 'contact_removed',
  'milestone_added', 'milestone_completed',
  'team_member_assigned', 'team_member_removed',
  'expense_added', 'payment_received', 'transaction_updated', 'transaction_deleted',
  'visit_scheduled', 'visit_recorded', 'visit_completed', 'visit_cancelled',
  'document_uploaded', 'media_uploaded', 'media_deleted',
  'comment_posted', 'reaction_added',
  'task_created', 'task_completed', 'task_assigned',
  'other'
];

const activityLogSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String },
  userAvatar: { type: String },

  actionType: { type: String, enum: ACTION_TYPES, required: true },
  description: { type: String, required: true, trim: true },
  metadata: { type: Schema.Types.Mixed },
  changes: {
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed }
  },

  ipAddress: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now }
}, {
  timestamps: false
});

// ── Indexes ──

activityLogSchema.index({ projectId: 1, timestamp: -1 });
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ projectId: 1, actionType: 1, timestamp: -1 });

// ── Static methods ──

activityLogSchema.statics.logActivity = async function (projectId, userId, actionType, description, metadata = {}) {
  try {
    const User = mongoose.model('User');
    let userName = '', userAvatar = '';

    if (userId) {
      const user = await User.findById(userId).select('name profilePhoto').lean();
      if (user) {
        userName = user.name || '';
        userAvatar = user.profilePhoto || '';
      }
    }

    // Map common action strings to enum values
    const actionMap = {
      'debit': 'expense_added',
      'credit': 'payment_received',
      'create': 'created',
      'update': 'updated',
      'delete': 'deleted'
    };

    const resolvedAction = actionMap[actionType] || actionType;
    const validAction = ACTION_TYPES.includes(resolvedAction) ? resolvedAction : 'other';

    return await this.create({
      projectId,
      userId,
      userName,
      userAvatar,
      actionType: validAction,
      description,
      metadata: {
        ...metadata,
        originalAction: actionType !== validAction ? actionType : undefined
      }
    });
  } catch (err) {
    // Non-blocking: don't let logging failures break the main flow
    console.error('Activity log error:', err.message);
    return null;
  }
};

activityLogSchema.statics.getProjectActivity = async function (projectId, options = {}) {
  const { page = 1, limit = 20, actionType } = options;
  const query = { projectId };
  if (actionType) query.actionType = actionType;

  const skip = (page - 1) * limit;
  const [activities, total] = await Promise.all([
    this.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    activities,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrevious: page > 1
    }
  };
};

activityLogSchema.statics.getRecentActivities = async function (userId, limit = 10) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('projectId', 'name category status')
    .lean();
};

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;

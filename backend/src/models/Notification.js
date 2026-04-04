const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['comment', 'mention', 'task_assigned', 'visit_scheduled', 'project_update', 'milestone', 'system'],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  referenceId: { type: String },
  referenceType: { type: String },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

// ── Indexes ──

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // TTL: 30 days

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;

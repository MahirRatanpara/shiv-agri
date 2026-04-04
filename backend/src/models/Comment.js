const mongoose = require('mongoose');
const { Schema } = mongoose;

const commentSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String },
  userAvatar: { type: String },
  content: { type: String, required: true, maxlength: 2000 },
  mentions: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String }
  }],
  reactions: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String }
  }],
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, {
  timestamps: true
});

// ── Indexes ──

commentSchema.index({ projectId: 1, createdAt: -1 });
commentSchema.index({ parentId: 1 });

// ── Pre-save: populate userName from userId if not set ──

commentSchema.pre('save', async function (next) {
  if (!this.userName && this.userId) {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(this.userId).select('name profilePhoto').lean();
      if (user) {
        this.userName = user.name || '';
        if (!this.userAvatar) {
          this.userAvatar = user.profilePhoto || '';
        }
      }
    } catch (err) {
      // Non-blocking: don't let lookup failures break the save
    }
  }
  next();
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;

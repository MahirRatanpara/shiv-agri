const mongoose = require('mongoose');
const { Schema } = mongoose;

const taskSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['todo', 'in_progress', 'review', 'done'], default: 'todo' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  assignedToName: { type: String },
  dueDate: { type: Date },
  checklist: [{
    text: { type: String },
    isDone: { type: Boolean, default: false }
  }],
  tags: [{ type: String }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  completedAt: { type: Date }
}, {
  timestamps: true
});

// ── Indexes ──

taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ assignedTo: 1 });

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;

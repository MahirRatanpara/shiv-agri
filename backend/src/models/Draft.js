const mongoose = require('mongoose');
const { Schema } = mongoose;

const draftSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  wizardStep: { type: Number, default: 1, min: 1, max: 6 },
  draftData: { type: Schema.Types.Mixed, default: {} },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, {
  timestamps: true
});

draftSchema.index({ projectId: 1, createdBy: 1 });

const Draft = mongoose.model('Draft', draftSchema);

module.exports = Draft;

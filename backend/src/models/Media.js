const mongoose = require('mongoose');
const { Schema } = mongoose;

const mediaSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  category: { type: String, default: 'general', trim: true },
  data: { type: Buffer, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

mediaSchema.index({ projectId: 1, category: 1 });

module.exports = mongoose.model('Media', mediaSchema);

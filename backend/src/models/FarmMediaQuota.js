const mongoose = require('mongoose');

const farmMediaQuotaSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  isoWeek: {
    type: String,
    required: true,
    match: /^\d{4}-W\d{2}$/
  },
  uploadCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUploadAt: {
    type: Date
  }
}, {
  timestamps: true
});

farmMediaQuotaSchema.index({ projectId: 1, isoWeek: 1 }, { unique: true });

module.exports = mongoose.model('FarmMediaQuota', farmMediaQuotaSchema);

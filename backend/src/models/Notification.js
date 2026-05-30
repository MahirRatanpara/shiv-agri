const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'farm_registration',
      'farm_approved',
      'farm_rejected',
      'farm_media_upload',
      'farm_design_upload',
      'farm_prescription_upload',
      'farm_quotation_required',
      'farm_quotation_received',
      'farm_quotation_accepted',
      'system'
    ],
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  submittingUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    farmName: String,
    submitterName: String,
    rejectionReason: String,
    mediaId: String,
    mediaType: String,
    uploaderName: String,
    documentType: String,
    itemCount: Number,
    quotationId: String,
    amountPerYear: Number
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  archivedAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true
});

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, archivedAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

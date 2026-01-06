const mongoose = require('mongoose');

/**
 * Draft Model
 * Stores draft data for projects that are being created or edited
 * Each draft is linked to a project ID
 */
const draftSchema = new mongoose.Schema({
  // Link to the actual project
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },

  // Wizard step the user is currently on
  wizardStep: {
    type: Number,
    default: 1,
    min: 1,
    max: 6
  },

  // Draft data - stores all form data
  draftData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // User who created this draft
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient querying
draftSchema.index({ projectId: 1, createdBy: 1 });

// Pre-save middleware to update the updatedAt timestamp
draftSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Draft = mongoose.model('Draft', draftSchema);

module.exports = Draft;

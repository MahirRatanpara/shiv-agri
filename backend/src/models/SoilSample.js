const mongoose = require('mongoose');

const sampleSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SoilSession',
    required: true,
    index: true
  },
  sessionDate: {
    type: String,
    required: true,
    index: true
  },
  sessionVersion: {
    type: Number,
    required: true
  },

  // Sample number (user-entered for PDF)
  sampleNumber: {
    type: String,
    trim: true
  },

  // Farmer information
  farmersName: {
    type: String,
    trim: true,
    index: true
  },
  mobileNo: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  farmsName: {
    type: String,
    trim: true
  },
  taluka: {
    type: String,
    trim: true
  },

  // Soil measurements
  ph: {
    type: Number,
    default: null
  },
  ec: {
    type: Number,
    default: null
  },
  ocBlank: {
    type: Number,
    default: null
  },
  ocStart: {
    type: Number,
    default: null
  },
  ocEnd: {
    type: Number,
    default: null
  },
  p2o5R: {
    type: Number,
    default: null
  },
  k2oR: {
    type: Number,
    default: null
  },

  // Calculated fields
  ocDifference: {
    type: Number,
    default: null
  },
  ocPercent: {
    type: Number,
    default: null
  },
  p2o5: {
    type: Number,
    default: null
  },
  k2o: {
    type: Number,
    default: null
  },
  organicMatter: {
    type: Number,
    default: null
  },

  // Crop and recommendations
  cropName: {
    type: String,
    trim: true
  },
  cropType: {
    type: String,
    enum: ['normal', 'small-fruit', 'large-fruit', ''],
    default: '',
    trim: true
  },
  finalDeduction: {
    type: String,
    trim: true
  },

  // Link to fertilizer sample
  fertilizerSampleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FertilizerSample',
    default: null,
    index: true
  },

  // Classification Results (Gujarati)
  phResult: {
    type: String,
    default: ''
  },
  ecResult: {
    type: String,
    default: ''
  },
  nitrogenResult: {
    type: String,
    default: ''
  },
  phosphorusResult: {
    type: String,
    default: ''
  },
  potashResult: {
    type: String,
    default: ''
  },

  // Classification Results (English)
  phResultEn: {
    type: String,
    default: ''
  },
  ecResultEn: {
    type: String,
    default: ''
  },
  nitrogenResultEn: {
    type: String,
    default: ''
  },
  phosphorusResultEn: {
    type: String,
    default: ''
  },
  potashResultEn: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes
sampleSchema.index({ sessionId: 1, createdAt: -1 });
sampleSchema.index({ sessionDate: 1, createdAt: -1 });

// Static methods
sampleSchema.statics.deleteBySessionId = async function(sessionId) {
  return await this.deleteMany({ sessionId });
};

sampleSchema.statics.countBySessionId = async function(sessionId) {
  return await this.countDocuments({ sessionId });
};

module.exports = mongoose.model('SoilSample', sampleSchema, 'soil_samples');

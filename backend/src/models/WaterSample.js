const mongoose = require('mongoose');

const sampleSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WaterSession',
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

  // Farmer/Location information
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
  boreWellType: {
    type: String,
    trim: true
  },

  // Water measurements
  ph: {
    type: Number,
    default: null
  },
  ec: {
    type: Number,
    default: null
  },
  caMgBlank: {
    type: Number,
    default: null
  },
  caMgStart: {
    type: Number,
    default: null
  },
  caMgEnd: {
    type: Number,
    default: null
  },
  caMgDifference: {
    type: Number,
    default: null
  },
  caMg: {
    type: Number,
    default: null
  },
  na: {
    type: Number,
    default: null
  },
  sar: {
    type: Number,
    default: null
  },
  classification: {
    type: String,
    trim: true
  },
  co3Hco3: {
    type: Number,
    default: null
  },
  rsc: {
    type: Number,
    default: null
  },
  finalDeduction: {
    type: String,
    trim: true
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
  sarResult: {
    type: String,
    default: ''
  },
  rscResult: {
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
  sarResultEn: {
    type: String,
    default: ''
  },
  rscResultEn: {
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

module.exports = mongoose.model('WaterSample', sampleSchema, 'water_samples');

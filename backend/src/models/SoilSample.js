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
  finalDeduction: {
    type: String,
    trim: true
  },

  // pH Classifications
  phClassification: {
    type: String,
    default: ''
  },
  phClassificationEn: {
    type: String,
    default: ''
  },
  phLabel: {
    type: String,
    default: ''
  },
  phLabelEn: {
    type: String,
    default: ''
  },

  // EC Classifications
  ecClassification: {
    type: String,
    default: ''
  },
  ecClassificationEn: {
    type: String,
    default: ''
  },
  ecLabel: {
    type: String,
    default: ''
  },
  ecLabelEn: {
    type: String,
    default: ''
  },

  // Nitrogen/Organic Carbon Classifications
  nitrogenClassification: {
    type: String,
    default: ''
  },
  nitrogenClassificationEn: {
    type: String,
    default: ''
  },
  nitrogenLabel: {
    type: String,
    default: ''
  },
  nitrogenLabelEn: {
    type: String,
    default: ''
  },

  // Phosphorus Classifications
  phosphorusClassification: {
    type: String,
    default: ''
  },
  phosphorusClassificationEn: {
    type: String,
    default: ''
  },
  phosphorusLabel: {
    type: String,
    default: ''
  },
  phosphorusLabelEn: {
    type: String,
    default: ''
  },

  // Potash Classifications
  potashClassification: {
    type: String,
    default: ''
  },
  potashClassificationEn: {
    type: String,
    default: ''
  },
  potashLabel: {
    type: String,
    default: ''
  },
  potashLabelEn: {
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

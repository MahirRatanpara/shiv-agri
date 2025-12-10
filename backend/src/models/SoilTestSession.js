const mongoose = require('mongoose');

const soilTestDataSchema = new mongoose.Schema({
  farmersName: {
    type: String,
    trim: true
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
  cropName: {
    type: String,
    trim: true
  },
  finalDeduction: {
    type: String,
    trim: true
  }
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    index: true
  },
  version: {
    type: Number,
    required: true
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  endTime: {
    type: Date,
    default: null
  },
  data: [soilTestDataSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure unique date+version combinations
sessionSchema.index({ date: 1, version: 1 }, { unique: true });

// Update the updatedAt timestamp before saving
sessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('SoilTestSession', sessionSchema);

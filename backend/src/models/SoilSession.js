const mongoose = require('mongoose');

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
  status: {
    type: String,
    enum: ['started', 'details', 'ready', 'completed'],
    default: 'started',
    index: true
  },
  sampleCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

sessionSchema.index({ date: 1, version: 1 }, { unique: true });
sessionSchema.index({ lastActivity: -1 });
sessionSchema.index({ status: 1, lastActivity: -1 });

sessionSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.lastActivity = Date.now();
  }
  next();
});

sessionSchema.virtual('isCompleted').get(function() {
  return this.status === 'completed' || this.endTime !== null;
});

sessionSchema.methods.updateSampleCount = async function(count) {
  this.sampleCount = count;
  this.lastActivity = Date.now();
  return await this.save();
};

sessionSchema.methods.incrementSampleCount = async function() {
  this.sampleCount += 1;
  this.lastActivity = Date.now();
  return await this.save();
};

sessionSchema.methods.decrementSampleCount = async function() {
  if (this.sampleCount > 0) {
    this.sampleCount -= 1;
    this.lastActivity = Date.now();
    return await this.save();
  }
  return this;
};

module.exports = mongoose.model('SoilSession', sessionSchema, 'soil_sessions');

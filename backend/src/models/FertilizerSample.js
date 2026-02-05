const mongoose = require('mongoose');

const sampleSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FertilizerSession',
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

  // Type of fertilizer report
  type: {
    type: String,
    enum: ['normal', 'small-fruit', 'large-fruit'],
    required: true,
    index: true
  },

  // Common fields
  sampleNumber: {
    type: String,
    trim: true
  },
  farmerName: {
    type: String,
    trim: true,
    index: true
  },
  cropName: {
    type: String,
    trim: true
  },

  // Link to soil sample (for auto-created entries)
  soilSampleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SoilSample',
    default: null,
    index: true
  },

  // Normal Fertilizer Fields (Cotton/Regular crops)
  // Header
  nValue: { type: Number, default: null },
  pValue: { type: Number, default: null },
  kValue: { type: Number, default: null },

  // Section A - Organic Fertilizers
  organicManure: { type: Number, default: null },
  castorCake: { type: Number, default: null },
  gypsum: { type: Number, default: null },
  sardarAmin: { type: Number, default: null },
  micronutrient: { type: Number, default: null },
  borocol: { type: Number, default: null },
  ferrous: { type: Number, default: null },

  // Section B - Chemical Fertilizers
  dap: { type: Number, default: null },
  npk12: { type: Number, default: null },
  asp: { type: Number, default: null },
  narmadaPhos: { type: Number, default: null },
  ssp: { type: Number, default: null },
  ammoniumSulphate: { type: Number, default: null },
  mop: { type: Number, default: null },
  ureaBase: { type: Number, default: null },

  // Dose Fertilizers (After crop emergence)
  day15: { type: Number, default: null },
  day25Npk: { type: Number, default: null },
  day25Tricho: { type: Number, default: null },
  day30: { type: Number, default: null },
  day45: { type: Number, default: null },
  day60: { type: Number, default: null },
  day75: { type: Number, default: null },
  day90Urea: { type: Number, default: null },
  day90Mag: { type: Number, default: null },
  day105: { type: Number, default: null },
  day115: { type: Number, default: null },
  day130: { type: Number, default: null },
  day145: { type: Number, default: null },
  day160: { type: Number, default: null },

  // Spray Fertilizers (Normal crop - 9 sprays)
  spray1Npk: { type: Number, default: null },
  spray1Hormone: { type: String, default: '' },
  spray2Stage: { type: String, default: '' },
  spray2Npk: { type: Number, default: null },
  spray2Hormone: { type: String, default: '' },
  spray2HormoneDose: { type: String, default: '' },
  spray3Stage: { type: String, default: '' },
  spray3Npk: { type: Number, default: null },
  spray3Hormone: { type: String, default: '' },
  spray3HormoneDose: { type: String, default: '' },
  spray4Stage: { type: String, default: '' },
  spray4Npk: { type: Number, default: null },
  spray4Hormone: { type: String, default: '' },
  spray4HormoneDose: { type: String, default: '' },
  spray5Stage: { type: String, default: '' },
  spray5Npk: { type: Number, default: null },
  spray5Hormone: { type: String, default: '' },
  spray5HormoneDose: { type: String, default: '' },
  spray6Boron: { type: Number, default: null },
  spray6Hormone: { type: String, default: '' },
  spray6HormoneDose: { type: String, default: '' },
  spray7Stage: { type: String, default: '' },
  spray7Dose: { type: Number, default: null },
  spray7Hormone: { type: String, default: '' },
  spray7HormoneDose: { type: String, default: '' },
  spray8Micro: { type: Number, default: null },
  spray8Hormone: { type: String, default: '' },
  spray8HormoneDose: { type: String, default: '' },
  spray9Stage: { type: String, default: '' },
  spray9Dose: { type: Number, default: null },
  spray9Hormone: { type: String, default: '' },
  spray9HormoneDose: { type: String, default: '' },

  // Small Fruit Tree Fields
  // June section
  june_dap: { type: Number, default: null },
  june_npk: { type: Number, default: null },
  june_asp: { type: Number, default: null },
  june_narmada: { type: Number, default: null },
  june_ssp: { type: Number, default: null },
  june_as: { type: Number, default: null },
  june_mop: { type: Number, default: null },
  june_urea: { type: Number, default: null },

  // Month 2 section
  month2_dap: { type: Number, default: null },
  month2_npk: { type: Number, default: null },
  month2_asp: { type: Number, default: null },
  month2_narmada: { type: Number, default: null },
  month2_ssp: { type: Number, default: null },
  month2_as: { type: Number, default: null },
  month2_mop: { type: Number, default: null },
  month2_urea: { type: Number, default: null },

  // October section
  october_dap: { type: Number, default: null },
  october_npk: { type: Number, default: null },
  october_asp: { type: Number, default: null },
  october_narmada: { type: Number, default: null },
  october_ssp: { type: Number, default: null },
  october_as: { type: Number, default: null },
  october_mop: { type: Number, default: null },
  october_urea: { type: Number, default: null },

  // February section (shared by both small and large fruit)
  february_dap: { type: Number, default: null },
  february_npk: { type: Number, default: null },
  february_asp: { type: Number, default: null },
  february_narmada: { type: Number, default: null },
  february_ssp: { type: Number, default: null },
  february_as: { type: Number, default: null },
  february_mop: { type: Number, default: null },
  february_urea: { type: Number, default: null },

  // Large Fruit Tree Fields
  // August section
  august_dap: { type: Number, default: null },
  august_npk: { type: Number, default: null },
  august_asp: { type: Number, default: null },
  august_narmada: { type: Number, default: null },
  august_ssp: { type: Number, default: null },
  august_as: { type: Number, default: null },
  august_mop: { type: Number, default: null },
  august_urea: { type: Number, default: null },

  // Month 4 section
  month4_dap: { type: Number, default: null },
  month4_npk: { type: Number, default: null },
  month4_asp: { type: Number, default: null },
  month4_narmada: { type: Number, default: null },
  month4_ssp: { type: Number, default: null },
  month4_as: { type: Number, default: null },
  month4_mop: { type: Number, default: null },
  month4_urea: { type: Number, default: null },

  // Spray section (for fruit trees - 5 sprays)
  spray_npk1919: { type: Number, default: null },
  spray_npk0052: { type: Number, default: null },
  spray_npk1261: { type: Number, default: null },
  spray_npk1300: { type: Number, default: null },
  spray_micromix: { type: Number, default: null }
}, {
  timestamps: true
});

// Indexes
sampleSchema.index({ sessionId: 1, createdAt: -1 });
sampleSchema.index({ sessionDate: 1, createdAt: -1 });
sampleSchema.index({ type: 1, sessionId: 1 });

// Static methods
sampleSchema.statics.deleteBySessionId = async function(sessionId) {
  return await this.deleteMany({ sessionId });
};

sampleSchema.statics.countBySessionId = async function(sessionId) {
  return await this.countDocuments({ sessionId });
};

module.exports = mongoose.model('FertilizerSample', sampleSchema, 'fertilizer_samples');

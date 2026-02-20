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

  // Spray Fertilizers (Normal crop - 3 sprays with uniform structure)


  // Fruit Tree Fields (shared by small-fruit and large-fruit types)
  // M1 section - selected month name + fertilizer amounts
  m1_month: { type: String, default: null },
  m1_dap: { type: Number, default: null },
  m1_npk: { type: Number, default: null },
  m1_asp: { type: Number, default: null },
  m1_narmada: { type: Number, default: null },
  m1_ssp: { type: Number, default: null },
  m1_as: { type: Number, default: null },
  m1_mop: { type: Number, default: null },
  m1_urea: { type: Number, default: null },
  m1_borocol: { type: Number, default: null },
  m1_sardaramin: { type: Number, default: null },
  m1_chhaniyu: { type: Number, default: null },
  m1_erandakhol: { type: Number, default: null },

  // M2 section
  m2_month: { type: String, default: null },
  m2_dap: { type: Number, default: null },
  m2_npk: { type: Number, default: null },
  m2_asp: { type: Number, default: null },
  m2_narmada: { type: Number, default: null },
  m2_ssp: { type: Number, default: null },
  m2_as: { type: Number, default: null },
  m2_mop: { type: Number, default: null },
  m2_urea: { type: Number, default: null },

  // M3 section
  m3_month: { type: String, default: null },
  m3_dap: { type: Number, default: null },
  m3_npk: { type: Number, default: null },
  m3_asp: { type: Number, default: null },
  m3_narmada: { type: Number, default: null },
  m3_ssp: { type: Number, default: null },
  m3_as: { type: Number, default: null },
  m3_mop: { type: Number, default: null },
  m3_urea: { type: Number, default: null },
  m3_borocol: { type: Number, default: null },
  m3_sardaramin: { type: Number, default: null },
  m3_chhaniyu: { type: Number, default: null },
  m3_erandakhol: { type: Number, default: null },

  // M4 section
  m4_month: { type: String, default: null },
  m4_dap: { type: Number, default: null },
  m4_npk: { type: Number, default: null },
  m4_asp: { type: Number, default: null },
  m4_narmada: { type: Number, default: null },
  m4_ssp: { type: Number, default: null },
  m4_as: { type: Number, default: null },
  m4_mop: { type: Number, default: null },
  m4_urea: { type: Number, default: null },
  m4_borocol: { type: Number, default: null },
  m4_sardaramin: { type: Number, default: null },
  m4_chhaniyu: { type: Number, default: null },
  m4_erandakhol: { type: Number, default: null },

  // M5 - Spray section (for fruit trees)
  m5_npk1919: { type: Number, default: null },
  m5_npk0052: { type: Number, default: null },
  m5_npk1261: { type: Number, default: null },
  m5_npk1300: { type: Number, default: null },
  m5_micromix: { type: Number, default: null }
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

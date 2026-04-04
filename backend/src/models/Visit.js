const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Sub-schemas ──

const inspectionSchema = new Schema({
  cropHealth: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor', 'critical']
  },
  soilCondition: { type: String },
  waterLevel: { type: String },
  pestPresence: { type: Boolean, default: false },
  diseasePresence: { type: Boolean, default: false },
  weatherCondition: { type: String },
  observations: [{ type: String }],
  photos: [{ type: String }]
}, { _id: false });

const diagnosisIssueSchema = new Schema({
  type: { type: String },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical']
  },
  description: { type: String },
  affectedArea: { type: String }
}, { _id: false });

const diagnosisSchema = new Schema({
  issues: [diagnosisIssueSchema],
  labTestsRequired: [{ type: String }]
}, { _id: false });

const recommendationSchema = new Schema({
  action: { type: String },
  product: { type: String },
  dosage: { type: String },
  frequency: { type: String },
  duration: { type: String },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent']
  }
}, { _id: false });

const prescriptionSchema = new Schema({
  recommendations: [recommendationSchema],
  nextVisitSuggested: { type: Date },
  followUpRequired: { type: Boolean, default: false }
}, { _id: false });

// ── Main Visit schema ──

const visitSchema = new Schema({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  visitNumber: { type: Number },
  scheduledDate: { type: Date, required: true },
  actualDate: { type: Date },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'missed'],
    default: 'scheduled'
  },
  type: {
    type: String,
    enum: ['routine', 'emergency', 'follow_up', 'initial'],
    default: 'routine'
  },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  assignedToName: { type: String },

  inspection: inspectionSchema,
  diagnosis: diagnosisSchema,
  prescription: prescriptionSchema,

  notes: { type: String },
  duration: { type: Number }, // minutes
  location: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  completedAt: { type: Date }
}, {
  timestamps: true
});

// ── Indexes ──

visitSchema.index({ projectId: 1, scheduledDate: 1 });
visitSchema.index({ projectId: 1, status: 1 });
visitSchema.index({ assignedTo: 1, scheduledDate: 1 });

// ── Pre-save: auto-increment visitNumber per project ──

visitSchema.pre('save', async function (next) {
  if (this.isNew && !this.visitNumber) {
    const count = await mongoose.model('Visit').countDocuments({ projectId: this.projectId });
    this.visitNumber = count + 1;
  }
  next();
});

// ── Query middleware: populate assignedTo ──

visitSchema.pre('find', function () {
  this.populate('assignedTo', 'name email profilePhoto');
});

visitSchema.pre('findOne', function () {
  this.populate('assignedTo', 'name email profilePhoto');
});

const Visit = mongoose.model('Visit', visitSchema);

module.exports = Visit;

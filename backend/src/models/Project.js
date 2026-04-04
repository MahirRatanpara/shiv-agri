const mongoose = require('mongoose');
const { Schema } = mongoose;

const contactSchema = new Schema({
  fullName: { type: String, required: true, trim: true },
  designation: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  role: {
    type: String,
    enum: ['owner', 'manager', 'architect', 'supervisor', 'worker', 'consultant', 'vendor', 'other'],
    default: 'other'
  },
  isPrimary: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { _id: true, timestamps: false });

const milestoneSchema = new Schema({
  name: { type: String, required: true, trim: true },
  date: { type: Date },
  description: { type: String, trim: true },
  isCompleted: { type: Boolean, default: false },
  completedAt: { type: Date }
}, { _id: true, timestamps: false });

const budgetCategorySchema = new Schema({
  category: { type: String, required: true, trim: true },
  percentage: { type: Number, required: true, min: 0, max: 100 },
  amount: { type: Number, default: 0, min: 0 }
}, { _id: false });

const cropSchema = new Schema({
  name: { type: String, required: true, trim: true },
  variety: { type: String, trim: true },
  season: { type: String, enum: ['kharif', 'rabi', 'zaid', 'perennial', ''], default: '' },
  plantingDate: { type: Date },
  expectedHarvestDate: { type: Date },
  area: { type: Number, min: 0 }
}, { _id: true, timestamps: false });

const imageSchema = new Schema({
  url: { type: String, required: true },
  caption: { type: String, trim: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: true, timestamps: false });

const projectSchema = new Schema({
  // Core
  name: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['FARM', 'LANDSCAPING', 'GARDENING'],
    required: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['Upcoming', 'Running', 'Completed', 'On Hold', 'Cancelled'],
    default: 'Upcoming'
  },
  description: { type: String, trim: true },
  notes: { type: String, trim: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  tags: [{ type: String, trim: true }],

  // Client
  clientId: { type: Schema.Types.ObjectId, ref: 'User' },
  clientName: { type: String, trim: true },
  clientAvatar: { type: String },
  clientEmail: { type: String, trim: true, lowercase: true },
  clientPhone: { type: String, trim: true },
  alternativeContact: { type: String, trim: true },

  // Location
  location: {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    district: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    coordinates: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] } // [lng, lat]
    },
    mapUrl: { type: String, trim: true }
  },

  // Land Details
  landDetails: {
    totalArea: { type: Number, min: 0 },
    areaUnit: { type: String, enum: ['acres', 'hectares', 'sqm', 'sqft', 'bigha', 'vigha'], default: 'acres' },
    cultivableArea: { type: Number, min: 0 },
    cultivablePercentage: { type: Number, min: 0, max: 100 },
    soilType: { type: String, trim: true },
    waterSource: [{ type: String, trim: true }],
    irrigationSystem: { type: String, trim: true },
    terrainType: { type: String, trim: true }
  },

  // Budget
  budget: { type: Number, required: true, min: 0, default: 0 },
  expenses: { type: Number, default: 0, min: 0 },
  income: { type: Number, default: 0, min: 0 },
  budgetUtilizationPercentage: { type: Number, default: 0, min: 0 },
  budgetCategories: [budgetCategorySchema],

  // Timeline
  startDate: { type: Date },
  completionDate: { type: Date },
  expectedCompletionDate: { type: Date },

  // Team
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  assignedToName: { type: String, trim: true },
  projectManager: { type: Schema.Types.ObjectId, ref: 'User' },
  fieldWorkers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  consultants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  assignedTeam: [{ type: Schema.Types.ObjectId, ref: 'User' }],

  // Contacts
  contacts: [contactSchema],

  // Milestones
  milestones: [milestoneSchema],

  // Visit config
  totalVisitsPlanned: { type: Number, default: 0, min: 0 },
  totalVisitsCompleted: { type: Number, default: 0, min: 0 },
  visitCompletionPercentage: { type: Number, default: 0, min: 0 },
  visitFrequencyConfig: {
    frequency: { type: String, enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'custom', ''], default: '' },
    customDays: { type: Number, min: 1 },
    preferredDay: { type: String },
    preferredTime: { type: String }
  },
  numberOfYears: { type: Number, min: 0 },

  // Crops
  crops: [cropSchema],

  // Media
  coverImage: { type: String },
  thumbnailUrl: { type: String },
  images: [imageSchema],

  // Favorites
  isFavorite: [{ type: Schema.Types.ObjectId, ref: 'User' }],

  // Draft
  isDraft: { type: Boolean, default: false },

  // Size (legacy support)
  size: {
    value: { type: Number },
    unit: { type: String, enum: ['acres', 'hectares', 'sqm', 'sqft', ''], default: '' }
  },

  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User' },

  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ── Virtuals ──

projectSchema.virtual('fullLocation').get(function () {
  const parts = [this.location?.city, this.location?.district, this.location?.state].filter(Boolean);
  return parts.join(', ') || '';
});

projectSchema.virtual('budgetRemaining').get(function () {
  return (this.budget || 0) - (this.expenses || 0);
});

projectSchema.virtual('isOverBudget').get(function () {
  return (this.expenses || 0) > (this.budget || 0);
});

projectSchema.virtual('daysToCompletion').get(function () {
  if (!this.expectedCompletionDate) return null;
  const diff = this.expectedCompletionDate.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

projectSchema.virtual('isOverdue').get(function () {
  if (!this.expectedCompletionDate) return false;
  return this.expectedCompletionDate < new Date() && this.status !== 'Completed';
});

// ── Indexes ──

// Text search
projectSchema.index(
  { name: 'text', clientName: 'text', 'location.city': 'text', 'location.district': 'text', description: 'text', 'crops.name': 'text' },
  { weights: { name: 10, clientName: 5, 'location.city': 3, 'location.district': 2, 'crops.name': 2, description: 1 }, name: 'project_text_search' }
);

// Category composites
projectSchema.index({ category: 1, status: 1 });
projectSchema.index({ category: 1, 'location.city': 1 });
projectSchema.index({ category: 1, createdBy: 1 });
projectSchema.index({ category: 1, updatedAt: -1 });

// Filtering & sorting
projectSchema.index({ status: 1, 'location.city': 1 });
projectSchema.index({ assignedTo: 1, status: 1 });
projectSchema.index({ createdBy: 1, status: 1 });
projectSchema.index({ startDate: 1, status: 1 });
projectSchema.index({ 'location.city': 1 });
projectSchema.index({ 'location.state': 1 });
projectSchema.index({ budget: -1 });
projectSchema.index({ createdAt: -1 });
projectSchema.index({ updatedAt: -1 });
projectSchema.index({ isDraft: 1 });
projectSchema.index({ isDeleted: 1, createdAt: -1 });
projectSchema.index({ projectManager: 1 });

// Geospatial
projectSchema.index({ 'location.coordinates': '2dsphere' }, { sparse: true });

// ── Pre-save middleware ──

projectSchema.pre('save', function (next) {
  // Calculate budget utilization
  if (this.budget > 0) {
    this.budgetUtilizationPercentage = Math.round((this.expenses / this.budget) * 100 * 100) / 100;
  } else {
    this.budgetUtilizationPercentage = 0;
  }

  // Calculate visit completion
  if (this.totalVisitsPlanned > 0) {
    this.visitCompletionPercentage = Math.round((this.totalVisitsCompleted / this.totalVisitsPlanned) * 100 * 100) / 100;
  } else {
    this.visitCompletionPercentage = 0;
  }

  // Calculate budget category amounts
  if (this.budgetCategories && this.budgetCategories.length > 0 && this.budget > 0) {
    this.budgetCategories.forEach(cat => {
      cat.amount = Math.round((cat.percentage / 100) * this.budget * 100) / 100;
    });
  }

  // Validate and clean GeoJSON coordinates
  if (this.location?.coordinates) {
    const coords = this.location.coordinates.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2 ||
        typeof coords[0] !== 'number' || typeof coords[1] !== 'number' ||
        isNaN(coords[0]) || isNaN(coords[1])) {
      this.location.coordinates = undefined;
    }
  }

  // Auto-generate thumbnail from cover image
  if (this.coverImage && !this.thumbnailUrl) {
    this.thumbnailUrl = this.coverImage;
  }

  next();
});

// ── Query middleware (auto-exclude soft-deleted) ──

projectSchema.pre(/^find/, function (next) {
  if (this.getQuery().isDeleted === undefined && this.getQuery()._isAdminQuery !== true) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// ── Instance methods ──

projectSchema.methods.softDelete = function (userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

projectSchema.methods.addToFavorites = function (userId) {
  if (!this.isFavorite.includes(userId)) {
    this.isFavorite.push(userId);
  }
  return this.save();
};

projectSchema.methods.removeFromFavorites = function (userId) {
  this.isFavorite = this.isFavorite.filter(id => id.toString() !== userId.toString());
  return this.save();
};

// ── Static methods ──

projectSchema.statics.findActive = function () {
  return this.find({ isDeleted: { $ne: true } });
};

projectSchema.statics.findByStatus = function (status) {
  return this.find({ status, isDeleted: { $ne: true } });
};

projectSchema.statics.findByCategory = function (category) {
  return this.find({ category: category.toUpperCase(), isDeleted: { $ne: true } });
};

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;

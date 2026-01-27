const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    index: true // For search functionality
  },

  // Project Category - First-class taxonomy entity
  category: {
    type: String,
    enum: ['FARM', 'LANDSCAPING', 'GARDENING'],
    required: [true, 'Project category is required'],
    index: true, // For filtering performance
    uppercase: true // Always store in uppercase for consistency
  },

  // Legacy field - kept for backward compatibility
  projectType: {
    type: String,
    enum: ['farm', 'landscaping', 'gardening'],
    index: true // For filtering
  },

  status: {
    type: String,
    enum: ['Upcoming', 'Running', 'Completed', 'On Hold', 'Cancelled'],
    default: 'Upcoming',
    required: true,
    index: true // For filtering
  },

  // Client Information
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true // For filtering by client
  },
  clientName: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true,
    index: true // For search
  },
  clientAvatar: {
    type: String
  },
  clientEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  clientPhone: {
    type: String
  },
  alternativeContact: {
    type: String
  },

  // Location Information
  location: {
    address: { type: String, trim: true },
    city: { type: String, trim: true, index: true }, // Indexed for filtering
    district: { type: String, trim: true },
    state: { type: String, trim: true, index: true }, // Indexed for filtering
    postalCode: { type: String },
    pincode: { type: String }, // Keep for backward compatibility
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number] // [longitude, latitude] - GeoJSON format
    },
    mapUrl: { type: String } // Google Maps link
  },

  // Project Details
  size: {
    value: { type: Number },
    unit: { type: String, enum: ['acres', 'sqm', 'hectares'] }
  },

  // Land Details (for farms)
  landDetails: {
    totalArea: { type: Number },
    areaUnit: { type: String, enum: ['acres', 'hectares', 'sqmeters'], default: 'acres' },
    cultivableArea: { type: Number },
    cultivablePercentage: { type: Number }, // Calculated field
    soilType: { type: String },
    waterSource: [{ type: String }], // Array: bore well, canal, river, rainwater
    irrigationSystem: { type: String }, // drip, sprinkler, flood, mixed
    terrainType: { type: String } // flat, sloped, hilly, mixed
  },

  // Budget Information with categories
  budget: {
    type: Number,
    required: [true, 'Budget is required'],
    min: [0, 'Budget cannot be negative'],
    index: true // For sorting and filtering
  },

  budgetCategories: [{
    category: { type: String }, // Materials, Labor, Equipment, etc.
    percentage: { type: Number, min: 0, max: 100 },
    amount: { type: Number, min: 0 }
  }],

  expenses: {
    type: Number,
    default: 0,
    min: [0, 'Expenses cannot be negative']
  },

  // Computed field - will be calculated via aggregation
  budgetUtilizationPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  // Team Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true // For filtering
  },
  assignedToName: {
    type: String
  },
  projectManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  fieldWorkers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  consultants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  assignedTeam: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true // For team member filtering
  }],

  // Contacts Array
  contacts: [{
    contactId: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    fullName: { type: String, required: true },
    designation: { type: String },
    phone: { type: String, required: true },
    email: { type: String, lowercase: true },
    role: {
      type: String,
      enum: ['Owner', 'Manager', 'Architect', 'Supervisor', 'Worker', 'Consultant', 'Vendor', 'Other']
    },
    isPrimary: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
  }],

  // Dates
  startDate: {
    type: Date,
    index: true // For date range filtering and sorting
  },
  completionDate: {
    type: Date
  },
  expectedCompletionDate: {
    type: Date
  },

  // Project Media
  coverImage: {
    type: String // URL to cover photo
  },
  thumbnailUrl: {
    type: String // Thumbnail URL for faster loading
  },
  images: [{
    url: String,
    caption: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Project Specific Data
  crops: [{
    name: { type: String, trim: true },
    variety: { type: String, trim: true },
    season: { type: String, enum: ['Kharif', 'Rabi', 'Zaid', 'Perennial', ''] },
    plantingDate: { type: Date },
    expectedHarvestDate: { type: Date },
    area: { type: Number, min: 0 }
  }],

  soilType: {
    type: String
  },

  irrigationType: {
    type: String
  },

  description: {
    type: String,
    trim: true
  },

  notes: {
    type: String,
    trim: true
  },

  // Timeline & Milestones
  milestones: [{
    milestoneId: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    name: { type: String, required: true },
    date: { type: Date, required: true },
    description: { type: String },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date }
  }],

  // Progress Tracking
  visitCompletionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  totalVisitsPlanned: {
    type: Number,
    default: 0
  },

  totalVisitsCompleted: {
    type: Number,
    default: 0
  },

  visitFrequency: {
    type: Number, // Visits per year
    default: 0
  },

  numberOfVisits: {
    type: Number, // Total number of visits for the project
    default: 0,
    min: 0
  },

  numberOfYears: {
    type: Number, // Total duration of project in years
    default: 1,
    min: 0
  },

  // Note: Transactions are now stored in a separate Transaction collection
  // The expenses field below is automatically updated when transactions are created/updated/deleted

  // User Preferences
  isFavorite: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  tags: [{
    type: String,
    trim: true
  }],

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Draft & Wizard Data
  isDraft: {
    type: Boolean,
    default: false,
    index: true
  },

  draftData: {
    type: mongoose.Schema.Types.Mixed // Store partial wizard data
  },

  wizardStep: {
    type: Number,
    default: 1,
    min: 1,
    max: 6
  },

  // Soft Delete
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: {
    type: Date
  },

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ========================
// Indexes for Performance
// ========================

// Composite indexes for common filter combinations
// Category-based indexes (primary)
projectSchema.index({ category: 1, status: 1 }); // Primary category + status filter
projectSchema.index({ category: 1, 'location.city': 1 }); // Category + location filter
projectSchema.index({ category: 1, createdBy: 1 }); // Category + user filter
projectSchema.index({ category: 1, updatedAt: -1 }); // Category + recency

// Legacy projectType indexes (for backward compatibility)
projectSchema.index({ status: 1, projectType: 1 });
projectSchema.index({ projectType: 1, 'location.city': 1 });

// General indexes
projectSchema.index({ status: 1, 'location.city': 1 });
projectSchema.index({ assignedTo: 1, status: 1 });
projectSchema.index({ createdBy: 1, status: 1 });
projectSchema.index({ createdAt: -1 }); // For sorting by creation date
projectSchema.index({ updatedAt: -1 }); // For sorting by update date (most common)
projectSchema.index({ budget: -1 }); // For sorting by budget

// Text index for full-text search
projectSchema.index({
  name: 'text',
  clientName: 'text',
  'location.city': 'text',
  'location.district': 'text',
  description: 'text',
  'crops.name': 'text'
}, {
  weights: {
    name: 10,
    clientName: 5,
    'location.city': 3,
    description: 1,
    'crops.name': 2
  },
  name: 'ProjectSearchIndex'
});

// Compound index for date range queries
projectSchema.index({ startDate: 1, status: 1 });
projectSchema.index({ createdAt: 1, isDeleted: 1 });

// Geospatial index for location-based queries
// Geospatial index - sparse means it only indexes documents with valid coordinates
projectSchema.index({ 'location.coordinates': '2dsphere' }, { sparse: true });

// Index for project manager and team queries
projectSchema.index({ projectManager: 1, status: 1 });
projectSchema.index({ fieldWorkers: 1 });
projectSchema.index({ consultants: 1 });

// ========================
// Virtual Fields
// ========================

projectSchema.virtual('fullLocation').get(function() {
  if (!this.location) return '';
  const parts = [
    this.location.city,
    this.location.district,
    this.location.state
  ].filter(Boolean);
  return parts.join(', ');
});

projectSchema.virtual('budgetRemaining').get(function() {
  return this.budget - (this.expenses || 0);
});

projectSchema.virtual('isOverBudget').get(function() {
  return (this.expenses || 0) > this.budget;
});

projectSchema.virtual('daysToCompletion').get(function() {
  if (!this.expectedCompletionDate) return null;
  const today = new Date();
  const diffTime = this.expectedCompletionDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

projectSchema.virtual('isOverdue').get(function() {
  if (!this.expectedCompletionDate || this.status === 'Completed') return false;
  return new Date() > this.expectedCompletionDate;
});

// ========================
// Instance Methods
// ========================

projectSchema.methods.calculateBudgetUtilization = function() {
  if (!this.budget || this.budget === 0) return 0;
  return Math.round((this.expenses / this.budget) * 100);
};

projectSchema.methods.calculateVisitCompletion = function() {
  if (!this.totalVisitsPlanned || this.totalVisitsPlanned === 0) return 0;
  return Math.round((this.totalVisitsCompleted / this.totalVisitsPlanned) * 100);
};

projectSchema.methods.addToFavorites = function(userId) {
  if (!this.isFavorite.includes(userId)) {
    this.isFavorite.push(userId);
  }
  return this.save();
};

projectSchema.methods.removeFromFavorites = function(userId) {
  this.isFavorite = this.isFavorite.filter(id => !id.equals(userId));
  return this.save();
};

projectSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Note: Transaction methods have been moved to the separate Transaction model
// Transactions are now managed via the TransactionService

// ========================
// Static Methods
// ========================

projectSchema.statics.findActive = function() {
  return this.find({ isDeleted: false });
};

projectSchema.statics.findByStatus = function(status) {
  return this.find({ status, isDeleted: false });
};

projectSchema.statics.findByType = function(projectType) {
  return this.find({ projectType, isDeleted: false });
};

projectSchema.statics.searchProjects = function(searchQuery, filters = {}) {
  const query = { isDeleted: false };

  // Text search
  if (searchQuery) {
    query.$text = { $search: searchQuery };
  }

  // Add filters
  if (filters.status) query.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;

  // Category filter (primary)
  if (filters.category) {
    const categories = Array.isArray(filters.category) ? filters.category : [filters.category];
    query.category = { $in: categories.map(cat => cat.toUpperCase()) };
  }

  // Legacy projectType filter (for backward compatibility)
  if (filters.projectType) query.projectType = Array.isArray(filters.projectType) ? { $in: filters.projectType } : filters.projectType;

  if (filters.city) query['location.city'] = filters.city;
  if (filters.state) query['location.state'] = filters.state;
  if (filters.assignedTo) query.assignedTo = filters.assignedTo;

  return this.find(query);
};

// ========================
// Pre-save Middleware
// ========================

// Sync category with projectType for backward compatibility
projectSchema.pre('save', function(next) {
  // If category is set but projectType is not, sync projectType from category
  if (this.category && !this.projectType) {
    this.projectType = this.category.toLowerCase();
  }

  // If projectType is set but category is not, sync category from projectType
  if (this.projectType && !this.category) {
    this.category = this.projectType.toUpperCase();
  }

  // Ensure category is always uppercase
  if (this.category) {
    this.category = this.category.toUpperCase();
  }

  next();
});

// Clean up incomplete coordinates before saving
projectSchema.pre('save', function(next) {
  // If coordinates exist but are incomplete (missing the coordinates array), remove them
  if (this.location && this.location.coordinates) {
    const coords = this.location.coordinates;

    // Check if coordinates array is missing or empty
    if (!coords.coordinates || !Array.isArray(coords.coordinates) || coords.coordinates.length === 0) {
      // Remove the coordinates object entirely to avoid geospatial index errors
      this.location.coordinates = undefined;
    }
    // Validate coordinates if they exist
    else if (coords.coordinates.length !== 2 ||
             typeof coords.coordinates[0] !== 'number' ||
             typeof coords.coordinates[1] !== 'number') {
      // Invalid coordinates format, remove them
      this.location.coordinates = undefined;
    }
  }

  next();
});

projectSchema.pre('save', function(next) {
  // Note: Expenses are now automatically updated by the Transaction model
  // when transactions are created/updated/deleted

  // Update computed fields
  if (this.isModified('budget') || this.isModified('expenses')) {
    this.budgetUtilizationPercentage = this.calculateBudgetUtilization();
  }

  if (this.isModified('totalVisitsPlanned') || this.isModified('totalVisitsCompleted')) {
    this.visitCompletionPercentage = this.calculateVisitCompletion();
  }

  // Auto-generate thumbnail URL from cover image if not provided
  if (this.coverImage && !this.thumbnailUrl) {
    this.thumbnailUrl = this.coverImage; // In production, generate actual thumbnail
  }

  next();
});

// ========================
// Query Middleware
// ========================

// Exclude soft-deleted projects by default
projectSchema.pre(/^find/, function(next) {
  // Only apply to queries that don't explicitly set isDeleted
  if (!this.getQuery().hasOwnProperty('isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;

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
    enum: [
      'Upcoming', 'Running', 'Completed', 'On Hold', 'Cancelled',
      'pending_approval', 'approved', 'rejected',
      // Quotation workflow (farmer-submitted farms)
      'pending_quotation',   // Farmer submitted, awaiting quotation from manager
      'pending_acceptance'   // Manager submitted quotation, awaiting farmer acceptance
    ],
    default: 'Upcoming',
    required: true,
    index: true // For filtering
  },

  // Currently-active quotation for this project (the one shown to the farmer).
  // Updated whenever a manager submits a new quotation. Older quotations
  // remain in the Quotation collection with status 'superseded'.
  activeQuotation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quotation',
    index: true
  },

  // First-time approval timestamp via the quotation flow
  quotationAcceptedAt: { type: Date },

  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  submittedAt: {
    type: Date
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  approvedAt: {
    type: Date
  },

  rejectedReason: {
    type: String,
    trim: true,
    maxlength: 500
  },

  registrationSource: {
    type: String,
    enum: ['farmer_self', 'manager_direct'],
    index: true
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
    taluka: { type: String, trim: true, index: true },
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
    areaUnit: {
      type: String,
      enum: ['acres', 'hectares', 'sqmeters', 'vigha-16', 'vigha-24'],
      default: 'acres'
    },
    cultivableArea: { type: Number },
    cultivablePercentage: { type: Number }, // Calculated field
    soilType: { type: String },
    waterSource: [{ type: String }], // Legacy: bore well, canal, river, rainwater
    // Legacy single-source field. New code writes to irrigationSources[]
    // below; this stays for back-compat reads and is mirrored on save.
    irrigationSystem: { type: String },
    // Multi-select water sources (Bore, Well, Canal, River, Pond, Tank, ...).
    // Replaces irrigationSystem going forward.
    irrigationSources: [{ type: String, trim: true }],
    // How the field is watered (Drip, Flood, Sprinkler, Furrow, ...).
    irrigationMethod: { type: String, trim: true },
    terrainType: { type: String } // flat, sloped, hilly, mixed
  },

  // Electricity / Power Supply (for farms)
  electricity: {
    transformerHp: { type: Number, min: 0 }, // Transformer TC Horse Power
    motorCount: { type: Number, min: 0 }, // Number of electric motors
    totalMotorHp: { type: Number, min: 0 } // Combined HP across all motors
  },

  // Landscaping consultancy tag — orthogonal to category, identifies a farm
  // project that also needs landscaping consultancy work
  needsLandscapingConsultancy: {
    type: Boolean,
    default: false,
    index: true
  },

  // Online (remote) visit projects skip on-site visit count tracking
  isOnlineVisit: {
    type: Boolean,
    default: false
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

  // Farm media (photos/videos uploaded by the farm owner via Media Service)
  farmMedia: [{
    mediaId: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true },
    sizeBytes: { type: Number },
    status: { type: String, default: 'ACTIVE' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: { type: String },
    uploadedAt: { type: Date, default: Date.now, index: true },
    // Tracks whether this upload counted toward the farmer's weekly quota.
    // Farmer uploads default to true; admin/manager uploads bypass the quota
    // and are stamped countsTowardQuota=false so deletes don't refund anything.
    countsTowardQuota: { type: Boolean, default: true },
    // Attended workflow: new uploads land in the "unattended" bucket
    // (shown as thumbnails). The project's owner/workers can acknowledge
    // them by marking attended, which moves them to the paginated drawer.
    attended: { type: Boolean, default: false },
    attendedAt: { type: Date },
    attendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    attendedByName: { type: String },
    // Soft-delete metadata (populated when an admin/manager removes the item)
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // Landscaping designs (images/videos uploaded by managers/admins for landscaping projects)
  landscapingDesigns: [{
    mediaId: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true },
    sizeBytes: { type: Number },
    title: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: { type: String, default: 'ACTIVE' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: { type: String },
    uploadedAt: { type: Date, default: Date.now, index: true },
    // Soft-delete metadata
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // Lab testing reports linked to this farm (soil / water / fertilizer).
  // Auto-populated on PDF generation when the sample's farmsName + mobileNo
  // match this project's name + clientPhone (case-insensitive farmsName,
  // last-10-digits mobileNo). One entry per (sampleType + sampleId).
  reports: [{
    sampleType: {
      type: String,
      enum: ['soil', 'water', 'fertilizer'],
      required: true,
      index: true
    },
    sampleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'reports.sampleModel',
      index: true
    },
    sampleModel: {
      type: String,
      enum: ['SoilSample', 'WaterSample', 'FertilizerSample'],
      required: true
    },
    sessionId: { type: mongoose.Schema.Types.ObjectId },
    sampleNumber: { type: String, trim: true },
    farmerName: { type: String, trim: true },
    farmsName: { type: String, trim: true },
    mobileNo: { type: String, trim: true },
    cropName: { type: String, trim: true },
    fertilizerType: { type: String, trim: true },
    sessionDate: { type: String, trim: true },
    generatedAt: { type: Date, default: Date.now, index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    generatedByName: { type: String }
  }],

  // Manually-uploaded farm reports (images / PDFs attached by admin/manager
  // to supplement the auto-linked soil/water/fertilizer reports). Auto-linked
  // reports remain in `reports[]` above and are never written here.
  manualReports: [{
    mediaId: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number },
    fileName: { type: String, trim: true },
    title: { type: String, trim: true },
    notes: { type: String, trim: true },
    // Optional categorization so the UI can show a chip (soil/water/fertilizer/other).
    sampleType: {
      type: String,
      enum: ['soil', 'water', 'fertilizer', 'other'],
      default: 'other'
    },
    status: { type: String, default: 'ACTIVE' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: { type: String },
    uploadedAt: { type: Date, default: Date.now, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // Prescriptions and ad-hoc documents (uploaded by managers/admins; farm user reads only)
  prescriptions: [{
    // 'file' for uploaded media, 'manual' for free-text prescriptions composed in-app,
    // 'structured' for the Shiv Agri standard visit-prescription form (matches printed slip)
    source: { type: String, enum: ['file', 'manual', 'structured'], default: 'file' },
    docType: {
      type: String,
      enum: ['image', 'video', 'pdf', 'docx', 'text', 'manual', 'structured'],
      required: true
    },
    title: { type: String, trim: true },
    notes: { type: String, trim: true },
    // Inline text for text-based or manual prescriptions
    textContent: { type: String, trim: true },
    // For uploaded files
    mediaId: { type: String },
    url: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    fileName: { type: String, trim: true },

    // Structured prescription payload (used when docType === 'structured').
    // Mirrors the printed visit slip used by field consultants.
    structured: {
      farmerName: { type: String, trim: true },
      visitDate: { type: Date },
      lastVisitReview: { type: String, trim: true },
      landPreparation: { type: String, trim: true },
      sowingPlanting: { type: String, trim: true },
      farmingOperations: {
        leveling: { type: Boolean, default: false },
        marking: { type: Boolean, default: false },
        digging: { type: Boolean, default: false },
        soilFilling: { type: Boolean, default: false },
        tractor: { type: Boolean, default: false },
        supports: { type: Boolean, default: false },
        fillGaps: { type: Boolean, default: false },
        pruning: { type: Boolean, default: false },
        other: { type: String, trim: true }
      },
      irrigation: { type: String, trim: true },
      weedControl: { type: String, trim: true },
      fertilizers: {
        farmyardManure: { type: Boolean, default: false },
        chemical: { type: Boolean, default: false },
        organic: { type: Boolean, default: false },
        jivamrut: { type: Boolean, default: false },
        spray: { type: Boolean, default: false }
      },
      pests: {
        soilBorne: { type: Boolean, default: false },
        root: { type: Boolean, default: false },
        stem: { type: Boolean, default: false },
        leaf: { type: Boolean, default: false },
        flower: { type: Boolean, default: false },
        fruit: { type: Boolean, default: false }
      },
      diseases: {
        soilBorne: { type: Boolean, default: false },
        stem: { type: Boolean, default: false },
        branch: { type: Boolean, default: false },
        leaf: { type: Boolean, default: false },
        flower: { type: Boolean, default: false },
        fruit: { type: Boolean, default: false },
        other: { type: Boolean, default: false }
      },
      hormoneTreatment: { type: Boolean, default: false },
      fruitHarvesting: { type: Boolean, default: false },
      grading: { type: Boolean, default: false },
      packing: { type: Boolean, default: false },
      otherNotes: { type: String, trim: true }
    },

    // Photos appended to a structured prescription (rendered at the end of the PDF)
    attachedImages: [{
      mediaId: { type: String },
      url: { type: String },
      mimeType: { type: String },
      sizeBytes: { type: Number },
      fileName: { type: String, trim: true }
    }],

    status: { type: String, default: 'ACTIVE' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: { type: String },
    uploadedAt: { type: Date, default: Date.now, index: true },
    // Soft-delete metadata
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // Project Specific Data
  crops: [{
    name: { type: String, trim: true },
    variety: { type: String, trim: true },
    season: { type: String, enum: ['Kharif', 'Rabi', 'Zaid', 'Perennial', ''] },
    plantingDate: { type: Date },
    expectedHarvestDate: { type: Date },
    area: { type: Number, min: 0 },
    // Crop age in years (relevant for perennials / orchards).
    cropAge: { type: Number, min: 0 },
    // Total number of trees / plants for the crop.
    totalTrees: { type: Number, min: 0 },
    // Spacing between plants, free text so users can type "5x5 ft" or "3m x 3m".
    spacing: { type: String, trim: true }
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
  },

  // Archive (admin-controlled). Archived projects remain visible but
  // are read-only — no further uploads or status changes allowed.
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },

  archivedAt: {
    type: Date
  },

  archivedBy: {
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
projectSchema.index({ status: 1, submittedBy: 1 });
projectSchema.index({ registrationSource: 1, status: 1 });

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

  // Mirror legacy single irrigationSystem field <-> new irrigationSources[]
  // so both API styles remain readable during the migration window.
  if (this.landDetails) {
    const sources = Array.isArray(this.landDetails.irrigationSources)
      ? this.landDetails.irrigationSources.filter(Boolean)
      : [];
    if (sources.length) {
      this.landDetails.irrigationSystem = sources.join(', ');
    } else if (this.landDetails.irrigationSystem) {
      // Backfill irrigationSources[] from the legacy single field on first save.
      this.landDetails.irrigationSources = this.landDetails.irrigationSystem
        .split(/[,;/]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

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

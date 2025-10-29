const mongoose = require('mongoose');

const FileUploadSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  fileType: {
    type: String,
    enum: ['DESIGN_FILE', 'DRONE_VIDEO', 'QUOTATION', 'INVOICE', 'AUTOCAD', 'PDF', 'IMAGE'],
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

const ContactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: /^[0-9]{10}$/
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: /^\S+@\S+\.\S+$/
  },
  role: {
    type: String,
    enum: ['OWNER', 'ARCHITECT', 'WORKER', 'SUPERVISOR', 'OTHER'],
    required: true,
    default: 'OWNER'
  },
  isPrimary: {
    type: Boolean,
    default: false
  }
});

const LocationSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  pincode: {
    type: String,
    required: true,
    trim: true
  },
  coordinates: {
    latitude: {
      type: Number,
      default: 0
    },
    longitude: {
      type: Number,
      default: 0
    }
  },
  mapUrl: {
    type: String,
    trim: true
  }
});

const LandInfoSchema = new mongoose.Schema({
  size: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    enum: ['sqft', 'acres', 'sqm'],
    required: true,
    default: 'sqft'
  },
  soilType: {
    type: String,
    trim: true
  },
  irrigationType: {
    type: String,
    trim: true
  },
  waterSource: {
    type: String,
    trim: true
  },
  coordinates: {
    type: String,
    trim: true
  }
});

const ProjectSchema = new mongoose.Schema({
  projectName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  farmName: {
    type: String,
    trim: true,
    index: true
  },
  status: {
    type: String,
    enum: ['COMPLETED', 'RUNNING', 'UPCOMING'],
    required: true,
    default: 'UPCOMING',
    index: true
  },
  location: {
    type: LocationSchema,
    required: true
  },
  landInfo: {
    type: LandInfoSchema,
    required: true
  },
  contacts: {
    type: [ContactSchema],
    validate: {
      validator: function(contacts) {
        return contacts && contacts.length > 0;
      },
      message: 'At least one contact is required'
    }
  },
  description: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date,
    index: true
  },
  endDate: {
    type: Date
  },
  estimatedCost: {
    type: Number,
    min: 0,
    default: 0
  },
  actualCost: {
    type: Number,
    min: 0,
    default: 0
  },
  files: {
    type: [FileUploadSchema],
    default: []
  },
  notes: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
ProjectSchema.index({ projectName: 'text', farmName: 'text', 'location.city': 'text' });
ProjectSchema.index({ status: 1, createdAt: -1 });
ProjectSchema.index({ 'location.city': 1, status: 1 });

// Virtual for calculating project duration
ProjectSchema.virtual('duration').get(function() {
  if (this.startDate && this.endDate) {
    return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
  }
  return null;
});

// Method to add file
ProjectSchema.methods.addFile = function(fileData) {
  this.files.push(fileData);
  return this.save();
};

// Method to remove file
ProjectSchema.methods.removeFile = function(fileId) {
  this.files = this.files.filter(file => file._id.toString() !== fileId.toString());
  return this.save();
};

// Method to get primary contact
ProjectSchema.methods.getPrimaryContact = function() {
  return this.contacts.find(contact => contact.isPrimary) || this.contacts[0];
};

// Method to get contact by role
ProjectSchema.methods.getContactByRole = function(role) {
  return this.contacts.filter(contact => contact.role === role);
};

// Static method to get projects by status
ProjectSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

// Static method to get projects by city
ProjectSchema.statics.findByCity = function(city) {
  return this.find({ 'location.city': city });
};

// Static method to search projects
ProjectSchema.statics.searchProjects = function(searchTerm) {
  return this.find({
    $text: { $search: searchTerm }
  }).sort({ score: { $meta: 'textScore' } });
};

// Pre-save hook to ensure at least one primary contact
ProjectSchema.pre('save', function(next) {
  if (this.contacts && this.contacts.length > 0) {
    const hasPrimary = this.contacts.some(contact => contact.isPrimary);
    if (!hasPrimary) {
      this.contacts[0].isPrimary = true;
    }
  }
  next();
});

const Project = mongoose.model('Project', ProjectSchema);

module.exports = Project;

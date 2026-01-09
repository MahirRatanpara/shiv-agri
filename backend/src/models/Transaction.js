const mongoose = require('mongoose');

/**
 * Transaction Model
 * Separate document for managing project transactions (expenses and income)
 * Linked to projects via projectId
 */

const transactionSchema = new mongoose.Schema({
  // Project Reference
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project ID is required'],
    index: true // CRITICAL: For efficient lookup of transactions by project
  },

  // Transaction Details
  description: {
    type: String,
    required: [true, 'Transaction description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },

  amount: {
    type: Number,
    required: [true, 'Transaction amount is required'],
    min: [0, 'Amount cannot be negative']
  },

  type: {
    type: String,
    enum: ['debit', 'credit'], // debit = expense (subtract), credit = income (add)
    required: [true, 'Transaction type is required'],
    default: 'debit',
    index: true // For filtering by type
  },

  category: {
    type: String,
    trim: true,
    maxlength: [100, 'Category cannot exceed 100 characters'],
    index: true // For category-based reporting
  },

  date: {
    type: Date,
    required: [true, 'Transaction date is required'],
    default: Date.now,
    index: true // CRITICAL: For date-based queries and sorting
  },

  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // For user-based filtering
  },

  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ========================
// Indexes for Performance
// ========================

// Compound indexes for common query patterns
transactionSchema.index({ projectId: 1, date: -1 }); // Most common: get transactions by project, sorted by date
transactionSchema.index({ projectId: 1, type: 1 }); // Filter transactions by project and type
transactionSchema.index({ projectId: 1, category: 1 }); // Category-based reports per project
transactionSchema.index({ projectId: 1, createdAt: -1 }); // Recently created transactions per project
transactionSchema.index({ createdBy: 1, date: -1 }); // User's transaction history
transactionSchema.index({ projectId: 1, isDeleted: 1, date: -1 }); // Active transactions by date

// ========================
// Virtual Fields
// ========================

transactionSchema.virtual('formattedAmount').get(function () {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(this.amount);
});

transactionSchema.virtual('transactionType').get(function () {
  return this.type === 'debit' ? 'Expense' : 'Income';
});

// ========================
// Instance Methods
// ========================

transactionSchema.methods.softDelete = function (userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// ========================
// Static Methods
// ========================

/**
 * Get transactions by project ID with pagination
 */
transactionSchema.statics.getByProject = function (projectId, options = {}) {
  const {
    page = 1,
    limit = 20,
    sortBy = 'date',
    sortOrder = 'desc',
    type = null,
    category = null,
    startDate = null,
    endDate = null
  } = options;

  const query = {
    projectId,
    isDeleted: false
  };

  // Add filters
  if (type) query.type = type;
  if (category) query.category = category;
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  return this.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('createdBy', 'name email')
    .populate('lastUpdatedBy', 'name email')
    .lean();
};

/**
 * Count transactions for a project
 */
transactionSchema.statics.countByProject = function (projectId, filters = {}) {
  const query = {
    projectId,
    isDeleted: false,
    ...filters
  };
  return this.countDocuments(query);
};

/**
 * Get transaction summary for a project
 */
transactionSchema.statics.getSummaryByProject = async function (projectId) {
  const result = await this.aggregate([
    {
      $match: {
        projectId: new mongoose.Types.ObjectId(projectId),
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const summary = {
    totalCredits: 0,
    totalDebits: 0,
    netExpense: 0,
    transactionCount: 0
  };

  result.forEach(item => {
    if (item._id === 'credit') {
      summary.totalCredits = item.total;
    } else if (item._id === 'debit') {
      summary.totalDebits = item.total;
    }
    summary.transactionCount += item.count;
  });

  summary.netExpense = summary.totalDebits - summary.totalCredits;

  return summary;
};

/**
 * Get category-wise breakdown for a project
 */
transactionSchema.statics.getCategoryBreakdown = function (projectId) {
  return this.aggregate([
    {
      $match: {
        projectId: new mongoose.Types.ObjectId(projectId),
        isDeleted: false,
        category: { $exists: true, $ne: null, $ne: '' }
      }
    },
    {
      $group: {
        _id: { category: '$category', type: '$type' },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { total: -1 }
    }
  ]);
};

/**
 * Delete all transactions for a project (cascade delete)
 */
transactionSchema.statics.deleteByProject = function (projectId, userId) {
  return this.updateMany(
    { projectId },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: userId
    }
  );
};

// ========================
// Query Middleware
// ========================

// Exclude soft-deleted transactions by default
transactionSchema.pre(/^find/, function (next) {
  if (!this.getQuery().hasOwnProperty('isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// ========================
// Post-save Middleware (Update Project Expenses)
// ========================

/**
 * After saving/updating/deleting a transaction, update the project's total expenses
 */
async function updateProjectExpenses(transactionDoc) {
  try {
    const Transaction = mongoose.model('Transaction');
    const Project = mongoose.model('Project');

    // Calculate new total expenses for the project
    const summary = await Transaction.getSummaryByProject(transactionDoc.projectId);

    // Update project expenses
    await Project.findByIdAndUpdate(
      transactionDoc.projectId,
      {
        expenses: summary.netExpense,
        budgetUtilizationPercentage: null // Will be recalculated by Project model
      }
    );

    console.log(`[Transaction] Updated project ${transactionDoc.projectId} expenses to ${summary.netExpense}`);
  } catch (error) {
    console.error('[Transaction] Error updating project expenses:', error);
    // Don't throw error to prevent transaction save from failing
  }
}

transactionSchema.post('save', function (doc) {
  updateProjectExpenses(doc);
});

transactionSchema.post('remove', function (doc) {
  updateProjectExpenses(doc);
});

transactionSchema.post('findOneAndUpdate', async function (doc) {
  if (doc) {
    await updateProjectExpenses(doc);
  }
});

transactionSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    await updateProjectExpenses(doc);
  }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;

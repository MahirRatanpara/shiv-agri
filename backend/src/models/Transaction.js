const mongoose = require('mongoose');
const { Schema } = mongoose;

const transactionSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },

  description: { type: String, required: true, trim: true, maxlength: 500 },
  amount: { type: Number, required: true, min: 0 },
  type: { type: String, enum: ['debit', 'credit'], required: true },
  category: { type: String, trim: true, maxlength: 100 },
  date: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true, maxlength: 1000 },

  // Payment details
  paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other', ''], default: '' },
  referenceNumber: { type: String, trim: true },

  // Vendor info (for expenses)
  vendor: {
    name: { type: String, trim: true },
    contact: { type: String, trim: true },
    gstin: { type: String, trim: true }
  },

  // Attachments
  receiptUrl: { type: String },
  invoiceNumber: { type: String, trim: true },

  // Tags
  tags: [{ type: String, trim: true }],

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

transactionSchema.virtual('formattedAmount').get(function () {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(this.amount);
});

transactionSchema.virtual('transactionType').get(function () {
  return this.type === 'debit' ? 'Expense' : 'Income';
});

// ── Indexes ──

transactionSchema.index({ projectId: 1, date: -1 });
transactionSchema.index({ projectId: 1, type: 1 });
transactionSchema.index({ projectId: 1, category: 1 });
transactionSchema.index({ projectId: 1, createdAt: -1 });
transactionSchema.index({ createdBy: 1, date: -1 });
transactionSchema.index({ projectId: 1, isDeleted: 1, date: -1 });

// ── Query middleware (auto-exclude soft-deleted) ──

transactionSchema.pre(/^find/, function (next) {
  if (this.getQuery().isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// ── Instance methods ──

transactionSchema.methods.softDelete = function (userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// ── Static methods ──

transactionSchema.statics.getByProject = async function (projectId, options = {}) {
  const { page = 1, limit = 50, sortBy = 'date', sortOrder = -1, type, category } = options;
  const query = { projectId, isDeleted: { $ne: true } };
  if (type) query.type = type;
  if (category) query.category = category;

  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    this.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email profilePhoto')
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    transactions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrevious: page > 1
    }
  };
};

transactionSchema.statics.getSummaryByProject = async function (projectId) {
  const result = await this.aggregate([
    { $match: { projectId: new mongoose.Types.ObjectId(projectId), isDeleted: { $ne: true } } },
    {
      $group: {
        _id: null,
        totalCredits: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
        totalDebits: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
        transactionCount: { $sum: 1 }
      }
    }
  ]);

  if (result.length === 0) {
    return { totalCredits: 0, totalDebits: 0, netAmount: 0, transactionCount: 0 };
  }

  const { totalCredits, totalDebits, transactionCount } = result[0];
  return { totalCredits, totalDebits, netAmount: totalCredits - totalDebits, transactionCount };
};

transactionSchema.statics.getCategoryBreakdown = async function (projectId) {
  return this.aggregate([
    { $match: { projectId: new mongoose.Types.ObjectId(projectId), isDeleted: { $ne: true } } },
    {
      $group: {
        _id: { category: '$category', type: '$type' },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { total: -1 } }
  ]);
};

transactionSchema.statics.deleteByProject = async function (projectId, userId) {
  return this.updateMany(
    { projectId, isDeleted: { $ne: true } },
    { isDeleted: true, deletedAt: new Date(), deletedBy: userId }
  );
};

// ── Post-save hooks: update parent Project expenses/income ──

async function updateProjectFinancials(projectId) {
  if (!projectId) return;
  const Project = mongoose.model('Project');
  try {
    const summary = await mongoose.model('Transaction').getSummaryByProject(projectId);
    await Project.findByIdAndUpdate(projectId, {
      expenses: summary.totalDebits,
      income: summary.totalCredits
    });
  } catch (err) {
    console.error('Error updating project financials:', err.message);
  }
}

transactionSchema.post('save', function () {
  updateProjectFinancials(this.projectId);
});

transactionSchema.post('findOneAndUpdate', function (doc) {
  if (doc) updateProjectFinancials(doc.projectId);
});

transactionSchema.post('findOneAndDelete', function (doc) {
  if (doc) updateProjectFinancials(doc.projectId);
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;

const mongoose = require('mongoose');

/**
 * Receipt Schema
 * For generating and tracking receipt documents
 */
const receiptSchema = new mongoose.Schema({
  receiptNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true,
    // Received With thanks from M/s./Shri
    index: true
  },
  customerAddress: {
    type: String,
    trim: true
    // Optional customer address line
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  amountInWords: {
    type: String,
    trim: true
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['cheque', 'bank_transfer', 'cash'],
    default: 'cash',
    index: true
  },
  chequeNumber: {
    type: String,
    trim: true
  },
  bankName: {
    type: String,
    trim: true
  },
  paymentType: {
    type: String,
    required: true,
    enum: ['full_payment', 'part_payment', 'advance_payment'],
    default: 'full_payment',
    index: true
  },
  billReference: {
    type: String,
    trim: true
    // Reference to invoice/bill number
  },
  billDate: {
    type: Date
    // Date of the bill/invoice being referenced
  },
  remarks: {
    type: String,
    trim: true
  },
  // PDF storage reference
  pdfUrl: {
    type: String
  },
  pdfGeneratedAt: {
    type: Date
  },
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Version tracking for edits
  version: {
    type: Number,
    default: 1
  },
  originalReceiptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Receipt'
  },
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
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
receiptSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for performance
receiptSchema.index({ createdBy: 1, createdAt: -1 });
receiptSchema.index({ customerName: 'text', receiptNumber: 'text' });
receiptSchema.index({ date: -1, amount: -1 });
receiptSchema.index({ isDeleted: 1, createdAt: -1 });

// Instance Methods
receiptSchema.methods.toClientJSON = function() {
  return {
    id: this._id,
    receiptNumber: this.receiptNumber,
    date: this.date,
    customerName: this.customerName,
    customerAddress: this.customerAddress,
    amount: this.amount,
    amountInWords: this.amountInWords,
    paymentMethod: this.paymentMethod,
    chequeNumber: this.chequeNumber,
    bankName: this.bankName,
    paymentType: this.paymentType,
    billReference: this.billReference,
    billDate: this.billDate,
    remarks: this.remarks,
    pdfUrl: this.pdfUrl,
    pdfGeneratedAt: this.pdfGeneratedAt,
    version: this.version,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    createdBy: this.createdBy
  };
};

// Static Methods
receiptSchema.statics.getNextReceiptNumber = async function() {
  const lastReceipt = await this.findOne({})
    .sort({ createdAt: -1 })
    .select('receiptNumber');

  if (!lastReceipt) {
    return 'RCP-0001';
  }

  // Extract number from format RCP-XXXX
  const lastNumber = parseInt(lastReceipt.receiptNumber.split('-')[1]) || 0;
  const nextNumber = lastNumber + 1;

  return `RCP-${String(nextNumber).padStart(4, '0')}`;
};

// Soft delete
receiptSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

module.exports = mongoose.model('Receipt', receiptSchema);

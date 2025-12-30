const mongoose = require('mongoose');

/**
 * Invoice Line Item Schema
 */
const lineItemSchema = new mongoose.Schema({
  serialNumber: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: false,
    trim: true
  },
  descriptionGujarati: {
    type: String,
    trim: true
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 1
  },
  total: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

/**
 * Invoice Schema
 * For generating and tracking invoice documents with bilingual support
 */
const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  invoiceType: {
    type: String,
    enum: ['cash', 'debit_memo'],
    default: 'cash'
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  // Customer Information
  customerName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  village: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  mobileNumber: {
    type: String,
    trim: true
  },
  // Line Items
  items: {
    type: [lineItemSchema],
    required: true,
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: 'Invoice must have at least one line item'
    }
  },
  // Totals
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  grandTotal: {
    type: Number,
    required: true,
    min: 0
  },
  grandTotalInWords: {
    type: String,
    trim: true
  },
  // Payment Status
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid',
    index: true
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Linked Receipts
  linkedReceipts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Receipt'
  }],
  // Consultant/Signature
  consultantName: {
    type: String,
    default: 'અનિલકુમાર હદવાણી'
  },
  consultantCredentials: {
    type: String,
    default: 'M.Sc. (Agri.)'
  },
  // PDF storage reference
  pdfUrl: {
    type: String
  },
  pdfGeneratedAt: {
    type: Date
  },
  // Notes and remarks
  remarks: {
    type: String,
    trim: true
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
  originalInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  isDraft: {
    type: Boolean,
    default: false,
    index: true
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
invoiceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for performance
invoiceSchema.index({ createdBy: 1, createdAt: -1 });
invoiceSchema.index({ customerName: 'text', invoiceNumber: 'text', location: 'text', village: 'text' });
invoiceSchema.index({ date: -1, grandTotal: -1 });
invoiceSchema.index({ paymentStatus: 1, createdAt: -1 });
invoiceSchema.index({ isDeleted: 1, isDraft: 1, createdAt: -1 });

// Instance Methods
invoiceSchema.methods.toClientJSON = function() {
  return {
    id: this._id,
    invoiceNumber: this.invoiceNumber,
    invoiceType: this.invoiceType,
    date: this.date,
    customerName: this.customerName,
    referenceNumber: this.referenceNumber,
    location: this.location,
    village: this.village,
    phoneNumber: this.phoneNumber,
    mobileNumber: this.mobileNumber,
    items: this.items,
    subtotal: this.subtotal,
    taxAmount: this.taxAmount,
    discount: this.discount,
    grandTotal: this.grandTotal,
    grandTotalInWords: this.grandTotalInWords,
    paymentStatus: this.paymentStatus,
    paidAmount: this.paidAmount,
    linkedReceipts: this.linkedReceipts,
    consultantName: this.consultantName,
    consultantCredentials: this.consultantCredentials,
    pdfUrl: this.pdfUrl,
    pdfGeneratedAt: this.pdfGeneratedAt,
    remarks: this.remarks,
    version: this.version,
    isDraft: this.isDraft,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    createdBy: this.createdBy
  };
};

// Static Methods
invoiceSchema.statics.getNextInvoiceNumber = async function() {
  const lastInvoice = await this.findOne({})
    .sort({ createdAt: -1 })
    .select('invoiceNumber');

  if (!lastInvoice) {
    return 'INV-0001';
  }

  // Extract number from format INV-XXXX
  const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[1]) || 0;
  const nextNumber = lastNumber + 1;

  return `INV-${String(nextNumber).padStart(4, '0')}`;
};

// Calculate totals
invoiceSchema.methods.calculateTotals = function() {
  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  this.grandTotal = this.subtotal + this.taxAmount - this.discount;
  return this;
};

// Update payment status based on paid amount
invoiceSchema.methods.updatePaymentStatus = function() {
  if (this.paidAmount >= this.grandTotal) {
    this.paymentStatus = 'paid';
  } else if (this.paidAmount > 0) {
    this.paymentStatus = 'partial';
  } else {
    this.paymentStatus = 'unpaid';
  }
  return this;
};

// Soft delete
invoiceSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Pre-defined static service items (matching the invoice image format)
invoiceSchema.statics.getServiceOptions = function() {
  return [
    {
      serialNumber: 1,
      descriptionGu: 'જમીનની ચકાસણી',
      descriptionEn: 'N.P.K., Ph. & EC',
      defaultRate: 0,
      defaultQuantity: 0
    },
    {
      serialNumber: 2,
      descriptionGu: 'સુક્ષ્મ તત્વોની ચકાસણી',
      descriptionEn: 'Zn, Fe, Mn & Cu',
      defaultRate: 0,
      defaultQuantity: 0
    },
    {
      serialNumber: 3,
      descriptionGu: 'પિયત પાણીની ચકાસણી',
      descriptionEn: '',
      defaultRate: 0,
      defaultQuantity: 0
    },
    {
      serialNumber: 4,
      descriptionGu: 'પીવા માટે પાણી, કેમીકલ ટેસ્ટ',
      descriptionEn: '',
      defaultRate: 0,
      defaultQuantity: 0
    },
    {
      serialNumber: 5,
      descriptionGu: 'બેક્ટેરીયાલોજી ટેસ્ટ',
      descriptionEn: '',
      defaultRate: 0,
      defaultQuantity: 0
    },
    {
      serialNumber: 6,
      descriptionGu: 'કન્સલ્ટન્સી ફી',
      descriptionEn: 'Consulting',
      defaultRate: 0,
      defaultQuantity: 0
    },
    {
      serialNumber: 7,
      descriptionGu: 'અન્ય',
      descriptionEn: '',
      defaultRate: 0,
      defaultQuantity: 0
    }
  ];
};

module.exports = mongoose.model('Invoice', invoiceSchema);

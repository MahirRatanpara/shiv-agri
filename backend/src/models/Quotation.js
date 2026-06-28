const mongoose = require('mongoose');

const installmentSchema = new mongoose.Schema({
  installmentNumber: { type: Number, required: true, min: 1, max: 4 },
  amount: { type: Number, required: true, min: 0 },
  dueDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['pending', 'paid', 'overdue'],
    default: 'pending'
  },
  paidAt: { type: Date },
  paidAmount: { type: Number, default: 0 },
  // Set when an admin/manager marks the installment as paid; used for
  // idempotent invoice creation so re-clicking "Mark Paid" returns the
  // existing invoice rather than creating a duplicate.
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNumber: { type: String, trim: true },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

/**
 * Overpay ledger entry — a single admin-recorded adjustment (+/-) to the
 * farm's overpay/credit balance. Purely a remembered note: it does NOT create
 * invoices or change any installment status.
 */
const overpayEntrySchema = new mongoose.Schema({
  // Signed adjustment: positive records an extra payment, negative draws it down.
  delta: { type: Number, required: true },
  // Running balance immediately after this entry was applied.
  balanceAfter: { type: Number, required: true, min: 0 },
  note: { type: String, trim: true, maxlength: 300 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

/**
 * BOP (Bill of Project) line item — used only for landscaping BOP quotations.
 * Annual farm quotations don't use this; they're driven entirely by
 * `amountPerYear` + auto-derived installments.
 */
const bopLineItemSchema = new mongoose.Schema({
  description: { type: String, trim: true, required: true },
  quantity: { type: Number, min: 0, default: 1 },
  rate: { type: Number, min: 0, default: 0 },
  total: { type: Number, min: 0, default: 0 }
}, { _id: false });

/**
 * Photo / PDF attachments for BOP quotations (reference drawings, vendor
 * quotes, signed approvals, etc.). Stored via the Media Service like other
 * media-backed subdocs in this project.
 */
const bopAttachmentSchema = new mongoose.Schema({
  mediaId: { type: String, required: true },
  url: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number },
  fileName: { type: String, trim: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedByName: { type: String, trim: true },
  uploadedAt: { type: Date, default: Date.now }
});

const quotationSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },

  /**
   * Quotation kind.
   *  - 'annual': the existing annual farm quotation that drives the project
   *    quotation/acceptance status flow (default for backward compatibility).
   *  - 'bop': adhoc Bill-of-Project quotation for landscaping projects.
   *    BOP quotations are NOT part of the pending-quotation status flow,
   *    have their own line items, and don't supersede annual quotations.
   */
  kind: {
    type: String,
    enum: ['annual', 'bop'],
    default: 'annual',
    index: true
  },

  // Rich text HTML content composed by the admin/manager in the quotation editor.
  // Optional — managers may skip the prose and let the amount + installment
  // schedule (or BOP line items) speak for themselves. Empty string OK.
  content: {
    type: String,
    trim: true,
    default: ''
  },

  /**
   * Line items for BOP quotations. Empty for annual quotations.
   */
  bopItems: {
    type: [bopLineItemSchema],
    default: []
  },

  /**
   * Optional title for BOP quotations (e.g. "Hardscape Phase 1 BOP").
   */
  title: {
    type: String,
    trim: true,
    maxlength: 200
  },

  /**
   * Photo / PDF attachments for BOP quotations. Empty for annual quotations.
   */
  attachments: {
    type: [bopAttachmentSchema],
    default: []
  },

  // Plain-text fallback derived from content (for previews / search)
  contentText: {
    type: String,
    trim: true
  },

  // Annual fee for the farm/consultancy
  amountPerYear: {
    type: Number,
    required: true,
    min: 0
  },

  // Pre-computed 4 quarterly installments (auto-derived from amountPerYear)
  installments: {
    type: [installmentSchema],
    default: []
  },

  // Anchor date used when computing the 4 installment due-dates.
  // Defaults to the date the quotation is submitted.
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },

  status: {
    type: String,
    enum: ['submitted', 'accepted', 'rejected', 'superseded'],
    default: 'submitted',
    index: true
  },

  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  submittedByName: {
    type: String,
    trim: true
  },

  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  acceptedAt: { type: Date },

  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  rejectedAt: { type: Date },
  rejectedReason: { type: String, trim: true, maxlength: 500 },

  /**
   * Overpay / credit balance — used when the customer has paid more than the
   * installment amounts. `balance` is the current running credit; `entries`
   * is the ledger of admin +/- adjustments. This is a remembered note only —
   * it does not generate invoices or alter installment statuses.
   */
  overpay: {
    balance: { type: Number, default: 0, min: 0 },
    entries: { type: [overpayEntrySchema], default: [] }
  }
}, {
  timestamps: true
});

quotationSchema.index({ project: 1, status: 1, createdAt: -1 });

quotationSchema.pre('validate', function(next) {
  // Auto-build the 4 quarterly installments from amountPerYear when missing.
  // BOP quotations are adhoc and have NO installments — skip the auto-build.
  if (
    this.kind !== 'bop' &&
    (!this.installments || this.installments.length !== 4) &&
    this.amountPerYear > 0
  ) {
    const start = this.startDate ? new Date(this.startDate) : new Date();
    const installmentAmount = Math.round((this.amountPerYear / 4) * 100) / 100;
    const installments = [];
    for (let i = 0; i < 4; i++) {
      const dueDate = new Date(start);
      dueDate.setMonth(dueDate.getMonth() + i * 3);
      installments.push({
        installmentNumber: i + 1,
        amount: installmentAmount,
        dueDate,
        status: 'pending'
      });
    }
    this.installments = installments;
  }
  next();
});

module.exports = mongoose.model('Quotation', quotationSchema);

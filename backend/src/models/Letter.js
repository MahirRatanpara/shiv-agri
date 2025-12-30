const mongoose = require('mongoose');

/**
 * Letter Schema
 * For generating and tracking letter pad documents
 */
const letterSchema = new mongoose.Schema({
  letterNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  letterType: {
    type: String,
    enum: ['service_list', 'general', 'custom'],
    required: true,
    default: 'general',
    index: true
  },
  subject: {
    type: String,
    trim: true
  },
  recipientName: {
    type: String,
    trim: true
  },
  recipientAddress: {
    type: String,
    trim: true
  },
  // Letter body content (rich text HTML)
  content: {
    type: String,
    required: true
  },
  // Plain text version for search
  contentPlainText: {
    type: String
  },
  // Tags for categorization
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  // Company information (can be overridden)
  companyName: {
    type: String,
    default: 'SHIV AGRI CONSULTANCY AND LABORATORY'
  },
  consultantName: {
    type: String,
    default: 'MR. ANILKUMAR HADVANI'
  },
  consultantCredentials: {
    type: String,
    default: 'M.Sc. (Agri.)'
  },
  consultantTitle: {
    type: String,
    default: 'Agricultural Consultant'
  },
  contactPhone: {
    type: String,
    default: '97234 56866 / 92655 08385'
  },
  contactEmail: {
    type: String,
    default: 'anihadvani@yahoo.com'
  },
  companyAddress: {
    type: String,
    default: '306, Nine Square, Golden City-1, Nr. Zanzarda Chokadi, Junagadh (Guj.)'
  },
  // PDF storage reference
  pdfUrl: {
    type: String
  },
  pdfGeneratedAt: {
    type: Date
  },
  // Draft status
  isDraft: {
    type: Boolean,
    default: false,
    index: true
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
  originalLetterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Letter'
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
letterSchema.pre('save', function(next) {
  this.updatedAt = new Date();

  // Generate plain text from HTML content for search
  if (this.content && this.isModified('content')) {
    // Simple HTML tag removal (basic implementation)
    this.contentPlainText = this.content
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  next();
});

// Indexes for performance
letterSchema.index({ createdBy: 1, createdAt: -1 });
letterSchema.index({ letterType: 1, createdAt: -1 });
letterSchema.index({ tags: 1, createdAt: -1 });
letterSchema.index({ contentPlainText: 'text', subject: 'text', recipientName: 'text' });
letterSchema.index({ isDeleted: 1, isDraft: 1, createdAt: -1 });

// Instance Methods
letterSchema.methods.toClientJSON = function() {
  return {
    id: this._id,
    letterNumber: this.letterNumber,
    date: this.date,
    letterType: this.letterType,
    subject: this.subject,
    recipientName: this.recipientName,
    recipientAddress: this.recipientAddress,
    content: this.content,
    contentPlainText: this.contentPlainText,
    tags: this.tags,
    companyName: this.companyName,
    consultantName: this.consultantName,
    consultantCredentials: this.consultantCredentials,
    consultantTitle: this.consultantTitle,
    contactPhone: this.contactPhone,
    contactEmail: this.contactEmail,
    companyAddress: this.companyAddress,
    pdfUrl: this.pdfUrl,
    pdfGeneratedAt: this.pdfGeneratedAt,
    isDraft: this.isDraft,
    version: this.version,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    createdBy: this.createdBy
  };
};

// Static Methods
letterSchema.statics.getNextLetterNumber = async function() {
  const lastLetter = await this.findOne({ letterNumber: { $exists: true } })
    .sort({ createdAt: -1 })
    .select('letterNumber');

  if (!lastLetter) {
    return 'LTR-0001';
  }

  // Extract number from format LTR-XXXX
  const lastNumber = parseInt(lastLetter.letterNumber.split('-')[1]) || 0;
  const nextNumber = lastNumber + 1;

  return `LTR-${String(nextNumber).padStart(4, '0')}`;
};

// Soft delete
letterSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Pre-defined service list template
letterSchema.statics.getServiceListTemplate = function() {
  return `
    <ol>
      <li><strong>Physical & Primary visit of farm.</strong></li>
      <li><strong>Soil and water collection for analysis.</strong></li>
      <li><strong>Soil and water analysis in our laboratory.</strong></li>
      <li><strong>According to report of soil and water quality, selection of all plants, flowers, fruits, crops etc.</strong></li>
      <li><strong>Landscape detail design of farm house.</strong></li>
      <li><strong>Irrigation design after finalization of Landscape design.</strong></li>
      <li><strong>Quotation finalization from reputed- irrigation company.</strong></li>
      <li><strong>Installation of Drip irrigation system under our supervision.</strong></li>
      <li><strong>Purchase of all plants, tree, flowers etc. according to design from different nursery of India.</strong></li>
      <li><strong>Quotation of all plants, tree, etc with labour and transportation.</strong></li>
      <li><strong>Plantation of all plants under our supervision according to design.</strong></li>
      <li><strong>Necessary visit up to total plantation.</strong></li>
      <li><strong>Giving better design with minimum cost.</strong></li>
    </ol>
  `;
};

module.exports = mongoose.model('Letter', letterSchema);

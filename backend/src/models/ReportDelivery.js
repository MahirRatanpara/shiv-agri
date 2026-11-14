const mongoose = require('mongoose');

/**
 * Audit trail for every lab report sent to a farmer (WhatsApp or email).
 *
 * One document per (sample × send attempt-series). A resend creates a NEW document
 * (isResend=true, sendSequence incremented) so the history is never overwritten.
 * Retries of the same send (reconciler) stay on the same document and bump `attempts`.
 *
 * Email bundles: one email (zip of N reports) creates N documents sharing `batchId` and
 * `providerMessageId`, so every report still has its own row in the dashboard.
 */
const STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'];

const statusEventSchema = new mongoose.Schema({
  status: { type: String, enum: STATUSES, required: true },
  at: { type: Date, default: Date.now },
  source: { type: String, enum: ['api', 'webhook', 'reconciler', 'user'], default: 'api' },
  note: { type: String, default: null }
}, { _id: false });

const reportDeliverySchema = new mongoose.Schema({
  sampleType: { type: String, enum: ['soil', 'water', 'fertilizer'], required: true },
  sampleId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'sampleModel' },
  sampleModel: { type: String, enum: ['SoilSample', 'WaterSample', 'FertilizerSample'], required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sessionDate: { type: String, default: null },
  sampleNumber: { type: String, default: '' },
  farmerName: { type: String, default: '' },
  farmsName: { type: String, default: '' },

  channel: { type: String, enum: ['whatsapp', 'email'], required: true },
  // E.164 digits without '+' for WhatsApp (e.g. 919876543210), lowercase address for email.
  recipient: { type: String, required: true },

  batchId: { type: String, required: true },
  isResend: { type: Boolean, default: false },
  sendSequence: { type: Number, default: 1 },

  status: { type: String, enum: STATUSES, default: 'queued' },
  statusHistory: { type: [statusEventSchema], default: [] },

  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  nextRetryAt: { type: Date, default: null },
  lastAttemptAt: { type: Date, default: null },
  // Claim lock so a send is never processed twice concurrently (request path vs reconciler).
  lockedUntil: { type: Date, default: null },
  lockToken: { type: String, default: null },

  providerMessageId: { type: String, default: null },
  providerRequestId: { type: String, default: null },
  error: {
    code: { type: String, default: null },
    message: { type: String, default: null },
    permanent: { type: Boolean, default: false }
  },

  shareLinkId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportShareLink', default: null },

  sentAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },

  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sentByName: { type: String, default: '' }
}, {
  timestamps: true
});

// Dashboard listing + filters (newest first).
reportDeliverySchema.index({ createdAt: -1 });
reportDeliverySchema.index({ channel: 1, status: 1, createdAt: -1 });
reportDeliverySchema.index({ sampleType: 1, createdAt: -1 });
// Per-sample history and resend sequencing.
reportDeliverySchema.index({ sampleType: 1, sampleId: 1, channel: 1, createdAt: -1 });
// Reconciler: due retries / stuck sends.
reportDeliverySchema.index({ status: 1, nextRetryAt: 1 });
// Webhook status correlation.
reportDeliverySchema.index({ providerMessageId: 1 }, { sparse: true });
reportDeliverySchema.index({ batchId: 1 });
reportDeliverySchema.index({ recipient: 1 });

reportDeliverySchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('ReportDelivery', reportDeliverySchema, 'report_deliveries');

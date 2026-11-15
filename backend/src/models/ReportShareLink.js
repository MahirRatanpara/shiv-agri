const mongoose = require('mongoose');

/**
 * Tokenised, unauthenticated access to ONE lab report PDF — the target of the
 * "View Report in App" WhatsApp button (https://shivagri.com/r/<token>).
 *
 * Only a SHA-256 hash of the token is stored, so a database leak does not leak working links.
 * Links expire after REPORT_LINK_TTL_DAYS (default 90). A resend mints a fresh link but leaves
 * earlier ones working until they expire, so an older WhatsApp message never shows a dead
 * button. A link is revoked only when the send it was minted for is retried (that message
 * never reached the farmer).
 */
const reportShareLinkSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  sampleType: { type: String, enum: ['soil', 'water', 'fertilizer'], required: true },
  sampleId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'sampleModel' },
  sampleModel: { type: String, enum: ['SoilSample', 'WaterSample', 'FertilizerSample'], required: true },
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportDelivery', default: null },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  accessCount: { type: Number, default: 0 },
  lastAccessedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true
});

reportShareLinkSchema.index({ sampleType: 1, sampleId: 1, revokedAt: 1 });
reportShareLinkSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('ReportShareLink', reportShareLinkSchema, 'report_share_links');

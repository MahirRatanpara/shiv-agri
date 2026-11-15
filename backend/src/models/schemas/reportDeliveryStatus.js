const mongoose = require('mongoose');

/**
 * Embedded "latest delivery" snapshot stored on each Soil/Water/Fertilizer sample.
 *
 * It mirrors ONLY the most recent send per channel so the testing grids can render a status
 * chip without a join. The full history (every send, resend and status transition) lives in the
 * `report_deliveries` audit collection — this snapshot is a denormalised cache of it.
 *
 * Consistency rule: a status update is applied here only when it belongs to `lastDeliveryId`.
 * Late webhooks for an older send (after a resend) update their own audit row but never
 * regress this snapshot. See reportDeliveryService.applyEmbeddedStatus.
 */
const channelStatusSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['not_sent', 'queued', 'sent', 'delivered', 'read', 'failed'],
    default: 'not_sent'
  },
  recipient: { type: String, default: null },
  lastDeliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportDelivery', default: null },
  lastSentAt: { type: Date, default: null },
  lastStatusAt: { type: Date, default: null },
  sendCount: { type: Number, default: 0 },
  lastError: { type: String, default: null }
}, { _id: false });

const reportDeliveryStatusSchema = new mongoose.Schema({
  whatsapp: { type: channelStatusSchema, default: () => ({}) },
  email: { type: channelStatusSchema, default: () => ({}) }
}, { _id: false });

module.exports = { reportDeliveryStatusSchema };

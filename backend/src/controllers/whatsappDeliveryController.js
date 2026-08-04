/**
 * Admin-facing read model for WhatsApp delivery telemetry.
 *
 * The notification-service holds the data and is protected by a shared API key that
 * must never reach a browser, so this controller is a thin authenticated proxy.
 */

const notificationClient = require('../services/notificationClient');

const ALLOWED_STATUSES = ['sent', 'delivered', 'read', 'failed'];

const handleUpstreamError = (res, err, what) => {
  console.error(`[whatsapp-delivery] ${what} failed:`, err.message, err.body || '');
  const status = err.status === 504 ? 504 : 502;
  return res.status(status).json({
    message: 'Could not reach the notification service',
    detail: err.message
  });
};

const getSummary = async (req, res) => {
  try {
    const summary = await notificationClient.getWhatsAppDeliverySummary();
    return res.json(summary);
  } catch (err) {
    return handleUpstreamError(res, err, 'summary');
  }
};

const getMessages = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
  const status = req.query.status ? String(req.query.status).toLowerCase() : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;

  if (status && !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${ALLOWED_STATUSES.join(', ')}`
    });
  }

  try {
    const result = await notificationClient.getWhatsAppDeliveryMessages({ page, limit, status, search });
    return res.json(result);
  } catch (err) {
    return handleUpstreamError(res, err, 'messages');
  }
};

const getMessage = async (req, res) => {
  try {
    const result = await notificationClient.getWhatsAppDeliveryMessage(req.params.wamid);
    return res.json(result);
  } catch (err) {
    return handleUpstreamError(res, err, 'message lookup');
  }
};

module.exports = { getSummary, getMessages, getMessage };

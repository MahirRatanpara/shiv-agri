/**
 * Thin HTTP client for the internal notification-service.
 *
 * Adds the configured X-API-Key header and surfaces errors with the request ID
 * so they can be correlated to notification-service logs.
 */

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8082';
const NOTIFICATION_API_KEY = process.env.NOTIFICATION_API_KEY || '';

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'X-API-Key': NOTIFICATION_API_KEY
});

const post = async (path, body, { timeoutMs = 15000 } = {}) => {
  if (!NOTIFICATION_API_KEY) {
    throw new Error('NOTIFICATION_API_KEY is not configured');
  }
  const url = `${NOTIFICATION_SERVICE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

    if (!response.ok) {
      const err = new Error(payload?.message || `notification-service responded ${response.status}`);
      err.status = response.status;
      err.body = payload;
      throw err;
    }
    return payload;
  } catch (err) {
    if (err.name === 'AbortError') {
      const wrapped = new Error('notification-service request timed out');
      wrapped.status = 504;
      throw wrapped;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const get = async (path, query = {}, { timeoutMs = 15000 } = {}) => {
  if (!NOTIFICATION_API_KEY) {
    throw new Error('NOTIFICATION_API_KEY is not configured');
  }
  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const url = `${NOTIFICATION_SERVICE_URL}${path}${qs ? `?${qs}` : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: buildHeaders(), signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

    if (!response.ok) {
      const err = new Error(payload?.message || `notification-service responded ${response.status}`);
      err.status = response.status;
      err.body = payload;
      throw err;
    }
    return payload;
  } catch (err) {
    if (err.name === 'AbortError') {
      const wrapped = new Error('notification-service request timed out');
      wrapped.status = 504;
      throw wrapped;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * WhatsApp delivery telemetry, proxied for the admin dashboard.
 *
 * Pagination is deliberately server-side: the status collection grows without bound,
 * so the browser asks for one page at a time rather than filtering a full dump.
 */
const getWhatsAppDeliverySummary = () =>
  get('/api/notifications/whatsapp/delivery/summary');

const getWhatsAppDeliveryMessages = ({ page, limit, status, search }) =>
  get('/api/notifications/whatsapp/delivery/messages', { page, limit, status, search });

const getWhatsAppDeliveryMessage = (wamid) =>
  get(`/api/notifications/whatsapp/delivery/messages/${encodeURIComponent(wamid)}`);

/**
 * Channel-agnostic OTP send. The notification-service decides WhatsApp vs SMS based on
 * its `notification.otp.channel` property — this client just hands over the recipient + code.
 */
const sendOtp = async ({ to, code, requestId }) =>
  post('/api/notifications/otp', { to, code, _client_request_id: requestId });

const sendWhatsAppOtpTemplate = async ({ to, code, requestId }) => {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'otp_login';
  const languageCode = process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'en';
  const includeButton = String(process.env.WHATSAPP_OTP_TEMPLATE_HAS_BUTTON || 'true') === 'true';

  return post('/api/notifications/whatsapp/template', {
    to,
    templateName,
    languageCode,
    bodyParameters: [code],
    buttonOtpCode: includeButton ? code : null,
    _client_request_id: requestId
  });
};

const sendWhatsAppText = async ({ to, message }) =>
  post('/api/notifications/whatsapp/text', { to, message });

/**
 * Sends the universally-available `hello_world` sample template.
 *
 * Useful for local testing: every WhatsApp Business account can send this template
 * to confirmed test recipients without needing any custom template approval. We
 * use it as a "ping" so the developer can confirm the WhatsApp delivery chain works
 * while the actual OTP is read from the backend console.
 */
const sendHelloWorldTemplate = async ({ to, requestId }) =>
  post('/api/notifications/whatsapp/template', {
    to,
    templateName: 'hello_world',
    languageCode: 'en_US',
    bodyParameters: [],
    buttonOtpCode: null,
    _client_request_id: requestId
  });

/**
 * Free-form text fallback for OTP delivery used while the WhatsApp template
 * is still in review by Meta. Only works if the recipient has messaged the
 * business number in the last 24h (WhatsApp customer-service window rule).
 */
const sendWhatsAppOtpFreeText = async ({ to, code, requestId }) => {
  const brand = process.env.OTP_BRAND_NAME || 'Shiv-Agri';
  const message =
    `${code} is your ${brand} verification code. ` +
    `It expires in 3 minutes. For your security, do not share this code.`;
  return post('/api/notifications/whatsapp/text', {
    to,
    message,
    _client_request_id: requestId
  });
};

module.exports = {
  sendOtp,
  sendWhatsAppOtpTemplate,
  sendHelloWorldTemplate,
  sendWhatsAppText,
  getWhatsAppDeliverySummary,
  getWhatsAppDeliveryMessages,
  getWhatsAppDeliveryMessage
};

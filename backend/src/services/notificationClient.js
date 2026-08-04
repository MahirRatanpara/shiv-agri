/**
 * Thin HTTP client for the internal notification-service.
 *
 * Adds the configured X-API-Key header and surfaces errors with the request ID
 * so they can be correlated to notification-service logs.
 */

// Full base URL including the /api/notifications prefix — the paths below are relative to
// it. Keeping the prefix in configuration rather than hardcoded means the service can be
// remounted at a different path without touching this file.
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8082/api/notifications';
const NOTIFICATION_API_KEY = process.env.NOTIFICATION_API_KEY || '';

console.log(`[notification] base URL: ${NOTIFICATION_SERVICE_URL}`);

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'X-API-Key': NOTIFICATION_API_KEY
});

const maskPhone = (value) =>
  typeof value === 'string' && value.length > 4 ? `••••${value.slice(-4)}` : value;

/**
 * Request bodies carry OTP codes and full phone numbers, so they are never logged
 * verbatim — only the shape, which is what you need to spot a malformed payload.
 */
const SECRET_KEYS = new Set(['code', 'buttonOtpCode', 'bodyParameters', 'message']);

const redactBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      if (key === 'to') return [key, maskPhone(value)];
      if (SECRET_KEYS.has(key)) return [key, '[redacted]'];
      return [key, value];
    })
  );
};

const execute = async ({ method, url, body, timeoutMs }) => {
  if (!NOTIFICATION_API_KEY) {
    throw new Error('NOTIFICATION_API_KEY is not configured');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  console.log(
    `[notification] → ${method} ${url}` +
    (body ? ` body=${JSON.stringify(redactBody(body))}` : '')
  );

  try {
    const response = await fetch(url, {
      method,
      headers: buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    const ms = Date.now() - startedAt;

    if (!response.ok) {
      // The raw body matters here: a 404 from the Node backend renders an HTML
      // "Cannot GET <path>" page that names the exact URL that missed.
      console.error(
        `[notification] ← ${response.status} ${method} ${url} (${ms}ms) response=${text.slice(0, 500)}`
      );
      const err = new Error(payload?.message || `notification-service responded ${response.status}`);
      err.status = response.status;
      err.body = payload;
      throw err;
    }

    console.log(`[notification] ← ${response.status} ${method} ${url} (${ms}ms)`);
    return payload;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`[notification] ✗ TIMEOUT ${method} ${url} after ${timeoutMs}ms`);
      const wrapped = new Error('notification-service request timed out');
      wrapped.status = 504;
      throw wrapped;
    }
    // Non-HTTP failures (DNS, connection refused) have no status and were not logged above.
    if (!err.status) {
      console.error(`[notification] ✗ ${method} ${url} — ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const post = (path, body, { timeoutMs = 15000 } = {}) =>
  execute({ method: 'POST', url: `${NOTIFICATION_SERVICE_URL}${path}`, body, timeoutMs });

const get = (path, query = {}, { timeoutMs = 15000 } = {}) => {
  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return execute({
    method: 'GET',
    url: `${NOTIFICATION_SERVICE_URL}${path}${qs ? `?${qs}` : ''}`,
    timeoutMs
  });
};

/**
 * WhatsApp delivery telemetry, proxied for the admin dashboard.
 *
 * Pagination is deliberately server-side: the status collection grows without bound,
 * so the browser asks for one page at a time rather than filtering a full dump.
 */
const getWhatsAppDeliverySummary = () =>
  get('/whatsapp/delivery/summary');

const getWhatsAppDeliveryMessages = ({ page, limit, status, search }) =>
  get('/whatsapp/delivery/messages', { page, limit, status, search });

const getWhatsAppDeliveryMessage = (wamid) =>
  get(`/whatsapp/delivery/messages/${encodeURIComponent(wamid)}`);

/**
 * Channel-agnostic OTP send. The notification-service decides WhatsApp vs SMS based on
 * its `notification.otp.channel` property — this client just hands over the recipient + code.
 */
const sendOtp = async ({ to, code, requestId }) =>
  post('/otp', { to, code, _client_request_id: requestId });

const sendWhatsAppOtpTemplate = async ({ to, code, requestId }) => {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'otp_login';
  const languageCode = process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'en';
  const includeButton = String(process.env.WHATSAPP_OTP_TEMPLATE_HAS_BUTTON || 'true') === 'true';

  return post('/whatsapp/template', {
    to,
    templateName,
    languageCode,
    bodyParameters: [code],
    buttonOtpCode: includeButton ? code : null,
    _client_request_id: requestId
  });
};

const sendWhatsAppText = async ({ to, message }) =>
  post('/whatsapp/text', { to, message });

/**
 * Sends the universally-available `hello_world` sample template.
 *
 * Useful for local testing: every WhatsApp Business account can send this template
 * to confirmed test recipients without needing any custom template approval. We
 * use it as a "ping" so the developer can confirm the WhatsApp delivery chain works
 * while the actual OTP is read from the backend console.
 */
const sendHelloWorldTemplate = async ({ to, requestId }) =>
  post('/whatsapp/template', {
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
  return post('/whatsapp/text', {
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

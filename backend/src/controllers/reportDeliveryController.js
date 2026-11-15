const reportDeliveryService = require('../services/reportDeliveryService');
const { ReportDeliveryError } = reportDeliveryService;
const logger = require('../utils/logger');

const LOG = '[ReportDelivery]';

/** Maps service errors to `{ success:false, error, code, details }` with the right status. */
const handleError = (res, err, action) => {
  if (err instanceof ReportDeliveryError) {
    logger.warn(`${LOG} ${action} rejected: ${err.code} — ${err.message}`);
    return res.status(err.status).json({ success: false, error: err.message, code: err.code, details: err.details });
  }
  logger.error(`${LOG} ${action} failed: ${err.message}`, { stack: err.stack });
  return res.status(500).json({ success: false, error: `Failed to ${action}. Please try again.` });
};

const reqContext = (req) => `user=${req.user?._id} (${req.user?.name || '-'}) type=${req.params.sampleType || '-'}`;

exports.precheck = async (req, res) => {
  const started = Date.now();
  try {
    const { sampleIds, channel } = req.body || {};
    const data = await reportDeliveryService.precheck({ sampleType: req.params.sampleType, sampleIds, channel });
    logger.info(`${LOG} precheck ${reqContext(req)} channel=${channel} ${JSON.stringify(data.summary)} (${Date.now() - started}ms)`);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err, 'check the selected reports');
  }
};

exports.sendWhatsApp = async (req, res) => {
  const started = Date.now();
  try {
    const { sampleIds, confirmResend } = req.body || {};
    logger.info(`${LOG} POST whatsapp ${reqContext(req)} count=${Array.isArray(sampleIds) ? sampleIds.length : 0} confirmResend=${!!confirmResend}`);
    const data = await reportDeliveryService.queueWhatsApp({
      sampleType: req.params.sampleType, sampleIds, user: req.user, confirmResend: confirmResend === true
    });
    logger.info(`${LOG} whatsapp accepted batch=${data.batchId} queued=${data.queued.length} skipped=${data.skipped.length} (${Date.now() - started}ms)`);
    return res.status(202).json({
      success: true,
      data,
      message: `${data.queued.length} report(s) are being sent on WhatsApp` +
        (data.skipped.length ? `; ${data.skipped.length} skipped (no valid mobile number)` : '')
    });
  } catch (err) {
    return handleError(res, err, 'send reports on WhatsApp');
  }
};

exports.sendEmail = async (req, res) => {
  const started = Date.now();
  try {
    const { sampleIds, email, confirmResend } = req.body || {};
    logger.info(`${LOG} POST email ${reqContext(req)} count=${Array.isArray(sampleIds) ? sampleIds.length : 0} confirmResend=${!!confirmResend}`);
    const data = await reportDeliveryService.queueEmail({
      sampleType: req.params.sampleType, sampleIds, email, user: req.user, confirmResend: confirmResend === true
    });
    logger.info(`${LOG} email accepted batch=${data.batchId} reports=${data.queued.length} (${Date.now() - started}ms)`);
    return res.status(202).json({
      success: true,
      data,
      message: `${data.queued.length} report(s) are being emailed to ${data.recipient}`
    });
  } catch (err) {
    return handleError(res, err, 'email the reports');
  }
};

exports.getStatuses = async (req, res) => {
  try {
    const data = await reportDeliveryService.getSampleStatuses({
      sampleType: req.params.sampleType, sampleIds: req.body?.sampleIds
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err, 'load delivery status');
  }
};

exports.previewPdf = async (req, res) => {
  const started = Date.now();
  try {
    const { buffer, filename } = await reportDeliveryService.generateReportPdf(req.params.sampleType, req.params.sampleId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    logger.info(`${LOG} preview ${reqContext(req)} sample=${req.params.sampleId} bytes=${buffer.length} (${Date.now() - started}ms)`);
    return res.send(buffer);
  } catch (err) {
    return handleError(res, err, 'generate the report preview');
  }
};

exports.list = async (req, res) => {
  const started = Date.now();
  try {
    const result = await reportDeliveryService.listDeliveries(req.query);
    logger.info(`${LOG} list user=${req.user?._id} query=${JSON.stringify(req.query)} total=${result.pagination.total} (${Date.now() - started}ms)`);
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleError(res, err, 'load report deliveries');
  }
};

exports.summary = async (req, res) => {
  try {
    const data = await reportDeliveryService.getSummary(req.query);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err, 'load delivery summary');
  }
};

exports.getOne = async (req, res) => {
  try {
    const data = await reportDeliveryService.getDelivery(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err, 'load the delivery');
  }
};

exports.retry = async (req, res) => {
  try {
    logger.info(`${LOG} manual retry requested delivery=${req.params.id} user=${req.user?._id} (${req.user?.name || '-'})`);
    const data = await reportDeliveryService.retryDelivery(req.params.id, req.user);
    return res.status(202).json({ success: true, data, message: 'Retry started' });
  } catch (err) {
    return handleError(res, err, 'retry the delivery');
  }
};

// ─── Public (token) endpoints ───────────────────────────────────────────────

const appLinks = () => ({
  android: process.env.ANDROID_STORE_URL || process.env.ANDROID_UPDATE_URL || 'https://play.google.com/store/apps/details?id=com.shivagri.app',
  ios: process.env.IOS_STORE_URL || null
});

exports.publicReportInfo = async (req, res) => {
  try {
    const { report } = await reportDeliveryService.resolveShareLink(req.params.token);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: { ...report, appLinks: appLinks() } });
  } catch (err) {
    return handleError(res, err, 'open the report link');
  }
};

exports.publicReportPdf = async (req, res) => {
  const started = Date.now();
  try {
    const { link } = await reportDeliveryService.resolveShareLink(req.params.token);
    const { buffer, filename } = await reportDeliveryService.generateReportPdf(link.sampleType, link.sampleId);
    await reportDeliveryService.recordLinkAccess(link._id);

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    logger.info(`${LOG} public PDF served link=${link._id} type=${link.sampleType} sample=${link.sampleId} ` +
      `disposition=${disposition} ip=${req.get('X-Real-IP') || req.ip} (${Date.now() - started}ms)`);
    return res.send(buffer);
  } catch (err) {
    return handleError(res, err, 'download the report');
  }
};

/**
 * Digital Asset Links (Android App Links) — lets https://shivagri.com/r/* open the app
 * directly. Needs the release signing certificate SHA-256 fingerprint(s).
 */
exports.assetLinks = (req, res) => {
  const fingerprints = (process.env.ANDROID_APP_SHA256_CERT_FINGERPRINTS || '')
    .split(',').map((f) => f.trim().toUpperCase()).filter(Boolean);
  if (!fingerprints.length) {
    logger.warn(`${LOG} assetlinks.json requested but ANDROID_APP_SHA256_CERT_FINGERPRINTS is not set — App Links will not verify`);
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: process.env.ANDROID_APP_PACKAGE || 'com.shivagri.app',
      sha256_cert_fingerprints: fingerprints
    }
  }]);
};

/** apple-app-site-association (iOS Universal Links) for /r/* paths. */
exports.appleAppSiteAssociation = (req, res) => {
  const teamId = (process.env.APPLE_TEAM_ID || '').trim();
  const bundleId = (process.env.IOS_BUNDLE_ID || 'com.shivagri.app').trim();
  if (!teamId) {
    logger.warn(`${LOG} apple-app-site-association requested but APPLE_TEAM_ID is not set — Universal Links will not work`);
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(JSON.stringify({
    applinks: {
      apps: [],
      details: teamId ? [{ appID: `${teamId}.${bundleId}`, appIDs: [`${teamId}.${bundleId}`], paths: ['/r/*'], components: [{ '/': '/r/*' }] }] : []
    }
  }));
};

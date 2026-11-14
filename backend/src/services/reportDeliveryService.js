/**
 * Lab report delivery (Soil / Water / Fertilizer → farmer) over WhatsApp and email.
 *
 * Flow
 * ────
 *   1. precheck()        – resolves recipients (+91 mobile), flags invalid numbers and
 *                          already-sent reports so the UI can show a confirmation.
 *   2. queueWhatsApp() /  – writes one audit row per report (status=queued), updates the
 *      queueEmail()        embedded snapshot on the sample, then processes IMMEDIATELY in the
 *                          background (no waiting for the reconciler).
 *   3. process*()        – claims the row(s) with a lock, generates the PDF, sends, and records
 *                          sent / failed (+ retry schedule) in both places.
 *   4. syncWhatsApp…()   – folds Meta webhook statuses (delivered / read / failed), persisted by
 *                          notification-service in `whatsapp_message_status`, back into the
 *                          audit rows + embedded snapshot. Runs on grid polls, dashboard loads
 *                          and every reconciler tick.
 *   5. reconcile()       – every 30 min: sends anything stuck in `queued` (e.g. lost to a
 *                          restart), retries transient failures (max 3 attempts), syncs statuses.
 *
 * Data model
 * ──────────
 *   report_deliveries (ReportDelivery) – append-only audit; a resend is a NEW row.
 *   sample.delivery.{whatsapp,email}   – latest-send snapshot for the grids. Writes are guarded
 *                                        by `lastDeliveryId` so a late update for an older send
 *                                        can never overwrite the newest one.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const archiver = require('archiver');
const { PassThrough } = require('stream');

const SoilSample = require('../models/SoilSample');
const WaterSample = require('../models/WaterSample');
const FertilizerSample = require('../models/FertilizerSample');
const ReportDelivery = require('../models/ReportDelivery');
const ReportShareLink = require('../models/ReportShareLink');
const pdfGenerator = require('./pdfGenerator');
const notificationClient = require('./notificationClient');
const { addClassifications: addWaterClassifications } = require('../utils/waterClassification');
const { buildLabReportsEmail, TYPE_LABELS } = require('../templates/email/labReportsEmail');
const logger = require('../utils/logger');

const LOG = '[ReportDelivery]';

// ─── Configuration ──────────────────────────────────────────────────────────

const SAMPLE_MODELS = { soil: SoilSample, water: WaterSample, fertilizer: FertilizerSample };
const SAMPLE_MODEL_NAMES = { soil: 'SoilSample', water: 'WaterSample', fertilizer: 'FertilizerSample' };
const SAMPLE_TYPES = Object.keys(SAMPLE_MODELS);
const CHANNELS = ['whatsapp', 'email'];

const WHATSAPP_TEMPLATES = {
  soil: process.env.WHATSAPP_REPORT_TEMPLATE_SOIL || 'shiv_agri_soil_testing_report_ready',
  water: process.env.WHATSAPP_REPORT_TEMPLATE_WATER || 'shiv_agri_water_testing_report_ready',
  fertilizer: process.env.WHATSAPP_REPORT_TEMPLATE_FERTILIZER || 'shiv_agri_fertilizer_recommendation_report_ready'
};
const WHATSAPP_TEMPLATE_LANGUAGE = process.env.WHATSAPP_REPORT_TEMPLATE_LANGUAGE || 'en';
// The template's URL button is "https://shivagri.com/{{1}}" — we fill {{1}} with "r/<token>".
const REPORT_LINK_PATH_PREFIX = 'r/';
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || 'https://shivagri.com').replace(/\/+$/, '');

const LINK_TTL_DAYS = parseInt(process.env.REPORT_LINK_TTL_DAYS, 10) || 90;
const MAX_ATTEMPTS = parseInt(process.env.REPORT_DELIVERY_MAX_ATTEMPTS, 10) || 3;
const MAX_WHATSAPP_PER_REQUEST = 100;
const MAX_EMAIL_PER_REQUEST = 50; // keeps the zip comfortably under the 25MB attachment cap
const PROCESS_CONCURRENCY = 3;    // Puppeteer PDF generation is the bottleneck
const LOCK_MS = 5 * 60 * 1000;
// A queued row older than this with no live lock was abandoned (crash/restart mid-send).
const STUCK_QUEUED_MS = 10 * 60 * 1000;
// Statuses are only synced for recent sends — Meta stops reporting after a few days anyway.
const STATUS_SYNC_WINDOW_DAYS = 14;

const STATUS_RANK = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 9 };
const WEBHOOK_RANK_TO_STATUS = { 1: 'sent', 2: 'delivered', 3: 'read', 9: 'failed' };

/**
 * Meta error codes that no retry can fix (bad number, not on WhatsApp, template
 * misconfigured/paused, test-mode allow-list). Anything else — rate limits, Meta outages,
 * notification-service down — is treated as transient and retried by the reconciler.
 */
const PERMANENT_WHATSAPP_ERROR_CODES = new Set([
  100, 131008, 131009, 131021, 131026, 131030, 131047, 131051,
  132000, 132001, 132005, 132007, 132012, 132015, 132016, 132068, 133010
]);

class ReportDeliveryError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ─── Small helpers ──────────────────────────────────────────────────────────

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

const assertSampleType = (sampleType) => {
  if (!SAMPLE_TYPES.includes(sampleType)) {
    throw new ReportDeliveryError(400, 'INVALID_SAMPLE_TYPE', `Unsupported report type "${sampleType}"`);
  }
};

const assertSampleIds = (sampleIds, max) => {
  if (!Array.isArray(sampleIds) || sampleIds.length === 0) {
    throw new ReportDeliveryError(400, 'SAMPLE_IDS_REQUIRED', 'Select at least one report');
  }
  if (sampleIds.length > max) {
    throw new ReportDeliveryError(400, 'TOO_MANY_SAMPLES', `You can send at most ${max} reports at once`);
  }
  const invalid = sampleIds.filter((id) => !isValidObjectId(id));
  if (invalid.length) {
    throw new ReportDeliveryError(400, 'INVALID_SAMPLE_ID', `Invalid sample id(s): ${invalid.slice(0, 3).join(', ')}`);
  }
  return [...new Set(sampleIds.map(String))];
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normalizeEmail = (raw) => {
  const email = String(raw || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    throw new ReportDeliveryError(400, 'INVALID_EMAIL', 'Enter a valid email address');
  }
  return email;
};

/**
 * Indian mobile → WhatsApp E.164 digits ("91XXXXXXXXXX"). Accepts "+91 98765 43210",
 * "098765 43210", "9876543210" etc. by taking the last 10 digits; rejects anything that is
 * not a valid Indian mobile (must start 6-9).
 */
function normalizeIndianMobile(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const national = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return `91${national}`;
}

const formatPhoneForDisplay = (e164) =>
  e164 && e164.length === 12 ? `+91 ${e164.slice(2, 7)} ${e164.slice(7)}` : e164 || '';

const maskRecipient = (recipient) => {
  if (!recipient) return '';
  if (recipient.includes('@')) {
    const [user, domain] = recipient.split('@');
    return `${user.slice(0, 2)}•••@${domain}`;
  }
  return `••••${recipient.slice(-4)}`;
};

const farmerNameOf = (sampleType, sample) =>
  (sampleType === 'fertilizer' ? sample.farmerName : sample.farmersName) || '';

const sanitizeFilePart = (value) =>
  String(value || '').trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

const buildPdfFileName = (sampleType, sample) => {
  const label = { soil: 'Soil_Report', water: 'Water_Report', fertilizer: 'Fertilizer_Report' }[sampleType];
  const parts = [label, sanitizeFilePart(sample.sampleNumber), sanitizeFilePart(farmerNameOf(sampleType, sample))].filter(Boolean);
  return `${parts.join('_')}.pdf`;
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Runs `worker` over `items` with at most `limit` in flight. Never rejects. */
async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        await worker(item);
      } catch (err) {
        logger.error(`${LOG} worker crashed: ${err.message}`, { stack: err.stack });
      }
    }
  });
  await Promise.all(runners);
}

const runInBackground = (label, fn) => {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch((err) => logger.error(`${LOG} background ${label} failed: ${err.message}`, { stack: err.stack }));
  });
};

// ─── Sample loading ─────────────────────────────────────────────────────────

const SAMPLE_SUMMARY_FIELDS = 'sampleNumber farmersName farmerName farmsName mobileNo sessionId sessionDate soilSampleId delivery';

/**
 * Loads samples (lean) in the order requested, attaching `mobileNo`. Fertilizer samples have
 * no mobile of their own — it is resolved from the linked soil sample (same rule as
 * farmReportLinker).
 */
async function loadSamplesWithContacts(sampleType, sampleIds) {
  const Model = SAMPLE_MODELS[sampleType];
  const samples = await Model.find({ _id: { $in: sampleIds } }).select(SAMPLE_SUMMARY_FIELDS).lean();

  if (sampleType === 'fertilizer') {
    const soilIds = samples.map((s) => s.soilSampleId).filter(Boolean);
    const soils = soilIds.length
      ? await SoilSample.find({ _id: { $in: soilIds } }).select('mobileNo farmsName').lean()
      : [];
    const soilById = new Map(soils.map((s) => [String(s._id), s]));
    for (const sample of samples) {
      const soil = sample.soilSampleId ? soilById.get(String(sample.soilSampleId)) : null;
      sample.mobileNo = soil?.mobileNo || '';
      if (!sample.farmsName && soil?.farmsName) sample.farmsName = soil.farmsName;
    }
  }

  const byId = new Map(samples.map((s) => [String(s._id), s]));
  return sampleIds.map((id) => byId.get(String(id))).filter(Boolean);
}

/** Renders the PDF exactly as the testing pages' Download button does. */
async function generateReportPdf(sampleType, sampleId) {
  assertSampleType(sampleType);
  const sample = await SAMPLE_MODELS[sampleType].findById(sampleId);
  if (!sample) {
    throw new ReportDeliveryError(404, 'SAMPLE_NOT_FOUND', 'Report not found — the sample may have been deleted');
  }
  const startedAt = Date.now();
  let buffer;
  if (sampleType === 'soil') {
    buffer = await pdfGenerator.generateSinglePDF(sample);
  } else if (sampleType === 'water') {
    buffer = await pdfGenerator.generateWaterPDF(addWaterClassifications(sample.toObject()));
  } else {
    buffer = await pdfGenerator.generateFertilizerPDF(sample);
  }
  logger.info(`${LOG} PDF generated type=${sampleType} sample=${sampleId} bytes=${buffer.length} (${Date.now() - startedAt}ms)`);
  return { buffer: Buffer.from(buffer), filename: buildPdfFileName(sampleType, sample), sample };
}

// ─── Precheck (confirmation dialog data) ────────────────────────────────────

async function precheck({ sampleType, sampleIds, channel }) {
  assertSampleType(sampleType);
  if (!CHANNELS.includes(channel)) {
    throw new ReportDeliveryError(400, 'INVALID_CHANNEL', 'Channel must be whatsapp or email');
  }
  const ids = assertSampleIds(sampleIds, channel === 'email' ? MAX_EMAIL_PER_REQUEST : MAX_WHATSAPP_PER_REQUEST);
  const samples = await loadSamplesWithContacts(sampleType, ids);

  const items = samples.map((s) => {
    const snapshot = s.delivery?.[channel] || {};
    const alreadySent = (snapshot.sendCount || 0) > 0 && snapshot.status !== 'not_sent';
    let recipient = null;
    let valid = true;
    let reason = null;

    if (channel === 'whatsapp') {
      recipient = normalizeIndianMobile(s.mobileNo);
      if (!recipient) {
        valid = false;
        reason = s.mobileNo ? 'Invalid mobile number' : 'No mobile number';
      }
    }

    return {
      sampleId: String(s._id),
      sampleNumber: s.sampleNumber || '',
      farmerName: farmerNameOf(sampleType, s),
      farmsName: s.farmsName || '',
      mobileNo: s.mobileNo || '',
      recipient,
      recipientDisplay: channel === 'whatsapp' ? formatPhoneForDisplay(recipient) : null,
      valid,
      reason,
      alreadySent,
      lastStatus: snapshot.status || 'not_sent',
      lastSentAt: snapshot.lastSentAt || null,
      lastRecipient: snapshot.recipient || null,
      sendCount: snapshot.sendCount || 0
    };
  });

  const missing = ids.length - samples.length;
  return {
    sampleType,
    channel,
    items,
    summary: {
      requested: ids.length,
      found: items.length,
      missing,
      valid: items.filter((i) => i.valid).length,
      invalid: items.filter((i) => !i.valid).length,
      alreadySent: items.filter((i) => i.valid && i.alreadySent).length
    }
  };
}

// ─── Embedded snapshot writes ───────────────────────────────────────────────

/**
 * Applies a status change to the sample's embedded snapshot, but ONLY if `delivery` is still
 * the latest send for that channel. Prevents an old send's late webhook (or retry) from
 * overwriting a newer resend's status.
 */
async function applyEmbeddedStatus(delivery, fields) {
  const Model = SAMPLE_MODELS[delivery.sampleType];
  const prefix = `delivery.${delivery.channel}`;
  const $set = { [`${prefix}.lastStatusAt`]: new Date() };
  for (const [key, value] of Object.entries(fields)) $set[`${prefix}.${key}`] = value;

  const result = await Model.updateOne(
    { _id: delivery.sampleId, [`${prefix}.lastDeliveryId`]: delivery._id },
    { $set }
  );
  if (result.matchedCount === 0) {
    logger.debug(`${LOG} snapshot not updated for delivery=${delivery._id} (superseded by a newer send)`);
  }
}

/** Points the sample's snapshot at a freshly queued send and bumps its send counter. */
async function markQueuedOnSample(delivery) {
  const Model = SAMPLE_MODELS[delivery.sampleType];
  const prefix = `delivery.${delivery.channel}`;
  await Model.updateOne(
    { _id: delivery.sampleId },
    {
      $set: {
        [`${prefix}.status`]: 'queued',
        [`${prefix}.recipient`]: delivery.recipient,
        [`${prefix}.lastDeliveryId`]: delivery._id,
        [`${prefix}.lastStatusAt`]: new Date(),
        [`${prefix}.lastError`]: null
      },
      $inc: { [`${prefix}.sendCount`]: 1 }
    }
  );
}

// ─── Queueing ───────────────────────────────────────────────────────────────

function buildDeliveryDoc({ sampleType, sample, channel, recipient, batchId, user }) {
  const previousSends = sample.delivery?.[channel]?.sendCount || 0;
  return {
    sampleType,
    sampleId: sample._id,
    sampleModel: SAMPLE_MODEL_NAMES[sampleType],
    sessionId: sample.sessionId || null,
    sessionDate: sample.sessionDate || null,
    sampleNumber: sample.sampleNumber || '',
    farmerName: farmerNameOf(sampleType, sample),
    farmsName: sample.farmsName || '',
    channel,
    recipient,
    batchId,
    isResend: previousSends > 0,
    sendSequence: previousSends + 1,
    status: 'queued',
    statusHistory: [{ status: 'queued', at: new Date(), source: 'user', note: previousSends > 0 ? 'Resend confirmed' : null }],
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    sentBy: user?._id || null,
    sentByName: user?.name || ''
  };
}

function requireResendConfirmation(check, confirmResend) {
  const already = check.items.filter((i) => i.valid && i.alreadySent);
  if (already.length && !confirmResend) {
    throw new ReportDeliveryError(409, 'RESEND_CONFIRMATION_REQUIRED',
      `${already.length} report(s) were already sent. Confirm to send them again.`,
      { alreadySent: already });
  }
}

async function queueWhatsApp({ sampleType, sampleIds, user, confirmResend = false }) {
  const check = await precheck({ sampleType, sampleIds, channel: 'whatsapp' });
  requireResendConfirmation(check, confirmResend);

  const validItems = check.items.filter((i) => i.valid);
  const skipped = check.items.filter((i) => !i.valid);
  if (!validItems.length) {
    throw new ReportDeliveryError(422, 'NO_VALID_RECIPIENTS', 'None of the selected reports has a valid mobile number', { skipped });
  }

  const samples = await loadSamplesWithContacts(sampleType, validItems.map((i) => i.sampleId));
  const recipientById = new Map(validItems.map((i) => [i.sampleId, i.recipient]));
  const batchId = crypto.randomUUID();

  const docs = samples.map((sample) => buildDeliveryDoc({
    sampleType, sample, channel: 'whatsapp', recipient: recipientById.get(String(sample._id)), batchId, user
  }));
  const deliveries = await ReportDelivery.insertMany(docs);
  await Promise.all(deliveries.map(markQueuedOnSample));

  logger.info(`${LOG} WhatsApp queued batch=${batchId} type=${sampleType} count=${deliveries.length} skipped=${skipped.length} ` +
    `resends=${deliveries.filter((d) => d.isResend).length} by=${user?._id} (${user?.name || '-'})`);

  runInBackground(`whatsapp batch ${batchId}`, () =>
    runWithConcurrency(deliveries.map((d) => d._id), PROCESS_CONCURRENCY, (id) => processWhatsAppDelivery(id, 'api')));

  return {
    batchId,
    channel: 'whatsapp',
    queued: deliveries.map((d) => ({ deliveryId: String(d._id), sampleId: String(d.sampleId), isResend: d.isResend })),
    skipped
  };
}

async function queueEmail({ sampleType, sampleIds, email, user, confirmResend = false }) {
  const recipient = normalizeEmail(email);
  const check = await precheck({ sampleType, sampleIds, channel: 'email' });
  requireResendConfirmation(check, confirmResend);
  if (!check.items.length) {
    throw new ReportDeliveryError(404, 'SAMPLES_NOT_FOUND', 'The selected reports no longer exist');
  }

  const samples = await loadSamplesWithContacts(sampleType, check.items.map((i) => i.sampleId));
  const batchId = crypto.randomUUID();
  const docs = samples.map((sample) => buildDeliveryDoc({
    sampleType, sample, channel: 'email', recipient, batchId, user
  }));
  const deliveries = await ReportDelivery.insertMany(docs);
  await Promise.all(deliveries.map(markQueuedOnSample));

  logger.info(`${LOG} Email queued batch=${batchId} type=${sampleType} count=${deliveries.length} to=${maskRecipient(recipient)} ` +
    `by=${user?._id} (${user?.name || '-'})`);

  runInBackground(`email batch ${batchId}`, () => processEmailBatch(batchId, 'api'));

  return {
    batchId,
    channel: 'email',
    recipient,
    queued: deliveries.map((d) => ({ deliveryId: String(d._id), sampleId: String(d.sampleId), isResend: d.isResend })),
    skipped: []
  };
}

// ─── Processing (shared by request path and reconciler) ────────────────────

/** Lock filter: row is sendable and not currently claimed by another worker. */
const claimableFilter = (now) => ({
  status: { $in: ['queued', 'failed'] },
  'error.permanent': { $ne: true },
  $expr: { $lt: ['$attempts', '$maxAttempts'] },
  $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }]
});

const claimUpdate = (now, lockToken) => ({
  $set: { lockedUntil: new Date(now.getTime() + LOCK_MS), lockToken, lastAttemptAt: now },
  $inc: { attempts: 1 }
});

const nextRetryAt = (attempts) => new Date(Date.now() + Math.min(attempts, 4) * 15 * 60 * 1000);

/** Classifies a send error and describes it for the audit row. */
function describeFailure(err) {
  const providerCode = err.providerErrorCode ?? err.body?.providerErrorCode ?? null;
  const serviceCode = err.body?.error || null;
  const permanent =
    (providerCode != null && PERMANENT_WHATSAPP_ERROR_CODES.has(Number(providerCode))) ||
    serviceCode === 'VALIDATION_ERROR' || serviceCode === 'BAD_REQUEST' ||
    err.code === 'SAMPLE_NOT_FOUND';
  return {
    code: providerCode != null ? String(providerCode) : (serviceCode || err.code || (err.status ? `HTTP_${err.status}` : 'NETWORK_ERROR')),
    message: (err.message || 'Unknown error').slice(0, 500),
    permanent
  };
}

async function recordFailure(delivery, err, source) {
  const error = describeFailure(err);
  const exhausted = delivery.attempts >= delivery.maxAttempts;
  const willRetry = !error.permanent && !exhausted;
  const now = new Date();

  await ReportDelivery.updateOne(
    { _id: delivery._id, lockToken: delivery.lockToken },
    {
      $set: {
        status: 'failed',
        error,
        failedAt: now,
        nextRetryAt: willRetry ? nextRetryAt(delivery.attempts) : null,
        lockedUntil: null,
        lockToken: null
      },
      $push: {
        statusHistory: {
          status: 'failed',
          at: now,
          source,
          note: `Attempt ${delivery.attempts}/${delivery.maxAttempts}: ${error.message}` +
            (willRetry ? ' — will retry' : error.permanent ? ' — permanent, not retried' : ' — no attempts left')
        }
      }
    }
  );
  await applyEmbeddedStatus(delivery, { status: 'failed', lastError: error.message });

  logger.warn(`${LOG} ${delivery.channel} FAILED delivery=${delivery._id} sample=${delivery.sampleType}/${delivery.sampleId} ` +
    `to=${maskRecipient(delivery.recipient)} attempt=${delivery.attempts}/${delivery.maxAttempts} code=${error.code} ` +
    `permanent=${error.permanent} retry=${willRetry} source=${source}: ${error.message}`);
}

async function createShareLink(delivery, user) {
  // A retry re-sends the same message; the previous attempt's link never reached anyone.
  await ReportShareLink.updateMany(
    { deliveryId: delivery._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  const token = crypto.randomBytes(24).toString('base64url');
  const link = await ReportShareLink.create({
    tokenHash: hashToken(token),
    sampleType: delivery.sampleType,
    sampleId: delivery.sampleId,
    sampleModel: delivery.sampleModel,
    deliveryId: delivery._id,
    expiresAt: new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdBy: user || delivery.sentBy || null
  });
  return { token, link };
}

async function processWhatsAppDelivery(deliveryId, source = 'api') {
  const now = new Date();
  const lockToken = crypto.randomUUID();
  const delivery = await ReportDelivery.findOneAndUpdate(
    { _id: deliveryId, channel: 'whatsapp', ...claimableFilter(now) },
    claimUpdate(now, lockToken),
    { new: true }
  );
  if (!delivery) {
    logger.debug(`${LOG} WhatsApp delivery=${deliveryId} not claimable (done, locked or exhausted)`);
    return;
  }

  const startedAt = Date.now();
  logger.info(`${LOG} WhatsApp sending delivery=${delivery._id} sample=${delivery.sampleType}/${delivery.sampleId} ` +
    `to=${maskRecipient(delivery.recipient)} attempt=${delivery.attempts}/${delivery.maxAttempts} source=${source}`);

  try {
    const { buffer, filename } = await generateReportPdf(delivery.sampleType, delivery.sampleId);
    const { token, link } = await createShareLink(delivery);

    const response = await notificationClient.sendWhatsAppDocumentTemplate({
      to: delivery.recipient,
      templateName: WHATSAPP_TEMPLATES[delivery.sampleType],
      languageCode: WHATSAPP_TEMPLATE_LANGUAGE,
      buttonUrlParameter: `${REPORT_LINK_PATH_PREFIX}${token}`,
      pdfBuffer: buffer,
      filename
    });

    const sentAt = new Date();
    await ReportDelivery.updateOne(
      { _id: delivery._id, lockToken },
      {
        $set: {
          status: 'sent',
          providerMessageId: response?.providerMessageId || null,
          providerRequestId: response?.requestId || null,
          shareLinkId: link._id,
          sentAt,
          nextRetryAt: null,
          error: { code: null, message: null, permanent: false },
          lockedUntil: null,
          lockToken: null
        },
        $push: { statusHistory: { status: 'sent', at: sentAt, source, note: `Accepted by WhatsApp (attempt ${delivery.attempts})` } }
      }
    );
    await ReportShareLink.updateOne({ _id: link._id }, { $set: { deliveryId: delivery._id } });
    await applyEmbeddedStatus(delivery, { status: 'sent', lastSentAt: sentAt, lastError: null });

    logger.info(`${LOG} WhatsApp SENT delivery=${delivery._id} wamid=${response?.providerMessageId || '-'} ` +
      `template=${WHATSAPP_TEMPLATES[delivery.sampleType]} (${Date.now() - startedAt}ms)`);
  } catch (err) {
    delivery.lockToken = lockToken;
    await recordFailure(delivery, err, source);
  }
}

/** Builds an in-memory zip of the given files. */
function zipBuffers(files) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const sink = new PassThrough();
    const chunks = [];
    sink.on('data', (c) => chunks.push(c));
    sink.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    sink.on('error', reject);
    archive.pipe(sink);

    const used = new Set();
    for (const file of files) {
      let name = file.filename;
      for (let n = 2; used.has(name); n++) name = file.filename.replace(/\.pdf$/i, `_${n}.pdf`);
      used.add(name);
      archive.append(file.buffer, { name });
    }
    archive.finalize();
  });
}

/**
 * Sends one email for every claimable row in an email batch: all reports zipped into a
 * single attachment. Every row in the batch shares the outcome (one email = one result).
 */
async function processEmailBatch(batchId, source = 'api') {
  const now = new Date();
  const lockToken = crypto.randomUUID();
  const claim = await ReportDelivery.updateMany(
    { batchId, channel: 'email', ...claimableFilter(now) },
    claimUpdate(now, lockToken)
  );
  if (!claim.modifiedCount) {
    logger.debug(`${LOG} Email batch=${batchId} has nothing claimable`);
    return;
  }
  const deliveries = await ReportDelivery.find({ batchId, lockToken });
  if (!deliveries.length) return;

  const recipient = deliveries[0].recipient;
  const sampleType = deliveries[0].sampleType;
  const startedAt = Date.now();
  logger.info(`${LOG} Email sending batch=${batchId} type=${sampleType} reports=${deliveries.length} ` +
    `to=${maskRecipient(recipient)} attempt=${deliveries[0].attempts}/${deliveries[0].maxAttempts} source=${source}`);

  // Generate every PDF; a report whose sample was deleted fails on its own without
  // blocking the rest of the bundle.
  const files = [];
  const included = [];
  await runWithConcurrency(deliveries, PROCESS_CONCURRENCY, async (delivery) => {
    try {
      const { buffer, filename } = await generateReportPdf(delivery.sampleType, delivery.sampleId);
      files.push({ buffer, filename, order: deliveries.indexOf(delivery) });
      included.push(delivery);
    } catch (err) {
      delivery.lockToken = lockToken;
      await recordFailure(delivery, err, source);
    }
  });
  if (!included.length) return;

  files.sort((a, b) => a.order - b.order);
  included.sort((a, b) => deliveries.indexOf(a) - deliveries.indexOf(b));

  try {
    const zip = await zipBuffers(files);
    const date = new Date().toISOString().slice(0, 10);
    const typeLabel = (TYPE_LABELS[sampleType] || 'Lab').replace(/\s+/g, '_');
    const zipFileName = `ShivAgri_${typeLabel}_Reports_${date}.zip`;
    const { subject, html } = buildLabReportsEmail({
      sampleType,
      reports: included.map((d) => ({
        sampleNumber: d.sampleNumber, farmerName: d.farmerName, farmsName: d.farmsName, sessionDate: d.sessionDate
      })),
      zipFileName,
      sentByName: included[0].sentByName
    });

    const response = await notificationClient.sendEmailWithAttachments({
      to: [recipient],
      subject,
      html,
      attachments: [{ buffer: zip, filename: zipFileName, contentType: 'application/zip' }]
    });

    const sentAt = new Date();
    await ReportDelivery.updateMany(
      { _id: { $in: included.map((d) => d._id) }, lockToken },
      {
        $set: {
          status: 'sent',
          providerMessageId: response?.providerMessageId || null,
          providerRequestId: response?.requestId || null,
          sentAt,
          nextRetryAt: null,
          error: { code: null, message: null, permanent: false },
          lockedUntil: null,
          lockToken: null
        },
        $push: { statusHistory: { status: 'sent', at: sentAt, source, note: `Emailed in ${zipFileName} (${included.length} report(s))` } }
      }
    );
    await Promise.all(included.map((d) => applyEmbeddedStatus(d, { status: 'sent', lastSentAt: sentAt, lastError: null })));

    logger.info(`${LOG} Email SENT batch=${batchId} reports=${included.length} zipBytes=${zip.length} ` +
      `to=${maskRecipient(recipient)} (${Date.now() - startedAt}ms)`);
  } catch (err) {
    await Promise.all(included.map((d) => {
      d.lockToken = lockToken;
      return recordFailure(d, err, source);
    }));
  }
}

// ─── Webhook status sync ────────────────────────────────────────────────────

/**
 * Folds Meta delivery statuses (persisted by notification-service's webhook into the shared
 * `whatsapp_message_status` collection, keyed by wamid) into our audit rows + snapshots.
 * Only ever moves a status forward (rank-based), mirroring the webhook store's own rule.
 *
 * @param {object} [scope] optional narrowing: { deliveryIds } or { sampleType, sampleIds }
 */
async function syncWhatsAppStatuses(scope = {}) {
  const filter = {
    channel: 'whatsapp',
    status: { $in: ['sent', 'delivered'] },
    providerMessageId: { $ne: null },
    sentAt: { $gte: new Date(Date.now() - STATUS_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000) }
  };
  if (scope.deliveryIds) filter._id = { $in: scope.deliveryIds };
  if (scope.sampleIds) {
    filter.sampleType = scope.sampleType;
    filter.sampleId = { $in: scope.sampleIds };
  }

  const pending = await ReportDelivery.find(filter)
    .select('_id sampleType sampleId channel status providerMessageId attempts maxAttempts recipient deliveredAt readAt')
    .limit(scope.limit || 1000)
    .lean();
  if (!pending.length) return { checked: 0, updated: 0 };

  const statusRows = await mongoose.connection.db.collection('whatsapp_message_status')
    .find({ _id: { $in: pending.map((d) => d.providerMessageId) } })
    .project({ statusRank: 1, errorCode: 1, errorTitle: 1, errorDetails: 1, transitions: 1, lastUpdated: 1 })
    .toArray();
  const byWamid = new Map(statusRows.map((r) => [r._id, r]));

  let updated = 0;
  for (const delivery of pending) {
    const row = byWamid.get(delivery.providerMessageId);
    const newStatus = row && WEBHOOK_RANK_TO_STATUS[row.statusRank];
    if (!newStatus || STATUS_RANK[newStatus] <= STATUS_RANK[delivery.status]) continue;

    const transitionAt = (status) => {
      const t = (row.transitions || []).filter((x) => x.status === status).pop();
      return t?.statusTimestamp || t?.receivedAt || row.lastUpdated || new Date();
    };

    const $set = { status: newStatus };
    const history = [];
    if ((newStatus === 'delivered' || newStatus === 'read') && !delivery.deliveredAt) {
      $set.deliveredAt = transitionAt('delivered');
      history.push({ status: 'delivered', at: $set.deliveredAt, source: 'webhook', note: null });
    }
    if (newStatus === 'read') {
      $set.readAt = transitionAt('read');
      history.push({ status: 'read', at: $set.readAt, source: 'webhook', note: null });
    }

    if (newStatus === 'failed') {
      // Accepted by the API but Meta could not deliver it (e.g. number not on WhatsApp).
      const err = Object.assign(new Error(row.errorDetails || row.errorTitle || 'WhatsApp could not deliver the message'), {
        providerErrorCode: row.errorCode
      });
      const failure = describeFailure(err);
      const willRetry = !failure.permanent && delivery.attempts < delivery.maxAttempts;
      Object.assign($set, {
        error: failure,
        failedAt: transitionAt('failed'),
        nextRetryAt: willRetry ? nextRetryAt(delivery.attempts) : null
      });
      history.push({
        status: 'failed', at: $set.failedAt, source: 'webhook',
        note: `${failure.code}: ${failure.message}${willRetry ? ' — will retry' : ''}`
      });
    }

    // Guard on the status we read so a concurrent sync can't apply the same move twice.
    const res = await ReportDelivery.updateOne(
      { _id: delivery._id, status: delivery.status },
      { $set, $push: { statusHistory: { $each: history } } }
    );
    if (!res.modifiedCount) continue;
    updated++;

    await applyEmbeddedStatus(delivery, newStatus === 'failed'
      ? { status: 'failed', lastError: $set.error.message }
      : { status: newStatus });
    logger.info(`${LOG} WhatsApp status ${delivery.status} → ${newStatus} delivery=${delivery._id} wamid=${delivery.providerMessageId}`);
  }

  return { checked: pending.length, updated };
}

// ─── Grid status polling ────────────────────────────────────────────────────

async function getSampleStatuses({ sampleType, sampleIds }) {
  assertSampleType(sampleType);
  const ids = assertSampleIds(sampleIds, 500);
  try {
    await syncWhatsAppStatuses({ sampleType, sampleIds: ids, limit: 500 });
  } catch (err) {
    logger.warn(`${LOG} status sync during poll failed (serving cached status): ${err.message}`);
  }
  const rows = await SAMPLE_MODELS[sampleType].find({ _id: { $in: ids } }).select('delivery').lean();
  return rows.map((r) => ({ sampleId: String(r._id), delivery: r.delivery || null }));
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildListFilter({ channel, status, sampleType, search, from, to }, { includeStatus = true } = {}) {
  const filter = {};
  if (channel && CHANNELS.includes(channel)) filter.channel = channel;
  if (sampleType && SAMPLE_TYPES.includes(sampleType)) filter.sampleType = sampleType;
  if (includeStatus && status && STATUS_RANK[status] !== undefined) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from && !Number.isNaN(Date.parse(from))) filter.createdAt.$gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) {
      const end = new Date(to);
      // A bare date ("2026-11-14") means "through the end of that day".
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
    if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
  }
  const term = String(search || '').trim().slice(0, 80);
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i');
    const digits = term.replace(/\D/g, '');
    filter.$or = [{ farmerName: rx }, { farmsName: rx }, { sampleNumber: rx }, { recipient: rx }, { sentByName: rx }];
    if (digits.length >= 4) filter.$or.push({ recipient: new RegExp(escapeRegex(digits)) });
  }
  return filter;
}

const toListRow = (d) => ({
  id: String(d._id),
  sampleType: d.sampleType,
  sampleId: String(d.sampleId),
  sessionId: d.sessionId ? String(d.sessionId) : null,
  sessionDate: d.sessionDate,
  sampleNumber: d.sampleNumber,
  farmerName: d.farmerName,
  farmsName: d.farmsName,
  channel: d.channel,
  recipient: d.recipient,
  recipientDisplay: d.channel === 'whatsapp' ? formatPhoneForDisplay(d.recipient) : d.recipient,
  batchId: d.batchId,
  isResend: d.isResend,
  sendSequence: d.sendSequence,
  status: d.status,
  attempts: d.attempts,
  maxAttempts: d.maxAttempts,
  nextRetryAt: d.nextRetryAt,
  error: d.error?.message ? d.error : null,
  sentAt: d.sentAt,
  deliveredAt: d.deliveredAt,
  readAt: d.readAt,
  failedAt: d.failedAt,
  sentByName: d.sentByName,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt
});

async function listDeliveries(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = buildListFilter(query);

  const [rows, total] = await Promise.all([
    ReportDelivery.find(filter)
      .select('-statusHistory -lockToken -lockedUntil')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ReportDelivery.countDocuments(filter)
  ]);

  // Freshen any in-flight WhatsApp rows on this page so the dashboard shows live status.
  const inflight = rows.filter((r) => r.channel === 'whatsapp' && (r.status === 'sent' || r.status === 'delivered'));
  if (inflight.length) {
    try {
      const { updated } = await syncWhatsAppStatuses({ deliveryIds: inflight.map((r) => r._id) });
      if (updated) {
        const fresh = await ReportDelivery.find({ _id: { $in: inflight.map((r) => r._id) } })
          .select('status deliveredAt readAt failedAt error nextRetryAt').lean();
        const byId = new Map(fresh.map((f) => [String(f._id), f]));
        for (const row of rows) Object.assign(row, byId.get(String(row._id)) || {});
      }
    } catch (err) {
      logger.warn(`${LOG} status sync during list failed: ${err.message}`);
    }
  }

  return {
    data: rows.map(toListRow),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}

/** Status counts for the dashboard tiles; honours every filter except `status` itself. */
async function getSummary(query) {
  const filter = buildListFilter(query, { includeStatus: false });
  const grouped = await ReportDelivery.aggregate([
    { $match: filter },
    { $group: { _id: { channel: '$channel', status: '$status' }, count: { $sum: 1 } } }
  ]);

  const byStatus = { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  const byChannel = { whatsapp: 0, email: 0 };
  for (const g of grouped) {
    byStatus[g._id.status] = (byStatus[g._id.status] || 0) + g.count;
    byChannel[g._id.channel] = (byChannel[g._id.channel] || 0) + g.count;
  }
  const total = Object.values(byChannel).reduce((a, b) => a + b, 0);
  const reached = byStatus.sent + byStatus.delivered + byStatus.read;
  return {
    total,
    byStatus,
    byChannel,
    pending: byStatus.queued,
    successRatePercent: total ? Math.round((reached / total) * 1000) / 10 : 0
  };
}

async function getDelivery(id) {
  if (!isValidObjectId(id)) throw new ReportDeliveryError(400, 'INVALID_ID', 'Invalid delivery id');
  const d = await ReportDelivery.findById(id).select('-lockToken -lockedUntil').lean();
  if (!d) throw new ReportDeliveryError(404, 'NOT_FOUND', 'Delivery not found');

  const link = d.shareLinkId
    ? await ReportShareLink.findById(d.shareLinkId).select('expiresAt revokedAt accessCount lastAccessedAt').lean()
    : null;

  return {
    ...toListRow(d),
    providerMessageId: d.providerMessageId,
    statusHistory: d.statusHistory || [],
    shareLink: link ? {
      expiresAt: link.expiresAt,
      revoked: !!link.revokedAt,
      accessCount: link.accessCount,
      lastAccessedAt: link.lastAccessedAt
    } : null
  };
}

/**
 * Manual retry from the dashboard (any failed row, even "permanent" ones — e.g. after the
 * template was fixed or the number corrected). Grants exactly one more attempt.
 * Email rows retry their whole batch's failed rows together (one email).
 */
async function retryDelivery(id, user) {
  if (!isValidObjectId(id)) throw new ReportDeliveryError(400, 'INVALID_ID', 'Invalid delivery id');
  const delivery = await ReportDelivery.findById(id).lean();
  if (!delivery) throw new ReportDeliveryError(404, 'NOT_FOUND', 'Delivery not found');
  if (delivery.status !== 'failed') {
    throw new ReportDeliveryError(409, 'NOT_RETRYABLE', 'Only failed deliveries can be retried');
  }

  const scope = delivery.channel === 'email'
    ? { batchId: delivery.batchId, status: 'failed' }
    : { _id: delivery._id, status: 'failed' };
  const rows = await ReportDelivery.find(scope).select('_id attempts').lean();
  const note = `Manual retry by ${user?.name || 'user'}`;
  await Promise.all(rows.map((r) => ReportDelivery.updateOne(
    { _id: r._id, status: 'failed' },
    {
      $set: { status: 'queued', maxAttempts: r.attempts + 1, nextRetryAt: null, 'error.permanent': false },
      $push: { statusHistory: { status: 'queued', at: new Date(), source: 'user', note } }
    }
  )));
  // Re-point snapshots at queued for rows that are still each sample's latest send.
  const fresh = await ReportDelivery.find({ _id: { $in: rows.map((r) => r._id) } }).lean();
  await Promise.all(fresh.map((d) => applyEmbeddedStatus(d, { status: 'queued', lastError: null })));

  logger.info(`${LOG} Manual retry delivery=${id} channel=${delivery.channel} rows=${rows.length} by=${user?._id}`);

  if (delivery.channel === 'email') {
    runInBackground(`email retry ${delivery.batchId}`, () => processEmailBatch(delivery.batchId, 'user'));
  } else {
    runInBackground(`whatsapp retry ${id}`, () => processWhatsAppDelivery(delivery._id, 'user'));
  }
  return { retried: rows.length };
}

// ─── Public share links ─────────────────────────────────────────────────────

/** Validates a public report token. Throws 404 (unknown/revoked) or 410 (expired). */
async function resolveShareLink(token) {
  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new ReportDeliveryError(404, 'LINK_NOT_FOUND', 'This report link is not valid');
  }
  const link = await ReportShareLink.findOne({ tokenHash: hashToken(token) }).lean();
  if (!link || link.revokedAt) {
    throw new ReportDeliveryError(404, 'LINK_NOT_FOUND', 'This report link is not valid');
  }
  if (link.expiresAt < new Date()) {
    throw new ReportDeliveryError(410, 'LINK_EXPIRED', 'This report link has expired. Please contact Shiv Agri for a new copy.');
  }

  const sample = await SAMPLE_MODELS[link.sampleType].findById(link.sampleId)
    .select('sampleNumber farmersName farmerName farmsName sessionDate')
    .lean();
  if (!sample) {
    throw new ReportDeliveryError(404, 'LINK_NOT_FOUND', 'This report is no longer available');
  }

  return {
    link,
    report: {
      sampleType: link.sampleType,
      title: `${TYPE_LABELS[link.sampleType]} Report`,
      sampleNumber: sample.sampleNumber || '',
      farmerName: farmerNameOf(link.sampleType, sample),
      farmsName: sample.farmsName || '',
      sessionDate: sample.sessionDate || '',
      expiresAt: link.expiresAt
    }
  };
}

async function recordLinkAccess(linkId) {
  await ReportShareLink.updateOne({ _id: linkId }, { $inc: { accessCount: 1 }, $set: { lastAccessedAt: new Date() } });
}

// ─── Reconciliation (every 30 min) ──────────────────────────────────────────

async function reconcile() {
  const startedAt = Date.now();
  const now = new Date();
  const lockFree = { $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] };

  // 1. Missed sends: still queued long after creation and nobody holds the lock.
  // 2. Due retries: transient failures whose backoff has elapsed.
  const due = await ReportDelivery.find({
    $and: [
      lockFree,
      {
        $or: [
          { status: 'queued', updatedAt: { $lt: new Date(now.getTime() - STUCK_QUEUED_MS) } },
          { status: 'failed', 'error.permanent': { $ne: true }, nextRetryAt: { $ne: null, $lte: now } }
        ]
      },
      { $expr: { $lt: ['$attempts', '$maxAttempts'] } }
    ]
  }).select('_id channel batchId status').limit(500).lean();

  const whatsappIds = due.filter((d) => d.channel === 'whatsapp').map((d) => d._id);
  const emailBatches = [...new Set(due.filter((d) => d.channel === 'email').map((d) => d.batchId))];

  if (due.length) {
    logger.info(`${LOG} Reconciler picked up ${due.length} row(s): whatsapp=${whatsappIds.length} emailBatches=${emailBatches.length} ` +
      `(stuck=${due.filter((d) => d.status === 'queued').length}, retries=${due.filter((d) => d.status === 'failed').length})`);
  }

  await runWithConcurrency(whatsappIds, PROCESS_CONCURRENCY, (id) => processWhatsAppDelivery(id, 'reconciler'));
  await runWithConcurrency(emailBatches, 1, (batchId) => processEmailBatch(batchId, 'reconciler'));

  let sync = { checked: 0, updated: 0 };
  try {
    sync = await syncWhatsAppStatuses();
  } catch (err) {
    logger.error(`${LOG} Reconciler status sync failed: ${err.message}`, { stack: err.stack });
  }

  const summary = {
    processedWhatsApp: whatsappIds.length,
    processedEmailBatches: emailBatches.length,
    statusChecked: sync.checked,
    statusUpdated: sync.updated,
    ms: Date.now() - startedAt
  };
  logger.info(`${LOG} Reconcile done ${JSON.stringify(summary)}`);
  return summary;
}

module.exports = {
  ReportDeliveryError,
  SAMPLE_TYPES,
  PUBLIC_APP_URL,
  normalizeIndianMobile,
  generateReportPdf,
  precheck,
  queueWhatsApp,
  queueEmail,
  processWhatsAppDelivery,
  processEmailBatch,
  syncWhatsAppStatuses,
  getSampleStatuses,
  listDeliveries,
  getSummary,
  getDelivery,
  retryDelivery,
  resolveShareLink,
  recordLinkAccess,
  reconcile
};

/**
 * Media cleanup service.
 *
 * Permanently purges soft-deleted project subdocuments (farm media,
 * landscaping designs, prescriptions, structured-prescription image
 * attachments) older than the configured retention window (default 30
 * days). For each media-service-backed item, the media-service delete
 * endpoint is invoked so the underlying file is also removed from
 * storage.
 *
 * Safe to call repeatedly; idempotent.
 */
const Project = require('../models/Project');
const logger = require('../utils/logger');

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:8081';
const RETENTION_DAYS = parseInt(process.env.MEDIA_PURGE_RETENTION_DAYS, 10) || 30;
// Default interval — once per day. Settable for tests/local dev.
const PURGE_INTERVAL_MS = parseInt(process.env.MEDIA_PURGE_INTERVAL_MS, 10)
  || 24 * 60 * 60 * 1000;

let scheduledHandle = null;

/**
 * Best-effort DELETE on the media service. Failures are logged but never
 * thrown — the DB cleanup proceeds regardless so we don't leave orphan
 * subdocs forever.
 */
async function deleteMediaServiceFile(mediaId) {
  if (!mediaId) return;
  try {
    const res = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media/${mediaId}`, {
      method: 'DELETE'
    });
    if (!res.ok && res.status !== 404) {
      logger.warn(`[MediaCleanup] Media-service delete returned ${res.status} for mediaId=${mediaId}`);
    }
  } catch (err) {
    logger.warn(`[MediaCleanup] Media-service delete failed for mediaId=${mediaId}: ${err.message}`);
  }
}

function cutoffDate() {
  const d = new Date();
  d.setDate(d.getDate() - RETENTION_DAYS);
  return d;
}

/**
 * Scan every project for expired soft-deleted subdocs and purge them
 * (DB record + media-service file). Returns a summary of how many of
 * each kind were removed.
 */
async function purgeExpiredMedia() {
  const cutoff = cutoffDate();
  const stats = {
    farmMedia: 0,
    designs: 0,
    prescriptions: 0,
    attachedImages: 0
  };

  // Find candidates only — using $or so we don't load every project.
  const candidateQuery = {
    isDeleted: false,
    $or: [
      { 'farmMedia.status': 'DELETED' },
      { 'landscapingDesigns.status': 'DELETED' },
      { 'prescriptions.status': 'DELETED' }
    ]
  };

  // Iterate via cursor to keep memory bounded.
  const cursor = Project.find(candidateQuery)
    .select('_id farmMedia landscapingDesigns prescriptions')
    .cursor();

  for (let project = await cursor.next(); project; project = await cursor.next()) {
    const farmMediaToPurge = (project.farmMedia || []).filter(
      (m) => m.status === 'DELETED' && m.deletedAt && new Date(m.deletedAt) < cutoff
    );
    const designsToPurge = (project.landscapingDesigns || []).filter(
      (m) => m.status === 'DELETED' && m.deletedAt && new Date(m.deletedAt) < cutoff
    );
    const prescriptionsToPurge = (project.prescriptions || []).filter(
      (m) => m.status === 'DELETED' && m.deletedAt && new Date(m.deletedAt) < cutoff
    );

    if (!farmMediaToPurge.length && !designsToPurge.length && !prescriptionsToPurge.length) {
      continue;
    }

    // Delete underlying media-service files first (best-effort).
    for (const m of farmMediaToPurge) await deleteMediaServiceFile(m.mediaId);
    for (const m of designsToPurge) await deleteMediaServiceFile(m.mediaId);
    for (const rx of prescriptionsToPurge) {
      if (rx.mediaId) await deleteMediaServiceFile(rx.mediaId);
      for (const img of rx.attachedImages || []) {
        await deleteMediaServiceFile(img.mediaId);
        stats.attachedImages += 1;
      }
    }

    const farmMediaIds = farmMediaToPurge.map((m) => m._id);
    const designIds = designsToPurge.map((m) => m._id);
    const prescriptionIds = prescriptionsToPurge.map((m) => m._id);

    // $pull all expired subdocs in one update.
    const pullSpec = {};
    if (farmMediaIds.length) pullSpec.farmMedia = { _id: { $in: farmMediaIds } };
    if (designIds.length) pullSpec.landscapingDesigns = { _id: { $in: designIds } };
    if (prescriptionIds.length) pullSpec.prescriptions = { _id: { $in: prescriptionIds } };

    await Project.updateOne(
      { _id: project._id },
      { $pull: pullSpec, $set: { updatedAt: new Date() } }
    );

    stats.farmMedia += farmMediaIds.length;
    stats.designs += designIds.length;
    stats.prescriptions += prescriptionIds.length;

    logger.info(
      `[MediaCleanup] Purged project=${project._id}: ` +
      `farmMedia=${farmMediaIds.length}, designs=${designIds.length}, prescriptions=${prescriptionIds.length}`
    );
  }

  logger.info(
    `[MediaCleanup] Purge sweep complete (cutoff=${cutoff.toISOString()}): ` +
    `farmMedia=${stats.farmMedia}, designs=${stats.designs}, prescriptions=${stats.prescriptions}, attachedImages=${stats.attachedImages}`
  );

  return { cutoff, stats };
}

/**
 * Start a recurring background sweep. Safe to call multiple times — the
 * previous interval is cancelled before a new one is created.
 */
function startScheduled() {
  if (scheduledHandle) return;
  // Run once at startup (delay 60s so the server can boot first), then on
  // the configured interval.
  setTimeout(() => {
    purgeExpiredMedia().catch((err) =>
      logger.error(`[MediaCleanup] Initial sweep failed: ${err.message}`)
    );
  }, 60 * 1000);

  scheduledHandle = setInterval(() => {
    purgeExpiredMedia().catch((err) =>
      logger.error(`[MediaCleanup] Scheduled sweep failed: ${err.message}`)
    );
  }, PURGE_INTERVAL_MS);

  // Don't keep the event loop alive on graceful shutdown.
  if (typeof scheduledHandle.unref === 'function') scheduledHandle.unref();

  logger.info(`[MediaCleanup] Scheduled sweeps every ${PURGE_INTERVAL_MS}ms, retention=${RETENTION_DAYS}d`);
}

function stopScheduled() {
  if (scheduledHandle) {
    clearInterval(scheduledHandle);
    scheduledHandle = null;
  }
}

module.exports = {
  purgeExpiredMedia,
  startScheduled,
  stopScheduled,
  RETENTION_DAYS
};

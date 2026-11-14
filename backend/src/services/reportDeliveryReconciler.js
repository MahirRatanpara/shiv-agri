/**
 * Every 30 minutes (REPORT_DELIVERY_RECONCILE_INTERVAL_MS): re-sends report deliveries that
 * were missed (stuck in `queued`, e.g. lost to a restart mid-send), retries transient
 * failures (bounded by maxAttempts), and folds in WhatsApp webhook statuses.
 *
 * Multi-instance safe: every send is claimed with an atomic lock in reportDeliveryService,
 * so two backends ticking at once never double-send. The in-process `running` flag only
 * stops one instance from overlapping itself when a tick runs long.
 */
const reportDeliveryService = require('./reportDeliveryService');
const logger = require('../utils/logger');

const INTERVAL_MS = parseInt(process.env.REPORT_DELIVERY_RECONCILE_INTERVAL_MS, 10) || 30 * 60 * 1000;
const INITIAL_DELAY_MS = 2 * 60 * 1000;

let handle = null;
let running = false;

async function tick(trigger) {
  if (running) {
    logger.warn(`[ReportDelivery] Reconcile (${trigger}) skipped — previous run still in progress`);
    return;
  }
  running = true;
  try {
    await reportDeliveryService.reconcile();
  } catch (err) {
    logger.error(`[ReportDelivery] Reconcile (${trigger}) failed: ${err.message}`, { stack: err.stack });
  } finally {
    running = false;
  }
}

function startScheduled() {
  if (handle) return;
  const initial = setTimeout(() => tick('startup'), INITIAL_DELAY_MS);
  if (typeof initial.unref === 'function') initial.unref();

  handle = setInterval(() => tick('interval'), INTERVAL_MS);
  if (typeof handle.unref === 'function') handle.unref();
  logger.info(`[ReportDelivery] Reconciler scheduled every ${Math.round(INTERVAL_MS / 60000)} min`);
}

function stopScheduled() {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}

module.exports = { startScheduled, stopScheduled, runNow: () => tick('manual') };

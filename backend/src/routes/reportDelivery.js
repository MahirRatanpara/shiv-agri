const express = require('express');
const router = express.Router();
const controller = require('../controllers/reportDeliveryController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { SAMPLE_TYPES } = require('../services/reportDeliveryService');

// Fertilizer testing reuses soil.* permissions for its sessions (see permissions.yml).
const SEND_PERMISSION = {
  soil: 'soil.reports.send',
  water: 'water.reports.send',
  fertilizer: 'fertilizer.reports.send'
};
const VIEW_PERMISSIONS = {
  soil: ['soil.sessions.view', 'soil.reports.send'],
  water: ['water.sessions.view', 'water.reports.send'],
  fertilizer: ['soil.sessions.view', 'fertilizer.reports.send']
};
const PREVIEW_PERMISSIONS = {
  soil: ['soil.reports.download', 'soil.reports.send'],
  water: ['water.reports.download', 'water.reports.send'],
  fertilizer: ['soil.reports.download', 'fertilizer.reports.send']
};

const validateSampleType = (req, res, next) => {
  if (!SAMPLE_TYPES.includes(req.params.sampleType)) {
    return res.status(400).json({ success: false, error: `Unsupported report type "${req.params.sampleType}"` });
  }
  next();
};

/** requirePermission resolved per request from the :sampleType route param. */
const requireForType = (map, options) => (req, res, next) =>
  requirePermission(map[req.params.sampleType], options)(req, res, next);

router.use(authenticate);

// ── Dashboard (audit trail) ──
router.get('/', requirePermission('reports.delivery.view'), controller.list);
router.get('/summary', requirePermission('reports.delivery.view'), controller.summary);
router.get('/deliveries/:id', requirePermission('reports.delivery.view'), controller.getOne);
router.post('/deliveries/:id/retry', requirePermission('reports.delivery.view'), controller.retry);

// ── Testing-page actions ──
router.post('/:sampleType/precheck', validateSampleType, requireForType(SEND_PERMISSION), controller.precheck);
router.post('/:sampleType/whatsapp', validateSampleType, requireForType(SEND_PERMISSION), controller.sendWhatsApp);
router.post('/:sampleType/email', validateSampleType, requireForType(SEND_PERMISSION), controller.sendEmail);
router.post('/:sampleType/status', validateSampleType, requireForType(VIEW_PERMISSIONS, { requireAll: false }), controller.getStatuses);
router.get('/:sampleType/samples/:sampleId/preview', validateSampleType,
  requireForType(PREVIEW_PERMISSIONS, { requireAll: false }), controller.previewPdf);

module.exports = router;

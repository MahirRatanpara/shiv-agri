const express = require('express');
const router = express.Router();
const controller = require('../controllers/whatsappDeliveryController');
const { authenticate, authorize } = require('../middleware/auth');

// Delivery telemetry exposes recipient phone numbers, so this is admin-only.
router.get('/summary', authenticate, authorize('admin'), controller.getSummary);
router.get('/messages', authenticate, authorize('admin'), controller.getMessages);
router.get('/messages/:wamid', authenticate, authorize('admin'), controller.getMessage);

module.exports = router;

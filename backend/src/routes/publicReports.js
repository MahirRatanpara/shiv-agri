const express = require('express');
const router = express.Router();
const controller = require('../controllers/reportDeliveryController');
const { simpleRateLimit } = require('../middleware/simpleRateLimit');

/**
 * Unauthenticated endpoints behind the WhatsApp "View Report in App" button.
 * Access is granted by the unguessable token alone (hashed at rest, 90-day expiry).
 */
const tokenLimiter = simpleRateLimit({ windowMs: 10 * 60 * 1000, max: 60, name: 'public-report' });

router.get('/reports/:token', tokenLimiter, controller.publicReportInfo);
router.get('/reports/:token/pdf', tokenLimiter, controller.publicReportPdf);

// Proxied by nginx from https://shivagri.com/.well-known/* (see nginx.conf).
router.get('/well-known/assetlinks.json', controller.assetLinks);
router.get('/well-known/apple-app-site-association', controller.appleAppSiteAssociation);

module.exports = router;

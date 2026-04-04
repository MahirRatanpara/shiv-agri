const router = require('express').Router();
const visitController = require('../controllers/visitController');
const { authenticate, requirePermission } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ─── Project-scoped routes ───

router.get('/project/:projectId', requirePermission('farm.visits.view'), visitController.getVisits);
router.get('/project/:projectId/upcoming', requirePermission('farm.visits.view'), visitController.getUpcomingVisits);
router.get('/project/:projectId/stats', requirePermission('farm.visits.view'), visitController.getVisitStats);
router.post('/project/:projectId/schedule-recurring', requirePermission('farm.visits.create'), visitController.scheduleRecurring);

// ─── Single visit routes ───

router.get('/:id', requirePermission('farm.visits.view'), visitController.getVisit);
router.post('/', requirePermission('farm.visits.create'), visitController.createVisit);
router.put('/:id', requirePermission('farm.visits.update'), visitController.updateVisit);
router.put('/:id/complete', requirePermission('farm.visits.update'), visitController.completeVisit);
router.put('/:id/cancel', requirePermission('farm.visits.update'), visitController.cancelVisit);

module.exports = router;

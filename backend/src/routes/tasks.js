const router = require('express').Router();
const taskController = require('../controllers/taskController');
const { authenticate, requirePermission } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ─── Project-scoped routes ───

router.get('/project/:projectId', requirePermission('farm.tasks.view'), taskController.getTasks);
router.get('/project/:projectId/stats', requirePermission('farm.tasks.view'), taskController.getTaskStats);

// ─── Single task routes ───

router.get('/:id', requirePermission('farm.tasks.view'), taskController.getTask);
router.post('/', requirePermission('farm.tasks.create'), taskController.createTask);
router.put('/:id', requirePermission('farm.tasks.update'), taskController.updateTask);
router.put('/:id/checklist/:index', requirePermission('farm.tasks.update'), taskController.updateChecklist);
router.delete('/:id', requirePermission('farm.tasks.delete'), taskController.deleteTask);

module.exports = router;

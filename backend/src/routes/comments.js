const router = require('express').Router();
const commentController = require('../controllers/commentController');
const { authenticate, requirePermission } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ─── Project-scoped routes ───

router.get('/project/:projectId', requirePermission('farm.comments.view'), commentController.getComments);

// ─── Comment CRUD ───

router.post('/', requirePermission('farm.comments.create'), commentController.createComment);
router.put('/:id', requirePermission('farm.comments.update'), commentController.updateComment);
router.delete('/:id', requirePermission('farm.comments.delete'), commentController.deleteComment);

// ─── Reactions & Replies ───

router.post('/:id/react', requirePermission('farm.comments.create'), commentController.addReaction);
router.get('/:id/replies', requirePermission('farm.comments.view'), commentController.getReplies);

module.exports = router;

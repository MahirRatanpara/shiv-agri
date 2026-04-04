const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authenticate, requirePermission } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ─── List, Stats, Export ───

router.get('/', requirePermission('farm.projects.view'), projectController.getProjects);
router.get('/stats', requirePermission('farm.projects.view'), projectController.getProjectStats);
router.get('/export', requirePermission('project.export'), projectController.exportProjects);

// ─── Draft Management ───

router.get('/drafts/list', projectController.getUserDrafts);
router.get('/drafts/:id', projectController.getDraft);
router.post('/drafts', requirePermission('project.create'), projectController.saveDraft);
router.put('/drafts/:id', requirePermission('project.create'), projectController.updateDraft);
router.post('/drafts/:id/complete', requirePermission('project.create'), projectController.completeDraft);
router.delete('/drafts/:id', projectController.deleteDraft);

// ─── CRUD ───

router.get('/:id', requirePermission('farm.projects.view'), projectController.getProject);
router.post('/', requirePermission('project.create'), projectController.createProject);
router.patch('/:id', requirePermission('project.update'), projectController.updateProject);
router.delete('/:id', requirePermission('project.delete'), projectController.deleteProject);
router.delete('/:id/hard', projectController.hardDeleteProject);

// ─── Favorites ───

router.patch('/:id/favorite', projectController.toggleFavorite);

// ─── Contacts ───

router.post('/:id/contacts', requirePermission('project.update'), projectController.addContact);
router.put('/:id/contacts/:contactId', requirePermission('project.update'), projectController.updateContact);
router.delete('/:id/contacts/:contactId', requirePermission('project.update'), projectController.removeContact);

// ─── Timeline & Milestones ───

router.get('/:id/timeline', requirePermission('farm.projects.view'), projectController.getProjectTimeline);
router.post('/:id/milestones', requirePermission('project.update'), projectController.addMilestone);
router.patch('/:id/milestones/:milestoneId', requirePermission('project.update'), projectController.updateMilestone);

// ─── Activity ───

router.get('/:id/activity', requirePermission('farm.projects.view'), projectController.getProjectActivity);

// ─── Bulk Operations ───

router.patch('/bulk', requirePermission('project.update'), projectController.bulkUpdateProjects);
router.post('/bulk-delete', requirePermission('project.delete'), projectController.bulkDeleteProjects);

module.exports = router;

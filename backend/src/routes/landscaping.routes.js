const express = require('express');
const router = express.Router();
const landscapingController = require('../controllers/landscaping.controller');

// Project CRUD routes
router.get('/projects', landscapingController.getProjects.bind(landscapingController));
router.post('/projects', landscapingController.createProject.bind(landscapingController));
router.get('/project/:id', landscapingController.getProjectById.bind(landscapingController));
router.put('/project/:id', landscapingController.updateProject.bind(landscapingController));
router.delete('/project/:id', landscapingController.deleteProject.bind(landscapingController));

// File management routes
router.post('/project/:id/file', landscapingController.addFile.bind(landscapingController));
router.delete('/project/:id/file/:fileId', landscapingController.removeFile.bind(landscapingController));
router.get('/project/:id/files', landscapingController.getFilesByProjectId.bind(landscapingController));

// Utility routes
router.get('/cities', landscapingController.getCities.bind(landscapingController));
router.get('/stats', landscapingController.getProjectStats.bind(landscapingController));

// Query routes
router.get('/projects/status/:status', landscapingController.getProjectsByStatus.bind(landscapingController));
router.get('/projects/city/:city', landscapingController.getProjectsByCity.bind(landscapingController));
router.get('/search', landscapingController.searchProjects.bind(landscapingController));

// Advanced filtering
router.post('/projects/filter', landscapingController.getAdvancedFilteredProjects.bind(landscapingController));

// Communication routes
router.post('/send-documents', landscapingController.sendDocuments.bind(landscapingController));

module.exports = router;

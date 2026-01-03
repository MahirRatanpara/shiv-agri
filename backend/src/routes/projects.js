const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authenticate, requirePermission } = require('../middleware/auth');

/**
 * Project Routes
 * All routes require authentication
 * Permission-based authorization for sensitive operations
 */

// ========================
// Public Project Routes (require authentication only)
// ========================

/**
 * @route   GET /api/projects
 * @desc    Get paginated list of projects with filtering, sorting, and search
 * @access  Private
 * @query   {number} page - Page number (default: 1)
 * @query   {number} limit - Items per page (default: 50, max: 100)
 * @query   {string} search - Text search query
 * @query   {string|string[]} projectType - Filter by project type (farm/landscaping)
 * @query   {string|string[]} status - Filter by status
 * @query   {string} city - Filter by city
 * @query   {string} state - Filter by state
 * @query   {string} clientId - Filter by client ID
 * @query   {string|string[]} assignedTo - Filter by assigned user ID(s)
 * @query   {string|string[]} assignedTeam - Filter by team member ID(s)
 * @query   {number} budgetMin - Minimum budget filter
 * @query   {number} budgetMax - Maximum budget filter
 * @query   {string} createdAfter - Filter by creation date (ISO format)
 * @query   {string} createdBefore - Filter by creation date (ISO format)
 * @query   {string} startAfter - Filter by start date (ISO format)
 * @query   {string} startBefore - Filter by start date (ISO format)
 * @query   {boolean} isFavorite - Filter favorites only
 * @query   {string} sortBy - Sort field (default: updatedAt)
 * @query   {string} sortOrder - Sort order: asc/desc (default: desc)
 */
router.get('/',
  authenticate,
  requirePermission('project.view'),
  projectController.getProjects
);

/**
 * @route   GET /api/projects/stats
 * @desc    Get project statistics and summary
 * @access  Private
 * @query   {boolean} forUser - Get stats for current user only
 */
router.get('/stats',
  authenticate,
  requirePermission('project.view'),
  projectController.getProjectStats
);

/**
 * @route   GET /api/projects/export
 * @desc    Export projects to Excel or CSV
 * @access  Private
 * @query   {string} format - Export format: excel/csv (default: excel)
 * @query   {string|string[]} projectIds - Specific project IDs to export
 * @query   All other query params from GET /api/projects for filtering
 */
router.get('/export',
  authenticate,
  requirePermission('project.export'),
  projectController.exportProjects
);

/**
 * @route   GET /api/projects/:id
 * @desc    Get project by ID with full details
 * @access  Private
 */
router.get('/:id',
  authenticate,
  requirePermission('project.view'),
  projectController.getProjectById
);

// ========================
// Project Management Routes (require specific permissions)
// ========================

/**
 * @route   POST /api/projects
 * @desc    Create new project
 * @access  Private (requires project.create permission)
 * @body    Project data (see Project model for schema)
 */
router.post('/',
  authenticate,
  requirePermission('project.create'),
  projectController.createProject
);

/**
 * @route   PATCH /api/projects/:id
 * @desc    Update existing project
 * @access  Private (requires project.update permission)
 * @body    Partial project data to update
 */
router.patch('/:id',
  authenticate,
  requirePermission('project.update'),
  projectController.updateProject
);

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project (soft delete)
 * @access  Private (requires project.delete permission)
 */
router.delete('/:id',
  authenticate,
  requirePermission('project.delete'),
  projectController.deleteProject
);

/**
 * @route   PATCH /api/projects/:id/favorite
 * @desc    Toggle favorite status for a project
 * @access  Private (all authenticated users)
 */
router.patch('/:id/favorite',
  authenticate,
  projectController.toggleFavorite
);

// ========================
// Bulk Operations Routes (require elevated permissions)
// ========================

/**
 * @route   PATCH /api/projects/bulk
 * @desc    Bulk update projects
 * @access  Private (requires project.update permission)
 * @body    {
 *            projectIds: string[],
 *            updates: object
 *          }
 */
router.patch('/bulk',
  authenticate,
  requirePermission('project.update'),
  projectController.bulkUpdateProjects
);

/**
 * @route   POST /api/projects/bulk-delete
 * @desc    Bulk delete projects (soft delete)
 * @access  Private (requires project.delete permission)
 * @body    {
 *            projectIds: string[]
 *          }
 */
router.post('/bulk-delete',
  authenticate,
  requirePermission('project.delete'),
  projectController.bulkDeleteProjects
);

module.exports = router;

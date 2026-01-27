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
  requirePermission('farm.projects.view'),
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
  requirePermission('farm.projects.view'),
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
  requirePermission('farm.projects.view'),
  projectController.getProjectById
);

// ========================
// Draft Management Routes
// ========================

/**
 * @route   GET /api/projects/drafts/list
 * @desc    Get user's draft projects
 * @access  Private
 */
router.get('/drafts/list',
  authenticate,
  projectController.getUserDrafts
);

/**
 * @route   GET /api/projects/drafts/:id
 * @desc    Get specific draft by ID
 * @access  Private
 */
router.get('/drafts/:id',
  authenticate,
  projectController.getDraft
);

/**
 * @route   POST /api/projects/drafts
 * @desc    Save project as draft
 * @access  Private
 */
router.post('/drafts',
  authenticate,
  projectController.saveDraft
);

/**
 * @route   PUT /api/projects/drafts/:id
 * @desc    Update existing draft
 * @access  Private
 */
router.put('/drafts/:id',
  authenticate,
  projectController.updateDraft
);

/**
 * @route   POST /api/projects/drafts/:id/complete
 * @desc    Convert draft to final project
 * @access  Private
 */
router.post('/drafts/:id/complete',
  authenticate,
  requirePermission('project.create'),
  projectController.completeDraft
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
 * @route   DELETE /api/projects/:id/hard
 * @desc    Permanently delete a project (admin only)
 * @access  Private (Admin only)
 */
router.delete('/:id/hard',
  authenticate,
  projectController.hardDeleteProject
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
// Contact Management Routes
// ========================

/**
 * @route   POST /api/projects/:id/contacts
 * @desc    Add contact to project
 * @access  Private
 */
router.post('/:id/contacts',
  authenticate,
  requirePermission('project.update'),
  projectController.addContact
);

/**
 * @route   PUT /api/projects/:id/contacts/:contactId
 * @desc    Update contact in project
 * @access  Private
 */
router.put('/:id/contacts/:contactId',
  authenticate,
  requirePermission('project.update'),
  projectController.updateContact
);

/**
 * @route   DELETE /api/projects/:id/contacts/:contactId
 * @desc    Remove contact from project
 * @access  Private
 */
router.delete('/:id/contacts/:contactId',
  authenticate,
  requirePermission('project.update'),
  projectController.removeContact
);

// ========================
// Timeline & Milestone Routes
// ========================

/**
 * @route   GET /api/projects/:id/timeline
 * @desc    Get project timeline with milestones
 * @access  Private
 */
router.get('/:id/timeline',
  authenticate,
  requirePermission('farm.projects.view'),
  projectController.getProjectTimeline
);

/**
 * @route   POST /api/projects/:id/milestones
 * @desc    Add milestone to project
 * @access  Private
 */
router.post('/:id/milestones',
  authenticate,
  requirePermission('project.update'),
  projectController.addMilestone
);

// ========================
// Transaction Management Routes
// ========================

/**
 * @route   GET /api/projects/:id/transactions
 * @desc    Get project transactions with pagination
 * @access  Private
 * @query   {number} page - Page number (default: 1)
 * @query   {number} limit - Items per page (default: 20, max: 100)
 * @query   {string} sortBy - Sort field: date/amount/type (default: date)
 * @query   {string} sortOrder - Sort order: asc/desc (default: desc)
 */
router.get('/:id/transactions',
  authenticate,
  requirePermission('farm.projects.view'),
  projectController.getProjectTransactions
);

/**
 * @route   POST /api/projects/:id/transactions
 * @desc    Add transaction to project
 * @access  Private
 * @body    {
 *            description: string (required),
 *            amount: number (required),
 *            type: 'debit' | 'credit' (required),
 *            category: string (optional),
 *            date: Date (optional),
 *            notes: string (optional)
 *          }
 */
router.post('/:id/transactions',
  authenticate,
  requirePermission('project.update'),
  projectController.addTransaction
);

/**
 * @route   PATCH /api/projects/:id/transactions/:transactionId
 * @desc    Update transaction in project
 * @access  Private
 */
router.patch('/:id/transactions/:transactionId',
  authenticate,
  requirePermission('project.update'),
  projectController.updateTransaction
);

/**
 * @route   DELETE /api/projects/:id/transactions/:transactionId
 * @desc    Remove transaction from project
 * @access  Private
 */
router.delete('/:id/transactions/:transactionId',
  authenticate,
  requirePermission('project.update'),
  projectController.removeTransaction
);

// ========================
// Activity Log Routes
// ========================

/**
 * @route   GET /api/projects/:id/activity
 * @desc    Get project activity log
 * @access  Private
 * @query   {number} page - Page number
 * @query   {number} limit - Items per page
 * @query   {string} actionType - Filter by action type
 */
router.get('/:id/activity',
  authenticate,
  requirePermission('farm.projects.view'),
  projectController.getProjectActivity
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

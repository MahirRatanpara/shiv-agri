const express = require('express');
const router = express.Router();
const TransactionController = require('../controllers/transactionController');
const { authenticate, requirePermission } = require('../middleware/auth');

/**
 * Transaction Routes
 * All routes require authentication
 * Permission-based authorization for operations
 */

// ========================
// Summary & Analytics Routes (must be before /:id)
// ========================

/**
 * @route   GET /api/transactions/summary
 * @desc    Get transaction summary for a project
 * @access  Private
 * @query   {string} projectId - Project ID (required)
 */
router.get('/summary',
  authenticate,
  requirePermission('farm.projects.view'),
  TransactionController.getProjectSummary
);

/**
 * @route   GET /api/transactions/categories
 * @desc    Get category breakdown for a project
 * @access  Private
 * @query   {string} projectId - Project ID (required)
 */
router.get('/categories',
  authenticate,
  requirePermission('farm.projects.view'),
  TransactionController.getCategoryBreakdown
);

// ========================
// CRUD Routes
// ========================

/**
 * @route   GET /api/transactions
 * @desc    Get transactions for a project with pagination and filtering
 * @access  Private
 * @query   {string} projectId - Project ID (required)
 * @query   {number} page - Page number (default: 1)
 * @query   {number} limit - Items per page (default: 20, max: 100)
 * @query   {string} sortBy - Sort field: date/amount/type (default: date)
 * @query   {string} sortOrder - Sort order: asc/desc (default: desc)
 * @query   {string} type - Filter by type: debit/credit
 * @query   {string} category - Filter by category
 * @query   {string} startDate - Filter by start date (ISO format)
 * @query   {string} endDate - Filter by end date (ISO format)
 */
router.get('/',
  authenticate,
  requirePermission('farm.projects.view'),
  TransactionController.getTransactions
);

/**
 * @route   POST /api/transactions
 * @desc    Create new transaction
 * @access  Private
 * @body    {
 *            projectId: string (required),
 *            description: string (required),
 *            amount: number (required),
 *            type: 'debit' | 'credit' (required),
 *            category: string (optional),
 *            date: Date (optional),
 *            notes: string (optional)
 *          }
 */
router.post('/',
  authenticate,
  requirePermission('project.update'),
  TransactionController.createTransaction
);

/**
 * @route   GET /api/transactions/:id
 * @desc    Get single transaction by ID
 * @access  Private
 * @query   {string} projectId - Project ID (optional, for additional validation)
 */
router.get('/:id',
  authenticate,
  requirePermission('farm.projects.view'),
  TransactionController.getTransactionById
);

/**
 * @route   PATCH /api/transactions/:id
 * @desc    Update transaction
 * @access  Private
 * @query   {string} projectId - Project ID (required)
 * @body    Partial transaction data to update
 */
router.patch('/:id',
  authenticate,
  requirePermission('project.update'),
  TransactionController.updateTransaction
);

/**
 * @route   DELETE /api/transactions/:id
 * @desc    Delete transaction (soft delete)
 * @access  Private
 * @query   {string} projectId - Project ID (required)
 */
router.delete('/:id',
  authenticate,
  requirePermission('project.update'),
  TransactionController.deleteTransaction
);

module.exports = router;

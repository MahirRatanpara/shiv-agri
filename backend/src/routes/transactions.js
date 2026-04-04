const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// Summary & analytics (must be before /:id)
router.get('/summary', requirePermission('farm.projects.view'), transactionController.getProjectSummary);
router.get('/categories', requirePermission('farm.projects.view'), transactionController.getCategoryBreakdown);
router.get('/trends', requirePermission('farm.projects.view'), transactionController.getTransactionTrends);

// CRUD
router.get('/', requirePermission('farm.projects.view'), transactionController.getTransactions);
router.post('/', requirePermission('project.update'), transactionController.createTransaction);
router.get('/:id', requirePermission('farm.projects.view'), transactionController.getTransaction);
router.patch('/:id', requirePermission('project.update'), transactionController.updateTransaction);
router.delete('/:id', requirePermission('project.update'), transactionController.deleteTransaction);

module.exports = router;

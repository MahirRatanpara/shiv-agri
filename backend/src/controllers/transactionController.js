const transactionService = require('../services/transactionService');
const logger = require('../utils/logger');

exports.getTransactions = async (req, res) => {
  try {
    const { projectId, page, limit, sortBy, sortOrder, type, category, dateFrom, dateTo } = req.query;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId query parameter is required' });
    }

    const result = await transactionService.getTransactionsByProject(projectId, {
      page, limit, sortBy, sortOrder, type, category, dateFrom, dateTo
    });

    res.json({ success: true, data: result.transactions, pagination: result.pagination, summary: result.summary });
  } catch (error) {
    logger.error('[TransactionController] getTransactions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions', message: error.message });
  }
};

exports.getTransaction = async (req, res) => {
  try {
    const transaction = await transactionService.getTransactionById(req.params.id);
    res.json({ success: true, data: transaction });
  } catch (error) {
    logger.error(`[TransactionController] getTransaction ${req.params.id} error:`, error);
    const status = error.message === 'Transaction not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    const { projectId, description, amount, type } = req.body;

    // Validate required fields
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });
    if (!description) return res.status(400).json({ success: false, error: 'description is required' });
    if (amount === undefined || amount === null) return res.status(400).json({ success: false, error: 'amount is required' });
    if (parseFloat(amount) < 0) return res.status(400).json({ success: false, error: 'amount must be positive' });
    if (!type || !['debit', 'credit'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be "debit" or "credit"' });
    }

    const transaction = await transactionService.createTransaction(req.body, req.user.id);
    logger.info(`[TransactionController] created: ${transaction._id}`);
    res.status(201).json({ success: true, data: transaction, message: 'Transaction created successfully' });
  } catch (error) {
    logger.error('[TransactionController] createTransaction error:', error);
    const status = error.message === 'Project not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.updateTransaction = async (req, res) => {
  try {
    if (req.body.type && !['debit', 'credit'].includes(req.body.type)) {
      return res.status(400).json({ success: false, error: 'type must be "debit" or "credit"' });
    }
    if (req.body.amount !== undefined && parseFloat(req.body.amount) < 0) {
      return res.status(400).json({ success: false, error: 'amount must be positive' });
    }

    const transaction = await transactionService.updateTransaction(req.params.id, req.body, req.user.id);
    logger.info(`[TransactionController] updated: ${req.params.id}`);
    res.json({ success: true, data: transaction, message: 'Transaction updated successfully' });
  } catch (error) {
    logger.error(`[TransactionController] updateTransaction ${req.params.id} error:`, error);
    const status = error.message === 'Transaction not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    await transactionService.deleteTransaction(req.params.id, req.user.id);
    logger.info(`[TransactionController] deleted: ${req.params.id}`);
    res.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error) {
    logger.error(`[TransactionController] deleteTransaction ${req.params.id} error:`, error);
    const status = error.message === 'Transaction not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.getProjectSummary = async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });

    const summary = await transactionService.getProjectSummary(projectId);
    res.json({ success: true, data: summary });
  } catch (error) {
    logger.error('[TransactionController] getProjectSummary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getCategoryBreakdown = async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });

    const breakdown = await transactionService.getCategoryBreakdown(projectId);
    res.json({ success: true, data: breakdown });
  } catch (error) {
    logger.error('[TransactionController] getCategoryBreakdown error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getTransactionTrends = async (req, res) => {
  try {
    const { projectId, months } = req.query;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });

    const trends = await transactionService.getTransactionTrends(projectId, parseInt(months) || 12);
    res.json({ success: true, data: trends });
  } catch (error) {
    logger.error('[TransactionController] getTransactionTrends error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

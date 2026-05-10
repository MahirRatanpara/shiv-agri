const TransactionService = require('../services/transactionService');
const Project = require('../models/Project');
const logger = require('../utils/logger');

/**
 * Admin-only farm transaction controller.
 * Wraps TransactionService with project-id taken from the URL path so each
 * route is naturally scoped to a single farm. Admin gating is enforced by the
 * `requireAdmin` middleware applied on the routes.
 */

const ALLOWED_TYPES = ['debit', 'credit'];

async function ensureProjectExists(projectId) {
  const exists = await Project.exists({ _id: projectId });
  if (!exists) {
    const err = new Error('Project not found');
    err.status = 404;
    throw err;
  }
}

exports.listTransactions = async (req, res) => {
  const projectId = req.params.id;
  try {
    logger.info(`[FarmTransaction] GET /projects/${projectId}/admin-transactions by user=${req.user._id}`);

    await ensureProjectExists(projectId);

    const options = {
      page: parseInt(req.query.page, 10) || 1,
      limit: Math.min(parseInt(req.query.limit, 10) || 20, 100),
      sortBy: req.query.sortBy || 'date',
      sortOrder: req.query.sortOrder || 'desc',
      type: req.query.type || null,
      category: req.query.category || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null
    };

    const result = await TransactionService.getTransactionsByProject(projectId, options);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.status || (error.message === 'Project not found' ? 404 : 500);
    logger.error(`[FarmTransaction] listTransactions error: ${error.message}`);
    return res.status(status).json({ success: false, error: error.message || 'Failed to fetch transactions' });
  }
};

exports.getSummary = async (req, res) => {
  const projectId = req.params.id;
  try {
    await ensureProjectExists(projectId);
    const summary = await TransactionService.getProjectSummary(projectId);
    return res.status(200).json({ success: true, data: summary });
  } catch (error) {
    const status = error.status || 500;
    logger.error(`[FarmTransaction] getSummary error: ${error.message}`);
    return res.status(status).json({ success: false, error: error.message || 'Failed to fetch summary' });
  }
};

exports.createTransaction = async (req, res) => {
  const projectId = req.params.id;
  try {
    const { description, amount, type, category, date, notes } = req.body || {};

    if (!description || amount === undefined || amount === null) {
      return res.status(400).json({ success: false, error: 'Description and amount are required' });
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a non-negative number' });
    }
    if (type && !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Type must be either "debit" or "credit"' });
    }

    await ensureProjectExists(projectId);

    logger.info(`[FarmTransaction] POST /projects/${projectId}/admin-transactions by user=${req.user._id} type=${type || 'debit'} amount=${numAmount}`);

    const transaction = await TransactionService.createTransaction(
      projectId,
      { description, amount: numAmount, type, category, date, notes },
      req.user._id
    );

    return res.status(201).json({
      success: true,
      data: transaction,
      message: 'Transaction recorded'
    });
  } catch (error) {
    const status = error.status || (error.message === 'Project not found' ? 404 : 500);
    logger.error(`[FarmTransaction] createTransaction error: ${error.message}`);
    return res.status(status).json({ success: false, error: error.message || 'Failed to create transaction' });
  }
};

exports.updateTransaction = async (req, res) => {
  const projectId = req.params.id;
  const transactionId = req.params.transactionId;
  try {
    const updateData = req.body || {};

    if (updateData.type && !ALLOWED_TYPES.includes(updateData.type)) {
      return res.status(400).json({ success: false, error: 'Type must be either "debit" or "credit"' });
    }
    if (updateData.amount !== undefined) {
      const numAmount = Number(updateData.amount);
      if (!Number.isFinite(numAmount) || numAmount < 0) {
        return res.status(400).json({ success: false, error: 'Amount must be a non-negative number' });
      }
      updateData.amount = numAmount;
    }

    logger.info(`[FarmTransaction] PATCH /projects/${projectId}/admin-transactions/${transactionId} by user=${req.user._id}`);

    const transaction = await TransactionService.updateTransaction(
      transactionId,
      projectId,
      updateData,
      req.user._id
    );

    return res.status(200).json({
      success: true,
      data: transaction,
      message: 'Transaction updated'
    });
  } catch (error) {
    const status = error.status || (error.message === 'Transaction not found' ? 404 : 500);
    logger.error(`[FarmTransaction] updateTransaction error: ${error.message}`);
    return res.status(status).json({ success: false, error: error.message || 'Failed to update transaction' });
  }
};

exports.deleteTransaction = async (req, res) => {
  const projectId = req.params.id;
  const transactionId = req.params.transactionId;
  try {
    logger.info(`[FarmTransaction] DELETE /projects/${projectId}/admin-transactions/${transactionId} by user=${req.user._id}`);
    await TransactionService.deleteTransaction(transactionId, projectId, req.user._id);
    return res.status(200).json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    const status = error.status || (error.message === 'Transaction not found' ? 404 : 500);
    logger.error(`[FarmTransaction] deleteTransaction error: ${error.message}`);
    return res.status(status).json({ success: false, error: error.message || 'Failed to delete transaction' });
  }
};

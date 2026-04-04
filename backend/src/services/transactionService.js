const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Project = require('../models/Project');
const logger = require('../utils/logger');
const { logActivity } = require('./activityLogService');

async function getTransactionsByProject(projectId, options = {}) {
  const { page = 1, limit = 50, sortBy = 'date', sortOrder = -1, type, category, dateFrom, dateTo } = options;

  const query = { projectId, isDeleted: { $ne: true } };
  if (type) query.type = type;
  if (category) query.category = category;
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = new Date(dateFrom);
    if (dateTo) query.date.$lte = new Date(dateTo);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [transactions, total, summary] = await Promise.all([
    Transaction.find(query)
      .sort({ [sortBy]: parseInt(sortOrder) })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name email profilePhoto')
      .lean(),
    Transaction.countDocuments(query),
    Transaction.getSummaryByProject(projectId)
  ]);

  // Get project budget for context
  const project = await Project.findById(projectId).select('budget expenses income').lean();

  logger.info(`[TransactionService] getByProject ${projectId}: ${transactions.length} of ${total}`);

  return {
    transactions,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
      hasPrevious: parseInt(page) > 1
    },
    summary: {
      ...summary,
      budget: project?.budget || 0,
      budgetRemaining: (project?.budget || 0) - (summary.totalDebits || 0),
      budgetUtilization: project?.budget > 0
        ? Math.round((summary.totalDebits / project.budget) * 100 * 100) / 100
        : 0
    }
  };
}

async function getTransactionById(transactionId) {
  const transaction = await Transaction.findById(transactionId)
    .populate('createdBy', 'name email profilePhoto')
    .populate('lastUpdatedBy', 'name email profilePhoto');
  if (!transaction) throw new Error('Transaction not found');
  return transaction;
}

async function createTransaction(data, userId) {
  const project = await Project.findById(data.projectId);
  if (!project) throw new Error('Project not found');

  const transaction = new Transaction({
    ...data,
    createdBy: userId,
    lastUpdatedBy: userId
  });
  const saved = await transaction.save();

  const actionType = saved.type === 'debit' ? 'expense_added' : 'payment_received';
  const desc = saved.type === 'debit'
    ? `Expense of ₹${saved.amount} added: ${saved.description}`
    : `Payment of ₹${saved.amount} received: ${saved.description}`;

  logActivity(saved.projectId, userId, actionType, desc, {
    entityType: 'transaction',
    entityId: saved._id,
    amount: saved.amount,
    type: saved.type,
    category: saved.category
  });

  logger.info(`[TransactionService] created: ${saved._id} (${saved.type}) ₹${saved.amount} for project ${saved.projectId}`);
  return saved;
}

async function updateTransaction(transactionId, updateData, userId) {
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw new Error('Transaction not found');

  const oldAmount = transaction.amount;
  const oldType = transaction.type;

  Object.assign(transaction, updateData);
  transaction.lastUpdatedBy = userId;
  const saved = await transaction.save();

  logActivity(saved.projectId, userId, 'transaction_updated', `Transaction updated: ${saved.description} (₹${oldAmount} → ₹${saved.amount})`, {
    entityType: 'transaction',
    entityId: saved._id,
    oldAmount,
    newAmount: saved.amount,
    oldType,
    newType: saved.type
  });

  logger.info(`[TransactionService] updated: ${saved._id} (₹${oldAmount} → ₹${saved.amount})`);
  return saved;
}

async function deleteTransaction(transactionId, userId) {
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw new Error('Transaction not found');

  await transaction.softDelete(userId);

  logActivity(transaction.projectId, userId, 'transaction_deleted', `Transaction deleted: ${transaction.description} (₹${transaction.amount})`, {
    entityType: 'transaction',
    entityId: transactionId,
    amount: transaction.amount,
    type: transaction.type
  });

  logger.info(`[TransactionService] deleted: ${transactionId}`);
  return { message: 'Transaction deleted' };
}

async function getProjectSummary(projectId) {
  const [summary, project] = await Promise.all([
    Transaction.getSummaryByProject(projectId),
    Project.findById(projectId).select('budget expenses income').lean()
  ]);

  return {
    ...summary,
    budget: project?.budget || 0,
    budgetRemaining: (project?.budget || 0) - (summary.totalDebits || 0),
    budgetUtilization: project?.budget > 0
      ? Math.round((summary.totalDebits / project.budget) * 100 * 100) / 100
      : 0
  };
}

async function getCategoryBreakdown(projectId) {
  return Transaction.getCategoryBreakdown(projectId);
}

async function getTransactionTrends(projectId, months = 12) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const result = await Transaction.aggregate([
    {
      $match: {
        projectId: new mongoose.Types.ObjectId(projectId),
        isDeleted: { $ne: true },
        date: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
          type: '$type'
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  return result;
}

module.exports = {
  getTransactionsByProject,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getProjectSummary,
  getCategoryBreakdown,
  getTransactionTrends
};

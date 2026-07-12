const Transaction = require('../models/Transaction');
const Project = require('../models/Project');
const { logActivity } = require('./activityLogService');

/**
 * Transaction Service
 * Business logic for transaction management
 */

class TransactionService {
  /**
   * Get transactions for a project with pagination and filtering
   */
  static async getTransactionsByProject(projectId, options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'desc',
      type = null,
      category = null,
      startDate = null,
      endDate = null
    } = options;

    console.log(`[TransactionService] Fetching transactions for project ${projectId}`, {
      page,
      limit,
      sortBy,
      sortOrder,
      filters: { type, category, startDate, endDate }
    });

    try {
      // Validate project exists
      const project = await Project.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Fetch transactions
      const transactions = await Transaction.getByProject(projectId, {
        page,
        limit,
        sortBy,
        sortOrder,
        type,
        category,
        startDate,
        endDate
      });

      // Count total
      const filters = {};
      if (type) filters.type = type;
      if (category) filters.category = category;
      if (startDate || endDate) {
        filters.date = {};
        if (startDate) filters.date.$gte = new Date(startDate);
        if (endDate) filters.date.$lte = new Date(endDate);
      }

      const total = await Transaction.countByProject(projectId, filters);

      // Get summary
      const summary = await Transaction.getSummaryByProject(projectId);

      // Add budget info from project
      summary.budget = project.budget;
      summary.budgetRemaining = project.budget - summary.netExpense;
      summary.budgetUtilization = project.budget > 0
        ? Math.round((summary.netExpense / project.budget) * 100)
        : 0;

      console.log(`[TransactionService] Found ${transactions.length} transactions (total: ${total})`);

      return {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        },
        summary
      };
    } catch (error) {
      console.error('[TransactionService] Error fetching transactions:', error);
      throw error;
    }
  }

  /**
   * Get single transaction by ID
   */
  static async getTransactionById(transactionId, projectId = null) {
    console.log(`[TransactionService] Fetching transaction ${transactionId}`);

    try {
      const query = { _id: transactionId };
      if (projectId) query.projectId = projectId;

      const transaction = await Transaction.findOne(query)
        .populate('createdBy', 'name email')
        .populate('lastUpdatedBy', 'name email');

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      console.log(`[TransactionService] Transaction found:`, transaction.description);
      return transaction;
    } catch (error) {
      console.error('[TransactionService] Error fetching transaction:', error);
      throw error;
    }
  }

  /**
   * Create new transaction
   */
  static async createTransaction(projectId, transactionData, userId) {
    console.log(`[TransactionService] Creating transaction for project ${projectId}`, transactionData);

    try {
      // Validate project exists
      const project = await Project.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Create transaction
      const transaction = new Transaction({
        projectId,
        description: transactionData.description,
        amount: transactionData.amount,
        type: transactionData.type || 'debit',
        category: transactionData.category,
        date: transactionData.date || new Date(),
        notes: transactionData.notes,
        createdBy: userId
      });

      await transaction.save();

      console.log(`[TransactionService] Transaction created: ${transaction._id}`);

      // Log activity
      await logActivity({
        userId,
        action: 'transaction.create',
        entityType: 'Transaction',
        entityId: transaction._id,
        projectId,
        description: `Added ${transaction.type} transaction: ${transaction.description} (₹${transaction.amount})`,
        metadata: {
          transactionType: transaction.type,
          amount: transaction.amount,
          category: transaction.category
        }
      });

      return transaction;
    } catch (error) {
      console.error('[TransactionService] Error creating transaction:', error);
      throw error;
    }
  }

  /**
   * Update existing transaction
   */
  static async updateTransaction(transactionId, projectId, updateData, userId) {
    console.log(`[TransactionService] Updating transaction ${transactionId}`, updateData);

    try {
      // Find transaction
      const transaction = await Transaction.findOne({
        _id: transactionId,
        projectId
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Store old values for logging
      const oldAmount = transaction.amount;
      const oldType = transaction.type;

      // Update fields
      if (updateData.description !== undefined) transaction.description = updateData.description;
      if (updateData.amount !== undefined) transaction.amount = updateData.amount;
      if (updateData.type !== undefined) transaction.type = updateData.type;
      if (updateData.category !== undefined) transaction.category = updateData.category;
      if (updateData.date !== undefined) transaction.date = updateData.date;
      if (updateData.notes !== undefined) transaction.notes = updateData.notes;

      transaction.lastUpdatedBy = userId;

      await transaction.save();

      console.log(`[TransactionService] Transaction updated: ${transaction._id}`);

      // Log activity
      await logActivity({
        userId,
        action: 'transaction.update',
        entityType: 'Transaction',
        entityId: transaction._id,
        projectId,
        description: `Updated transaction: ${transaction.description}`,
        metadata: {
          oldAmount,
          newAmount: transaction.amount,
          oldType,
          newType: transaction.type
        }
      });

      return transaction;
    } catch (error) {
      console.error('[TransactionService] Error updating transaction:', error);
      throw error;
    }
  }

  /**
   * Delete transaction (soft delete)
   */
  static async deleteTransaction(transactionId, projectId, userId) {
    console.log(`[TransactionService] Deleting transaction ${transactionId}`);

    try {
      // Find transaction
      const transaction = await Transaction.findOne({
        _id: transactionId,
        projectId
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Store details for logging
      const transactionDetails = {
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type
      };

      // Soft delete
      await transaction.softDelete(userId);

      console.log(`[TransactionService] Transaction deleted: ${transaction._id}`);

      // Log activity
      await logActivity({
        userId,
        action: 'transaction.delete',
        entityType: 'Transaction',
        entityId: transaction._id,
        projectId,
        description: `Deleted ${transactionDetails.type} transaction: ${transactionDetails.description} (₹${transactionDetails.amount})`,
        metadata: transactionDetails
      });

      return transaction;
    } catch (error) {
      console.error('[TransactionService] Error deleting transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction summary for a project
   */
  static async getProjectSummary(projectId) {
    console.log(`[TransactionService] Fetching summary for project ${projectId}`);

    try {
      const project = await Project.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const summary = await Transaction.getSummaryByProject(projectId);

      // Add budget info
      summary.budget = project.budget;
      summary.budgetRemaining = project.budget - summary.netExpense;
      summary.budgetUtilization = project.budget > 0
        ? Math.round((summary.netExpense / project.budget) * 100)
        : 0;

      console.log(`[TransactionService] Summary:`, summary);
      return summary;
    } catch (error) {
      console.error('[TransactionService] Error fetching summary:', error);
      throw error;
    }
  }

  /**
   * Get category breakdown for a project
   */
  static async getCategoryBreakdown(projectId) {
    console.log(`[TransactionService] Fetching category breakdown for project ${projectId}`);

    try {
      const breakdown = await Transaction.getCategoryBreakdown(projectId);
      console.log(`[TransactionService] Found ${breakdown.length} categories`);
      return breakdown;
    } catch (error) {
      console.error('[TransactionService] Error fetching category breakdown:', error);
      throw error;
    }
  }

  /**
   * Bulk delete transactions (for project deletion)
   */
  static async deleteProjectTransactions(projectId, userId) {
    console.log(`[TransactionService] Deleting all transactions for project ${projectId}`);

    try {
      const result = await Transaction.deleteByProject(projectId, userId);
      console.log(`[TransactionService] Deleted ${result.modifiedCount} transactions`);

      // Log activity
      await logActivity({
        userId,
        action: 'transaction.bulk_delete',
        entityType: 'Project',
        entityId: projectId,
        projectId,
        description: `Deleted ${result.modifiedCount} transactions due to project deletion`,
        metadata: { deletedCount: result.modifiedCount }
      });

      return result;
    } catch (error) {
      console.error('[TransactionService] Error bulk deleting transactions:', error);
      throw error;
    }
  }
}

module.exports = TransactionService;

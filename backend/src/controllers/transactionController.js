const TransactionService = require('../services/transactionService');

/**
 * Transaction Controller
 * Handles HTTP requests for transaction management
 */

class TransactionController {
  /**
   * @route   GET /api/transactions?projectId=xxx
   * @desc    Get transactions for a project with pagination
   * @access  Private
   */
  static async getTransactions(req, res) {
    try {
      const { projectId } = req.query;

      if (!projectId) {
        console.log('[TransactionController] Missing projectId in query');
        return res.status(400).json({
          success: false,
          message: 'Project ID is required'
        });
      }

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 20, 100),
        sortBy: req.query.sortBy || 'date',
        sortOrder: req.query.sortOrder || 'desc',
        type: req.query.type || null,
        category: req.query.category || null,
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null
      };

      console.log(`[TransactionController] GET /api/transactions - Project: ${projectId}`, options);

      const result = await TransactionService.getTransactionsByProject(projectId, options);

      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[TransactionController] Error in getTransactions:', error);
      return res.status(error.message === 'Project not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to fetch transactions'
      });
    }
  }

  /**
   * @route   GET /api/transactions/:id
   * @desc    Get single transaction by ID
   * @access  Private
   */
  static async getTransactionById(req, res) {
    try {
      const { id } = req.params;
      const { projectId } = req.query;

      console.log(`[TransactionController] GET /api/transactions/${id}`);

      const transaction = await TransactionService.getTransactionById(id, projectId);

      return res.status(200).json({
        success: true,
        data: transaction
      });
    } catch (error) {
      console.error('[TransactionController] Error in getTransactionById:', error);
      return res.status(error.message === 'Transaction not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to fetch transaction'
      });
    }
  }

  /**
   * @route   POST /api/transactions
   * @desc    Create new transaction
   * @access  Private
   */
  static async createTransaction(req, res) {
    try {
      const { projectId, description, amount, type, category, date, notes } = req.body;
      const userId = req.user._id;

      // Validation
      if (!projectId) {
        console.log('[TransactionController] Missing projectId');
        return res.status(400).json({
          success: false,
          message: 'Project ID is required'
        });
      }

      if (!description || !amount) {
        console.log('[TransactionController] Missing required fields');
        return res.status(400).json({
          success: false,
          message: 'Description and amount are required'
        });
      }

      if (type && !['debit', 'credit'].includes(type)) {
        console.log('[TransactionController] Invalid transaction type');
        return res.status(400).json({
          success: false,
          message: 'Type must be either "debit" or "credit"'
        });
      }

      console.log(`[TransactionController] POST /api/transactions - Project: ${projectId}`, {
        description,
        amount,
        type
      });

      const transaction = await TransactionService.createTransaction(
        projectId,
        { description, amount, type, category, date, notes },
        userId
      );

      return res.status(201).json({
        success: true,
        data: transaction,
        message: 'Transaction created successfully'
      });
    } catch (error) {
      console.error('[TransactionController] Error in createTransaction:', error);
      return res.status(error.message === 'Project not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to create transaction'
      });
    }
  }

  /**
   * @route   PATCH /api/transactions/:id
   * @desc    Update transaction
   * @access  Private
   */
  static async updateTransaction(req, res) {
    try {
      const { id } = req.params;
      const { projectId } = req.query;
      const updateData = req.body;
      const userId = req.user._id;

      if (!projectId) {
        console.log('[TransactionController] Missing projectId');
        return res.status(400).json({
          success: false,
          message: 'Project ID is required'
        });
      }

      if (updateData.type && !['debit', 'credit'].includes(updateData.type)) {
        console.log('[TransactionController] Invalid transaction type');
        return res.status(400).json({
          success: false,
          message: 'Type must be either "debit" or "credit"'
        });
      }

      console.log(`[TransactionController] PATCH /api/transactions/${id}`, updateData);

      const transaction = await TransactionService.updateTransaction(
        id,
        projectId,
        updateData,
        userId
      );

      return res.status(200).json({
        success: true,
        data: transaction,
        message: 'Transaction updated successfully'
      });
    } catch (error) {
      console.error('[TransactionController] Error in updateTransaction:', error);
      return res.status(error.message === 'Transaction not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to update transaction'
      });
    }
  }

  /**
   * @route   DELETE /api/transactions/:id
   * @desc    Delete transaction (soft delete)
   * @access  Private
   */
  static async deleteTransaction(req, res) {
    try {
      const { id } = req.params;
      const { projectId } = req.query;
      const userId = req.user._id;

      if (!projectId) {
        console.log('[TransactionController] Missing projectId');
        return res.status(400).json({
          success: false,
          message: 'Project ID is required'
        });
      }

      console.log(`[TransactionController] DELETE /api/transactions/${id}`);

      await TransactionService.deleteTransaction(id, projectId, userId);

      return res.status(200).json({
        success: true,
        message: 'Transaction deleted successfully'
      });
    } catch (error) {
      console.error('[TransactionController] Error in deleteTransaction:', error);
      return res.status(error.message === 'Transaction not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to delete transaction'
      });
    }
  }

  /**
   * @route   GET /api/transactions/summary?projectId=xxx
   * @desc    Get transaction summary for a project
   * @access  Private
   */
  static async getProjectSummary(req, res) {
    try {
      const { projectId } = req.query;

      if (!projectId) {
        console.log('[TransactionController] Missing projectId');
        return res.status(400).json({
          success: false,
          message: 'Project ID is required'
        });
      }

      console.log(`[TransactionController] GET /api/transactions/summary - Project: ${projectId}`);

      const summary = await TransactionService.getProjectSummary(projectId);

      return res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('[TransactionController] Error in getProjectSummary:', error);
      return res.status(error.message === 'Project not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to fetch transaction summary'
      });
    }
  }

  /**
   * @route   GET /api/transactions/categories?projectId=xxx
   * @desc    Get category breakdown for a project
   * @access  Private
   */
  static async getCategoryBreakdown(req, res) {
    try {
      const { projectId } = req.query;

      if (!projectId) {
        console.log('[TransactionController] Missing projectId');
        return res.status(400).json({
          success: false,
          message: 'Project ID is required'
        });
      }

      console.log(`[TransactionController] GET /api/transactions/categories - Project: ${projectId}`);

      const breakdown = await TransactionService.getCategoryBreakdown(projectId);

      return res.status(200).json({
        success: true,
        data: breakdown
      });
    } catch (error) {
      console.error('[TransactionController] Error in getCategoryBreakdown:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch category breakdown'
      });
    }
  }
}

module.exports = TransactionController;

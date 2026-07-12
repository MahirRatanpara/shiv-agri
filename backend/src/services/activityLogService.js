const ActivityLog = require('../models/ActivityLog');

/**
 * Service to handle activity logging throughout the application
 * Acts as an adapter between services and the ActivityLog model
 */

/**
 * Log an activity
 * @param {Object} params - The activity parameters
 * @param {string} params.userId - User ID performing the action
 * @param {string} params.action - Action identifier (e.g., 'transaction.create')
 * @param {string} params.entityType - Type of entity affected (e.g., 'Transaction')
 * @param {string} params.entityId - ID of the entity
 * @param {string} params.projectId - Project ID involved
 * @param {string} params.description - Human readable description
 * @param {Object} params.metadata - Additional metadata
 */
const logActivity = async ({ 
  userId, 
  action, 
  entityType, 
  entityId, 
  projectId, 
  description, 
  metadata = {} 
}) => {
  try {
    // Map internal action strings to ActivityLog model enums
    let actionType = 'other';
    
    // Transaction actions mappings
    if (action === 'transaction.create') {
      const transType = metadata.transactionType || 'debit';
      actionType = transType === 'debit' ? 'expense_added' : 'payment_received';
    } else if (action === 'transaction.update') {
      // If amount was changed, could be arguably generic update
      actionType = 'updated'; 
    } else if (action === 'transaction.delete' || action === 'transaction.bulk_delete') {
      actionType = 'deleted'; 
    } 
    // Generic fallbacks based on action naming conventions
    else if (action.includes('create') || action.includes('add')) {
      actionType = 'created';
    } else if (action.includes('update') || action.includes('edit')) {
      actionType = 'updated';
    } else if (action.includes('delete') || action.includes('remove')) {
      actionType = 'deleted';
    }

    // Enrich metadata with entity info to preserve context
    const enrichedMetadata = {
      ...metadata,
      entityType,
      entityId,
      originalAction: action
    };

    // Use the static method on ActivityLog model
    await ActivityLog.logActivity(
      projectId,
      userId,
      actionType,
      description,
      enrichedMetadata
    );
    
  } catch (error) {
    // Log error but don't throw to prevent interrupting the main flow
    // We don't want a logging failure to fail the transaction itself
    console.error('[ActivityLogService] Error logging activity:', error.message);
  }
};

module.exports = {
  logActivity
};

const ActivityLog = require('../models/ActivityLog');
const logger = require('../utils/logger');

/**
 * Log an activity for a project.
 * Non-blocking — errors are caught internally.
 */
async function logActivity(projectId, userId, actionType, description, metadata = {}) {
  return ActivityLog.logActivity(projectId, userId, actionType, description, metadata);
}

/**
 * Get paginated activity log for a project.
 */
async function getProjectActivity(projectId, options = {}) {
  return ActivityLog.getProjectActivity(projectId, options);
}

/**
 * Get recent activities for a user across all projects.
 */
async function getRecentActivities(userId, limit = 10) {
  return ActivityLog.getRecentActivities(userId, limit);
}

module.exports = {
  logActivity,
  getProjectActivity,
  getRecentActivities
};

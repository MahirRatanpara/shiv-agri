const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

exports.getNotifications = async (req, res) => {
  try {
    const result = await notificationService.listForUser(req.user._id, req.query);
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error(`Failed to fetch notifications: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      message: error.message
    });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const notification = await notificationService.markRead(req.params.id, req.user._id);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    logger.error(`Failed to mark notification read: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification',
      message: error.message
    });
  }
};

exports.archiveNotification = async (req, res) => {
  try {
    const notification = await notificationService.archive(req.params.id, req.user._id);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    logger.error(`Failed to archive notification: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to archive notification',
      message: error.message
    });
  }
};

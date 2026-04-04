const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

// ─── Get Notifications ───

exports.getNotifications = async (req, res) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await notificationService.getUserNotifications(req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      unreadOnly: unreadOnly === 'true'
    });
    res.json({ success: true, data: result.notifications, pagination: result.pagination });
  } catch (error) {
    logger.error('[NotificationController] getNotifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications', message: error.message });
  }
};

// ─── Get Unread Count ───

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: { count } });
  } catch (error) {
    logger.error('[NotificationController] getUnreadCount error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch unread count', message: error.message });
  }
};

// ─── Mark as Read ───

exports.markAsRead = async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user.id);
    res.json({ success: true, data: notification, message: 'Notification marked as read' });
  } catch (error) {
    logger.error(`[NotificationController] markAsRead ${req.params.id} error:`, error);
    const status = error.message === 'Notification not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Mark All as Read ───

exports.markAllAsRead = async (req, res) => {
  try {
    const result = await notificationService.markAllAsRead(req.user.id);
    res.json({ success: true, data: result, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('[NotificationController] markAllAsRead error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark all as read', message: error.message });
  }
};

// ─── Delete Notification ───

exports.deleteNotification = async (req, res) => {
  try {
    await notificationService.deleteNotification(req.params.id, req.user.id);
    logger.info(`[NotificationController] deleteNotification: ${req.params.id}`);
    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    logger.error(`[NotificationController] deleteNotification ${req.params.id} error:`, error);
    const status = error.message === 'Notification not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

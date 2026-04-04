const Notification = require('../models/Notification');
const logger = require('../utils/logger');

// ─── Get User Notifications ───

async function getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const query = { userId };
  if (unreadOnly) query.isRead = false;

  const [notifications, total] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Notification.countDocuments(query)
  ]);

  return {
    notifications,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      hasNext: safePage < Math.ceil(total / safeLimit),
      hasPrevious: safePage > 1
    }
  };
}

// ─── Get Unread Count ───

async function getUnreadCount(userId) {
  const count = await Notification.countDocuments({ userId, isRead: false });
  return count;
}

// ─── Mark as Read ───

async function markAsRead(notificationId, userId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true, readAt: new Date() },
    { new: true }
  ).lean();

  if (!notification) throw new Error('Notification not found');

  logger.info(`[NotificationService] Notification ${notificationId} marked as read`);
  return notification;
}

// ─── Mark All as Read ───

async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    { userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  logger.info(`[NotificationService] ${result.modifiedCount} notifications marked as read for user ${userId}`);
  return { modifiedCount: result.modifiedCount };
}

// ─── Create Notification ───

async function createNotification(data) {
  const notification = await Notification.create(data);
  logger.info(`[NotificationService] Notification created for user ${data.userId}`);
  return notification.toObject();
}

// ─── Delete Notification ───

async function deleteNotification(id, userId) {
  const notification = await Notification.findOneAndDelete({ _id: id, userId });
  if (!notification) throw new Error('Notification not found');

  logger.info(`[NotificationService] Notification ${id} deleted`);
  return notification;
}

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification
};

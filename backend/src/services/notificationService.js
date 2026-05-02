const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');

class NotificationService {
  async createForUser(userId, payload) {
    if (!userId) return null;

    const notification = await Notification.create({
      ...payload,
      user: userId
    });

    logger.info(`Notification ${notification._id} created for user ${userId}`);
    return notification;
  }

  async createForUsersWithPermission(permissionName, payload) {
    const users = await User.find({})
      .populate({
        path: 'roleRef',
        populate: { path: 'permissions' }
      })
      .lean();

    const recipients = users.filter((user) => {
      if (user.role === 'admin') return true;
      const permissions = user.roleRef?.permissions || [];
      return permissions.some((permission) => permission.name === permissionName);
    });

    if (!recipients.length) {
      logger.warn(`No notification recipients found for permission ${permissionName}`);
      return [];
    }

    const notifications = recipients.map((user) => ({
      ...payload,
      user: user._id
    }));

    const created = await Notification.insertMany(notifications);
    logger.info(`Created ${created.length} notifications for permission ${permissionName}`);
    return created;
  }

  async listForUser(userId, options = {}) {
    const limit = Math.min(parseInt(options.limit, 10) || 20, 100);
    const query = {
      user: userId,
      archivedAt: { $exists: false }
    };

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(query)
        .populate('project', 'name status rejectedReason')
        .populate('submittingUser', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Notification.countDocuments({
        user: userId,
        isRead: false,
        archivedAt: { $exists: false }
      })
    ]);

    return { notifications, unreadCount };
  }

  async markRead(notificationId, userId) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { $set: { isRead: true } },
      { new: true }
    );
  }

  async archive(notificationId, userId) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { $set: { archivedAt: new Date(), isRead: true } },
      { new: true }
    );
  }

  async archiveFarmRegistration(projectId) {
    await Notification.updateMany(
      {
        type: 'farm_registration',
        project: projectId,
        archivedAt: { $exists: false }
      },
      {
        $set: {
          archivedAt: new Date(),
          isRead: true
        }
      }
    );
  }
}

module.exports = new NotificationService();

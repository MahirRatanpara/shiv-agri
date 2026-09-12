const Notification = require('../models/Notification');
const User = require('../models/User');
const Role = require('../models/Role');
const logger = require('../utils/logger');

// Roles that run the business and should hear about every farm document that
// moves, regardless of whether they are attached to that specific farm.
const STAFF_ROLES = ['admin', 'manager'];

class NotificationService {
  /**
   * Insert one notification per recipient, de-duplicated, with the actor
   * removed so nobody is notified about their own action.
   * Returns the created docs (empty array when there is nobody left to notify).
   */
  async createForMany(userIds, payload, excludeUserId) {
    const exclude = excludeUserId ? String(excludeUserId) : null;
    const unique = new Set();

    for (const id of userIds || []) {
      if (!id) continue;
      const key = String((typeof id === 'object' && (id._id || id.id)) || id);
      if (!key || key === exclude) continue;
      unique.add(key);
    }

    if (!unique.size) return [];

    const created = await Notification.insertMany(
      Array.from(unique).map((user) => ({ ...payload, user }))
    );
    return created;
  }

  /**
   * Every staff member who should hear about farm activity: anyone holding an
   * admin/manager role, plus anyone granted `permissionName` through a custom
   * role. Roles are resolved first so this does not load the whole user table.
   */
  async resolveStaffRecipientIds(permissionName) {
    const conditions = [{ role: { $in: STAFF_ROLES } }];

    if (permissionName) {
      const roles = await Role.find({ isActive: true })
        .select('_id permissions')
        .populate('permissions', 'name')
        .lean();

      const permittedRoleIds = roles
        .filter((role) => (role.permissions || []).some((perm) => perm.name === permissionName))
        .map((role) => role._id);

      if (permittedRoleIds.length) {
        conditions.push({ roleRef: { $in: permittedRoleIds } });
      }
    }

    const users = await User.find({ $or: conditions }).select('_id').lean();
    return users.map((user) => user._id);
  }

  /**
   * Fan a notification out to the whole back office. Used for farm document
   * activity, where a farm's own assignees are not a wide enough audience —
   * most farms have no team assigned at all.
   */
  async createForStaff(payload, options = {}) {
    const { excludeUserId, permissionName = 'farm.documents.view' } = options;

    const staffIds = await this.resolveStaffRecipientIds(permissionName);
    const created = await this.createForMany(staffIds, payload, excludeUserId);

    if (!created.length) {
      logger.warn('No staff recipients found for notification type ' + payload.type);
    } else {
      logger.info(`Created ${created.length} staff notifications of type ${payload.type}`);
    }
    return created;
  }

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
      // Admins and managers always qualify. Previously only 'admin' did, so a
      // manager whose role lacked the exact permission silently received none
      // of the notifications these call sites describe as going to managers.
      if (STAFF_ROLES.includes(user.role)) return true;
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

const FarmMediaQuota = require('../models/FarmMediaQuota');
const Project = require('../models/Project');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:8081';
const MEDIA_SERVICE_PUBLIC_URL = process.env.MEDIA_SERVICE_PUBLIC_URL || MEDIA_SERVICE_URL;
const WEEKLY_LIMIT = parseInt(process.env.FARM_MEDIA_WEEKLY_LIMIT, 10) || 10;
const MAX_FILES_PER_UPLOAD = 5;

class FarmMediaService {
  /**
   * Compute ISO 8601 week string ("2026-W18") for a given date.
   */
  getIsoWeek(date = new Date()) {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  /**
   * Returns Date for the start of next ISO week (Monday 00:00:00 UTC).
   */
  getResetsAt(date = new Date()) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    const daysUntilNextMonday = 8 - dayNum;
    d.setUTCDate(d.getUTCDate() + daysUntilNextMonday);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  async getCurrentQuotaRecord(projectId, isoWeek = this.getIsoWeek()) {
    const now = new Date();
    const quota = await FarmMediaQuota.findOne({ projectId })
      .sort({ updatedAt: -1, _id: -1 });

    if (!quota || quota.isoWeek === isoWeek) {
      return quota;
    }

    const currentWeekQuota = await FarmMediaQuota.findOne({ projectId, isoWeek })
      .sort({ updatedAt: -1, _id: -1 });
    if (currentWeekQuota) {
      return currentWeekQuota;
    }

    return FarmMediaQuota.findByIdAndUpdate(
      quota._id,
      [
        {
          $set: {
            isoWeek,
            uploadCount: {
              $cond: [
                { $eq: ['$isoWeek', isoWeek] },
                { $ifNull: ['$uploadCount', 0] },
                0
              ]
            },
            lastUploadAt: {
              $cond: [
                { $eq: ['$isoWeek', isoWeek] },
                '$lastUploadAt',
                null
              ]
            },
            updatedAt: now
          }
        }
      ],
      { new: true }
    );
  }

  /**
   * Snapshot of the current week's quota. The quota document is project-scoped;
   * when ISO week changes, the existing row is rolled forward and reset.
   */
  async getQuotaSnapshot(projectId) {
    const isoWeek = this.getIsoWeek();
    const resetsAt = this.getResetsAt();
    const quota = await this.getCurrentQuotaRecord(projectId, isoWeek);
    return {
      used: quota?.uploadCount || 0,
      limit: WEEKLY_LIMIT,
      isoWeek,
      resetsAt: resetsAt.toISOString(),
      lastUploadAt: quota?.lastUploadAt || null
    };
  }

  async incrementQuota(projectId) {
    const reservation = await this.reserveQuota(projectId, 1);
    if (!reservation.reserved) {
      throw { status: 429, message: 'Weekly upload limit reached', quota: reservation.snapshot };
    }
    return reservation.quota;
  }

  async reserveQuota(projectId, count = 1) {
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error('Quota reservation count must be a positive integer');
    }

    const isoWeek = this.getIsoWeek();
    const now = new Date();

    if (count > WEEKLY_LIMIT) {
      const snapshot = await this.getQuotaSnapshot(projectId);
      return { reserved: false, snapshot };
    }

    const quota = await this.getCurrentQuotaRecord(projectId, isoWeek);

    if (!quota) {
      try {
        const created = await FarmMediaQuota.create({
          projectId,
          isoWeek,
          uploadCount: count,
          lastUploadAt: now
        });
        return {
          reserved: true,
          quota: created,
          snapshot: this.toQuotaSnapshot(created, isoWeek)
        };
      } catch (err) {
        if (err?.code === 11000) {
          return this.reserveQuota(projectId, count);
        }
        throw err;
      }
    }

    const updated = await FarmMediaQuota.findOneAndUpdate(
      {
        _id: quota._id,
        isoWeek,
        uploadCount: { $lte: WEEKLY_LIMIT - count }
      },
      {
        $inc: { uploadCount: count },
        $set: {
          lastUploadAt: now,
          updatedAt: now
        }
      },
      { new: true }
    );

    if (!updated) {
      const snapshot = await this.getQuotaSnapshot(projectId);
      return { reserved: false, snapshot };
    }

    return {
      reserved: true,
      quota: updated,
      snapshot: this.toQuotaSnapshot(updated, isoWeek)
    };
  }

  async releaseQuota(projectId, count = 1) {
    if (!Number.isInteger(count) || count <= 0) return null;

    const isoWeek = this.getIsoWeek();
    const quota = await this.getCurrentQuotaRecord(projectId, isoWeek);
    if (!quota) return null;

    return FarmMediaQuota.findByIdAndUpdate(
      quota._id,
      [
        {
          $set: {
            uploadCount: {
              $cond: [
                { $lt: [{ $subtract: [{ $ifNull: ['$uploadCount', 0] }, count] }, 0] },
                0,
                { $subtract: [{ $ifNull: ['$uploadCount', 0] }, count] }
              ]
            },
            updatedAt: new Date()
          }
        }
      ],
      { new: true }
    );
  }

  toQuotaSnapshot(quota, isoWeek = this.getIsoWeek()) {
    return {
      used: quota?.uploadCount || 0,
      limit: WEEKLY_LIMIT,
      isoWeek,
      resetsAt: this.getResetsAt().toISOString(),
      lastUploadAt: quota?.lastUploadAt || null
    };
  }

  /**
   * Upload a single media file to the media service then embed a reference
   * on the project document. Throws { status, message } on failure.
   *
   * @param {Object} [options]
   * @param {boolean} [options.bypassQuota=false] When true, the upload is
   *   stamped with `countsTowardQuota=false` and lands already attended.
   *   Used for admin/manager uploads so they don't consume the farmer's
   *   weekly allowance and don't need triage in the unattended bucket.
   */
  async uploadMedia(projectId, file, user, options = {}) {
    const { bypassQuota = false } = options;
    const start = Date.now();
    logger.info(`[FarmMedia] Upload start: project=${projectId}, file=${file.originalname}, size=${file.size}, mime=${file.mimetype}, user=${user._id}`);

    const initiateRes = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        altText: `Farm media for project ${projectId}`,
        tags: ['farm-media', `project-${projectId}`]
      })
    });

    if (!initiateRes.ok) {
      const text = await initiateRes.text();
      logger.error(`[FarmMedia] Initiate failed: status=${initiateRes.status}, body=${text}`);
      throw { status: 502, message: 'Media service unavailable. Please try again.' };
    }

    const initiated = await initiateRes.json();
    logger.info(`[FarmMedia] Initiated: mediaId=${initiated.id}`);

    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append('file', blob, file.originalname);

    const uploadRes = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media/${initiated.id}/upload`, {
      method: 'PUT',
      body: formData
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      logger.error(`[FarmMedia] Complete upload failed: id=${initiated.id}, status=${uploadRes.status}, body=${text}`);
      throw { status: 502, message: 'Upload failed. Please try again.' };
    }

    const completed = await uploadRes.json();
    logger.info(`[FarmMedia] Upload complete: id=${completed.id}, checksum=${completed.checksum}, durationMs=${Date.now() - start}`);

    const type = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const fullUrl = completed.contentUrl?.startsWith('http')
      ? completed.contentUrl
      : `${MEDIA_SERVICE_PUBLIC_URL}${completed.contentUrl}`;

    const mediaRef = {
      mediaId: completed.id,
      url: fullUrl,
      mimeType: completed.mimeType,
      type,
      sizeBytes: completed.sizeBytes,
      status: 'ACTIVE',
      uploadedBy: user._id,
      uploadedByName: user.name || user.email,
      uploadedAt: new Date(completed.createdAt || Date.now()),
      // Admin/manager uploads land attended and don't count toward the
      // farmer's weekly quota.
      attended: bypassQuota,
      attendedAt: bypassQuota ? new Date() : undefined,
      attendedBy: bypassQuota ? user._id : undefined,
      attendedByName: bypassQuota ? (user.name || user.email) : undefined,
      countsTowardQuota: !bypassQuota
    };

    await Project.updateOne(
      { _id: projectId },
      { $push: { farmMedia: mediaRef }, $set: { updatedAt: new Date() } }
    );

    return mediaRef;
  }

  /**
   * Resolve the set of users associated with a project (owner + workers).
   * Notifications are scoped to this set only — no global admin/manager fan-out.
   */
  collectProjectStakeholders(project) {
    const ids = new Set();
    const push = (value) => {
      if (!value) return;
      if (Array.isArray(value)) return value.forEach(push);
      const id = (typeof value === 'object' && (value._id || value.id)) || value;
      if (id) ids.add(id.toString());
    };

    // Owner / client side
    push(project.submittedBy);
    push(project.clientId);

    // Worker / team side
    push(project.assignedTo);
    push(project.projectManager);
    push(project.fieldWorkers);
    push(project.consultants);
    push(project.assignedTeam);

    return ids;
  }

  /**
   * Notify only the project's stakeholders — owner and assigned workers.
   * The uploader is excluded so they don't notify themselves.
   * Best-effort; failures are logged and don't fail the upload.
   */
  async notifyOnUpload(project, count, user) {
    try {
      const message = count > 1
        ? `${count} new photos added to ${project.name}`
        : `New photo added to ${project.name}`;

      const basePayload = {
        type: 'farm_media_upload',
        title: 'New farm media uploaded',
        message,
        project: project._id,
        submittingUser: user._id,
        metadata: {
          farmName: project.name,
          uploaderName: user.name || user.email,
          mediaCount: count
        }
      };

      const stakeholderIds = this.collectProjectStakeholders(project);
      stakeholderIds.delete(user._id.toString());

      if (!stakeholderIds.size) {
        logger.debug(`[FarmMedia] No stakeholders to notify for project ${project._id}`);
        return;
      }

      await Promise.all(
        Array.from(stakeholderIds).map((uid) =>
          notificationService.createForUser(uid, basePayload)
        )
      );

      logger.info(`[FarmMedia] Notifications sent: project=${project._id}, recipients=${stakeholderIds.size}`);
    } catch (err) {
      logger.error(`[FarmMedia] Notification failed: ${err.message}`);
    }
  }

  /**
   * List unattended media (newly uploaded, not yet acknowledged) plus a count
   * of how many attended items exist. Unattended items show as thumbnails;
   * attended items live behind a paginated drawer (see listAttendedMedia).
   */
  async listUnattendedMedia(projectId) {
    const project = await Project.findById(projectId)
      .select('farmMedia')
      .lean();
    if (!project) return { unattended: [], attendedTotal: 0, total: 0 };

    const all = (project.farmMedia || []).filter((m) => m.status !== 'DELETED');
    const unattended = all
      .filter((m) => !m.attended)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const attendedTotal = all.length - unattended.length;

    return { unattended, attendedTotal, total: all.length };
  }

  /**
   * Paginated list of attended media. Loaded lazily when the user opens the
   * "View attended photos" drawer in the UI.
   */
  async listAttendedMedia(projectId, page = 1, limit = 20) {
    const project = await Project.findById(projectId)
      .select('farmMedia')
      .lean();
    if (!project) return { items: [], total: 0, page, totalPages: 0 };

    const attended = (project.farmMedia || [])
      .filter((m) => m.status !== 'DELETED' && m.attended)
      .sort((a, b) => new Date(b.attendedAt || b.uploadedAt) - new Date(a.attendedAt || a.uploadedAt));

    const total = attended.length;
    const start = (page - 1) * limit;
    const items = attended.slice(start, start + limit);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  /**
   * Mark a single media item as attended. Uses $elemMatch so the positional
   * `$` operator targets the same element that satisfied both conditions —
   * a plain dot-path query like `{'farmMedia.mediaId': X, 'farmMedia.attended': {$ne:true}}`
   * matches at the document level (any element X, any element not-attended)
   * which can fail to update in mixed-state arrays.
   */
  async markAttended(projectId, mediaId, user) {
    const result = await Project.updateOne(
      {
        _id: projectId,
        farmMedia: {
          $elemMatch: { mediaId, status: { $ne: 'DELETED' } }
        }
      },
      {
        $set: {
          'farmMedia.$.attended': true,
          'farmMedia.$.attendedAt': new Date(),
          'farmMedia.$.attendedBy': user._id,
          'farmMedia.$.attendedByName': user.name || user.email,
          updatedAt: new Date()
        }
      }
    );

    if (!result.matchedCount) {
      throw { status: 404, message: 'Media not found on this project' };
    }

    logger.info(`[FarmMedia] Media attended: project=${projectId}, mediaId=${mediaId}, by=${user._id}, modified=${result.modifiedCount}`);
    return { success: true, alreadyAttended: result.modifiedCount === 0 };
  }

  /**
   * Bulk-attend every unattended, non-deleted media item on the project.
   * Returns the number of items transitioned. Uses arrayFilters so it scales
   * as the project's history grows.
   */
  async markAllAttended(projectId, user) {
    const project = await Project.findById(projectId).select('farmMedia').lean();
    if (!project) throw { status: 404, message: 'Project not found' };

    const unattendedCount = (project.farmMedia || []).filter(
      (m) => m.status !== 'DELETED' && !m.attended
    ).length;

    if (unattendedCount === 0) {
      return { success: true, attendedCount: 0 };
    }

    const now = new Date();
    await Project.updateOne(
      { _id: projectId },
      {
        $set: {
          'farmMedia.$[elem].attended': true,
          'farmMedia.$[elem].attendedAt': now,
          'farmMedia.$[elem].attendedBy': user._id,
          'farmMedia.$[elem].attendedByName': user.name || user.email,
          updatedAt: now
        }
      },
      {
        arrayFilters: [
          {
            'elem.attended': { $ne: true },
            'elem.status': { $ne: 'DELETED' }
          }
        ]
      }
    );

    logger.info(`[FarmMedia] Bulk attended: project=${projectId}, count=${unattendedCount}, by=${user._id}`);
    return { success: true, attendedCount: unattendedCount };
  }

  /**
   * Soft-delete a media item by marking its status.
   *
   * Three deletion modes are supported via options:
   *  - Admin   (`allowAnyUploader: true`,  `refundQuota: true`)  — any item,
   *            attended or not. Quota refunds for current-week farmer items.
   *  - Manager (`allowAnyUploader: false`, `refundQuota: true`)  — only items
   *            the manager uploaded themselves. Quota refunds for current-week
   *            farmer items (manager uploads have `countsTowardQuota=false`
   *            so they don't refund anyway).
   *  - Owner   (`allowAnyUploader: false`, `refundQuota: false`,
   *             `requireUnattended: true`) — farm owner cleaning up their own
   *            uploads. Quota is NOT refunded — the rate limit is one-way.
   *            The item must still be unattended (admin/manager hasn't
   *            triaged it yet); attended items are part of the historical
   *            record and only admin/manager can remove them.
   */
  async deleteMedia(projectId, mediaId, user, options = {}) {
    const {
      allowAnyUploader = false,
      refundQuota = true,
      requireUnattended = false
    } = options;

    const project = await Project.findOne(
      { _id: projectId, 'farmMedia.mediaId': mediaId },
      { 'farmMedia.$': 1 }
    ).lean();

    if (!project || !project.farmMedia?.[0]) {
      throw { status: 404, message: 'Media not found on this project' };
    }

    const media = project.farmMedia[0];

    if (!allowAnyUploader) {
      const uploader = media.uploadedBy?.toString();
      if (!uploader || uploader !== user._id.toString()) {
        throw {
          status: 403,
          message: 'You may only delete media that you uploaded.'
        };
      }
    }

    if (requireUnattended && media.attended === true) {
      throw {
        status: 403,
        message: 'This photo has already been reviewed by the team. Please contact your manager to remove it.'
      };
    }

    const result = await Project.updateOne(
      { _id: projectId, 'farmMedia.mediaId': mediaId },
      {
        $set: {
          'farmMedia.$.status': 'DELETED',
          'farmMedia.$.deletedAt': new Date(),
          'farmMedia.$.deletedBy': user._id,
          updatedAt: new Date()
        }
      }
    );

    if (!result.matchedCount) {
      throw { status: 404, message: 'Media not found on this project' };
    }

    // Refund the farmer's weekly quota only when the caller is allowed to
    // trigger refunds (admin/manager) AND the deleted item was a
    // quota-counting farmer upload from the CURRENT ISO week. Farmer
    // self-deletes never refund quota — the weekly cap is intentionally
    // one-way so the farmer can't cycle uploads to bypass the limit.
    let quotaRefunded = false;
    if (refundQuota) {
      const counted = media.countsTowardQuota !== false; // Default true for legacy items
      const sameWeek = media.uploadedAt
        ? this.getIsoWeek(new Date(media.uploadedAt)) === this.getIsoWeek()
        : false;

      if (counted && sameWeek) {
        await this.releaseQuota(projectId, 1);
        quotaRefunded = true;
        logger.info(`[FarmMedia] Quota refunded on delete: project=${projectId}, mediaId=${mediaId}`);
      }
    }

    logger.info(`[FarmMedia] Media deleted: project=${projectId}, mediaId=${mediaId}, by=${user._id}, quotaRefunded=${quotaRefunded}, mode=${allowAnyUploader ? 'admin' : (requireUnattended ? 'owner' : 'manager')}`);
    return { success: true, mediaId: media.mediaId, quotaRefunded };
  }

  getWeeklyLimit() {
    return WEEKLY_LIMIT;
  }

  getMaxFilesPerUpload() {
    return MAX_FILES_PER_UPLOAD;
  }
}

module.exports = new FarmMediaService();

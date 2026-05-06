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
   * Uses ISO week date rules: weeks start on Monday, week 1 is the
   * week containing the first Thursday of the year.
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

  async getQuotaSnapshot(projectId) {
    const isoWeek = this.getIsoWeek();
    const resetsAt = this.getResetsAt();
    const quota = await FarmMediaQuota.findOne({ projectId, isoWeek }).lean();
    return {
      used: quota?.uploadCount || 0,
      limit: WEEKLY_LIMIT,
      isoWeek,
      resetsAt: resetsAt.toISOString(),
      lastUploadAt: quota?.lastUploadAt || null
    };
  }

  async incrementQuota(projectId) {
    const isoWeek = this.getIsoWeek();
    const updated = await FarmMediaQuota.findOneAndUpdate(
      { projectId, isoWeek },
      {
        $inc: { uploadCount: 1 },
        $set: { lastUploadAt: new Date() }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return updated;
  }

  /**
   * Upload a single media file to the media service then embed a reference
   * on the project document. Throws { status, message } on failure.
   */
  async uploadMedia(projectId, file, user) {
    const start = Date.now();
    logger.info(`[FarmMedia] Upload start: project=${projectId}, file=${file.originalname}, size=${file.size}, mime=${file.mimetype}, user=${user._id}`);

    // 1. Initiate upload
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

    // 2. Complete upload (PUT with multipart)
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

    // 3. Build embedded reference
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
      uploadedAt: new Date(completed.createdAt || Date.now())
    };

    // 4. Push reference into project document
    await Project.updateOne(
      { _id: projectId },
      { $push: { farmMedia: mediaRef }, $set: { updatedAt: new Date() } }
    );

    return mediaRef;
  }

  /**
   * Send notification to farm owner after upload.
   * Best-effort; failures are logged but do not affect the upload result.
   */
  async notifyOwner(project, count, user) {
    try {
      const ownerId = project.submittedBy || project.clientId;
      if (!ownerId) {
        logger.debug(`[FarmMedia] No owner to notify for project ${project._id}`);
        return;
      }
      // Don't self-notify
      if (ownerId.toString() === user._id.toString()) return;

      const message = count > 1
        ? `${count} new photos added to ${project.name}`
        : `New photo added to ${project.name}`;

      await notificationService.createForUser(ownerId, {
        type: 'farm_media_upload',
        title: 'New media uploaded',
        message,
        project: project._id,
        submittingUser: user._id,
        metadata: {
          farmName: project.name,
          uploaderName: user.name || user.email
        }
      });
      logger.info(`[FarmMedia] Notification sent to owner=${ownerId} for project=${project._id}`);
    } catch (err) {
      logger.error(`[FarmMedia] Notification failed: ${err.message}`);
    }
  }

  async listMedia(projectId, page = 1, limit = 50) {
    const project = await Project.findById(projectId)
      .select('farmMedia')
      .lean();
    if (!project) return { items: [], total: 0, page, totalPages: 0 };

    const all = (project.farmMedia || [])
      .filter((m) => m.status !== 'DELETED')
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    const total = all.length;
    const start = (page - 1) * limit;
    const items = all.slice(start, start + limit);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  getWeeklyLimit() {
    return WEEKLY_LIMIT;
  }

  getMaxFilesPerUpload() {
    return MAX_FILES_PER_UPLOAD;
  }
}

module.exports = new FarmMediaService();

const Project = require('../models/Project');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:8081';
const MEDIA_SERVICE_PUBLIC_URL = process.env.MEDIA_SERVICE_PUBLIC_URL || MEDIA_SERVICE_URL;
const MAX_FILES_PER_UPLOAD = 5;

class FarmDesignService {
  async uploadDesign(projectId, file, user, meta = {}) {
    const start = Date.now();
    logger.info(`[FarmDesign] Upload start: project=${projectId}, file=${file.originalname}, size=${file.size}, mime=${file.mimetype}, user=${user._id}`);

    const initiateRes = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        altText: `Landscaping design for project ${projectId}`,
        tags: ['landscaping-design', `project-${projectId}`]
      })
    });

    if (!initiateRes.ok) {
      const text = await initiateRes.text();
      logger.error(`[FarmDesign] Initiate failed: status=${initiateRes.status}, body=${text}`);
      throw { status: 502, message: 'Media service unavailable. Please try again.' };
    }

    const initiated = await initiateRes.json();
    logger.info(`[FarmDesign] Initiated: mediaId=${initiated.id}`);

    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append('file', blob, file.originalname);

    const uploadRes = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media/${initiated.id}/upload`, {
      method: 'PUT',
      body: formData
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      logger.error(`[FarmDesign] Complete failed: id=${initiated.id}, status=${uploadRes.status}, body=${text}`);
      throw { status: 502, message: 'Upload failed. Please try again.' };
    }

    const completed = await uploadRes.json();
    logger.info(`[FarmDesign] Upload complete: id=${completed.id}, durationMs=${Date.now() - start}`);

    const type = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const fullUrl = completed.contentUrl?.startsWith('http')
      ? completed.contentUrl
      : `${MEDIA_SERVICE_PUBLIC_URL}${completed.contentUrl}`;

    const designRef = {
      mediaId: completed.id,
      url: fullUrl,
      mimeType: completed.mimeType,
      type,
      sizeBytes: completed.sizeBytes,
      title: meta.title?.trim() || '',
      notes: meta.notes?.trim() || '',
      status: 'ACTIVE',
      uploadedBy: user._id,
      uploadedByName: user.name || user.email,
      uploadedAt: new Date(completed.createdAt || Date.now())
    };

    await Project.updateOne(
      { _id: projectId },
      { $push: { landscapingDesigns: designRef }, $set: { updatedAt: new Date() } }
    );

    return designRef;
  }

  async notifyOwner(project, count, user) {
    try {
      const ownerId = project.submittedBy || project.clientId;
      if (!ownerId) {
        logger.debug(`[FarmDesign] No owner to notify for project ${project._id}`);
        return;
      }
      if (ownerId.toString() === user._id.toString()) return;

      const message = count > 1
        ? `${count} new landscaping designs added to ${project.name}`
        : `New landscaping design added to ${project.name}`;

      await notificationService.createForUser(ownerId, {
        type: 'farm_design_upload',
        title: 'New landscaping design uploaded',
        message,
        project: project._id,
        submittingUser: user._id,
        metadata: {
          farmName: project.name,
          uploaderName: user.name || user.email,
          itemCount: count
        }
      });
      logger.info(`[FarmDesign] Notification sent to owner=${ownerId} for project=${project._id}`);
    } catch (err) {
      logger.error(`[FarmDesign] Notification failed: ${err.message}`);
    }
  }

  async listDesigns(projectId, page = 1, limit = 50) {
    const project = await Project.findById(projectId)
      .select('landscapingDesigns')
      .lean();
    if (!project) return { items: [], total: 0, page, totalPages: 0 };

    const all = (project.landscapingDesigns || [])
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

  getMaxFilesPerUpload() {
    return MAX_FILES_PER_UPLOAD;
  }
}

module.exports = new FarmDesignService();

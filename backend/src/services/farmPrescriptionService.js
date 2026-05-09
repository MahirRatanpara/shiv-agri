const Project = require('../models/Project');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:8081';
const MEDIA_SERVICE_PUBLIC_URL = process.env.MEDIA_SERVICE_PUBLIC_URL || MEDIA_SERVICE_URL;
const MAX_FILES_PER_UPLOAD = 5;

const PDF_MIME = 'application/pdf';
const DOCX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
]);
const TEXT_MIMES = new Set(['text/plain', 'text/markdown']);

function classifyDocType(mimeType) {
  if (!mimeType) return 'text';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === PDF_MIME) return 'pdf';
  if (DOCX_MIMES.has(mimeType)) return 'docx';
  if (TEXT_MIMES.has(mimeType)) return 'text';
  return 'text';
}

class FarmPrescriptionService {
  classifyDocType(mimeType) {
    return classifyDocType(mimeType);
  }

  async uploadFile(projectId, file, user, meta = {}) {
    const start = Date.now();
    logger.info(`[FarmPrescription] Upload start: project=${projectId}, file=${file.originalname}, size=${file.size}, mime=${file.mimetype}, user=${user._id}`);

    const initiateRes = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        altText: `Prescription document for project ${projectId}`,
        tags: ['prescription', `project-${projectId}`]
      })
    });

    if (!initiateRes.ok) {
      const text = await initiateRes.text();
      logger.error(`[FarmPrescription] Initiate failed: status=${initiateRes.status}, body=${text}`);
      throw { status: 502, message: 'Media service unavailable. Please try again.' };
    }

    const initiated = await initiateRes.json();
    logger.info(`[FarmPrescription] Initiated: mediaId=${initiated.id}`);

    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append('file', blob, file.originalname);

    const uploadRes = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media/${initiated.id}/upload`, {
      method: 'PUT',
      body: formData
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      logger.error(`[FarmPrescription] Complete failed: id=${initiated.id}, status=${uploadRes.status}, body=${text}`);
      throw { status: 502, message: 'Upload failed. Please try again.' };
    }

    const completed = await uploadRes.json();
    logger.info(`[FarmPrescription] Upload complete: id=${completed.id}, durationMs=${Date.now() - start}`);

    const fullUrl = completed.contentUrl?.startsWith('http')
      ? completed.contentUrl
      : `${MEDIA_SERVICE_PUBLIC_URL}${completed.contentUrl}`;

    const docType = classifyDocType(completed.mimeType || file.mimetype);

    const ref = {
      source: 'file',
      docType,
      title: meta.title?.trim() || file.originalname,
      notes: meta.notes?.trim() || '',
      mediaId: completed.id,
      url: fullUrl,
      mimeType: completed.mimeType,
      sizeBytes: completed.sizeBytes,
      fileName: file.originalname,
      status: 'ACTIVE',
      uploadedBy: user._id,
      uploadedByName: user.name || user.email,
      uploadedAt: new Date(completed.createdAt || Date.now())
    };

    await Project.updateOne(
      { _id: projectId },
      { $push: { prescriptions: ref }, $set: { updatedAt: new Date() } }
    );

    return ref;
  }

  async addManual(projectId, payload, user) {
    const ref = {
      source: 'manual',
      docType: 'manual',
      title: payload.title?.trim() || 'Prescription',
      notes: payload.notes?.trim() || '',
      textContent: payload.textContent?.trim() || '',
      status: 'ACTIVE',
      uploadedBy: user._id,
      uploadedByName: user.name || user.email,
      uploadedAt: new Date()
    };

    await Project.updateOne(
      { _id: projectId },
      { $push: { prescriptions: ref }, $set: { updatedAt: new Date() } }
    );

    logger.info(`[FarmPrescription] Manual prescription added: project=${projectId}, user=${user._id}`);
    return ref;
  }

  async addText(projectId, payload, user) {
    const text = (payload.textContent || '').trim();
    if (!text) {
      throw { status: 400, message: 'Prescription text is required.' };
    }

    const ref = {
      source: 'file',
      docType: 'text',
      title: payload.title?.trim() || 'Text prescription',
      notes: payload.notes?.trim() || '',
      textContent: text,
      status: 'ACTIVE',
      uploadedBy: user._id,
      uploadedByName: user.name || user.email,
      uploadedAt: new Date()
    };

    await Project.updateOne(
      { _id: projectId },
      { $push: { prescriptions: ref }, $set: { updatedAt: new Date() } }
    );

    logger.info(`[FarmPrescription] Text prescription added: project=${projectId}, user=${user._id}`);
    return ref;
  }

  async notifyOwner(project, count, user, kindLabel = 'prescription') {
    try {
      const ownerId = project.submittedBy || project.clientId;
      if (!ownerId) {
        logger.debug(`[FarmPrescription] No owner to notify for project ${project._id}`);
        return;
      }
      if (ownerId.toString() === user._id.toString()) return;

      const message = count > 1
        ? `${count} new ${kindLabel}s added to ${project.name}`
        : `New ${kindLabel} added to ${project.name}`;

      await notificationService.createForUser(ownerId, {
        type: 'farm_prescription_upload',
        title: 'New prescription available',
        message,
        project: project._id,
        submittingUser: user._id,
        metadata: {
          farmName: project.name,
          uploaderName: user.name || user.email,
          itemCount: count
        }
      });
      logger.info(`[FarmPrescription] Notification sent to owner=${ownerId} for project=${project._id}`);
    } catch (err) {
      logger.error(`[FarmPrescription] Notification failed: ${err.message}`);
    }
  }

  async listPrescriptions(projectId, page = 1, limit = 50) {
    const project = await Project.findById(projectId)
      .select('prescriptions')
      .lean();
    if (!project) return { items: [], total: 0, page, totalPages: 0 };

    const all = (project.prescriptions || [])
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

module.exports = new FarmPrescriptionService();

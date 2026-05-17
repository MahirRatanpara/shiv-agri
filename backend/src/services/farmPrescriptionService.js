const mongoose = require('mongoose');
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
      _id: new mongoose.Types.ObjectId(),
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

  async uploadImageOnly(projectId, file) {
    const initiateRes = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        altText: `Prescription image for project ${projectId}`,
        tags: ['prescription-image', `project-${projectId}`]
      })
    });

    if (!initiateRes.ok) {
      const text = await initiateRes.text();
      logger.error(`[FarmPrescription] Image initiate failed: status=${initiateRes.status}, body=${text}`);
      throw { status: 502, message: 'Media service unavailable. Please try again.' };
    }

    const initiated = await initiateRes.json();
    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append('file', blob, file.originalname);

    const uploadRes = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media/${initiated.id}/upload`, {
      method: 'PUT',
      body: formData
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      logger.error(`[FarmPrescription] Image upload failed: id=${initiated.id}, status=${uploadRes.status}, body=${text}`);
      throw { status: 502, message: 'Image upload failed. Please try again.' };
    }

    const completed = await uploadRes.json();
    const fullUrl = completed.contentUrl?.startsWith('http')
      ? completed.contentUrl
      : `${MEDIA_SERVICE_PUBLIC_URL}${completed.contentUrl}`;

    return {
      mediaId: completed.id,
      url: fullUrl,
      mimeType: completed.mimeType,
      sizeBytes: completed.sizeBytes,
      fileName: file.originalname
    };
  }

  async addStructured(projectId, payload, files, user) {
    const structured = payload?.structured || {};
    if (!structured || typeof structured !== 'object') {
      throw { status: 400, message: 'Structured prescription data is required.' };
    }

    const attachedImages = [];
    for (const file of files || []) {
      if (!file.mimetype?.startsWith('image/')) {
        throw { status: 415, message: `Only images can be attached to a prescription (got ${file.mimetype}).` };
      }
      const ref = await this.uploadImageOnly(projectId, file);
      attachedImages.push(ref);
    }

    const visitDate = structured.visitDate ? new Date(structured.visitDate) : new Date();
    const farmerNameTrimmed = (structured.farmerName || '').trim();
    const title = (payload.title || '').trim()
      || (farmerNameTrimmed ? `Prescription — ${farmerNameTrimmed}` : 'Prescription');

    // Pre-generate the subdoc _id so we can reliably return it to the client
    // (avoids issues with $push + lean() not surfacing the auto-generated id).
    const ref = {
      _id: new mongoose.Types.ObjectId(),
      source: 'structured',
      docType: 'structured',
      title,
      notes: (payload.notes || '').trim() || '',
      structured: { ...structured, visitDate },
      attachedImages,
      status: 'ACTIVE',
      uploadedBy: user._id,
      uploadedByName: user.name || user.email,
      uploadedAt: new Date()
    };

    const result = await Project.updateOne(
      { _id: projectId },
      { $push: { prescriptions: ref }, $set: { updatedAt: new Date() } }
    );

    if (!result || result.matchedCount === 0) {
      logger.error(`[FarmPrescription] Structured prescription save failed: project=${projectId} not found`);
      throw { status: 404, message: 'Project not found' };
    }

    logger.info(`[FarmPrescription] Structured prescription added: project=${projectId}, rxId=${ref._id}, images=${attachedImages.length}, user=${user._id}`);
    return ref;
  }

  async getPrescriptionById(projectId, prescriptionId) {
    const project = await Project.findOne(
      { _id: projectId, 'prescriptions._id': prescriptionId },
      { 'prescriptions.$': 1, name: 1, clientPhone: 1, location: 1 }
    ).lean();
    if (!project) return null;
    return {
      project: { _id: project._id, name: project.name, clientPhone: project.clientPhone, location: project.location },
      prescription: project.prescriptions?.[0] || null
    };
  }

  async addManual(projectId, payload, user) {
    const ref = {
      _id: new mongoose.Types.ObjectId(),
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
      _id: new mongoose.Types.ObjectId(),
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

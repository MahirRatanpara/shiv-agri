const mongoose = require('mongoose');
const Project = require('../models/Project');
const logger = require('../utils/logger');

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:8081';
const MEDIA_SERVICE_PUBLIC_URL = process.env.MEDIA_SERVICE_PUBLIC_URL || MEDIA_SERVICE_URL;
const MAX_FILES_PER_UPLOAD = 5;

/**
 * Manually-uploaded farm reports (images + PDFs). Used by admin/manager to
 * attach third-party lab reports or hand-written notes alongside the auto-
 * linked soil/water/fertilizer PDFs. Mirrors the prescription upload flow.
 */
class FarmManualReportService {
  async uploadFile(projectId, file, user, meta = {}) {
    const start = Date.now();
    logger.info(
      `[FarmManualReport] Upload start: project=${projectId}, file=${file.originalname}, size=${file.size}, mime=${file.mimetype}, user=${user._id}`
    );

    const initiateRes = await fetch(`${MEDIA_SERVICE_URL}/api/v1/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        altText: `Farm report for project ${projectId}`,
        tags: ['manual-report', `project-${projectId}`]
      })
    });

    if (!initiateRes.ok) {
      const text = await initiateRes.text();
      logger.error(`[FarmManualReport] Initiate failed: status=${initiateRes.status}, body=${text}`);
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
      logger.error(`[FarmManualReport] Complete failed: id=${initiated.id}, status=${uploadRes.status}, body=${text}`);
      throw { status: 502, message: 'Upload failed. Please try again.' };
    }

    const completed = await uploadRes.json();
    logger.info(`[FarmManualReport] Upload complete: id=${completed.id}, durationMs=${Date.now() - start}`);

    const fullUrl = completed.contentUrl?.startsWith('http')
      ? completed.contentUrl
      : `${MEDIA_SERVICE_PUBLIC_URL}${completed.contentUrl}`;

    const allowedTypes = new Set(['soil', 'water', 'fertilizer', 'other']);
    const sampleType = allowedTypes.has(String(meta.sampleType || '').toLowerCase())
      ? String(meta.sampleType).toLowerCase()
      : 'other';

    const ref = {
      _id: new mongoose.Types.ObjectId(),
      mediaId: completed.id,
      url: fullUrl,
      mimeType: completed.mimeType,
      sizeBytes: completed.sizeBytes,
      fileName: file.originalname,
      title: (meta.title || '').trim() || file.originalname,
      notes: (meta.notes || '').trim(),
      sampleType,
      status: 'ACTIVE',
      uploadedBy: user._id,
      uploadedByName: user.name || user.email,
      uploadedAt: new Date(completed.createdAt || Date.now())
    };

    await Project.updateOne(
      { _id: projectId },
      { $push: { manualReports: ref }, $set: { updatedAt: new Date() } }
    );

    return ref;
  }

  async listReports(projectId) {
    const project = await Project.findById(projectId).select('manualReports').lean();
    if (!project) return [];
    return (project.manualReports || [])
      .filter((m) => m.status !== 'DELETED')
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  /**
   * Soft-delete a manual report. Admin can delete any item; manager can
   * delete only items they uploaded themselves.
   */
  async deleteReport(projectId, reportId, user, { allowAnyUploader = false } = {}) {
    const project = await Project.findOne(
      { _id: projectId, 'manualReports._id': reportId },
      { 'manualReports.$': 1 }
    ).lean();

    if (!project || !project.manualReports?.[0]) {
      throw { status: 404, message: 'Report not found on this project' };
    }

    const report = project.manualReports[0];

    if (!allowAnyUploader) {
      const uploader = report.uploadedBy?.toString();
      if (!uploader || uploader !== user._id.toString()) {
        throw {
          status: 403,
          message: 'You may only delete reports that you uploaded.'
        };
      }
    }

    const result = await Project.updateOne(
      { _id: projectId, 'manualReports._id': reportId },
      {
        $set: {
          'manualReports.$.status': 'DELETED',
          'manualReports.$.deletedAt': new Date(),
          'manualReports.$.deletedBy': user._id,
          updatedAt: new Date()
        }
      }
    );

    if (!result.matchedCount) {
      throw { status: 404, message: 'Report not found on this project' };
    }

    logger.info(`[FarmManualReport] Report soft-deleted: project=${projectId}, reportId=${reportId}, by=${user._id}`);
    return { success: true, mediaId: report.mediaId };
  }

  getMaxFilesPerUpload() {
    return MAX_FILES_PER_UPLOAD;
  }
}

module.exports = new FarmManualReportService();

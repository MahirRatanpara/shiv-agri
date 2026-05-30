const Project = require('../models/Project');
const farmMediaService = require('../services/farmMediaService');
const logger = require('../utils/logger');

const ALLOWED_MIME_PATTERN = /^(image|video)\//i;

const setQuotaHeaders = (res, snapshot) => {
  res.set('X-Media-Quota-Used', String(snapshot.used));
  res.set('X-Media-Quota-Limit', String(snapshot.limit));
  res.set('X-Media-Quota-Resets-At', snapshot.resetsAt);
};

exports.uploadMedia = async (req, res) => {
  const projectId = req.params.id;
  try {
    logger.info(`[FarmMedia] POST /projects/${projectId}/media by user=${req.user._id}`);

    const project = await Project.findById(projectId).select('_id name submittedBy clientId status isArchived');
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (project.isArchived) {
      return res.status(409).json({
        success: false,
        error: 'Project archived',
        message: 'This farm has been archived. Uploads are no longer accepted.'
      });
    }

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    const maxBatch = farmMediaService.getMaxFilesPerUpload();
    if (files.length > maxBatch) {
      return res.status(400).json({
        success: false,
        error: `Cannot upload more than ${maxBatch} files at once`
      });
    }

    for (const file of files) {
      if (!ALLOWED_MIME_PATTERN.test(file.mimetype)) {
        return res.status(415).json({
          success: false,
          error: `Unsupported file type: ${file.originalname} (${file.mimetype})`
        });
      }
    }

    const reservation = await farmMediaService.reserveQuota(projectId, files.length);

    if (!reservation.reserved) {
      const quota = reservation.snapshot;
      const remaining = Math.max(quota.limit - quota.used, 0);
      logger.warn(`[FarmMedia] Quota exhausted for project=${projectId}: used=${quota.used}, limit=${quota.limit}, requested=${files.length}`);
      setQuotaHeaders(res, quota);
      return res.status(429).json({
        success: false,
        error: 'Weekly upload limit reached',
        message: remaining > 0
          ? `Only ${remaining} more upload(s) allowed this week. Resets ${new Date(quota.resetsAt).toUTCString()}.`
          : `Weekly limit of ${quota.limit} uploads reached. Resets ${new Date(quota.resetsAt).toUTCString()}.`,
        quota
      });
    }

    const uploaded = [];
    const failures = [];

    for (const file of files) {
      try {
        const ref = await farmMediaService.uploadMedia(projectId, file, req.user);
        uploaded.push(ref);
      } catch (err) {
        const status = err?.status || 500;
        const message = err?.message || 'Upload failed';
        logger.error(`[FarmMedia] File upload failed: file=${file.originalname}, status=${status}, message=${message}`);
        failures.push({ filename: file.originalname, status, message });
      }
    }

    if (failures.length) {
      await farmMediaService.releaseQuota(projectId, failures.length);
    }

    if (uploaded.length) {
      await farmMediaService.notifyOnUpload(project, uploaded.length, req.user);
    }

    const snapshot = await farmMediaService.getQuotaSnapshot(projectId);
    setQuotaHeaders(res, snapshot);

    const responseStatus = uploaded.length === 0
      ? 502
      : (failures.length ? 207 : 201);

    return res.status(responseStatus).json({
      success: uploaded.length > 0,
      uploaded,
      failures,
      quota: snapshot
    });
  } catch (error) {
    logger.error(`[FarmMedia] uploadMedia error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to upload media',
      message: error.message
    });
  }
};

exports.getQuota = async (req, res) => {
  const projectId = req.params.id;
  try {
    const project = await Project.exists({ _id: projectId });
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const snapshot = await farmMediaService.getQuotaSnapshot(projectId);
    setQuotaHeaders(res, snapshot);
    return res.status(200).json({ success: true, quota: snapshot });
  } catch (error) {
    logger.error(`[FarmMedia] getQuota error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch quota',
      message: error.message
    });
  }
};

/**
 * Default media list endpoint. Returns unattended media (newly uploaded,
 * not yet acknowledged) plus a count of attended items so the UI can
 * surface the "View attended photos" affordance without loading them.
 */
exports.listMedia = async (req, res) => {
  const projectId = req.params.id;
  try {
    const result = await farmMediaService.listUnattendedMedia(projectId);
    const snapshot = await farmMediaService.getQuotaSnapshot(projectId);
    setQuotaHeaders(res, snapshot);

    return res.status(200).json({
      success: true,
      items: result.unattended,
      attendedTotal: result.attendedTotal,
      total: result.total,
      quota: snapshot
    });
  } catch (error) {
    logger.error(`[FarmMedia] listMedia error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch media',
      message: error.message
    });
  }
};

/**
 * Paginated list of attended media. Loaded only when the user opens the
 * attended-photos drawer in the UI, so the tab opens fast.
 *
 * Route stays at /:id/media/older to preserve existing API surface for the
 * frontend; semantically it now means "attended" rather than "older".
 */
exports.listOlderMedia = async (req, res) => {
  const projectId = req.params.id;
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 60);

    const result = await farmMediaService.listAttendedMedia(projectId, page, limit);

    return res.status(200).json({
      success: true,
      items: result.items,
      pagination: {
        page: result.page,
        limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    logger.error(`[FarmMedia] listOlderMedia error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch attended media',
      message: error.message
    });
  }
};

/**
 * Mark every unattended media item on the project as attended in one shot.
 * Same role gate as the per-item endpoint (admin / farm.projects.approve).
 */
exports.markAllAttended = async (req, res) => {
  const projectId = req.params.id;
  try {
    logger.info(`[FarmMedia] PATCH /projects/${projectId}/media/attend-all by user=${req.user._id}`);
    const result = await farmMediaService.markAllAttended(projectId, req.user);
    return res.status(200).json({
      success: true,
      attendedCount: result.attendedCount,
      message: result.attendedCount === 0
        ? 'No unattended photos to mark.'
        : `${result.attendedCount} photo${result.attendedCount === 1 ? '' : 's'} marked as attended.`
    });
  } catch (error) {
    const status = error?.status || 500;
    logger.error(`[FarmMedia] markAllAttended error: ${error.message}`);
    return res.status(status).json({
      success: false,
      error: 'Failed to mark all as attended',
      message: error.message || 'Unknown error'
    });
  }
};

/**
 * Mark a media item as attended. Admin or farm manager only — enforced at
 * the route layer via requireAttendAccess.
 */
exports.markAttended = async (req, res) => {
  const projectId = req.params.id;
  const mediaId = req.params.mediaId;
  try {
    logger.info(`[FarmMedia] PATCH /projects/${projectId}/media/${mediaId}/attend by user=${req.user._id}`);
    const result = await farmMediaService.markAttended(projectId, mediaId, req.user);
    return res.status(200).json({
      success: true,
      alreadyAttended: !!result.alreadyAttended,
      message: result.alreadyAttended ? 'Already attended' : 'Marked as attended'
    });
  } catch (error) {
    const status = error?.status || 500;
    logger.error(`[FarmMedia] markAttended error: ${error.message}`);
    return res.status(status).json({
      success: false,
      error: 'Failed to mark as attended',
      message: error.message || 'Unknown error'
    });
  }
};

/**
 * Soft-delete a media item. Admin-only; route enforces authorization.
 */
exports.deleteMedia = async (req, res) => {
  const projectId = req.params.id;
  const mediaId = req.params.mediaId;
  try {
    logger.info(`[FarmMedia] DELETE /projects/${projectId}/media/${mediaId} by user=${req.user._id}`);

    await farmMediaService.deleteMedia(projectId, mediaId, req.user);
    return res.status(200).json({
      success: true,
      message: 'Media removed'
    });
  } catch (error) {
    const status = error?.status || 500;
    logger.error(`[FarmMedia] deleteMedia error: ${error.message}`);
    return res.status(status).json({
      success: false,
      error: 'Failed to delete media',
      message: error.message || 'Unknown error'
    });
  }
};

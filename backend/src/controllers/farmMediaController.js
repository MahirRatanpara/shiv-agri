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

    const project = await Project.findById(projectId).select('_id name submittedBy clientId status');
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
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

    let snapshot = await farmMediaService.getQuotaSnapshot(projectId);

    if (snapshot.used + files.length > snapshot.limit) {
      const remaining = Math.max(snapshot.limit - snapshot.used, 0);
      logger.warn(`[FarmMedia] Quota exceeded for project=${projectId}: used=${snapshot.used}, limit=${snapshot.limit}, requested=${files.length}`);
      setQuotaHeaders(res, snapshot);
      return res.status(429).json({
        success: false,
        error: 'Weekly upload limit reached',
        message: remaining > 0
          ? `Only ${remaining} more upload(s) allowed this week. Resets ${new Date(snapshot.resetsAt).toUTCString()}.`
          : `Weekly limit of ${snapshot.limit} uploads reached. Resets ${new Date(snapshot.resetsAt).toUTCString()}.`,
        quota: snapshot
      });
    }

    const uploaded = [];
    const failures = [];

    for (const file of files) {
      try {
        const ref = await farmMediaService.uploadMedia(projectId, file, req.user);
        await farmMediaService.incrementQuota(projectId);
        uploaded.push(ref);
      } catch (err) {
        const status = err?.status || 500;
        const message = err?.message || 'Upload failed';
        logger.error(`[FarmMedia] File upload failed: file=${file.originalname}, status=${status}, message=${message}`);
        failures.push({ filename: file.originalname, status, message });
      }
    }

    if (uploaded.length) {
      await farmMediaService.notifyOwner(project, uploaded.length, req.user);
    }

    snapshot = await farmMediaService.getQuotaSnapshot(projectId);
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

exports.listMedia = async (req, res) => {
  const projectId = req.params.id;
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const result = await farmMediaService.listMedia(projectId, page, limit);
    const snapshot = await farmMediaService.getQuotaSnapshot(projectId);
    setQuotaHeaders(res, snapshot);

    return res.status(200).json({
      success: true,
      items: result.items,
      pagination: {
        page: result.page,
        limit,
        total: result.total,
        totalPages: result.totalPages
      },
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

const Project = require('../models/Project');
const farmDesignService = require('../services/farmDesignService');
const logger = require('../utils/logger');

exports.uploadDesigns = async (req, res) => {
  const projectId = req.params.id;
  try {
    logger.info(`[FarmDesign] POST /projects/${projectId}/designs by user=${req.user._id}`);

    const project = await Project.findById(projectId)
      .select('_id name submittedBy clientId status')
      .lean();
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Designs are available for every farm type (normal farm, landscaping,
    // etc.) — they are no longer an exclusive landscaping feature.

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    const maxBatch = farmDesignService.getMaxFilesPerUpload();
    if (files.length > maxBatch) {
      return res.status(400).json({
        success: false,
        error: `Cannot upload more than ${maxBatch} files at once`
      });
    }

    // Any file type is accepted for designs — no MIME restriction.

    const meta = {
      title: req.body?.title,
      notes: req.body?.notes
    };

    const uploaded = [];
    const failures = [];

    for (const file of files) {
      try {
        const ref = await farmDesignService.uploadDesign(projectId, file, req.user, meta);
        uploaded.push(ref);
      } catch (err) {
        const status = err?.status || 500;
        const message = err?.message || 'Upload failed';
        logger.error(`[FarmDesign] File upload failed: file=${file.originalname}, status=${status}, message=${message}`);
        failures.push({ filename: file.originalname, status, message });
      }
    }

    if (uploaded.length) {
      await farmDesignService.notifyOwner(project, uploaded.length, req.user);
    }

    const responseStatus = uploaded.length === 0
      ? 502
      : (failures.length ? 207 : 201);

    return res.status(responseStatus).json({
      success: uploaded.length > 0,
      uploaded,
      failures
    });
  } catch (error) {
    logger.error(`[FarmDesign] uploadDesigns error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to upload designs',
      message: error.message
    });
  }
};

exports.listDesigns = async (req, res) => {
  const projectId = req.params.id;
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const result = await farmDesignService.listDesigns(projectId, page, limit);

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
    logger.error(`[FarmDesign] listDesigns error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch designs',
      message: error.message
    });
  }
};

/**
 * Soft-delete a single landscaping design. Admin can delete any design;
 * manager may delete only items they uploaded. The route enforces basic
 * manager/admin gating; per-uploader checks happen here.
 */
exports.deleteDesign = async (req, res) => {
  const projectId = req.params.id;
  const designId = req.params.designId;
  try {
    logger.info(`[FarmDesign] DELETE /projects/${projectId}/designs/${designId} by user=${req.user._id}`);

    const isAdmin = req.user?.role === 'admin';
    const result = await farmDesignService.deleteDesign(projectId, designId, req.user, {
      allowAnyUploader: isAdmin
    });

    return res.status(200).json({
      success: true,
      message: 'Design removed',
      mediaId: result.mediaId
    });
  } catch (error) {
    const status = error?.status || 500;
    logger.error(`[FarmDesign] deleteDesign error: ${error.message}`);
    return res.status(status).json({
      success: false,
      error: 'Failed to delete design',
      message: error.message || 'Unknown error'
    });
  }
};


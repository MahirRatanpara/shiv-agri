const Project = require('../models/Project');
const farmPrescriptionService = require('../services/farmPrescriptionService');
const pdfGenerator = require('../services/pdfGenerator');
const logger = require('../utils/logger');

const ALLOWED_MIME_PATTERN = /^(image\/.*|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword|text\/(plain|markdown))$/i;

exports.uploadPrescriptions = async (req, res) => {
  const projectId = req.params.id;
  try {
    logger.info(`[FarmPrescription] POST /projects/${projectId}/prescriptions by user=${req.user._id}`);

    const project = await Project.findById(projectId)
      .select('_id name submittedBy clientId status')
      .lean();
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const files = req.files || [];

    const meta = {
      title: req.body?.title,
      notes: req.body?.notes
    };

    if (!files.length) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    const maxBatch = farmPrescriptionService.getMaxFilesPerUpload();
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

    const uploaded = [];
    const failures = [];

    for (const file of files) {
      try {
        const ref = await farmPrescriptionService.uploadFile(projectId, file, req.user, meta);
        uploaded.push(ref);
      } catch (err) {
        const status = err?.status || 500;
        const message = err?.message || 'Upload failed';
        logger.error(`[FarmPrescription] File upload failed: file=${file.originalname}, status=${status}, message=${message}`);
        failures.push({ filename: file.originalname, status, message });
      }
    }

    if (uploaded.length) {
      await farmPrescriptionService.notifyOwner(project, uploaded.length, req.user);
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
    logger.error(`[FarmPrescription] uploadPrescriptions error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to upload prescriptions',
      message: error.message
    });
  }
};

exports.addTextPrescription = async (req, res) => {
  const projectId = req.params.id;
  try {
    logger.info(`[FarmPrescription] POST /projects/${projectId}/prescriptions/text by user=${req.user._id}`);

    const project = await Project.findById(projectId)
      .select('_id name submittedBy clientId')
      .lean();
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const ref = await farmPrescriptionService.addText(projectId, req.body || {}, req.user);
    await farmPrescriptionService.notifyOwner(project, 1, req.user, 'prescription');

    return res.status(201).json({ success: true, prescription: ref });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ success: false, error: error.message });
    }
    logger.error(`[FarmPrescription] addTextPrescription error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to add prescription',
      message: error.message
    });
  }
};

exports.addManualPrescription = async (req, res) => {
  const projectId = req.params.id;
  try {
    logger.info(`[FarmPrescription] POST /projects/${projectId}/prescriptions/manual by user=${req.user._id}`);

    const project = await Project.findById(projectId)
      .select('_id name submittedBy clientId')
      .lean();
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const ref = await farmPrescriptionService.addManual(projectId, req.body || {}, req.user);
    await farmPrescriptionService.notifyOwner(project, 1, req.user, 'prescription');

    return res.status(201).json({ success: true, prescription: ref });
  } catch (error) {
    logger.error(`[FarmPrescription] addManualPrescription error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to add prescription',
      message: error.message
    });
  }
};

exports.addStructuredPrescription = async (req, res) => {
  const projectId = req.params.id;
  try {
    logger.info(`[FarmPrescription] POST /projects/${projectId}/prescriptions/structured by user=${req.user._id}`);

    const project = await Project.findById(projectId)
      .select('_id name submittedBy clientId')
      .lean();
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    let structuredPayload = {};
    if (req.body?.structured) {
      try {
        structuredPayload = typeof req.body.structured === 'string'
          ? JSON.parse(req.body.structured)
          : req.body.structured;
      } catch (err) {
        return res.status(400).json({ success: false, error: 'Invalid structured prescription payload' });
      }
    }

    const files = req.files || [];
    const maxBatch = farmPrescriptionService.getMaxFilesPerUpload();
    if (files.length > maxBatch) {
      return res.status(400).json({
        success: false,
        error: `Cannot attach more than ${maxBatch} images per prescription`
      });
    }

    const ref = await farmPrescriptionService.addStructured(
      projectId,
      {
        title: req.body?.title,
        notes: req.body?.notes,
        structured: structuredPayload
      },
      files,
      req.user
    );

    await farmPrescriptionService.notifyOwner(project, 1, req.user, 'prescription');

    return res.status(201).json({ success: true, prescription: ref });
  } catch (error) {
    const status = error?.status || 500;
    if (status !== 500) {
      return res.status(status).json({ success: false, error: error.message });
    }
    logger.error(`[FarmPrescription] addStructuredPrescription error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to add prescription',
      message: error.message
    });
  }
};

exports.downloadPrescriptionPdf = async (req, res) => {
  const { id: projectId, prescriptionId } = req.params;
  try {
    logger.info(`[FarmPrescription] GET /projects/${projectId}/prescriptions/${prescriptionId}/pdf by user=${req.user._id}`);

    const data = await farmPrescriptionService.getPrescriptionById(projectId, prescriptionId);
    if (!data || !data.prescription) {
      return res.status(404).json({ success: false, error: 'Prescription not found' });
    }

    if (data.prescription.docType !== 'structured') {
      return res.status(400).json({ success: false, error: 'PDF is only available for structured prescriptions' });
    }

    const pdfBuffer = await pdfGenerator.generatePrescriptionPDF(data.prescription, data.project);

    const safeName = (data.prescription.title || 'prescription')
      .replace(/[^a-z0-9\-_ ]+/gi, '')
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'prescription';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    logger.error(`[FarmPrescription] downloadPrescriptionPdf error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to generate prescription PDF',
      message: error.message
    });
  }
};

/**
 * Soft-delete a prescription. Admin can delete any prescription; manager
 * may delete only items they uploaded.
 */
exports.deletePrescription = async (req, res) => {
  const projectId = req.params.id;
  const prescriptionId = req.params.prescriptionId;
  try {
    logger.info(`[FarmPrescription] DELETE /projects/${projectId}/prescriptions/${prescriptionId} by user=${req.user._id}`);

    const isAdmin = req.user?.role === 'admin';
    const result = await farmPrescriptionService.deletePrescription(
      projectId,
      prescriptionId,
      req.user,
      { allowAnyUploader: isAdmin }
    );

    return res.status(200).json({
      success: true,
      message: 'Prescription removed',
      mediaId: result.mediaId,
      attachedMediaIds: result.attachedMediaIds
    });
  } catch (error) {
    const status = error?.status || 500;
    logger.error(`[FarmPrescription] deletePrescription error: ${error.message}`);
    return res.status(status).json({
      success: false,
      error: 'Failed to delete prescription',
      message: error.message || 'Unknown error'
    });
  }
};

exports.listPrescriptions = async (req, res) => {
  const projectId = req.params.id;
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const result = await farmPrescriptionService.listPrescriptions(projectId, page, limit);

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
    logger.error(`[FarmPrescription] listPrescriptions error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch prescriptions',
      message: error.message
    });
  }
};

const Project = require('../models/Project');
const SoilSample = require('../models/SoilSample');
const WaterSample = require('../models/WaterSample');
const FertilizerSample = require('../models/FertilizerSample');
const pdfGenerator = require('../services/pdfGenerator');
const farmManualReportService = require('../services/farmManualReportService');
const { addClassifications } = require('../utils/waterClassification');
const logger = require('../utils/logger');

const SAMPLE_MODELS = {
  soil: SoilSample,
  water: WaterSample,
  fertilizer: FertilizerSample
};

const REPORT_LABELS = {
  soil: 'soil',
  water: 'water',
  fertilizer: 'fertilizer'
};

/**
 * GET /api/projects/:id/reports
 * List all lab reports linked to this farm, newest first.
 */
exports.listReports = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id)
      .select('reports name')
      .lean();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const reports = (project.reports || [])
      .slice()
      .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt))
      .map((r) => ({
        reportId: r._id?.toString?.() || r._id,
        sampleType: r.sampleType,
        sampleId: r.sampleId?.toString?.() || r.sampleId,
        sampleModel: r.sampleModel,
        sessionId: r.sessionId?.toString?.() || r.sessionId,
        sampleNumber: r.sampleNumber || '',
        farmerName: r.farmerName || '',
        farmsName: r.farmsName || '',
        mobileNo: r.mobileNo || '',
        cropName: r.cropName || '',
        fertilizerType: r.fertilizerType || '',
        sessionDate: r.sessionDate || '',
        generatedAt: r.generatedAt,
        generatedByName: r.generatedByName || ''
      }));

    return res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    logger.error(`[FarmReports] listReports failed: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ error: 'Failed to load farm reports' });
  }
};

/**
 * Internal: load a report entry from the project + the underlying sample.
 * Disposition can be 'inline' (preview overlay) or 'attachment' (download).
 */
async function streamReportPdf(req, res, disposition) {
  const { id, reportId } = req.params;

  const project = await Project.findById(id).select('reports name').lean();
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const report = (project.reports || []).find(
    (r) => (r._id?.toString?.() || r._id) === reportId
  );
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const SampleModel = SAMPLE_MODELS[report.sampleType];
  if (!SampleModel) {
    return res.status(400).json({ error: `Unsupported report type: ${report.sampleType}` });
  }

  const sample = await SampleModel.findById(report.sampleId);
  if (!sample) {
    return res.status(404).json({ error: 'Underlying sample no longer exists' });
  }

  let pdfBuffer;
  if (report.sampleType === 'soil') {
    pdfBuffer = await pdfGenerator.generateSinglePDF(sample);
  } else if (report.sampleType === 'water') {
    pdfBuffer = await pdfGenerator.generateWaterPDF(addClassifications(sample.toObject()));
  } else if (report.sampleType === 'fertilizer') {
    pdfBuffer = await pdfGenerator.generateFertilizerPDF(sample);
  }

  const farmerName = report.farmerName || 'Unknown';
  const sampleNumber = report.sampleNumber || '';
  const baseLabel = REPORT_LABELS[report.sampleType];
  const fileName = sampleNumber
    ? `${baseLabel}-report-${sampleNumber}-${farmerName}.pdf`
    : `${baseLabel}-report-${farmerName}.pdf`;
  const safeFile = fileName.replace(/\s+/g, '_');
  const encodedFileName = encodeURIComponent(safeFile);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="report.pdf"; filename*=UTF-8''${encodedFileName}`
  );
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.send(pdfBuffer);
}

/**
 * GET /api/projects/:id/reports/:reportId/pdf
 * Inline PDF for in-app overlay viewer.
 */
exports.viewReportPdf = async (req, res) => {
  try {
    return await streamReportPdf(req, res, 'inline');
  } catch (error) {
    logger.error(`[FarmReports] viewReportPdf failed: ${error.message}`, { stack: error.stack });
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to generate PDF for report' });
    }
    return res.end();
  }
};

/**
 * GET /api/projects/:id/reports/:reportId/pdf/download
 * Attachment-disposition PDF for explicit download.
 */
exports.downloadReportPdf = async (req, res) => {
  try {
    return await streamReportPdf(req, res, 'attachment');
  } catch (error) {
    logger.error(`[FarmReports] downloadReportPdf failed: ${error.message}`, { stack: error.stack });
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to generate PDF for report' });
    }
    return res.end();
  }
};

// ========================
// Manually-uploaded farm reports (admin / manager upload, owner read-only)
// ========================

const MANUAL_REPORT_MIME_PATTERN = /^(image\/.*|application\/pdf)$/i;

/**
 * GET /api/projects/:id/manual-reports
 * List all manually-uploaded reports on the project.
 */
exports.listManualReports = async (req, res) => {
  try {
    const items = await farmManualReportService.listReports(req.params.id);
    return res.json({ success: true, count: items.length, items });
  } catch (error) {
    logger.error(`[FarmManualReport] list failed: ${error.message}`);
    return res.status(500).json({ error: 'Failed to load manual reports' });
  }
};

/**
 * POST /api/projects/:id/manual-reports
 * Admin/manager attaches up to 5 image or PDF files. Optional body fields:
 *   title, notes, sampleType (soil|water|fertilizer|other)
 */
exports.uploadManualReports = async (req, res) => {
  const projectId = req.params.id;
  try {
    const project = await Project.findById(projectId).select('_id name isArchived').lean();
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

    const maxBatch = farmManualReportService.getMaxFilesPerUpload();
    if (files.length > maxBatch) {
      return res.status(400).json({
        success: false,
        error: `Cannot upload more than ${maxBatch} files at once`
      });
    }

    for (const file of files) {
      if (!MANUAL_REPORT_MIME_PATTERN.test(file.mimetype)) {
        return res.status(415).json({
          success: false,
          error: `Unsupported file type: ${file.originalname} (${file.mimetype})`
        });
      }
    }

    const meta = {
      title: req.body?.title,
      notes: req.body?.notes,
      sampleType: req.body?.sampleType
    };

    const uploaded = [];
    const failures = [];

    for (const file of files) {
      try {
        const ref = await farmManualReportService.uploadFile(projectId, file, req.user, meta);
        uploaded.push(ref);
      } catch (err) {
        const status = err?.status || 500;
        const message = err?.message || 'Upload failed';
        logger.error(`[FarmManualReport] File failed: file=${file.originalname}, status=${status}, message=${message}`);
        failures.push({ filename: file.originalname, status, message });
      }
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
    logger.error(`[FarmManualReport] upload error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to upload manual reports',
      message: error.message
    });
  }
};

/**
 * DELETE /api/projects/:id/manual-reports/:reportId
 * Admin can delete any item; manager can delete only items they uploaded.
 */
exports.deleteManualReport = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const result = await farmManualReportService.deleteReport(
      req.params.id,
      req.params.reportId,
      req.user,
      { allowAnyUploader: isAdmin }
    );
    return res.json({ success: true, mediaId: result.mediaId });
  } catch (error) {
    const status = error?.status || 500;
    logger.error(`[FarmManualReport] delete failed: ${error.message}`);
    return res.status(status).json({
      success: false,
      error: 'Failed to delete manual report',
      message: error.message || 'Unknown error'
    });
  }
};

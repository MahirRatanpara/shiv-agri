const Project = require('../models/Project');
const SoilSample = require('../models/SoilSample');
const WaterSample = require('../models/WaterSample');
const FertilizerSample = require('../models/FertilizerSample');
const pdfGenerator = require('../services/pdfGenerator');
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

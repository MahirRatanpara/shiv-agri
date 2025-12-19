const express = require('express');
const router = express.Router();
const SoilSample = require('../models/SoilSample');
const SoilSession = require('../models/SoilSession');
const pdfGeneratorService = require('../services/pdfGenerator');
const logger = require('../utils/logger');

/**
 * Generate PDF for a single soil sample
 * POST /api/pdf/sample/:sampleId
 */
router.post('/sample/:sampleId', async (req, res) => {
  try {
    const { sampleId } = req.params;

    logger.info(`PDF generation requested for sample: ${sampleId}`);

    // Fetch sample data
    const sample = await SoilSample.findById(sampleId);
    if (!sample) {
      logger.warn(`Sample not found: ${sampleId}`);
      return res.status(404).json({ error: 'Sample not found' });
    }

    // Generate PDF
    const pdfBuffer = await pdfGeneratorService.generateSinglePDF(sample);

    // Set response headers
    const fileName = `Soil_Report_${sample.farmersName?.replace(/\s+/g, '_') || 'Unknown'}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    logger.info(`PDF generated and sent for sample: ${sampleId}`);
    res.send(pdfBuffer);

  } catch (error) {
    logger.error(`Error generating PDF for sample: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

/**
 * Generate PDF preview for a single soil sample (inline display)
 * GET /api/pdf/sample/:sampleId/preview
 */
router.get('/sample/:sampleId/preview', async (req, res) => {
  try {
    const { sampleId } = req.params;

    logger.info(`PDF preview requested for sample: ${sampleId}`);

    const sample = await SoilSample.findById(sampleId);
    if (!sample) {
      logger.warn(`Sample not found: ${sampleId}`);
      return res.status(404).json({ error: 'Sample not found' });
    }

    const pdfBuffer = await pdfGeneratorService.generateSinglePDF(sample);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Length', pdfBuffer.length);

    logger.info(`PDF preview generated for sample: ${sampleId}`);
    res.send(pdfBuffer);

  } catch (error) {
    logger.error(`Error generating PDF preview: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate PDF preview' });
  }
});

/**
 * Generate bulk PDFs for a session (returns individual PDFs as ZIP)
 * POST /api/pdf/session/:sessionId/bulk
 */
router.post('/session/:sessionId/bulk', async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info(`Bulk PDF generation requested for session: ${sessionId}`);

    // Fetch session and samples
    const session = await SoilSession.findById(sessionId);
    if (!session) {
      logger.warn(`Session not found: ${sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const samples = await SoilSample.find({ sessionId }).sort({ createdAt: 1 });
    if (samples.length === 0) {
      logger.warn(`No samples found for session: ${sessionId}`);
      return res.status(404).json({ error: 'No samples found in this session' });
    }

    // Generate PDFs
    const pdfs = await pdfGeneratorService.generateBulkPDFs(samples);

    // For now, return the array of PDFs as JSON with base64 encoding
    // In production, you might want to create a ZIP file
    const result = pdfs.map(pdf => ({
      sampleId: pdf.sampleId,
      farmerName: pdf.farmerName,
      pdf: Buffer.from(pdf.buffer).toString('base64')
    }));

    logger.info(`Bulk PDFs generated for session: ${sessionId}, count: ${pdfs.length}`);
    res.json({
      sessionId,
      count: pdfs.length,
      pdfs: result
    });

  } catch (error) {
    logger.error(`Error generating bulk PDFs: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate bulk PDFs' });
  }
});

/**
 * Generate combined PDF for all samples in a session
 * POST /api/pdf/session/:sessionId/combined
 */
router.post('/session/:sessionId/combined', async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info(`Combined PDF generation requested for session: ${sessionId}`);

    // Fetch session and samples
    const session = await SoilSession.findById(sessionId);
    if (!session) {
      logger.warn(`Session not found: ${sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const samples = await SoilSample.find({ sessionId }).sort({ createdAt: 1 });
    if (samples.length === 0) {
      logger.warn(`No samples found for session: ${sessionId}`);
      return res.status(404).json({ error: 'No samples found in this session' });
    }

    // Generate combined PDF
    const pdfBuffer = await pdfGeneratorService.generateCombinedPDF(samples);

    // Set response headers
    const fileName = `Soil_Reports_Combined_${session.date}_v${session.version}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    logger.info(`Combined PDF generated for session: ${sessionId}, samples: ${samples.length}`);
    res.send(pdfBuffer);

  } catch (error) {
    logger.error(`Error generating combined PDF: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate combined PDF' });
  }
});

/**
 * Generate PDFs for multiple samples by IDs
 * POST /api/pdf/samples/multiple
 * Body: { sampleIds: ["id1", "id2", ...], combined: boolean }
 */
router.post('/samples/multiple', async (req, res) => {
  try {
    const { sampleIds, combined = false } = req.body;

    if (!sampleIds || !Array.isArray(sampleIds) || sampleIds.length === 0) {
      return res.status(400).json({ error: 'Sample IDs array is required' });
    }

    logger.info(`Multiple PDF generation requested for ${sampleIds.length} samples, combined: ${combined}`);

    // Fetch samples
    const samples = await SoilSample.find({ _id: { $in: sampleIds } });
    if (samples.length === 0) {
      logger.warn(`No samples found for provided IDs`);
      return res.status(404).json({ error: 'No samples found' });
    }

    if (combined) {
      // Generate combined PDF
      const pdfBuffer = await pdfGeneratorService.generateCombinedPDF(samples);

      const fileName = `Soil_Reports_Combined_${new Date().toISOString().split('T')[0]}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      logger.info(`Combined PDF generated for ${samples.length} samples`);
      res.send(pdfBuffer);

    } else {
      // Generate bulk PDFs
      const pdfs = await pdfGeneratorService.generateBulkPDFs(samples);

      const result = pdfs.map(pdf => ({
        sampleId: pdf.sampleId,
        farmerName: pdf.farmerName,
        pdf: Buffer.from(pdf.buffer).toString('base64')
      }));

      logger.info(`Bulk PDFs generated for ${pdfs.length} samples`);
      res.json({
        count: pdfs.length,
        pdfs: result
      });
    }

  } catch (error) {
    logger.error(`Error generating PDFs for multiple samples: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate PDFs' });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'PDF Generation API' });
});

module.exports = router;

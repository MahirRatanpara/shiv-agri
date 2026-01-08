const express = require('express');
const router = express.Router();
const WaterSession = require('../models/WaterSession');
const WaterSample = require('../models/WaterSample');
const { addClassifications } = require('../utils/waterClassification');
const { authenticate, requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('Water Testing routes initialized - Using referenced mode with separate collections');
logger.info('Water classification system enabled');

// All routes require authentication
router.use(authenticate);

// Get all sessions with their samples
router.get('/sessions', requirePermission('water.sessions.view'), async (req, res) => {
  try {
    const sessions = await WaterSession.find().sort({ date: -1, version: -1 });

    const sessionsWithSamples = [];
    for (const session of sessions) {
      const sessionObj = session.toObject();
      const samples = await WaterSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
      sessionObj.data = samples;
      sessionsWithSamples.push(sessionObj);
    }

    logger.info(`Retrieved ${sessionsWithSamples.length} water sessions with samples`);
    res.json(sessionsWithSamples);
  } catch (error) {
    logger.error(`Error fetching water sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get sessions by date with their samples
router.get('/sessions/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const sessions = await WaterSession.find({ date }).sort({ version: -1 });

    const sessionsWithSamples = [];
    for (const session of sessions) {
      const sessionObj = session.toObject();
      const samples = await WaterSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
      sessionObj.data = samples;
      sessionsWithSamples.push(sessionObj);
    }

    logger.info(`Retrieved ${sessionsWithSamples.length} water sessions for date ${date}`);
    res.json(sessionsWithSamples);
  } catch (error) {
    logger.error(`Error fetching water sessions by date: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get session count for a specific date
router.get('/sessions/count/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const count = await WaterSession.countDocuments({ date });
    logger.debug(`Water session count for ${date}: ${count}`);
    res.json({ date, count });
  } catch (error) {
    logger.error(`Error counting water sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to count sessions' });
  }
});

// Get a specific session by ID with its samples
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await WaterSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Water session not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const samples = await WaterSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
    logger.debug(`Retrieved water session ${req.params.id} with ${samples.length} samples`);

    const sessionObj = session.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error fetching water session ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Create a new session
router.post('/sessions', async (req, res) => {
  try {
    const { date, version, startTime } = req.body;

    const existingSession = await WaterSession.findOne({ date, version });
    if (existingSession) {
      logger.warn(`Water session already exists for ${date} v${version}`);
      return res.status(409).json({ error: 'Session with this date and version already exists' });
    }

    const session = new WaterSession({
      date,
      version,
      startTime: startTime || new Date(),
      status: 'active',
      sampleCount: 0,
      lastActivity: new Date()
    });

    const savedSession = await session.save();
    logger.info(`Created water session ${savedSession._id} for ${date} v${version}`);

    const responseSession = savedSession.toObject();
    responseSession.data = [];

    res.status(201).json(responseSession);
  } catch (error) {
    logger.error(`Error creating water session: ${error.message}`);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update a session and its samples
router.put('/sessions/:id', async (req, res) => {
  try {
    const { endTime, data } = req.body;

    const session = await WaterSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Water session not found for update: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.info(`Updating water session ${req.params.id} with ${data ? data.length : 0} samples`);

    // Handle endTime update
    if ('endTime' in req.body) {
      session.endTime = endTime;
      session.status = endTime ? 'completed' : 'active';
      logger.debug(`Water session ${req.params.id} status changed to ${session.status}`);
    }

    // Handle sample updates
    if (data && Array.isArray(data)) {
      // Delete existing samples
      const deleteResult = await WaterSample.deleteMany({ sessionId: session._id });
      logger.debug(`Deleted ${deleteResult.deletedCount} old samples from water session ${req.params.id}`);

      // Create new samples with classifications
      if (data.length > 0) {
        const newSamples = data.map((sampleData) => {
          const sampleWithClassifications = addClassifications(sampleData);

          return {
            sessionId: session._id,
            sessionDate: session.date,
            sessionVersion: session.version,
            ...sampleWithClassifications
          };
        });

        const insertResult = await WaterSample.insertMany(newSamples);
        logger.info(`Created ${insertResult.length} water samples with classifications for session ${req.params.id}`);

        // Log first sample details at debug level
        if (insertResult.length > 0 && process.env.LOG_LEVEL === 'debug') {
          const first = insertResult[0];
          logger.debug(`Water sample classifications - pH: ${first.phResult}, EC: ${first.ecResult}, TDS: ${first.tdsResult}, Hardness: ${first.hardnessResult}`);
        }
      }

      // Update session metadata
      session.sampleCount = data.length;
      session.lastActivity = new Date();
    }

    const updatedSession = await session.save();
    logger.info(`Water session ${req.params.id} updated successfully`);

    // Fetch samples and return
    const samples = await WaterSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
    const sessionObj = updatedSession.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error updating water session ${req.params.id}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Delete a session and its samples
router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await WaterSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Water session not found for deletion: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete all associated samples
    const deleteResult = await WaterSample.deleteMany({ sessionId: req.params.id });
    logger.info(`Deleted ${deleteResult.deletedCount} samples for water session ${req.params.id}`);

    // Delete the session
    await WaterSession.findByIdAndDelete(req.params.id);
    logger.info(`Deleted water session ${req.params.id}`);

    res.json({ message: 'Session and associated samples deleted successfully', session });
  } catch (error) {
    logger.error(`Error deleting water session ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Get today's session count
router.get('/sessions/today/count', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const count = await WaterSession.countDocuments({ date: today });
    logger.debug(`Today's water session count (${today}): ${count}`);
    res.json({ date: today, count });
  } catch (error) {
    logger.error(`Error counting today's water sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to count sessions' });
  }
});

// ===== PDF GENERATION ROUTES =====

const pdfGenerator = require('../services/pdfGenerator');

/**
 * Generate PDF for a single water sample
 * POST /api/water-testing/samples/:sampleId/pdf
 */
router.post('/samples/:sampleId/pdf', async (req, res) => {
  try {
    logger.info(`Generating PDF for water sample: ${req.params.sampleId}`);

    const sample = await WaterSample.findById(req.params.sampleId);
    if (!sample) {
      logger.warn(`Water sample not found: ${req.params.sampleId}`);
      return res.status(404).json({ error: 'Sample not found' });
    }

    // Add classifications to sample data
    const sampleWithClassifications = addClassifications(sample.toObject());

    // Generate PDF
    const pdfBuffer = await pdfGenerator.generateWaterPDF(sampleWithClassifications);

    // Set response headers with proper filename encoding
    const filename = `water-report-${sample.farmersName || 'sample'}-${sample.sessionDate || new Date().toISOString().split('T')[0]}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="water_report.pdf"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', pdfBuffer.length);

    logger.info(`Water PDF generated successfully for sample: ${req.params.sampleId}`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error(`Error generating water PDF for sample ${req.params.sampleId}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

/**
 * Generate PDFs for all samples in a session (returns base64 encoded PDFs)
 * POST /api/water-testing/sessions/:sessionId/pdfs
 */
router.post('/sessions/:sessionId/pdfs', async (req, res) => {
  try {
    logger.info(`Generating bulk PDFs for water session: ${req.params.sessionId}`);

    const session = await WaterSession.findById(req.params.sessionId);
    if (!session) {
      logger.warn(`Water session not found: ${req.params.sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const samples = await WaterSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
    if (samples.length === 0) {
      logger.warn(`No samples found for water session: ${req.params.sessionId}`);
      return res.status(404).json({ error: 'No samples found in session' });
    }

    // Add classifications to all samples
    const samplesWithClassifications = samples.map(s => addClassifications(s.toObject()));

    // Generate all PDFs
    const pdfs = await pdfGenerator.generateBulkWaterPDFs(samplesWithClassifications);

    // Return as JSON with base64 encoding (same as soil testing)
    const result = pdfs.map(pdf => ({
      sampleId: pdf.sampleId,
      farmerName: pdf.farmerName,
      pdf: Buffer.from(pdf.buffer).toString('base64')
    }));

    logger.info(`Bulk water PDFs generated successfully for session: ${req.params.sessionId} (${pdfs.length} files)`);
    res.json({
      sessionId: req.params.sessionId,
      count: pdfs.length,
      pdfs: result
    });
  } catch (error) {
    logger.error(`Error generating bulk water PDFs for session ${req.params.sessionId}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to generate PDFs', details: error.message });
  }
});

/**
 * Generate combined PDF for all samples in a session
 * POST /api/water-testing/sessions/:sessionId/pdf-combined
 */
router.post('/sessions/:sessionId/pdf-combined', async (req, res) => {
  try {
    logger.info(`Generating combined PDF for water session: ${req.params.sessionId}`);

    const session = await WaterSession.findById(req.params.sessionId);
    if (!session) {
      logger.warn(`Water session not found: ${req.params.sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const samples = await WaterSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
    if (samples.length === 0) {
      logger.warn(`No samples found for water session: ${req.params.sessionId}`);
      return res.status(404).json({ error: 'No samples found in session' });
    }

    // Add classifications to all samples
    const samplesWithClassifications = samples.map(s => addClassifications(s.toObject()));

    // Generate combined PDF
    const pdfBuffer = await pdfGenerator.generateCombinedWaterPDF(samplesWithClassifications);

    // Set response headers with proper filename encoding
    const filename = `water-reports-combined-${session.date}-v${session.version}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="water_reports_combined.pdf"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', pdfBuffer.length);

    logger.info(`Combined water PDF generated successfully for session: ${req.params.sessionId} (${samples.length} samples)`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error(`Error generating combined water PDF for session ${req.params.sessionId}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

module.exports = router;

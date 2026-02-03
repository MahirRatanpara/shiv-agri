const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const WaterSession = require('../models/WaterSession');
const WaterSample = require('../models/WaterSample');
const { addClassifications } = require('../utils/waterClassification');
const { authenticate, requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

logger.info('Water Testing routes initialized - Using referenced mode with separate collections');
logger.info('Water classification system enabled');

// Helper function to sort samples by sample number naturally
const sortSamplesByNumber = (samples) => {
  return samples.sort((a, b) => {
    const sampleA = (a.sampleNumber || '').toLowerCase();
    const sampleB = (b.sampleNumber || '').toLowerCase();
    return sampleA.localeCompare(sampleB, undefined, { numeric: true, sensitivity: 'base' });
  });
};

// All routes require authentication
router.use(authenticate);

// Get all sessions with their samples
router.get('/sessions', requirePermission('water.sessions.view'), async (req, res) => {
  try {
    const sessions = await WaterSession.find().sort({ date: -1, version: -1 });

    const sessionsWithSamples = [];
    for (const session of sessions) {
      const sessionObj = session.toObject();
      let samples = await WaterSample.find({ sessionId: session._id });
      samples = sortSamplesByNumber(samples);
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
      let samples = await WaterSample.find({ sessionId: session._id });
      samples = sortSamplesByNumber(samples);
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

    let samples = await WaterSample.find({ sessionId: session._id });
    samples = sortSamplesByNumber(samples);
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
      status: 'started',
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
      // Note: Status is now managed separately via PATCH /sessions/:id/status endpoint
      logger.debug(`Water session ${req.params.id} endTime updated to ${endTime}`);
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

    // Fetch samples and return (sorted by sample number)
    let samples = await WaterSample.find({ sessionId: session._id });
    samples = sortSamplesByNumber(samples);
    const sessionObj = updatedSession.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error updating water session ${req.params.id}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Update session status (state transitions)
router.patch('/sessions/:id/status', requirePermission('water.sessions.update'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['started', 'details', 'ready', 'completed'];

    if (!status || !validStatuses.includes(status)) {
      logger.warn(`Invalid water session status provided: ${status}`);
      return res.status(400).json({ error: 'Invalid status. Must be one of: started, details, ready, completed' });
    }

    const session = await WaterSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Water session not found for status update: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const oldStatus = session.status;
    session.status = status;

    // Update endTime when completing
    if (status === 'completed' && !session.endTime) {
      session.endTime = new Date();
    }

    const updatedSession = await session.save();
    logger.info(`Water session ${req.params.id} status changed: ${oldStatus} → ${status}`);

    // Fetch samples and return
    let samples = await WaterSample.find({ sessionId: session._id });
    samples = sortSamplesByNumber(samples);
    const sessionObj = updatedSession.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error updating water session status ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to update session status' });
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
 * Stream bulk PDFs for a session - each PDF streamed as multipart
 * POST /api/water-testing/sessions/:sessionId/pdfs-stream
 *
 * Response format: multipart/mixed with each part being a PDF file
 * Each part has headers: Content-Type, Content-Disposition, X-Farmer-Name, X-Sample-Id, X-Index, X-Total
 */
router.post('/sessions/:sessionId/pdfs-stream', async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info(`Streaming PDF generation requested for water session: ${sessionId}`);

    // Fetch session and samples
    const session = await WaterSession.findById(sessionId);
    if (!session) {
      logger.warn(`Water session not found: ${sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const samples = await WaterSample.find({ sessionId }).sort({ createdAt: 1 });
    if (samples.length === 0) {
      logger.warn(`No samples found for water session: ${sessionId}`);
      return res.status(404).json({ error: 'No samples found in this session' });
    }

    // Add classifications to all samples
    const samplesWithClassifications = samples.map(s => addClassifications(s.toObject()));

    const total = samplesWithClassifications.length;
    const boundary = `----PDFBoundary${Date.now()}`;

    // Set multipart response headers
    res.setHeader('Content-Type', `multipart/mixed; boundary=${boundary}`);
    res.setHeader('X-Total-Count', total);
    res.setHeader('Transfer-Encoding', 'chunked');

    logger.info(`Starting streaming generation for ${total} water PDFs`);

    // Use the streaming generator
    let index = 0;
    for await (const pdf of pdfGenerator.generateBulkPDFsStream(samplesWithClassifications, 'water')) {
      const farmerName = pdf.farmerName || 'Unknown';
      const filename = `પાણી ચકાસણી - ${farmerName}.pdf`;
      const encodedFilename = encodeURIComponent(filename);

      // Write multipart boundary and headers
      res.write(`\r\n--${boundary}\r\n`);
      res.write(`Content-Type: application/pdf\r\n`);
      res.write(`Content-Disposition: attachment; filename="${encodedFilename}"\r\n`);
      res.write(`X-Farmer-Name: ${encodeURIComponent(farmerName)}\r\n`);
      res.write(`X-Sample-Id: ${pdf.sampleId}\r\n`);
      res.write(`X-Index: ${index}\r\n`);
      res.write(`X-Total: ${total}\r\n`);
      res.write(`Content-Length: ${pdf.buffer.length}\r\n`);
      res.write(`\r\n`);

      // Write PDF buffer
      res.write(pdf.buffer);

      index++;
      logger.debug(`Streamed water PDF ${index}/${total}: ${farmerName}`);
    }

    // Write final boundary
    res.write(`\r\n--${boundary}--\r\n`);
    res.end();

    logger.info(`Streaming completed for water session: ${sessionId}, sent ${index} PDFs`);

  } catch (error) {
    logger.error(`Error streaming water PDFs: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream PDFs' });
    } else {
      res.end();
    }
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

// Upload Excel file to update/append samples in a session
router.post('/sessions/:id/upload-excel',
  requirePermission('water.sessions.update'),
  upload.single('file'),
  async (req, res) => {
    try {
      const sessionId = req.params.id;

      // Check if file was uploaded
      if (!req.file) {
        logger.warn('Excel upload attempted without file');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      logger.info(`Processing Excel upload for water session ${sessionId}, file size: ${req.file.size} bytes`);

      // Check if session exists
      const session = await WaterSession.findById(sessionId);
      if (!session) {
        logger.warn(`Water session not found for Excel upload: ${sessionId}`);
        return res.status(404).json({ error: 'Session not found' });
      }

      // Parse Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        logger.error('No worksheet found in Excel file');
        return res.status(400).json({ error: 'No worksheet found in Excel file' });
      }

      // Get existing samples for this session
      const existingSamples = await WaterSample.find({ sessionId });
      const existingSamplesMap = new Map();
      existingSamples.forEach(sample => {
        if (sample.sampleNumber) {
          existingSamplesMap.set(sample.sampleNumber.trim(), sample);
        }
      });

      logger.debug(`Found ${existingSamples.length} existing water samples in session`);

      // Parse Excel rows (skip header row)
      const excelData = [];
      const errors = [];
      let rowIndex = 0;

      worksheet.eachRow((row, rowNumber) => {
        // Skip header row
        if (rowNumber === 1) {
          return;
        }

        rowIndex++;

        try {
          // Extract data from Excel columns
          // Expected columns: Sample Number, Farmer's Name, Mobile No., Location, Farm's Name, Taluka, Bore/Well
          const sampleNumber = row.getCell(1).value?.toString().trim() || '';
          const farmersName = row.getCell(2).value?.toString().trim() || '';
          const mobileNo = row.getCell(3).value?.toString().trim() || '';
          const location = row.getCell(4).value?.toString().trim() || '';
          const farmsName = row.getCell(5).value?.toString().trim() || '';
          const taluka = row.getCell(6).value?.toString().trim() || '';
          const boreWellType = row.getCell(7).value?.toString().trim() || '';

          // Validate required fields
          if (!sampleNumber) {
            errors.push(`Row ${rowNumber}: Sample Number is required`);
            return;
          }

          if (!farmersName) {
            errors.push(`Row ${rowNumber}: Farmer's Name is required`);
            return;
          }

          excelData.push({
            sampleNumber,
            farmersName,
            mobileNo,
            location,
            farmsName,
            taluka,
            boreWellType,
            rowNumber
          });
        } catch (error) {
          logger.error(`Error parsing row ${rowNumber}: ${error.message}`);
          errors.push(`Row ${rowNumber}: ${error.message}`);
        }
      });

      logger.info(`Parsed ${excelData.length} rows from Excel file`);

      if (errors.length > 0) {
        logger.warn(`Excel parsing completed with ${errors.length} errors`);
        return res.status(400).json({
          error: 'Some rows could not be processed',
          details: errors,
          processedCount: excelData.length
        });
      }

      if (excelData.length === 0) {
        logger.warn('No valid data found in Excel file');
        return res.status(400).json({ error: 'No valid data found in Excel file' });
      }

      // Process each row: update existing or create new
      let updatedCount = 0;
      let addedCount = 0;

      for (const excelRow of excelData) {
        const existingSample = existingSamplesMap.get(excelRow.sampleNumber);

        if (existingSample) {
          // Only update farmer details, keep test values unchanged
          existingSample.farmersName = excelRow.farmersName;
          existingSample.mobileNo = excelRow.mobileNo;
          existingSample.location = excelRow.location;
          existingSample.farmsName = excelRow.farmsName;
          existingSample.taluka = excelRow.taluka;
          existingSample.boreWellType = excelRow.boreWellType;

          await existingSample.save();
          updatedCount++;

          logger.debug(`Updated farmer details for water sample: ${excelRow.sampleNumber}`);
        } else {
          // Create new sample
          const newSample = new WaterSample({
            sessionId: session._id,
            sessionDate: session.date,
            sessionVersion: session.version,
            sampleNumber: excelRow.sampleNumber,
            farmersName: excelRow.farmersName,
            mobileNo: excelRow.mobileNo,
            location: excelRow.location,
            farmsName: excelRow.farmsName,
            taluka: excelRow.taluka,
            boreWellType: excelRow.boreWellType
          });

          await newSample.save();
          addedCount++;

          logger.debug(`Added new water sample: ${excelRow.sampleNumber}`);
        }
      }

      // Update session metadata
      session.sampleCount = await WaterSample.countDocuments({ sessionId });
      session.lastActivity = new Date();
      await session.save();

      logger.info(`Excel upload successful for water session ${sessionId} - Updated: ${updatedCount}, Added: ${addedCount}`);

      res.json({
        success: true,
        message: 'Excel data processed successfully',
        updated: updatedCount,
        added: addedCount,
        total: updatedCount + addedCount
      });

    } catch (error) {
      logger.error(`Error processing water Excel upload: ${error.message}`, { stack: error.stack });

      if (error.message.includes('Only Excel files')) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to process Excel file' });
    }
  }
);

module.exports = router;

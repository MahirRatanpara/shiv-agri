const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const FertilizerSession = require('../models/FertilizerSession');
const FertilizerSample = require('../models/FertilizerSample');
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

logger.info('Fertilizer Testing routes initialized');

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
router.get('/sessions', requirePermission('soil.sessions.view'), async (req, res) => {
  try {
    const sessions = await FertilizerSession.find().sort({ date: -1, version: -1 });

    const sessionsWithSamples = [];
    for (const session of sessions) {
      const sessionObj = session.toObject();
      let samples = await FertilizerSample.find({ sessionId: session._id });
      samples = sortSamplesByNumber(samples);
      sessionObj.data = samples;
      sessionsWithSamples.push(sessionObj);
    }

    logger.info(`Retrieved ${sessionsWithSamples.length} fertilizer sessions with samples`);
    res.json(sessionsWithSamples);
  } catch (error) {
    logger.error(`Error fetching fertilizer sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get sessions by date with their samples
router.get('/sessions/date/:date', requirePermission('soil.sessions.view'), async (req, res) => {
  try {
    const { date } = req.params;
    const sessions = await FertilizerSession.find({ date }).sort({ version: -1 });

    const sessionsWithSamples = [];
    for (const session of sessions) {
      const sessionObj = session.toObject();
      let samples = await FertilizerSample.find({ sessionId: session._id });
      samples = sortSamplesByNumber(samples);
      sessionObj.data = samples;
      sessionsWithSamples.push(sessionObj);
    }

    logger.info(`Retrieved ${sessionsWithSamples.length} fertilizer sessions for date ${date}`);
    res.json(sessionsWithSamples);
  } catch (error) {
    logger.error(`Error fetching fertilizer sessions by date: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get session count for a specific date
router.get('/sessions/count/:date', requirePermission('soil.sessions.view'), async (req, res) => {
  try {
    const { date } = req.params;
    const count = await FertilizerSession.countDocuments({ date });
    logger.debug(`Fertilizer session count for ${date}: ${count}`);
    res.json({ date, count });
  } catch (error) {
    logger.error(`Error counting fertilizer sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to count sessions' });
  }
});

// Get a specific session by ID with its samples
router.get('/sessions/:id', requirePermission('soil.sessions.view'), async (req, res) => {
  try {
    const session = await FertilizerSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Fertilizer session not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    let samples = await FertilizerSample.find({ sessionId: session._id });
    samples = sortSamplesByNumber(samples);
    logger.debug(`Retrieved fertilizer session ${req.params.id} with ${samples.length} samples`);

    const sessionObj = session.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error fetching fertilizer session ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Create a new session
router.post('/sessions', requirePermission('soil.sessions.create'), async (req, res) => {
  try {
    const { date, version, startTime } = req.body;

    const existingSession = await FertilizerSession.findOne({ date, version });
    if (existingSession) {
      logger.warn(`Fertilizer session already exists for ${date} v${version}`);
      return res.status(409).json({ error: 'Session with this date and version already exists' });
    }

    const session = new FertilizerSession({
      date,
      version,
      startTime: startTime || new Date(),
      status: 'started',
      sampleCount: 0,
      lastActivity: new Date()
    });

    const savedSession = await session.save();
    logger.info(`Created fertilizer session ${savedSession._id} for ${date} v${version}`);

    const responseSession = savedSession.toObject();
    responseSession.data = [];

    res.status(201).json(responseSession);
  } catch (error) {
    logger.error(`Error creating fertilizer session: ${error.message}`);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update a session and its samples
router.put('/sessions/:id', requirePermission('soil.sessions.update'), async (req, res) => {
  try {
    const { endTime, data } = req.body;

    const session = await FertilizerSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Fertilizer session not found for update: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.info(`Updating fertilizer session ${req.params.id} with ${data ? data.length : 0} samples`);

    // Handle endTime update
    if ('endTime' in req.body) {
      session.endTime = endTime;
      logger.debug(`Fertilizer session ${req.params.id} endTime updated to ${endTime}`);
    }

    // Handle sample updates
    if (data && Array.isArray(data)) {
      // Delete existing samples
      const deleteResult = await FertilizerSample.deleteMany({ sessionId: session._id });
      logger.debug(`Deleted ${deleteResult.deletedCount} old samples from fertilizer session ${req.params.id}`);

      // Create new samples
      if (data.length > 0) {
        const newSamples = data.map((sampleData) => ({
          sessionId: session._id,
          sessionDate: session.date,
          sessionVersion: session.version,
          ...sampleData
        }));

        const insertResult = await FertilizerSample.insertMany(newSamples);
        logger.info(`Created ${insertResult.length} fertilizer samples for session ${req.params.id}`);
      }

      // Update session metadata
      session.sampleCount = data.length;
      session.lastActivity = new Date();
    }

    const updatedSession = await session.save();
    logger.info(`Fertilizer session ${req.params.id} updated successfully`);

    // Fetch samples and return (sorted by sample number)
    let samples = await FertilizerSample.find({ sessionId: session._id });
    samples = sortSamplesByNumber(samples);
    const sessionObj = updatedSession.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error updating fertilizer session ${req.params.id}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Update session status (state transitions)
router.patch('/sessions/:id/status', requirePermission('soil.sessions.update'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['started', 'generate-reports', 'completed'];

    if (!status || !validStatuses.includes(status)) {
      logger.warn(`Invalid fertilizer session status provided: ${status}`);
      return res.status(400).json({ error: 'Invalid status. Must be one of: started, generate-reports, completed' });
    }

    const session = await FertilizerSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Fertilizer session not found for status update: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const oldStatus = session.status;
    session.status = status;

    // Update endTime when completing
    if (status === 'completed' && !session.endTime) {
      session.endTime = new Date();
    }

    const updatedSession = await session.save();
    logger.info(`Fertilizer session ${req.params.id} status changed: ${oldStatus} → ${status}`);

    // Fetch samples and return
    let samples = await FertilizerSample.find({ sessionId: session._id });
    samples = sortSamplesByNumber(samples);
    const sessionObj = updatedSession.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error updating fertilizer session status ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to update session status' });
  }
});

// Delete a session and its samples
router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await FertilizerSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Fertilizer session not found for deletion: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete all associated samples
    const deleteResult = await FertilizerSample.deleteMany({ sessionId: req.params.id });
    logger.info(`Deleted ${deleteResult.deletedCount} samples for fertilizer session ${req.params.id}`);

    // Delete the session
    await FertilizerSession.findByIdAndDelete(req.params.id);
    logger.info(`Deleted fertilizer session ${req.params.id}`);

    res.json({ message: 'Session and associated samples deleted successfully', session });
  } catch (error) {
    logger.error(`Error deleting fertilizer session ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Get today's session count
router.get('/sessions/today/count', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const count = await FertilizerSession.countDocuments({ date: today });
    logger.debug(`Today's fertilizer session count (${today}): ${count}`);
    res.json({ date: today, count });
  } catch (error) {
    logger.error(`Error counting today's fertilizer sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to count sessions' });
  }
});

// Get paginated samples for a session
router.get('/sessions/:sessionId/samples', requirePermission('soil.sessions.view'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const samples = await FertilizerSample.find({ sessionId })
      .sort({ createdAt: 1 })
      .collation({ locale: 'en_US', numericOrdering: true })
      .skip(skip)
      .limit(limit);

    const total = await FertilizerSample.countDocuments({ sessionId });

    res.json({
      samples,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error fetching paginated fertilizer samples: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch samples' });
  }
});

// Bulk update/upsert samples (Safe Update for Infinite Scroll)
router.patch('/sessions/:sessionId/samples', requirePermission('soil.sessions.update'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { samples } = req.body;

    if (!samples || !Array.isArray(samples)) {
      return res.status(400).json({ error: 'Samples array is required' });
    }

    const session = await FertilizerSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.info(`Bulk updating ${samples.length} fertilizer samples for session ${sessionId}`);

    const operations = samples.map(sampleData => {
      if (sampleData._id) {
        // Update existing
        return {
          updateOne: {
            filter: { _id: sampleData._id, sessionId },
            update: { $set: { ...sampleData, sessionId } }
          }
        };
      } else {
        // Insert new
        return {
          insertOne: {
            document: {
              ...sampleData,
              sessionId,
              sessionDate: session.date,
              sessionVersion: session.version
            }
          }
        };
      }
    });

    if (operations.length > 0) {
      await FertilizerSample.bulkWrite(operations);
    }

    // Update session metadata
    session.sampleCount = await FertilizerSample.countDocuments({ sessionId });
    session.lastActivity = new Date();
    await session.save();

    res.json({ message: 'Samples updated successfully', count: samples.length });
  } catch (error) {
    logger.error(`Error bulk updating fertilizer samples: ${error.message}`);
    res.status(500).json({ error: 'Failed to update samples' });
  }
});

// Bulk delete samples
router.delete('/sessions/:sessionId/samples', requirePermission('soil.samples.delete'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sampleIds } = req.body;

    if (!sampleIds || !Array.isArray(sampleIds) || sampleIds.length === 0) {
      return res.status(400).json({ error: 'Sample IDs array is required' });
    }

    const session = await FertilizerSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await FertilizerSample.deleteMany({
      _id: { $in: sampleIds },
      sessionId // Ensure we only delete from this session
    });

    // Update session metadata
    session.sampleCount = await FertilizerSample.countDocuments({ sessionId });
    session.lastActivity = new Date();
    await session.save();

    res.json({
      message: 'Samples deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error(`Error deleting fertilizer samples: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete samples' });
  }
});

// Upload Excel file to update/append samples in a session
router.post('/sessions/:id/upload-excel',
  requirePermission('soil.sessions.update'),
  upload.single('file'),
  async (req, res) => {
    try {
      const sessionId = req.params.id;
      const { type } = req.body; // Type should be sent with form data

      // Check if file was uploaded
      if (!req.file) {
        logger.warn('Excel upload attempted without file');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Validate type
      const validTypes = ['normal', 'small-fruit', 'large-fruit'];
      if (!type || !validTypes.includes(type)) {
        return res.status(400).json({ error: 'Valid type (normal, small-fruit, large-fruit) is required' });
      }

      logger.info(`Processing Excel upload for fertilizer session ${sessionId}, type: ${type}, file size: ${req.file.size} bytes`);

      // Check if session exists
      const session = await FertilizerSession.findById(sessionId);
      if (!session) {
        logger.warn(`Fertilizer session not found for Excel upload: ${sessionId}`);
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
      const existingSamples = await FertilizerSample.find({ sessionId, type });
      const existingSamplesMap = new Map();
      existingSamples.forEach(sample => {
        if (sample.sampleNumber) {
          existingSamplesMap.set(sample.sampleNumber.trim(), sample);
        }
      });

      logger.debug(`Found ${existingSamples.length} existing fertilizer samples in session for type ${type}`);

      // Parse Excel rows (skip header row)
      const excelData = [];
      const errors = [];

      worksheet.eachRow((row, rowNumber) => {
        // Skip header row
        if (rowNumber === 1) {
          return;
        }

        try {
          // Extract common fields from Excel columns
          const sampleNumber = row.getCell(1).value?.toString().trim() || '';
          const farmerName = row.getCell(2).value?.toString().trim() || '';
          const cropName = row.getCell(3).value?.toString().trim() || '';

          // Validate required fields
          if (!sampleNumber) {
            errors.push(`Row ${rowNumber}: Sample Number is required`);
            return;
          }

          if (!farmerName) {
            errors.push(`Row ${rowNumber}: Farmer Name is required`);
            return;
          }

          // Extract additional fields based on type
          const rowData = {
            sampleNumber,
            farmerName,
            cropName,
            type,
            rowNumber
          };

          // Add type-specific fields from columns 4 onwards
          // This is a simplified version - you'll need to map specific columns based on your Excel template
          let colIndex = 4;
          for (const cell of row.values.slice(4)) {
            const value = cell?.toString().trim();
            if (value && !isNaN(value)) {
              rowData[`col${colIndex}`] = parseFloat(value);
            }
            colIndex++;
          }

          excelData.push(rowData);
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
          // Update existing sample
          Object.assign(existingSample, excelRow);
          await existingSample.save();
          updatedCount++;
          logger.debug(`Updated fertilizer sample: ${excelRow.sampleNumber}`);
        } else {
          // Create new sample
          const newSample = new FertilizerSample({
            sessionId: session._id,
            sessionDate: session.date,
            sessionVersion: session.version,
            ...excelRow
          });

          await newSample.save();
          addedCount++;
          logger.debug(`Added new fertilizer sample: ${excelRow.sampleNumber}`);
        }
      }

      // Update session metadata
      session.sampleCount = await FertilizerSample.countDocuments({ sessionId });
      session.lastActivity = new Date();
      await session.save();

      logger.info(`Excel upload successful for fertilizer session ${sessionId} - Updated: ${updatedCount}, Added: ${addedCount}`);

      res.json({
        success: true,
        message: 'Excel data processed successfully',
        updated: updatedCount,
        added: addedCount,
        total: updatedCount + addedCount
      });

    } catch (error) {
      logger.error(`Error processing Excel upload: ${error.message}`, { stack: error.stack });

      if (error.message.includes('Only Excel files')) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to process Excel file' });
    }
  }
);

// ===== PDF GENERATION ROUTES =====

const pdfGenerator = require('../services/pdfGenerator');

/**
 * Test endpoint to check sample data structure
 * GET /api/fertilizer-testing/samples/:sampleId/test
 */
router.get('/samples/:sampleId/test', async (req, res) => {
  try {
    const sample = await FertilizerSample.findById(req.params.sampleId);
    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    const plainSample = sample.toObject();

    res.json({
      id: sample._id,
      type: plainSample.type,
      farmerName: plainSample.farmerName,
      cropName: plainSample.cropName,
      sampleNumber: plainSample.sampleNumber,
      hasNValue: plainSample.nValue !== null && plainSample.nValue !== undefined,
      hasPValue: plainSample.pValue !== null && plainSample.pValue !== undefined,
      hasKValue: plainSample.kValue !== null && plainSample.kValue !== undefined,
      hasSpray1Npk: plainSample.spray1Npk !== null && plainSample.spray1Npk !== undefined,
      fieldCount: Object.keys(plainSample).length,
      fields: Object.keys(plainSample).filter(k => !k.startsWith('_') && k !== '__v')
    });
  } catch (error) {
    logger.error(`Error testing sample: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate PDF for a single fertilizer sample
 * POST /api/fertilizer-testing/samples/:sampleId/pdf
 */
router.post('/samples/:sampleId/pdf', async (req, res) => {
  try {
    logger.info(`Generating PDF for fertilizer sample: ${req.params.sampleId}`);

    const sample = await FertilizerSample.findById(req.params.sampleId);
    if (!sample) {
      logger.warn(`Fertilizer sample not found: ${req.params.sampleId}`);
      return res.status(404).json({ error: 'Sample not found' });
    }

    logger.info(`Found sample - ID: ${sample._id}, Type: ${sample.type}, Farmer: ${sample.farmerName}`);

    // Generate PDF
    const pdfBuffer = await pdfGenerator.generateFertilizerPDF(sample);

    // Set response headers
    const filename = `fertilizer-report-${sample.farmerName || 'sample'}-${sample.sessionDate || new Date().toISOString().split('T')[0]}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fertilizer_report.pdf"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', pdfBuffer.length);

    logger.info(`Fertilizer PDF generated successfully for sample: ${req.params.sampleId}`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error(`Error generating fertilizer PDF for sample ${req.params.sampleId}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

/**
 * Generate PDFs for all samples in a session (returns base64 encoded PDFs)
 * POST /api/fertilizer-testing/sessions/:sessionId/pdfs
 */
router.post('/sessions/:sessionId/pdfs', async (req, res) => {
  try {
    logger.info(`Generating bulk PDFs for fertilizer session: ${req.params.sessionId}`);

    const session = await FertilizerSession.findById(req.params.sessionId);
    if (!session) {
      logger.warn(`Fertilizer session not found: ${req.params.sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    let samples = await FertilizerSample.find({ sessionId: req.params.sessionId });
    samples = sortSamplesByNumber(samples);

    if (samples.length === 0) {
      logger.warn(`No samples found for fertilizer session: ${req.params.sessionId}`);
      return res.status(404).json({ error: 'No samples found in this session' });
    }

    // Generate all PDFs
    const pdfs = await pdfGenerator.generateBulkFertilizerPDFs(samples);

    // Return base64 encoded PDFs
    const result = pdfs.map(pdf => ({
      sampleId: pdf.sampleId,
      farmerName: pdf.farmerName,
      pdf: Buffer.from(pdf.buffer).toString('base64')
    }));

    logger.info(`Bulk fertilizer PDFs generated successfully for session: ${req.params.sessionId} (${pdfs.length} files)`);

    res.json({
      sessionId: req.params.sessionId,
      count: pdfs.length,
      pdfs: result
    });
  } catch (error) {
    logger.error(`Error generating bulk fertilizer PDFs for session ${req.params.sessionId}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to generate PDFs', details: error.message });
  }
});

/**
 * Stream bulk PDFs for a session - each PDF streamed as multipart
 * POST /api/fertilizer-testing/sessions/:sessionId/pdfs-stream
 *
 * Response format: multipart/mixed with each part being a PDF file
 * Each part has headers: Content-Type, Content-Disposition, X-Farmer-Name, X-Sample-Id, X-Index, X-Total
 */
router.post('/sessions/:sessionId/pdfs-stream', async (req, res) => {
  let clientDisconnected = false;

  try {
    const { sessionId } = req.params;

    logger.info(`Streaming PDF generation requested for fertilizer session: ${sessionId}`);

    const session = await FertilizerSession.findById(sessionId);
    if (!session) {
      logger.warn(`Fertilizer session not found: ${sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    let samples = await FertilizerSample.find({ sessionId });
    samples = sortSamplesByNumber(samples);

    if (samples.length === 0) {
      logger.warn(`No samples found for fertilizer session: ${sessionId}`);
      return res.status(404).json({ error: 'No samples found in this session' });
    }

    const total = samples.length;
    const boundary = `----PDFBoundary${Date.now()}`;

    // Monitor client connection
    req.on('close', () => {
      clientDisconnected = true;
      logger.warn(`Client disconnected during fertilizer PDF streaming for session: ${sessionId}`);
    });

    // Set multipart response headers with keep-alive
    res.setHeader('Content-Type', `multipart/mixed; boundary=${boundary}`);
    res.setHeader('X-Total-Count', total);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=600'); // 10 minutes

    // Disable timeout for this request (large file streaming)
    req.setTimeout(600000); // 10 minutes
    res.setTimeout(600000); // 10 minutes

    logger.info(`Starting streaming generation for ${total} fertilizer PDFs`);

    // Use the streaming generator
    let index = 0;
    for await (const pdf of pdfGenerator.generateBulkPDFsStream(samples, 'fertilizer')) {
      // Check if client disconnected
      if (clientDisconnected) {
        logger.warn(`Stopping fertilizer PDF generation - client disconnected at ${index}/${total}`);
        break;
      }

      const farmerName = pdf.farmerName || 'Unknown';
      const filename = `ખાતર ચકાસણી - ${farmerName}.pdf`;
      const encodedFilename = encodeURIComponent(filename);

      try {
        logger.info(`[Fertilizer Stream] Sending PDF ${index + 1}/${total}: ${farmerName} (${pdf.buffer.length} bytes)`);

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

        // Write PDF buffer with backpressure handling
        const writeSuccess = res.write(pdf.buffer);
        if (!writeSuccess) {
          logger.warn(`[Fertilizer Stream] Backpressure detected, waiting for drain...`);
          await new Promise(resolve => res.once('drain', resolve));
        }

        // Flush to ensure data is sent immediately
        if (res.flush && typeof res.flush === 'function') {
          res.flush();
        }

        index++;
        logger.info(`[Fertilizer Stream] Successfully sent PDF ${index}/${total}`);
      } catch (writeError) {
        logger.error(`Error writing fertilizer PDF ${index}/${total}: ${writeError.message}`);
        clientDisconnected = true;
        break;
      }
    }

    // Only write final boundary if not disconnected
    if (!clientDisconnected) {
      res.write(`\r\n--${boundary}--\r\n`);
      res.end();
      logger.info(`Streaming completed for fertilizer session: ${sessionId}, sent ${index}/${total} PDFs`);
    } else {
      logger.warn(`Streaming incomplete for fertilizer session: ${sessionId}, sent ${index}/${total} PDFs before disconnect`);
      res.end();
    }

  } catch (error) {
    logger.error(`Error streaming fertilizer PDFs: ${error.message}`, { stack: error.stack });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream PDFs' });
    } else {
      res.end();
    }
  }
});

/**
 * Generate combined PDF for all samples in a session
 * POST /api/fertilizer-testing/sessions/:sessionId/pdf-combined
 */
router.post('/sessions/:sessionId/pdf-combined', async (req, res) => {
  try {
    logger.info(`Generating combined PDF for fertilizer session: ${req.params.sessionId}`);

    const session = await FertilizerSession.findById(req.params.sessionId);
    if (!session) {
      logger.warn(`Fertilizer session not found: ${req.params.sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    let samples = await FertilizerSample.find({ sessionId: req.params.sessionId });
    samples = sortSamplesByNumber(samples);

    if (samples.length === 0) {
      logger.warn(`No samples found for fertilizer session: ${req.params.sessionId}`);
      return res.status(404).json({ error: 'No samples found in this session' });
    }

    // Generate combined PDF
    const pdfBuffer = await pdfGenerator.generateCombinedFertilizerPDF(samples);

    // Set response headers
    const filename = `fertilizer-reports-combined-${session.date}-v${session.version}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fertilizer_reports_combined.pdf"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', pdfBuffer.length);

    logger.info(`Combined fertilizer PDF generated successfully for session: ${req.params.sessionId} (${samples.length} samples)`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error(`Error generating combined fertilizer PDF for session ${req.params.sessionId}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

module.exports = router;

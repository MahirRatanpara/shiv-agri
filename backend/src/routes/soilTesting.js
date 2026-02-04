const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const SoilSession = require('../models/SoilSession');
const SoilSample = require('../models/SoilSample');
const { addClassifications } = require('../utils/soilClassification');
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

logger.info('Soil Testing routes initialized - Using referenced mode with separate collections');
logger.info('Soil classification system enabled');

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
    const sessions = await SoilSession.find().sort({ date: -1, version: -1 });

    const sessionsWithSamples = [];
    for (const session of sessions) {
      const sessionObj = session.toObject();
      let samples = await SoilSample.find({ sessionId: session._id });
      samples = sortSamplesByNumber(samples);
      sessionObj.data = samples;
      sessionsWithSamples.push(sessionObj);
    }

    logger.info(`Retrieved ${sessionsWithSamples.length} sessions with samples`);
    res.json(sessionsWithSamples);
  } catch (error) {
    logger.error(`Error fetching sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get sessions by date with their samples
router.get('/sessions/date/:date', requirePermission('soil.sessions.view'), async (req, res) => {
  try {
    const { date } = req.params;
    const sessions = await SoilSession.find({ date }).sort({ version: -1 });

    const sessionsWithSamples = [];
    for (const session of sessions) {
      const sessionObj = session.toObject();
      let samples = await SoilSample.find({ sessionId: session._id });
      samples = sortSamplesByNumber(samples);
      sessionObj.data = samples;
      sessionsWithSamples.push(sessionObj);
    }

    logger.info(`Retrieved ${sessionsWithSamples.length} sessions for date ${date}`);
    res.json(sessionsWithSamples);
  } catch (error) {
    logger.error(`Error fetching sessions by date: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get session count for a specific date
router.get('/sessions/count/:date', requirePermission('soil.sessions.view'), async (req, res) => {
  try {
    const { date } = req.params;
    const count = await SoilSession.countDocuments({ date });
    logger.debug(`Session count for ${date}: ${count}`);
    res.json({ date, count });
  } catch (error) {
    logger.error(`Error counting sessions: ${error.message}`);
    res.status(500).json({ error: 'Failed to count sessions' });
  }
});

// Get a specific session by ID with its samples
router.get('/sessions/:id', requirePermission('soil.sessions.view'), async (req, res) => {
  try {
    const session = await SoilSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Session not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    let samples = await SoilSample.find({ sessionId: session._id });
    samples = sortSamplesByNumber(samples);
    logger.debug(`Retrieved session ${req.params.id} with ${samples.length} samples`);

    const sessionObj = session.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error fetching session ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Create a new session
router.post('/sessions', requirePermission('soil.sessions.create'), async (req, res) => {
  try {
    const { date, version, startTime } = req.body;

    const existingSession = await SoilSession.findOne({ date, version });
    if (existingSession) {
      logger.warn(`Session already exists for ${date} v${version}`);
      return res.status(409).json({ error: 'Session with this date and version already exists' });
    }

    const session = new SoilSession({
      date,
      version,
      startTime: startTime || new Date(),
      status: 'started',
      sampleCount: 0,
      lastActivity: new Date()
    });

    const savedSession = await session.save();
    logger.info(`Created session ${savedSession._id} for ${date} v${version}`);

    const responseSession = savedSession.toObject();
    responseSession.data = [];

    res.status(201).json(responseSession);
  } catch (error) {
    logger.error(`Error creating session: ${error.message}`);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update a session and its samples
router.put('/sessions/:id', requirePermission('soil.sessions.update'), async (req, res) => {
  try {
    const { endTime, data } = req.body;

    const session = await SoilSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Session not found for update: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.info(`Updating session ${req.params.id} with ${data ? data.length : 0} samples`);

    // Handle endTime update
    if ('endTime' in req.body) {
      session.endTime = endTime;
      // Note: Status is now managed separately via PATCH /sessions/:id/status endpoint
      logger.debug(`Session ${req.params.id} endTime updated to ${endTime}`);
    }

    // Handle sample updates
    if (data && Array.isArray(data)) {
      // Delete existing samples
      const deleteResult = await SoilSample.deleteMany({ sessionId: session._id });
      logger.debug(`Deleted ${deleteResult.deletedCount} old samples from session ${req.params.id}`);

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

        const insertResult = await SoilSample.insertMany(newSamples);
        logger.info(`Created ${insertResult.length} samples with classifications for session ${req.params.id}`);

        // Log first sample details at debug level
        if (insertResult.length > 0 && process.env.LOG_LEVEL === 'debug') {
          const first = insertResult[0];
          logger.debug(`Sample classifications - pH: ${first.phResult}, EC: ${first.ecResult}, N: ${first.nitrogenResult}, P: ${first.phosphorusResult}, K: ${first.potashResult}`);
        }
      }

      // Update session metadata
      session.sampleCount = data.length;
      session.lastActivity = new Date();
    }

    const updatedSession = await session.save();
    logger.info(`Session ${req.params.id} updated successfully`);

    // Fetch samples and return (sorted by sample number)
    let samples = await SoilSample.find({ sessionId: session._id });
    samples = sortSamplesByNumber(samples);
    const sessionObj = updatedSession.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error updating session ${req.params.id}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Update session status (state transitions)
router.patch('/sessions/:id/status', requirePermission('soil.sessions.update'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['started', 'details', 'ready', 'completed'];

    if (!status || !validStatuses.includes(status)) {
      logger.warn(`Invalid status provided: ${status}`);
      return res.status(400).json({ error: 'Invalid status. Must be one of: started, details, ready, completed' });
    }

    const session = await SoilSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Session not found for status update: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const oldStatus = session.status;
    session.status = status;

    // Update endTime when completing
    if (status === 'completed' && !session.endTime) {
      session.endTime = new Date();
    }

    const updatedSession = await session.save();
    logger.info(`Session ${req.params.id} status changed: ${oldStatus} → ${status}`);

    // Fetch samples and return
    let samples = await SoilSample.find({ sessionId: session._id });
    samples = sortSamplesByNumber(samples);
    const sessionObj = updatedSession.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error updating session status ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to update session status' });
  }
});

// Delete a session and its samples
router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await SoilSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Session not found for deletion: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete all associated samples
    const deleteResult = await SoilSample.deleteMany({ sessionId: req.params.id });
    logger.info(`Deleted ${deleteResult.deletedCount} samples for session ${req.params.id}`);

    // Delete the session
    await SoilSession.findByIdAndDelete(req.params.id);
    logger.info(`Deleted session ${req.params.id}`);

    res.json({ message: 'Session and associated samples deleted successfully', session });
  } catch (error) {
    logger.error(`Error deleting session ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Get today's session count
router.get('/sessions/today/count', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const count = await SoilSession.countDocuments({ date: today });
    logger.debug(`Today's session count (${today}): ${count}`);
    res.json({ date: today, count });
  } catch (error) {
    logger.error(`Error counting today's sessions: ${error.message}`);
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

    const samples = await SoilSample.find({ sessionId })
      .sort({ createdAt: 1 }) // Use natural creation order or handle numeric sort here?
      // Note: sortSamplesByNumber is expensive for pagination as it requires fetching all.
      // We'll stick to DB sort for efficiency in pagination.
      // Alternatively, we used to sort manually. For infinite scroll, consistent order is key.
      .collation({ locale: 'en_US', numericOrdering: true }) // Natural sort on MongoDB if sampleNumber indexed/available?
      // sampleNumber might not be unique or set initially. createdAt is safer for stability.
      .skip(skip)
      .limit(limit);

    const total = await SoilSample.countDocuments({ sessionId });

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
    logger.error(`Error fetching paginated samples: ${error.message}`);
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

    const session = await SoilSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.info(`Bulk updating ${samples.length} samples for session ${sessionId}`);

    const operations = samples.map(sampleData => {
      // Calculate classifications
      const sampleWithClassifications = addClassifications(sampleData);

      if (sampleData._id) {
        // Update existing
        return {
          updateOne: {
            filter: { _id: sampleData._id, sessionId },
            update: { $set: { ...sampleWithClassifications, sessionId } }
          }
        };
      } else {
        // Insert new
        return {
          insertOne: {
            document: {
              ...sampleWithClassifications,
              sessionId,
              sessionDate: session.date,
              sessionVersion: session.version
            }
          }
        };
      }
    });

    if (operations.length > 0) {
      await SoilSample.bulkWrite(operations);
    }

    // Update session metadata
    session.sampleCount = await SoilSample.countDocuments({ sessionId });
    session.lastActivity = new Date();
    await session.save();

    res.json({ message: 'Samples updated successfully', count: samples.length });
  } catch (error) {
    logger.error(`Error bulk updating samples: ${error.message}`);
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

    const session = await SoilSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await SoilSample.deleteMany({
      _id: { $in: sampleIds },
      sessionId // Ensure we only delete from this session
    });

    // Update session metadata
    session.sampleCount = await SoilSample.countDocuments({ sessionId });
    session.lastActivity = new Date();
    await session.save();

    res.json({
      message: 'Samples deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error(`Error deleting samples: ${error.message}`);
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

      // Check if file was uploaded
      if (!req.file) {
        logger.warn('Excel upload attempted without file');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      logger.info(`Processing Excel upload for session ${sessionId}, file size: ${req.file.size} bytes`);

      // Check if session exists
      const session = await SoilSession.findById(sessionId);
      if (!session) {
        logger.warn(`Session not found for Excel upload: ${sessionId}`);
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
      const existingSamples = await SoilSample.find({ sessionId });
      const existingSamplesMap = new Map();
      existingSamples.forEach(sample => {
        if (sample.sampleNumber) {
          existingSamplesMap.set(sample.sampleNumber.trim(), sample);
        }
      });

      logger.debug(`Found ${existingSamples.length} existing samples in session`);

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
          // Expected columns: Sample Number, Farmer's Name, Mobile No., Location, Farm's Name, Taluka
          const sampleNumber = row.getCell(1).value?.toString().trim() || '';
          const farmersName = row.getCell(2).value?.toString().trim() || '';
          const mobileNo = row.getCell(3).value?.toString().trim() || '';
          const location = row.getCell(4).value?.toString().trim() || '';
          const farmsName = row.getCell(5).value?.toString().trim() || '';
          const taluka = row.getCell(6).value?.toString().trim() || '';

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

          await existingSample.save();
          updatedCount++;

          logger.debug(`Updated farmer details for sample: ${excelRow.sampleNumber}`);
        } else {
          // Create new sample
          const newSample = new SoilSample({
            sessionId: session._id,
            sessionDate: session.date,
            sessionVersion: session.version,
            sampleNumber: excelRow.sampleNumber,
            farmersName: excelRow.farmersName,
            mobileNo: excelRow.mobileNo,
            location: excelRow.location,
            farmsName: excelRow.farmsName,
            taluka: excelRow.taluka
          });

          await newSample.save();
          addedCount++;

          logger.debug(`Added new sample: ${excelRow.sampleNumber}`);
        }
      }

      // Update session metadata
      session.sampleCount = await SoilSample.countDocuments({ sessionId });
      session.lastActivity = new Date();
      await session.save();

      logger.info(`Excel upload successful for session ${sessionId} - Updated: ${updatedCount}, Added: ${addedCount}`);

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

module.exports = router;

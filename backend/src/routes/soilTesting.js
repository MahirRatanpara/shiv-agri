const express = require('express');
const router = express.Router();
const SoilSession = require('../models/SoilSession');
const SoilSample = require('../models/SoilSample');
const { addClassifications } = require('../utils/soilClassification');
const logger = require('../utils/logger');

logger.info('Soil Testing routes initialized - Using referenced mode with separate collections');
logger.info('Soil classification system enabled');

// Get all sessions with their samples
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await SoilSession.find().sort({ date: -1, version: -1 });

    const sessionsWithSamples = [];
    for (const session of sessions) {
      const sessionObj = session.toObject();
      const samples = await SoilSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
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
router.get('/sessions/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const sessions = await SoilSession.find({ date }).sort({ version: -1 });

    const sessionsWithSamples = [];
    for (const session of sessions) {
      const sessionObj = session.toObject();
      const samples = await SoilSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
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
router.get('/sessions/count/:date', async (req, res) => {
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
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await SoilSession.findById(req.params.id);
    if (!session) {
      logger.warn(`Session not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    const samples = await SoilSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
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
router.post('/sessions', async (req, res) => {
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
      status: 'active',
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
router.put('/sessions/:id', async (req, res) => {
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
      session.status = endTime ? 'completed' : 'active';
      logger.debug(`Session ${req.params.id} status changed to ${session.status}`);
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

    // Fetch samples and return
    const samples = await SoilSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
    const sessionObj = updatedSession.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    logger.error(`Error updating session ${req.params.id}: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to update session' });
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

module.exports = router;

const express = require('express');
const router = express.Router();
const SoilTestSession = require('../models/SoilTestSession');

// Get all sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await SoilTestSession.find().sort({ date: -1, version: -1 });
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get sessions by date
router.get('/sessions/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const sessions = await SoilTestSession.find({ date }).sort({ version: -1 });
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions by date:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get session count for a specific date
router.get('/sessions/count/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const count = await SoilTestSession.countDocuments({ date });
    res.json({ date, count });
  } catch (error) {
    console.error('Error counting sessions:', error);
    res.status(500).json({ error: 'Failed to count sessions' });
  }
});

// Get a specific session by ID
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await SoilTestSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Create a new session
router.post('/sessions', async (req, res) => {
  try {
    const { date, version, startTime, data } = req.body;

    // Check if session with same date and version already exists
    const existingSession = await SoilTestSession.findOne({ date, version });
    if (existingSession) {
      return res.status(409).json({ error: 'Session with this date and version already exists' });
    }

    const session = new SoilTestSession({
      date,
      version,
      startTime: startTime || new Date(),
      data: data || []
    });

    const savedSession = await session.save();
    res.status(201).json(savedSession);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update a session (end session)
router.put('/sessions/:id', async (req, res) => {
  try {
    const { endTime, data } = req.body;

    const session = await SoilTestSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Handle endTime update - explicitly check if the field is present in the request
    if ('endTime' in req.body) {
      session.endTime = endTime; // This will set it to null if endTime is null
    }
    if (data) session.data = data;

    const updatedSession = await session.save();
    res.json(updatedSession);
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Delete a session
router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await SoilTestSession.findByIdAndDelete(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ message: 'Session deleted successfully', session });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Get today's session count
router.get('/sessions/today/count', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const count = await SoilTestSession.countDocuments({ date: today });
    res.json({ date: today, count });
  } catch (error) {
    console.error('Error counting today sessions:', error);
    res.status(500).json({ error: 'Failed to count sessions' });
  }
});

module.exports = router;

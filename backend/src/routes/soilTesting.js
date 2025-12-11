const express = require('express');
const router = express.Router();
const SoilSession = require('../models/SoilSession');
const SoilSample = require('../models/SoilSample');
const { addClassifications } = require('../utils/soilClassification');

console.log('✅ SoilSample model loaded - USING REFERENCED MODE');
console.log('   Samples stored in separate "soil_samples" collection');
console.log('   ✅ Soil classification system enabled');

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

    console.log(`\n🔍 GET /sessions - Retrieved ${sessionsWithSamples.length} sessions`);
    if (sessionsWithSamples.length > 0 && sessionsWithSamples[0].data.length > 0) {
      const firstSample = sessionsWithSamples[0].data[0];
      console.log(`  First sample of first session - results:`);
      console.log(`    pH: "${firstSample.phResult}" / "${firstSample.phResultEn}"`);
      console.log(`    EC: "${firstSample.ecResult}" / "${firstSample.ecResultEn}"`);
      console.log(`    Nitrogen: "${firstSample.nitrogenResult}" / "${firstSample.nitrogenResultEn}"`);
      console.log(`    Phosphorus: "${firstSample.phosphorusResult}" / "${firstSample.phosphorusResultEn}"`);
      console.log(`    Potash: "${firstSample.potashResult}" / "${firstSample.potashResultEn}"`);
    }

    res.json(sessionsWithSamples);
  } catch (error) {
    console.error('Error fetching sessions:', error);
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

    res.json(sessionsWithSamples);
  } catch (error) {
    console.error('Error fetching sessions by date:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get session count for a specific date
router.get('/sessions/count/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const count = await SoilSession.countDocuments({ date });
    res.json({ date, count });
  } catch (error) {
    console.error('Error counting sessions:', error);
    res.status(500).json({ error: 'Failed to count sessions' });
  }
});

// Get a specific session by ID with its samples
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await SoilSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const samples = await SoilSample.find({ sessionId: session._id }).sort({ createdAt: 1 });

    console.log(`\n🔍 GET /sessions/${req.params.id} - Retrieved ${samples.length} samples`);
    if (samples.length > 0) {
      const firstSample = samples[0];
      console.log(`  First sample results:`);
      console.log(`    pH: "${firstSample.phResult}" / "${firstSample.phResultEn}"`);
      console.log(`    EC: "${firstSample.ecResult}" / "${firstSample.ecResultEn}"`);
      console.log(`    Nitrogen: "${firstSample.nitrogenResult}" / "${firstSample.nitrogenResultEn}"`);
      console.log(`    Phosphorus: "${firstSample.phosphorusResult}" / "${firstSample.phosphorusResultEn}"`);
      console.log(`    Potash: "${firstSample.potashResult}" / "${firstSample.potashResultEn}"`);
    }

    const sessionObj = session.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Create a new session
router.post('/sessions', async (req, res) => {
  try {
    const { date, version, startTime } = req.body;

    const existingSession = await SoilSession.findOne({ date, version });
    if (existingSession) {
      return res.status(409).json({ error: 'Session with this date and version already exists' });
    }

    console.log(`📝 Creating new session for ${date} v${version}`);

    const session = new SoilSession({
      date,
      version,
      startTime: startTime || new Date(),
      status: 'active',
      sampleCount: 0,
      lastActivity: new Date()
    });

    const savedSession = await session.save();
    console.log(`  ✅ SoilSession created: ${savedSession._id}`);

    const responseSession = savedSession.toObject();
    responseSession.data = [];

    res.status(201).json(responseSession);
  } catch (error) {
    console.error('❌ Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update a session and its samples
router.put('/sessions/:id', async (req, res) => {
  try {
    const { endTime, data } = req.body;

    const session = await SoilSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    console.log(`📝 Updating session ${req.params.id} with ${data ? data.length : 0} samples`);

    // Handle endTime update
    if ('endTime' in req.body) {
      session.endTime = endTime;
      session.status = endTime ? 'completed' : 'active';
    }

    // Handle sample updates
    if (data && Array.isArray(data)) {
      // Delete existing samples
      const deleteResult = await SoilSample.deleteMany({ sessionId: session._id });
      console.log(`  🗑️  Deleted ${deleteResult.deletedCount} old samples`);

      // Create new samples with classifications
      if (data.length > 0) {
        const newSamples = data.map((sampleData, index) => {
          const sampleWithClassifications = addClassifications(sampleData);

          console.log(`\n🔍 Sample ${index + 1} - Classification results:`);
          console.log(`  Input: ph=${sampleData.ph}, ec=${sampleData.ec}, ocPercent=${sampleData.ocPercent}, p2o5=${sampleData.p2o5}, k2o=${sampleData.k2o}`);
          console.log(`  Crop: "${sampleData.cropName}", Final Deduction: "${sampleData.finalDeduction}"`);
          console.log(`  pH Result: ${sampleWithClassifications.phResult} / ${sampleWithClassifications.phResultEn}`);
          console.log(`  EC Result: ${sampleWithClassifications.ecResult} / ${sampleWithClassifications.ecResultEn}`);
          console.log(`  Nitrogen Result: ${sampleWithClassifications.nitrogenResult} / ${sampleWithClassifications.nitrogenResultEn}`);
          console.log(`  Phosphorus Result: ${sampleWithClassifications.phosphorusResult} / ${sampleWithClassifications.phosphorusResultEn}`);
          console.log(`  Potash Result: ${sampleWithClassifications.potashResult} / ${sampleWithClassifications.potashResultEn}`);

          const documentToSave = {
            sessionId: session._id,
            sessionDate: session.date,
            sessionVersion: session.version,
            ...sampleWithClassifications
          };

          console.log(`\n📝 Document to save has these fields:`);
          console.log(`  cropName: "${documentToSave.cropName}"`);
          console.log(`  finalDeduction: "${documentToSave.finalDeduction}"`);
          console.log(`  phResult: "${documentToSave.phResult}"`);
          console.log(`  ecResult: "${documentToSave.ecResult}"`);
          console.log(`  nitrogenResult: "${documentToSave.nitrogenResult}"`);
          console.log(`  phosphorusResult: "${documentToSave.phosphorusResult}"`);
          console.log(`  potashResult: "${documentToSave.potashResult}"`);

          return documentToSave;
        });

        const insertResult = await SoilSample.insertMany(newSamples);
        console.log(`\n  ✅ Created ${insertResult.length} new sample documents in "soil_samples" collection`);
        console.log(`  📊 Applied soil classification rules to all samples`);

        // Verify what was actually saved by querying MongoDB
        console.log(`\n🔍 Verifying what MongoDB actually saved for first sample:`);
        if (insertResult.length > 0) {
          const firstInserted = insertResult[0];
          console.log(`  From insertResult object:`);
          console.log(`    pH: "${firstInserted.phResult}" / "${firstInserted.phResultEn}"`);
          console.log(`    EC: "${firstInserted.ecResult}" / "${firstInserted.ecResultEn}"`);
          console.log(`    Nitrogen: "${firstInserted.nitrogenResult}" / "${firstInserted.nitrogenResultEn}"`);
          console.log(`    Phosphorus: "${firstInserted.phosphorusResult}" / "${firstInserted.phosphorusResultEn}"`);
          console.log(`    Potash: "${firstInserted.potashResult}" / "${firstInserted.potashResultEn}"`);

          // Query the database to see what was actually persisted
          const savedSample = await SoilSample.findById(firstInserted._id);
          console.log(`\n  From database query:`);
          console.log(`    cropName: "${savedSample.cropName}"`);
          console.log(`    finalDeduction: "${savedSample.finalDeduction}"`);
          console.log(`    pH: "${savedSample.phResult}" / "${savedSample.phResultEn}"`);
          console.log(`    EC: "${savedSample.ecResult}" / "${savedSample.ecResultEn}"`);
          console.log(`    Nitrogen: "${savedSample.nitrogenResult}" / "${savedSample.nitrogenResultEn}"`);
          console.log(`    Phosphorus: "${savedSample.phosphorusResult}" / "${savedSample.phosphorusResultEn}"`);
          console.log(`    Potash: "${savedSample.potashResult}" / "${savedSample.potashResultEn}"`);
        }
      }

      // Update session metadata
      session.sampleCount = data.length;
      session.lastActivity = new Date();
    }

    const updatedSession = await session.save();
    console.log(`  ✅ Session updated successfully`);

    // Fetch samples and return
    const samples = await SoilSample.find({ sessionId: session._id }).sort({ createdAt: 1 });
    const sessionObj = updatedSession.toObject();
    sessionObj.data = samples;

    res.json(sessionObj);
  } catch (error) {
    console.error('❌ Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Delete a session and its samples
router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await SoilSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete all associated samples
    const deleteResult = await SoilSample.deleteMany({ sessionId: req.params.id });
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} samples for session ${req.params.id}`);

    // Delete the session
    await SoilSession.findByIdAndDelete(req.params.id);

    res.json({ message: 'Session and associated samples deleted successfully', session });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Get today's session count
router.get('/sessions/today/count', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const count = await SoilSession.countDocuments({ date: today });
    res.json({ date: today, count });
  } catch (error) {
    console.error('Error counting today sessions:', error);
    res.status(500).json({ error: 'Failed to count sessions' });
  }
});

module.exports = router;

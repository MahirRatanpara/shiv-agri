const express = require('express');
const router = express.Router();
const soilTestingRoutes = require('./soilTesting');
const pdfGenerationRoutes = require('./pdfGeneration');

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to Shiv Agri API' });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Soil Testing routes
router.use('/soil-testing', soilTestingRoutes);

// PDF Generation routes
router.use('/pdf', pdfGenerationRoutes);

module.exports = router;

const express = require('express');
const router = express.Router();
const soilTestingRoutes = require('./soilTesting');

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to Shiv Agri API' });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Soil Testing routes
router.use('/soil-testing', soilTestingRoutes);

module.exports = router;

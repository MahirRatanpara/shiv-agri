const express = require('express');
const router = express.Router();
const landscapingRoutes = require('./landscaping.routes');

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to Shiv Agri API' });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Landscaping Management Module routes
router.use('/landscaping', landscapingRoutes);

module.exports = router;

const express = require('express');
const router = express.Router();
const soilTestingRoutes = require('./soilTesting');
const waterTestingRoutes = require('./waterTesting');
const pdfGenerationRoutes = require('./pdfGeneration');
const rolesRoutes = require('./roles');
const usersRoutes = require('./users');
const managerialWorkRoutes = require('./managerialWork');

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to Shiv Agri API' });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Soil Testing routes
router.use('/soil-testing', soilTestingRoutes);

// Water Testing routes
router.use('/water-testing', waterTestingRoutes);

// PDF Generation routes
router.use('/pdf', pdfGenerationRoutes);

// Roles and Permissions routes
router.use('/roles', rolesRoutes);

// User Management routes
router.use('/users', usersRoutes);

// Managerial Work routes (Receipts, Invoices, Letters)
router.use('/managerial-work', managerialWorkRoutes);

module.exports = router;

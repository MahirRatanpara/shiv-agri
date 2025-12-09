const express = require('express');
const router = express.Router();
const { googleLogin, refreshAccessToken, logout, getCurrentUser } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.post('/google', googleLogin);
router.post('/refresh', refreshAccessToken);

// Protected routes
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);

module.exports = router;

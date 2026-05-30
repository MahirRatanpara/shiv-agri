const express = require('express');
const router = express.Router();
const { googleLogin, googleLoginWithCode, refreshAccessToken, logout, getCurrentUser, getAuthConfig, updateCurrentUserProfile, requestProfilePhoneOtp, verifyProfilePhoneOtp, setProfilePhone, setProfileEmail } = require('../controllers/authController');
const { requestOtp, verifyOtp } = require('../controllers/otpAuthController');
const { authenticate } = require('../middleware/auth');
const { requireOtpEnabled } = require('../middleware/featureFlags');

// Public routes
router.get('/config', getAuthConfig);
router.post('/google', googleLogin);
router.post('/google-code', googleLoginWithCode);
router.post('/refresh', refreshAccessToken);

// Phone OTP login — disabled when OTP_LOGIN_ENABLED=false
router.post('/otp/request', requireOtpEnabled, requestOtp);
router.post('/otp/verify', requireOtpEnabled, verifyOtp);

// Protected routes
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);

// Admin-only direct phone change (normal users cannot edit a set number)
router.patch('/profile', authenticate, updateCurrentUserProfile);

// Self-service phone attach via OTP (only when no number exists yet) — disabled in Google-only mode
router.post('/profile/phone/request-otp', authenticate, requireOtpEnabled, requestProfilePhoneOtp);
router.post('/profile/phone/verify-otp', authenticate, requireOtpEnabled, verifyProfilePhoneOtp);

// Self-service MANUAL phone attach (no OTP) — used only when OTP login is disabled
router.post('/profile/phone', authenticate, setProfilePhone);

// Self-service email attach (only when no email exists yet)
router.post('/profile/email', authenticate, setProfileEmail);

module.exports = router;

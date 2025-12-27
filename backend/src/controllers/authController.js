const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Google OAuth login
 */
const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user - auto-approved
      user = new User({
        googleId,
        email,
        name,
        profilePhoto: picture,
        lastLogin: new Date()
      });
      await user.save();

      // Set roleRef based on role name
      const Role = require('../models/Role');
      const roleDoc = await Role.findOne({ name: user.role }).populate('permissions');
      if (roleDoc) {
        user.roleRef = roleDoc._id;
        await user.save();
      }

      // Populate roleRef with permissions for response
      await user.populate({
        path: 'roleRef',
        populate: { path: 'permissions' }
      });

      // Generate tokens for new user
      const accessToken = generateAccessToken({ userId: user._id, email: user.email, role: user.role });
      const refreshToken = generateRefreshToken({ userId: user._id });

      // Save refresh token
      user.refreshToken = refreshToken;
      await user.save();

      // Set cookies
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 // 1 hour
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return res.status(201).json({
        message: 'Account created successfully',
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          profilePhoto: user.profilePhoto,
          roleRef: user.roleRef
        }
      });
    }

    // Update existing user
    if (!user.googleId) {
      user.googleId = googleId;
    }
    if (picture) {
      user.profilePhoto = picture;
    }
    user.lastLogin = new Date();

    // Ensure roleRef is set
    if (!user.roleRef) {
      const Role = require('../models/Role');
      const roleDoc = await Role.findOne({ name: user.role });
      if (roleDoc) {
        user.roleRef = roleDoc._id;
      }
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user._id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user._id });

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Populate roleRef with permissions for response
    await user.populate({
      path: 'roleRef',
      populate: { path: 'permissions' }
    });

    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        profilePhoto: user.profilePhoto,
        roleRef: user.roleRef
      }
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
};

/**
 * Refresh access token
 */
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body || req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token is required' });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);

    // Find user and verify refresh token
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Generate new access token
    const accessToken = generateAccessToken({ userId: user._id, email: user.email, role: user.role });

    // Set cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    res.json({
      message: 'Token refreshed',
      accessToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
};

/**
 * Logout
 */
const logout = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (userId) {
      // Clear refresh token from database
      await User.findByIdAndUpdate(userId, { refreshToken: null });
    }

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

/**
 * Get current user
 */
const getCurrentUser = async (req, res) => {
  try {
    const user = req.user;

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        profilePhoto: user.profilePhoto,
        roleRef: user.roleRef
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
};

module.exports = {
  googleLogin,
  refreshAccessToken,
  logout,
  getCurrentUser
};

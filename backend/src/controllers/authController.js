const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateAccessToken, verifyToken, decodeToken } = require('../utils/jwt');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const normalizePhoneNumber = (phoneNumber = '') => String(phoneNumber).replace(/\D/g, '');

const serializeUser = (user) => ({
  id: user._id,
  email: user.email,
  name: user.name,
  role: user.role,
  profilePhoto: user.profilePhoto,
  phoneCountryCode: user.metadata?.phoneCountryCode || '',
  phoneNumber: user.metadata?.phoneNumber || '',
  department: user.metadata?.department || '',
  designation: user.metadata?.designation || '',
  roleRef: user.roleRef
});

/**
 * Google OAuth login (legacy ID token flow - kept as fallback)
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
      user = new User({
        googleId,
        email,
        name,
        profilePhoto: picture,
        lastLogin: new Date()
      });
      await user.save();

      const Role = require('../models/Role');
      const roleDoc = await Role.findOne({ name: user.role }).populate('permissions');
      if (roleDoc) {
        user.roleRef = roleDoc._id;
        await user.save();
      }

      await user.populate({
        path: 'roleRef',
        populate: { path: 'permissions' }
      });

      const accessToken = generateAccessToken({ userId: user._id, email: user.email, role: user.role });

      return res.status(201).json({
        message: 'Account created successfully',
        accessToken,
        user: serializeUser(user)
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

    if (!user.roleRef) {
      const Role = require('../models/Role');
      const roleDoc = await Role.findOne({ name: user.role });
      if (roleDoc) {
        user.roleRef = roleDoc._id;
      }
    }

    const accessToken = generateAccessToken({ userId: user._id, email: user.email, role: user.role });
    await user.save();

    await user.populate({
      path: 'roleRef',
      populate: { path: 'permissions' }
    });

    res.json({
      message: 'Login successful',
      accessToken,
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
};

/**
 * Google OAuth login with Authorization Code flow
 * Frontend sends an authorization code, backend exchanges it for tokens
 */
const googleLoginWithCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Google token exchange error:', tokenData);
      return res.status(400).json({ error: 'Failed to exchange authorization code', details: tokenData.error_description });
    }

    const { id_token, refresh_token: googleRefreshToken } = tokenData;

    // Verify the id_token to get user info
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await User.findOne({ email });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        googleId,
        email,
        name,
        profilePhoto: picture,
        lastLogin: new Date()
      });

      if (googleRefreshToken) {
        user.googleRefreshToken = googleRefreshToken;
      }
      await user.save();

      const Role = require('../models/Role');
      const roleDoc = await Role.findOne({ name: user.role }).populate('permissions');
      if (roleDoc) {
        user.roleRef = roleDoc._id;
        await user.save();
      }
    } else {
      // Update existing user
      if (!user.googleId) {
        user.googleId = googleId;
      }
      if (picture) {
        user.profilePhoto = picture;
      }
      user.lastLogin = new Date();

      // Store Google refresh token (only provided on first consent)
      if (googleRefreshToken) {
        user.googleRefreshToken = googleRefreshToken;
      }

      if (!user.roleRef) {
        const Role = require('../models/Role');
        const roleDoc = await Role.findOne({ name: user.role });
        if (roleDoc) {
          user.roleRef = roleDoc._id;
        }
      }

      await user.save();
    }

    // Populate roleRef with permissions for response
    await user.populate({
      path: 'roleRef',
      populate: { path: 'permissions' }
    });

    // Generate JWT access token (24h)
    const accessToken = generateAccessToken({ userId: user._id, email: user.email, role: user.role });

    res.status(isNewUser ? 201 : 200).json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      accessToken,
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Google code login error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
};

/**
 * Refresh access token using stored Google refresh token
 * Frontend sends the expired/expiring JWT for user identification
 */
const refreshAccessToken = async (req, res) => {
  try {
    // Get the current (possibly expired) access token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json({ error: 'Access token is required for refresh' });
    }

    // Decode token without strict expiry check (but still validates signature)
    let decoded;
    try {
      decoded = decodeToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Grace window: reject tokens that expired more than 30 days ago
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && (now - decoded.exp) > 30 * 24 * 60 * 60) {
      return res.status(401).json({ error: 'Token expired too long ago, please login again' });
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Use stored Google refresh token to validate with Google
    if (!user.googleRefreshToken) {
      return res.status(401).json({ error: 'No Google session found, please login again' });
    }

    // Call Google's token endpoint with the refresh token
    const googleResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: user.googleRefreshToken,
        grant_type: 'refresh_token'
      })
    });

    const googleData = await googleResponse.json();

    if (googleData.error) {
      // Google refresh token is revoked or invalid — user must re-login
      console.error('Google refresh token invalid:', googleData.error);
      user.googleRefreshToken = null;
      await user.save();
      return res.status(401).json({ error: 'Google session expired, please login again' });
    }

    // Google refresh succeeded — issue new JWT
    const accessToken = generateAccessToken({ userId: user._id, email: user.email, role: user.role });

    res.json({
      message: 'Token refreshed',
      accessToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ error: 'Token refresh failed' });
  }
};

/**
 * Logout - revoke Google refresh token and clear session
 */
const logout = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (userId) {
      const user = await User.findById(userId);

      if (user) {
        // Revoke Google refresh token if present
        if (user.googleRefreshToken) {
          try {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${user.googleRefreshToken}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
          } catch (revokeError) {
            console.error('Failed to revoke Google token (non-fatal):', revokeError);
          }
          user.googleRefreshToken = null;
        }

        user.refreshToken = null;
        await user.save();
      }
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
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
};

/**
 * Update current user's editable profile fields
 */
const updateCurrentUserProfile = async (req, res) => {
  try {
    const phoneCountryCode = String(req.body.phoneCountryCode || '+91').trim();
    const nationalPhoneNumber = String(req.body.phoneNumber || '').trim();
    const phoneNumber = nationalPhoneNumber.startsWith('+')
      ? nationalPhoneNumber
      : `${phoneCountryCode} ${nationalPhoneNumber}`.trim();
    const phoneNumberNormalized = normalizePhoneNumber(
      nationalPhoneNumber.startsWith('+') ? nationalPhoneNumber : `${phoneCountryCode}${nationalPhoneNumber}`
    );
    const nationalPhoneNumberNormalized = normalizePhoneNumber(nationalPhoneNumber);

    if (!nationalPhoneNumber) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    if (phoneNumberNormalized.length < 7) {
      return res.status(400).json({ error: 'Enter a valid mobile number' });
    }

    const userId = req.user?._id || req.body.userId || req.body.id;
    const email = String(req.user?.email || req.body.email || '').trim().toLowerCase();
    const userQuery = userId ? { _id: userId } : email ? { email } : null;

    if (!userQuery) {
      return res.status(400).json({ error: 'User identifier is required to update mobile number' });
    }

    const user = await User.findOne(userQuery).populate({
      path: 'roleRef',
      populate: { path: 'permissions' }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const directDuplicate = await User.findOne({
      _id: { $ne: user._id },
      $or: [
        { 'metadata.phoneNumberNormalized': phoneNumberNormalized },
        { 'metadata.phoneNumber': phoneNumber },
        { 'metadata.phoneNumber': phoneNumberNormalized },
        { 'metadata.phoneNumber': nationalPhoneNumber },
        { 'metadata.phoneNumber': nationalPhoneNumberNormalized }
      ]
    }).select('_id');
    const usersWithPhones = directDuplicate ? [] : await User.find({
      _id: { $ne: user._id },
      $or: [
        { 'metadata.phoneNumber': { $exists: true, $ne: '' } },
        { 'metadata.phoneNumberNormalized': { $exists: true, $ne: '' } }
      ]
    }).select('_id metadata.phoneNumber metadata.phoneNumberNormalized');
    const normalizedDuplicate = usersWithPhones.find((candidate) => {
      const candidatePhone = candidate.metadata?.phoneNumberNormalized || normalizePhoneNumber(candidate.metadata?.phoneNumber);
      return candidatePhone === phoneNumberNormalized || candidatePhone === nationalPhoneNumberNormalized;
    });

    if (directDuplicate || normalizedDuplicate) {
      return res.status(409).json({ error: 'This mobile number is already linked to another user' });
    }

    user.metadata = {
      ...(user.metadata?.toObject ? user.metadata.toObject() : user.metadata || {}),
      phoneCountryCode,
      phoneNumber,
      phoneNumberNormalized
    };

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

module.exports = {
  googleLogin,
  googleLoginWithCode,
  refreshAccessToken,
  logout,
  getCurrentUser,
  updateCurrentUserProfile
};

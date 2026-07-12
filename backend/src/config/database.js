const mongoose = require('mongoose');
const { runUserIdentityHygiene } = require('../utils/userIdentityHygiene');

const connectDB = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shiv-agri';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // One-time-per-boot hygiene: unset blank email/googleId/phone values
    // on existing users and drop the legacy sparse-unique indexes so the
    // partial-index variants on the User model can build cleanly. Idempotent.
    runUserIdentityHygiene().catch((err) => {
      console.warn('User identity hygiene pass failed (non-fatal):', err?.message);
    });
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

module.exports = connectDB;

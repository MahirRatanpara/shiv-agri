const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  profilePhoto: {
    type: String
  },
  role: {
    type: String,
    enum: ['admin', 'user', 'assistant'],
    default: 'user'
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  refreshToken: {
    type: String
  },
  lastLogin: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);

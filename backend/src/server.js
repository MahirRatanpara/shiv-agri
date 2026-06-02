const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const connectDB = require('./config/database');
const fertilizerCropConfig = require('./config/fertilizerCropConfig');
const mediaCleanupService = require('./services/mediaCleanupService');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');

const app = express();

// Connect to database
connectDB();

// Load static backend configs (in-memory)
fertilizerCropConfig.loadConfig();

// Start scheduled media cleanup: permanently purges soft-deleted media
// (farm photos, designs, prescriptions, attached images) older than the
// retention window (default 30 days) and removes the underlying files
// from the media service.
mediaCleanupService.startScheduled();

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:4200',
  credentials: true,
  exposedHeaders: ['X-Total-Count', 'Content-Disposition']
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/health', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

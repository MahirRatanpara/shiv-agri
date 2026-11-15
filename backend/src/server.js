const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const connectDB = require('./config/database');
const fertilizerCropConfig = require('./config/fertilizerCropConfig');
const mediaCleanupService = require('./services/mediaCleanupService');
const reportDeliveryReconciler = require('./services/reportDeliveryReconciler');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const appVersionRoutes = require('./routes/appVersion');
const { enforceMinAppVersion } = require('./middleware/appVersionGate');

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

// Lab report delivery reconciler (every 30 min): re-sends missed WhatsApp/email report
// deliveries, retries transient failures and syncs WhatsApp delivered/read statuses.
reportDeliveryReconciler.startScheduled();

// Allowed origins: configured web origins + native app WebView origins.
// Capacitor serves the app from capacitor://localhost (iOS) and http(s)://localhost
// (Android), which are cross-origin to the API and must be whitelisted for the
// credentialed login request to succeed.
const configuredOrigins = (process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean)) || ['http://localhost:4200'];
const nativeOrigins = ['capacitor://localhost', 'http://localhost', 'https://localhost'];
const allowedOrigins = [...configuredOrigins, ...nativeOrigins];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (e.g. native HTTP, curl, same-origin).
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  exposedHeaders: ['X-Total-Count', 'Content-Disposition']
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
// The app-version endpoint is mounted BEFORE the gate: a build that the gate
// blocks must still be able to ask what it should update to.
app.use('/api/app', appVersionRoutes);

// Everything below here refuses native builds older than ANDROID_MIN_VERSION_CODE
// with 426 Upgrade Required. Inert until that variable is set (default 0).
app.use('/api', enforceMinAppVersion);

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

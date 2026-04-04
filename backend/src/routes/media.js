const express = require('express');
const router = express.Router();
const multer = require('multer');
const Media = require('../models/Media');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Allowed: JPEG, PNG, GIF, WebP, PDF'));
    }
  }
});

router.use(authenticate);

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }
    if (!req.body.projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }

    const media = await Media.create({
      projectId: req.body.projectId,
      filename: `${Date.now()}-${req.file.originalname}`,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      category: req.body.category || 'general',
      data: req.file.buffer,
      uploadedBy: req.user.id
    });

    logger.info(`[Media] Uploaded ${media.filename} for project ${req.body.projectId}`);
    res.status(201).json({
      success: true,
      data: {
        _id: media._id,
        projectId: media.projectId,
        filename: media.filename,
        originalName: media.originalName,
        mimeType: media.mimeType,
        size: media.size,
        category: media.category,
        createdAt: media.createdAt
      }
    });
  } catch (error) {
    logger.error('[Media] Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all media for a project
router.get('/project/:projectId', async (req, res) => {
  try {
    const media = await Media.find({ projectId: req.params.projectId })
      .select('-data')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: media });
  } catch (error) {
    logger.error('[Media] Get by project error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get file content (serve the actual file)
router.get('/:id/file', async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }
    res.set('Content-Type', media.mimeType);
    res.set('Content-Disposition', `inline; filename="${media.originalName}"`);
    res.send(media.data);
  } catch (error) {
    logger.error('[Media] Get file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete media
router.delete('/:id', async (req, res) => {
  try {
    const media = await Media.findByIdAndDelete(req.params.id);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }
    logger.info(`[Media] Deleted ${media.filename}`);
    res.json({ success: true, message: 'Media deleted' });
  } catch (error) {
    logger.error('[Media] Delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

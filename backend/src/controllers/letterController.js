const Letter = require('../models/Letter');
const logger = require('../utils/logger');

/**
 * Get all letters with filters
 */
exports.getLetters = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      startDate,
      endDate,
      letterType,
      tags,
      includeDrafts = false
    } = req.query;

    const query = { isDeleted: false };

    // Exclude drafts by default
    if (includeDrafts !== 'true') {
      query.isDraft = false;
    }

    // Search in content, subject, and recipient name
    if (search) {
      query.$text = { $search: search };
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Letter type filter
    if (letterType) {
      query.letterType = letterType;
    }

    // Tags filter
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      query.tags = { $in: tagArray };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [letters, total] = await Promise.all([
      Letter.find(query)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Letter.countDocuments(query)
    ]);

    res.json({
      letters: letters.map(l => ({
        ...l.toClientJSON(),
        // Return only preview of content in list
        contentPreview: l.contentPlainText?.substring(0, 100) + '...' || ''
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching letters:', error);
    res.status(500).json({ error: 'Failed to fetch letters' });
  }
};

/**
 * Get single letter by ID
 */
exports.getLetterById = async (req, res) => {
  try {
    const letter = await Letter.findOne({
      _id: req.params.id,
      isDeleted: false
    }).populate('createdBy', 'name email');

    if (!letter) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    res.json(letter.toClientJSON());
  } catch (error) {
    logger.error('Error fetching letter:', error);
    res.status(500).json({ error: 'Failed to fetch letter' });
  }
};

/**
 * Create new letter
 */
exports.createLetter = async (req, res) => {
  try {
    const {
      letterNumber,
      date,
      letterType,
      subject,
      recipientName,
      recipientAddress,
      content,
      tags,
      companyName,
      consultantName,
      consultantCredentials,
      consultantTitle,
      contactPhone,
      contactEmail,
      companyAddress,
      isDraft
    } = req.body;

    // Validate content
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Letter content is required' });
    }

    // Generate letter number if not provided and not a draft
    let finalLetterNumber = letterNumber;
    if (!finalLetterNumber && !isDraft) {
      finalLetterNumber = await Letter.getNextLetterNumber();
    }

    const letter = new Letter({
      letterNumber: finalLetterNumber,
      date: date || new Date(),
      letterType,
      subject,
      recipientName,
      recipientAddress,
      content,
      tags: tags || [],
      companyName,
      consultantName,
      consultantCredentials,
      consultantTitle,
      contactPhone,
      contactEmail,
      companyAddress,
      isDraft: isDraft || false,
      createdBy: req.user._id
    });

    await letter.save();

    logger.info(`Letter created: ${letter.letterNumber || 'Draft'} by user ${req.user.email}`);

    res.status(201).json(letter.toClientJSON());
  } catch (error) {
    logger.error('Error creating letter:', error);

    if (error.code === 11000) {
      return res.status(400).json({ error: 'Letter number already exists' });
    }

    res.status(500).json({ error: 'Failed to create letter' });
  }
};

/**
 * Update letter
 */
exports.updateLetter = async (req, res) => {
  try {
    const letter = await Letter.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!letter) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    const {
      letterNumber,
      date,
      letterType,
      subject,
      recipientName,
      recipientAddress,
      content,
      tags,
      companyName,
      consultantName,
      consultantCredentials,
      consultantTitle,
      contactPhone,
      contactEmail,
      companyAddress,
      isDraft
    } = req.body;

    // Update fields
    if (letterNumber !== undefined) letter.letterNumber = letterNumber;
    if (date !== undefined) letter.date = date;
    if (letterType !== undefined) letter.letterType = letterType;
    if (subject !== undefined) letter.subject = subject;
    if (recipientName !== undefined) letter.recipientName = recipientName;
    if (recipientAddress !== undefined) letter.recipientAddress = recipientAddress;
    if (content !== undefined) letter.content = content;
    if (tags !== undefined) letter.tags = tags;
    if (companyName !== undefined) letter.companyName = companyName;
    if (consultantName !== undefined) letter.consultantName = consultantName;
    if (consultantCredentials !== undefined) letter.consultantCredentials = consultantCredentials;
    if (consultantTitle !== undefined) letter.consultantTitle = consultantTitle;
    if (contactPhone !== undefined) letter.contactPhone = contactPhone;
    if (contactEmail !== undefined) letter.contactEmail = contactEmail;
    if (companyAddress !== undefined) letter.companyAddress = companyAddress;
    if (isDraft !== undefined) letter.isDraft = isDraft;

    letter.updatedBy = req.user._id;
    letter.version += 1;

    await letter.save();

    logger.info(`Letter updated: ${letter.letterNumber} by user ${req.user.email}`);

    res.json(letter.toClientJSON());
  } catch (error) {
    logger.error('Error updating letter:', error);
    res.status(500).json({ error: 'Failed to update letter' });
  }
};

/**
 * Delete letter (soft delete)
 */
exports.deleteLetter = async (req, res) => {
  try {
    const letter = await Letter.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!letter) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    await letter.softDelete(req.user._id);

    logger.info(`Letter deleted: ${letter.letterNumber} by user ${req.user.email}`);

    res.json({ message: 'Letter deleted successfully' });
  } catch (error) {
    logger.error('Error deleting letter:', error);
    res.status(500).json({ error: 'Failed to delete letter' });
  }
};

/**
 * Get next letter number
 */
exports.getNextLetterNumber = async (req, res) => {
  try {
    const nextNumber = await Letter.getNextLetterNumber();
    res.json({ letterNumber: nextNumber });
  } catch (error) {
    logger.error('Error generating letter number:', error);
    res.status(500).json({ error: 'Failed to generate letter number' });
  }
};

/**
 * Get service list template
 */
exports.getServiceListTemplate = async (req, res) => {
  try {
    const template = Letter.getServiceListTemplate();
    res.json({ template });
  } catch (error) {
    logger.error('Error fetching service list template:', error);
    res.status(500).json({ error: 'Failed to fetch service list template' });
  }
};

/**
 * Update PDF reference after generation
 */
exports.updatePdfReference = async (req, res) => {
  try {
    const { pdfUrl } = req.body;

    const letter = await Letter.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!letter) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    letter.pdfUrl = pdfUrl;
    letter.pdfGeneratedAt = new Date();

    await letter.save();

    res.json(letter.toClientJSON());
  } catch (error) {
    logger.error('Error updating PDF reference:', error);
    res.status(500).json({ error: 'Failed to update PDF reference' });
  }
};

/**
 * Get all unique tags
 */
exports.getAllTags = async (req, res) => {
  try {
    const tags = await Letter.distinct('tags', { isDeleted: false });
    res.json({ tags: tags.sort() });
  } catch (error) {
    logger.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
};

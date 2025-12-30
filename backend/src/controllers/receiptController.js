const Receipt = require('../models/Receipt');
const logger = require('../utils/logger');

/**
 * Get all receipts with filters
 */
exports.getReceipts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      startDate,
      endDate,
      paymentMethod,
      paymentType,
      minAmount,
      maxAmount
    } = req.query;

    const query = { isDeleted: false };

    // Search by receipt number or customer name
    if (search) {
      query.$text = { $search: search };
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Payment method filter
    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    // Payment type filter
    if (paymentType) {
      query.paymentType = paymentType;
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseFloat(minAmount);
      if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [receipts, total] = await Promise.all([
      Receipt.find(query)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Receipt.countDocuments(query)
    ]);

    // Calculate total amount for filtered results
    const totalAmount = await Receipt.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      receipts: receipts.map(r => r.toClientJSON()),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      summary: {
        totalAmount: totalAmount[0]?.total || 0
      }
    });
  } catch (error) {
    logger.error('Error fetching receipts:', error);
    res.status(500).json({ error: 'Failed to fetch receipts' });
  }
};

/**
 * Get single receipt by ID
 */
exports.getReceiptById = async (req, res) => {
  try {
    const receipt = await Receipt.findOne({
      _id: req.params.id,
      isDeleted: false
    }).populate('createdBy', 'name email');

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json(receipt.toClientJSON());
  } catch (error) {
    logger.error('Error fetching receipt:', error);
    res.status(500).json({ error: 'Failed to fetch receipt' });
  }
};

/**
 * Create new receipt
 */
exports.createReceipt = async (req, res) => {
  try {
    const {
      receiptNumber,
      date,
      customerName,
      customerAddress,
      amount,
      amountInWords,
      paymentMethod,
      chequeNumber,
      bankName,
      paymentType,
      billReference,
      billDate,
      remarks
    } = req.body;

    // Generate receipt number if not provided
    let finalReceiptNumber = receiptNumber;
    if (!finalReceiptNumber) {
      finalReceiptNumber = await Receipt.getNextReceiptNumber();
    }

    const receipt = new Receipt({
      receiptNumber: finalReceiptNumber,
      date: date || new Date(),
      customerName,
      customerAddress,
      amount,
      amountInWords,
      paymentMethod,
      chequeNumber,
      bankName,
      paymentType,
      billReference,
      billDate,
      remarks,
      createdBy: req.user._id
    });

    await receipt.save();

    logger.info(`Receipt created: ${receipt.receiptNumber} by user ${req.user.email}`);

    res.status(201).json(receipt.toClientJSON());
  } catch (error) {
    logger.error('Error creating receipt:', error);

    if (error.code === 11000) {
      return res.status(400).json({ error: 'Receipt number already exists' });
    }

    res.status(500).json({ error: 'Failed to create receipt' });
  }
};

/**
 * Update receipt (creates new version)
 */
exports.updateReceipt = async (req, res) => {
  try {
    const receipt = await Receipt.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Update fields
    const {
      date,
      customerName,
      customerAddress,
      amount,
      amountInWords,
      paymentMethod,
      chequeNumber,
      bankName,
      paymentType,
      billReference,
      billDate,
      remarks
    } = req.body;

    if (date !== undefined) receipt.date = date;
    if (customerName !== undefined) receipt.customerName = customerName;
    if (customerAddress !== undefined) receipt.customerAddress = customerAddress;
    if (amount !== undefined) receipt.amount = amount;
    if (amountInWords !== undefined) receipt.amountInWords = amountInWords;
    if (paymentMethod !== undefined) receipt.paymentMethod = paymentMethod;
    if (chequeNumber !== undefined) receipt.chequeNumber = chequeNumber;
    if (bankName !== undefined) receipt.bankName = bankName;
    if (paymentType !== undefined) receipt.paymentType = paymentType;
    if (billReference !== undefined) receipt.billReference = billReference;
    if (billDate !== undefined) receipt.billDate = billDate;
    if (remarks !== undefined) receipt.remarks = remarks;

    receipt.updatedBy = req.user._id;
    receipt.version += 1;

    await receipt.save();

    logger.info(`Receipt updated: ${receipt.receiptNumber} by user ${req.user.email}`);

    res.json(receipt.toClientJSON());
  } catch (error) {
    logger.error('Error updating receipt:', error);
    res.status(500).json({ error: 'Failed to update receipt' });
  }
};

/**
 * Delete receipt (soft delete)
 */
exports.deleteReceipt = async (req, res) => {
  try {
    const receipt = await Receipt.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    await receipt.softDelete(req.user._id);

    logger.info(`Receipt deleted: ${receipt.receiptNumber} by user ${req.user.email}`);

    res.json({ message: 'Receipt deleted successfully' });
  } catch (error) {
    logger.error('Error deleting receipt:', error);
    res.status(500).json({ error: 'Failed to delete receipt' });
  }
};

/**
 * Get next receipt number
 */
exports.getNextReceiptNumber = async (req, res) => {
  try {
    const nextNumber = await Receipt.getNextReceiptNumber();
    res.json({ receiptNumber: nextNumber });
  } catch (error) {
    logger.error('Error generating receipt number:', error);
    res.status(500).json({ error: 'Failed to generate receipt number' });
  }
};

/**
 * Update PDF reference after generation
 */
exports.updatePdfReference = async (req, res) => {
  try {
    const { pdfUrl } = req.body;

    const receipt = await Receipt.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    receipt.pdfUrl = pdfUrl;
    receipt.pdfGeneratedAt = new Date();

    await receipt.save();

    res.json(receipt.toClientJSON());
  } catch (error) {
    logger.error('Error updating PDF reference:', error);
    res.status(500).json({ error: 'Failed to update PDF reference' });
  }
};

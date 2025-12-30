const Invoice = require('../models/Invoice');
const logger = require('../utils/logger');

/**
 * Get all invoices with filters
 */
exports.getInvoices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      startDate,
      endDate,
      paymentStatus,
      minAmount,
      maxAmount,
      includeDrafts = false
    } = req.query;

    const query = { isDeleted: false };

    // Exclude drafts by default
    if (includeDrafts !== 'true') {
      query.isDraft = false;
    }

    // Search by invoice number, customer name, location, or village
    if (search) {
      query.$text = { $search: search };
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Payment status filter
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      query.grandTotal = {};
      if (minAmount) query.grandTotal.$gte = parseFloat(minAmount);
      if (maxAmount) query.grandTotal.$lte = parseFloat(maxAmount);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('createdBy', 'name email')
        .populate('linkedReceipts')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Invoice.countDocuments(query)
    ]);

    // Calculate summary statistics
    const summary = await Invoice.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$grandTotal' },
          totalPaid: { $sum: '$paidAmount' },
          totalUnpaid: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, '$grandTotal', 0]
            }
          }
        }
      }
    ]);

    res.json({
      invoices: invoices.map(i => i.toClientJSON()),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      summary: {
        totalAmount: summary[0]?.totalAmount || 0,
        totalPaid: summary[0]?.totalPaid || 0,
        totalUnpaid: summary[0]?.totalUnpaid || 0
      }
    });
  } catch (error) {
    logger.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

/**
 * Get single invoice by ID
 */
exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      isDeleted: false
    })
      .populate('createdBy', 'name email')
      .populate('linkedReceipts');

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice.toClientJSON());
  } catch (error) {
    logger.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
};

/**
 * Create new invoice
 */
exports.createInvoice = async (req, res) => {
  try {
    const {
      invoiceNumber,
      invoiceType,
      date,
      customerName,
      referenceNumber,
      location,
      village,
      phoneNumber,
      mobileNumber,
      items,
      taxAmount,
      discount,
      grandTotalInWords,
      consultantName,
      consultantCredentials,
      remarks,
      isDraft
    } = req.body;

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Invoice must have at least one item' });
    }

    // Calculate line item totals
    const processedItems = items.map((item, index) => ({
      serialNumber: item.serialNumber || index + 1,
      description: item.description,
      descriptionGujarati: item.descriptionGujarati,
      rate: parseFloat(item.rate),
      quantity: parseFloat(item.quantity),
      total: parseFloat(item.rate) * parseFloat(item.quantity)
    }));

    // Generate invoice number if not provided and not a draft
    let finalInvoiceNumber = invoiceNumber;
    if (!finalInvoiceNumber && !isDraft) {
      finalInvoiceNumber = await Invoice.getNextInvoiceNumber();
    }

    const invoice = new Invoice({
      invoiceNumber: finalInvoiceNumber,
      invoiceType,
      date: date || new Date(),
      customerName,
      referenceNumber,
      location,
      village,
      phoneNumber,
      mobileNumber,
      items: processedItems,
      taxAmount: taxAmount || 0,
      discount: discount || 0,
      grandTotalInWords,
      consultantName,
      consultantCredentials,
      remarks,
      isDraft: isDraft || false,
      createdBy: req.user._id
    });

    // Calculate totals
    invoice.calculateTotals();

    await invoice.save();

    logger.info(`Invoice created: ${invoice.invoiceNumber || 'Draft'} by user ${req.user.email}`);

    res.status(201).json(invoice.toClientJSON());
  } catch (error) {
    logger.error('Error creating invoice:', error);

    if (error.code === 11000) {
      return res.status(400).json({ error: 'Invoice number already exists' });
    }

    res.status(500).json({ error: 'Failed to create invoice' });
  }
};

/**
 * Update invoice
 */
exports.updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const {
      invoiceNumber,
      invoiceType,
      date,
      customerName,
      referenceNumber,
      location,
      village,
      phoneNumber,
      mobileNumber,
      items,
      taxAmount,
      discount,
      grandTotalInWords,
      consultantName,
      consultantCredentials,
      remarks,
      isDraft
    } = req.body;

    // Update fields
    if (invoiceNumber !== undefined) invoice.invoiceNumber = invoiceNumber;
    if (invoiceType !== undefined) invoice.invoiceType = invoiceType;
    if (date !== undefined) invoice.date = date;
    if (customerName !== undefined) invoice.customerName = customerName;
    if (referenceNumber !== undefined) invoice.referenceNumber = referenceNumber;
    if (location !== undefined) invoice.location = location;
    if (village !== undefined) invoice.village = village;
    if (phoneNumber !== undefined) invoice.phoneNumber = phoneNumber;
    if (mobileNumber !== undefined) invoice.mobileNumber = mobileNumber;
    if (taxAmount !== undefined) invoice.taxAmount = taxAmount;
    if (discount !== undefined) invoice.discount = discount;
    if (grandTotalInWords !== undefined) invoice.grandTotalInWords = grandTotalInWords;
    if (consultantName !== undefined) invoice.consultantName = consultantName;
    if (consultantCredentials !== undefined) invoice.consultantCredentials = consultantCredentials;
    if (remarks !== undefined) invoice.remarks = remarks;
    if (isDraft !== undefined) invoice.isDraft = isDraft;

    // Update items if provided
    if (items && items.length > 0) {
      invoice.items = items.map((item, index) => ({
        serialNumber: item.serialNumber || index + 1,
        description: item.description,
        descriptionGujarati: item.descriptionGujarati,
        rate: parseFloat(item.rate),
        quantity: parseFloat(item.quantity),
        total: parseFloat(item.rate) * parseFloat(item.quantity)
      }));
    }

    // Recalculate totals
    invoice.calculateTotals();

    invoice.updatedBy = req.user._id;
    invoice.version += 1;

    await invoice.save();

    logger.info(`Invoice updated: ${invoice.invoiceNumber} by user ${req.user.email}`);

    res.json(invoice.toClientJSON());
  } catch (error) {
    logger.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
};

/**
 * Update payment status
 */
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus, paidAmount, receiptId } = req.body;

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (paymentStatus) {
      invoice.paymentStatus = paymentStatus;
    }

    if (paidAmount !== undefined) {
      invoice.paidAmount = parseFloat(paidAmount);
      invoice.updatePaymentStatus();
    }

    // Link receipt if provided
    if (receiptId && !invoice.linkedReceipts.includes(receiptId)) {
      invoice.linkedReceipts.push(receiptId);
    }

    invoice.updatedBy = req.user._id;

    await invoice.save();

    logger.info(`Invoice payment status updated: ${invoice.invoiceNumber} by user ${req.user.email}`);

    res.json(invoice.toClientJSON());
  } catch (error) {
    logger.error('Error updating payment status:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
};

/**
 * Delete invoice (soft delete)
 */
exports.deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await invoice.softDelete(req.user._id);

    logger.info(`Invoice deleted: ${invoice.invoiceNumber} by user ${req.user.email}`);

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    logger.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
};

/**
 * Duplicate invoice
 */
exports.duplicateInvoice = async (req, res) => {
  try {
    const originalInvoice = await Invoice.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!originalInvoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Create new invoice with same data
    const newInvoiceNumber = await Invoice.getNextInvoiceNumber();

    const duplicateInvoice = new Invoice({
      invoiceNumber: newInvoiceNumber,
      invoiceType: originalInvoice.invoiceType,
      date: new Date(),
      customerName: originalInvoice.customerName,
      referenceNumber: originalInvoice.referenceNumber,
      location: originalInvoice.location,
      village: originalInvoice.village,
      phoneNumber: originalInvoice.phoneNumber,
      mobileNumber: originalInvoice.mobileNumber,
      items: originalInvoice.items,
      taxAmount: originalInvoice.taxAmount,
      discount: originalInvoice.discount,
      consultantName: originalInvoice.consultantName,
      consultantCredentials: originalInvoice.consultantCredentials,
      originalInvoiceId: originalInvoice._id,
      createdBy: req.user._id
    });

    duplicateInvoice.calculateTotals();

    await duplicateInvoice.save();

    logger.info(`Invoice duplicated: ${originalInvoice.invoiceNumber} -> ${duplicateInvoice.invoiceNumber} by user ${req.user.email}`);

    res.status(201).json(duplicateInvoice.toClientJSON());
  } catch (error) {
    logger.error('Error duplicating invoice:', error);
    res.status(500).json({ error: 'Failed to duplicate invoice' });
  }
};

/**
 * Get next invoice number
 */
exports.getNextInvoiceNumber = async (req, res) => {
  try {
    const nextNumber = await Invoice.getNextInvoiceNumber();
    res.json({ invoiceNumber: nextNumber });
  } catch (error) {
    logger.error('Error generating invoice number:', error);
    res.status(500).json({ error: 'Failed to generate invoice number' });
  }
};

/**
 * Get service options
 */
exports.getServiceOptions = async (req, res) => {
  try {
    const services = Invoice.getServiceOptions();
    res.json({ services });
  } catch (error) {
    logger.error('Error fetching service options:', error);
    res.status(500).json({ error: 'Failed to fetch service options' });
  }
};

/**
 * Update PDF reference after generation
 */
exports.updatePdfReference = async (req, res) => {
  try {
    const { pdfUrl } = req.body;

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    invoice.pdfUrl = pdfUrl;
    invoice.pdfGeneratedAt = new Date();

    await invoice.save();

    res.json(invoice.toClientJSON());
  } catch (error) {
    logger.error('Error updating PDF reference:', error);
    res.status(500).json({ error: 'Failed to update PDF reference' });
  }
};

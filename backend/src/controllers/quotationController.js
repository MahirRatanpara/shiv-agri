const quotationService = require('../services/quotationService');
const logger = require('../utils/logger');

exports.createQuotation = async (req, res) => {
  try {
    const result = await quotationService.createQuotation(req.params.id, req.body, req.user);
    res.status(201).json({
      success: true,
      data: { quotation: result.quotation, project: result.project },
      message: 'Quotation submitted successfully'
    });
  } catch (error) {
    logger.error(`Error creating quotation for project ${req.params.id}: ${error.message}`);
    const statusCode = error.message === 'Project not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to submit quotation',
      message: error.message
    });
  }
};

exports.listQuotations = async (req, res) => {
  try {
    const { kind } = req.query;
    const quotations = await quotationService.getQuotationsForProject(req.params.id, { kind });
    res.status(200).json({ success: true, quotations });
  } catch (error) {
    logger.error(`Error listing quotations for project ${req.params.id}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quotations',
      message: error.message
    });
  }
};

/**
 * Create an adhoc BOP (Bill of Project) quotation for a landscaping project.
 * Accepts optional multipart `files` (images/PDFs) that become attachments
 * on the new quotation. Body JSON arrives via the standard multer text
 * fields, so `bopItems` is JSON-encoded.
 */
exports.createBopQuotation = async (req, res) => {
  try {
    // When the request is multipart, `bopItems` and `attachInitial` flags
    // come through as strings. JSON requests pass through untouched.
    const rawBody = req.body || {};
    const parsedItems = typeof rawBody.bopItems === 'string'
      ? safeParseJson(rawBody.bopItems, [])
      : rawBody.bopItems;

    const payload = {
      ...rawBody,
      bopItems: parsedItems
    };

    const files = Array.isArray(req.files) ? req.files : [];

    const result = await quotationService.createBopQuotation(
      req.params.id,
      payload,
      req.user,
      files
    );

    res.status(201).json({
      success: true,
      data: { quotation: result.quotation, project: result.project },
      attachmentFailures: result.attachmentFailures || [],
      message: 'BOP quotation created.'
    });
  } catch (error) {
    logger.error(`Error creating BOP quotation for project ${req.params.id}: ${error.message}`);
    const statusCode = error.message === 'Project not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to create BOP quotation',
      message: error.message
    });
  }
};

/**
 * Attach additional photos/PDFs to an existing BOP quotation.
 */
exports.addBopAttachments = async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }
    const result = await quotationService.addBopAttachments(
      req.params.id,
      req.params.quotationId,
      files,
      req.user
    );
    const status = result.added.length === 0 ? 502 : (result.failures.length ? 207 : 201);
    res.status(status).json({
      success: result.added.length > 0,
      added: result.added,
      failures: result.failures,
      quotation: result.quotation
    });
  } catch (error) {
    logger.error(`Error adding BOP attachments: ${error.message}`);
    const code = error.message.includes('not found') ? 404 : 400;
    res.status(code).json({
      success: false,
      error: 'Failed to add attachments',
      message: error.message
    });
  }
};

/**
 * Remove a single attachment from an existing BOP quotation.
 */
exports.removeBopAttachment = async (req, res) => {
  try {
    await quotationService.removeBopAttachment(
      req.params.id,
      req.params.quotationId,
      req.params.attachmentId,
      req.user
    );
    res.json({ success: true, message: 'Attachment removed.' });
  } catch (error) {
    logger.error(`Error removing BOP attachment: ${error.message}`);
    const code = error.message.includes('not found') ? 404 : 400;
    res.status(code).json({
      success: false,
      error: 'Failed to remove attachment',
      message: error.message
    });
  }
};

/** Defensive JSON.parse — returns the fallback on any error. */
function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

/**
 * Admin-only: revert a previously-marked-paid installment. Resets the
 * installment to pending and soft-deletes the linked invoice.
 */
exports.revertInstallmentPayment = async (req, res) => {
  try {
    const installmentNumber = parseInt(req.params.installmentNumber, 10);
    if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid installment number'
      });
    }

    const result = await quotationService.revertInstallmentPayment(
      req.params.id,
      req.params.quotationId,
      installmentNumber,
      req.user
    );

    res.status(200).json({
      success: true,
      data: {
        quotation: result.quotation,
        revertedInstallment: result.revertedInstallment,
        invoiceNumber: result.invoiceNumber,
        invoiceSoftDeleted: result.invoiceSoftDeleted
      },
      message: result.invoiceSoftDeleted
        ? `Installment ${result.revertedInstallment} reverted. Invoice ${result.invoiceNumber} removed.`
        : `Installment ${result.revertedInstallment} reverted.`
    });
  } catch (error) {
    logger.error(`Error reverting installment payment: ${error.message}`);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to revert installment payment',
      message: error.message
    });
  }
};

/**
 * Mark a quotation installment as paid and idempotently create an invoice
 * for the paid amount. Returns the (possibly pre-existing) invoice so the
 * client can immediately offer/download the PDF.
 */
exports.markInstallmentPaid = async (req, res) => {
  try {
    const installmentNumber = parseInt(req.params.installmentNumber, 10);
    if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid installment number'
      });
    }

    const result = await quotationService.markInstallmentPaid(
      req.params.id,
      req.params.quotationId,
      installmentNumber,
      req.user
    );

    res.status(result.alreadyPaid ? 200 : 201).json({
      success: true,
      alreadyPaid: result.alreadyPaid,
      data: {
        quotation: result.quotation,
        invoice: result.invoice.toClientJSON ? result.invoice.toClientJSON() : result.invoice
      },
      message: result.alreadyPaid
        ? 'Installment was already paid. Existing invoice returned.'
        : 'Installment marked paid. Invoice created.'
    });
  } catch (error) {
    logger.error(`Error marking installment paid: ${error.message}`);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to mark installment paid',
      message: error.message
    });
  }
};

exports.getActiveQuotation = async (req, res) => {
  try {
    const quotation = await quotationService.getActiveQuotation(req.params.id);
    res.status(200).json({ success: true, quotation });
  } catch (error) {
    logger.error(`Error fetching active quotation ${req.params.id}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quotation',
      message: error.message
    });
  }
};

exports.getQuotation = async (req, res) => {
  try {
    const quotation = await quotationService.getQuotationById(req.params.id, req.params.quotationId);
    res.status(200).json({ success: true, quotation });
  } catch (error) {
    logger.error(`Error fetching quotation ${req.params.quotationId}: ${error.message}`);
    const statusCode = error.message === 'Quotation not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to fetch quotation',
      message: error.message
    });
  }
};

exports.acceptQuotation = async (req, res) => {
  try {
    const result = await quotationService.acceptQuotation(
      req.params.id,
      req.params.quotationId,
      req.user
    );
    res.status(200).json({
      success: true,
      data: { quotation: result.quotation, project: result.project },
      message: 'Quotation accepted. Farm is now approved.'
    });
  } catch (error) {
    logger.error(`Error accepting quotation ${req.params.quotationId}: ${error.message}`);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to accept quotation',
      message: error.message
    });
  }
};

exports.downloadQuotationPdf = async (req, res) => {
  try {
    const Project = require('../models/Project');
    const Quotation = require('../models/Quotation');
    const pdfGenerator = require('./../services/pdfGenerator');

    const project = await Project.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const quotation = await Quotation.findOne({ _id: req.params.quotationId, project: project._id }).lean();
    if (!quotation) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    const pdfBuffer = await pdfGenerator.generateQuotationPDF(quotation, project);

    const farmName = (project.name || 'farm').replace(/\s+/g, '_');
    const dateStr = new Date(quotation.createdAt || Date.now()).toISOString().slice(0, 10);
    const filename = `Quotation_${farmName}_${dateStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quotation.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    logger.error(`Error generating quotation PDF for ${req.params.quotationId}: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate quotation PDF',
      message: error.message
    });
  }
};

exports.rejectQuotation = async (req, res) => {
  try {
    const result = await quotationService.rejectQuotation(
      req.params.id,
      req.params.quotationId,
      req.user,
      req.body?.reason
    );
    res.status(200).json({
      success: true,
      data: { quotation: result.quotation, project: result.project },
      message: 'Quotation rejected.'
    });
  } catch (error) {
    logger.error(`Error rejecting quotation ${req.params.quotationId}: ${error.message}`);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to reject quotation',
      message: error.message
    });
  }
};

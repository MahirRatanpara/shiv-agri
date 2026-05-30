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
    const quotations = await quotationService.getQuotationsForProject(req.params.id);
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

const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const receiptController = require('../controllers/receiptController');
const invoiceController = require('../controllers/invoiceController');
const letterController = require('../controllers/letterController');

// Permission names (will be created in migration script)
const PERMISSIONS = {
  RECEIPTS_VIEW: 'managerial.receipts.view',
  RECEIPTS_CREATE: 'managerial.receipts.create',
  RECEIPTS_EDIT: 'managerial.receipts.update',
  RECEIPTS_DELETE: 'managerial.receipts.delete',
  INVOICES_VIEW: 'managerial.invoices.view',
  INVOICES_CREATE: 'managerial.invoices.create',
  INVOICES_EDIT: 'managerial.invoices.update',
  INVOICES_DELETE: 'managerial.invoices.delete',
  LETTERS_VIEW: 'managerial.letters.view',
  LETTERS_CREATE: 'managerial.letters.create',
  LETTERS_EDIT: 'managerial.letters.update',
  LETTERS_DELETE: 'managerial.letters.delete'
};

// ============ RECEIPT ROUTES ============

/**
 * @route   GET /api/managerial-work/receipts
 * @desc    Get all receipts with filters
 * @access  Manager, Admin
 */
router.get(
  '/receipts',
  authenticate,
  requirePermission(PERMISSIONS.RECEIPTS_VIEW),
  receiptController.getReceipts
);

/**
 * @route   GET /api/managerial-work/receipts/next-number
 * @desc    Get next receipt number
 * @access  Manager, Admin
 */
router.get(
  '/receipts/next-number',
  authenticate,
  requirePermission(PERMISSIONS.RECEIPTS_CREATE),
  receiptController.getNextReceiptNumber
);

/**
 * @route   GET /api/managerial-work/receipts/:id
 * @desc    Get single receipt
 * @access  Manager, Admin
 */
router.get(
  '/receipts/:id',
  authenticate,
  requirePermission(PERMISSIONS.RECEIPTS_VIEW),
  receiptController.getReceiptById
);

/**
 * @route   POST /api/managerial-work/receipts
 * @desc    Create new receipt
 * @access  Manager, Admin
 */
router.post(
  '/receipts',
  authenticate,
  requirePermission(PERMISSIONS.RECEIPTS_CREATE),
  receiptController.createReceipt
);

/**
 * @route   PUT /api/managerial-work/receipts/:id
 * @desc    Update receipt
 * @access  Manager, Admin
 */
router.put(
  '/receipts/:id',
  authenticate,
  requirePermission(PERMISSIONS.RECEIPTS_EDIT),
  receiptController.updateReceipt
);

/**
 * @route   PUT /api/managerial-work/receipts/:id/pdf
 * @desc    Update PDF reference
 * @access  Manager, Admin
 */
router.put(
  '/receipts/:id/pdf',
  authenticate,
  requirePermission(PERMISSIONS.RECEIPTS_EDIT),
  receiptController.updatePdfReference
);

/**
 * @route   DELETE /api/managerial-work/receipts/:id
 * @desc    Delete receipt (soft delete)
 * @access  Manager, Admin
 */
router.delete(
  '/receipts/:id',
  authenticate,
  requirePermission(PERMISSIONS.RECEIPTS_DELETE),
  receiptController.deleteReceipt
);

// ============ INVOICE ROUTES ============

/**
 * @route   GET /api/managerial-work/invoices
 * @desc    Get all invoices with filters
 * @access  Manager, Admin
 */
router.get(
  '/invoices',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_VIEW),
  invoiceController.getInvoices
);

/**
 * @route   GET /api/managerial-work/invoices/next-number
 * @desc    Get next invoice number
 * @access  Manager, Admin
 */
router.get(
  '/invoices/next-number',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_CREATE),
  invoiceController.getNextInvoiceNumber
);

/**
 * @route   GET /api/managerial-work/invoices/service-options
 * @desc    Get pre-defined service options
 * @access  Manager, Admin
 */
router.get(
  '/invoices/service-options',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_VIEW),
  invoiceController.getServiceOptions
);

/**
 * @route   GET /api/managerial-work/invoices/:id
 * @desc    Get single invoice
 * @access  Manager, Admin
 */
router.get(
  '/invoices/:id',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_VIEW),
  invoiceController.getInvoiceById
);

/**
 * @route   POST /api/managerial-work/invoices
 * @desc    Create new invoice
 * @access  Manager, Admin
 */
router.post(
  '/invoices',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_CREATE),
  invoiceController.createInvoice
);

/**
 * @route   PUT /api/managerial-work/invoices/:id
 * @desc    Update invoice
 * @access  Manager, Admin
 */
router.put(
  '/invoices/:id',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_EDIT),
  invoiceController.updateInvoice
);

/**
 * @route   PUT /api/managerial-work/invoices/:id/payment
 * @desc    Update payment status
 * @access  Manager, Admin
 */
router.put(
  '/invoices/:id/payment',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_EDIT),
  invoiceController.updatePaymentStatus
);

/**
 * @route   PUT /api/managerial-work/invoices/:id/pdf
 * @desc    Update PDF reference
 * @access  Manager, Admin
 */
router.put(
  '/invoices/:id/pdf',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_EDIT),
  invoiceController.updatePdfReference
);

/**
 * @route   POST /api/managerial-work/invoices/:id/duplicate
 * @desc    Duplicate invoice
 * @access  Manager, Admin
 */
router.post(
  '/invoices/:id/duplicate',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_CREATE),
  invoiceController.duplicateInvoice
);

/**
 * @route   DELETE /api/managerial-work/invoices/:id
 * @desc    Delete invoice (soft delete)
 * @access  Manager, Admin
 */
router.delete(
  '/invoices/:id',
  authenticate,
  requirePermission(PERMISSIONS.INVOICES_DELETE),
  invoiceController.deleteInvoice
);

// ============ LETTER ROUTES ============

/**
 * @route   GET /api/managerial-work/letters
 * @desc    Get all letters with filters
 * @access  Manager, Admin
 */
router.get(
  '/letters',
  authenticate,
  requirePermission(PERMISSIONS.LETTERS_VIEW),
  letterController.getLetters
);

/**
 * @route   GET /api/managerial-work/letters/next-number
 * @desc    Get next letter number
 * @access  Manager, Admin
 */
router.get(
  '/letters/next-number',
  authenticate,
  requirePermission(PERMISSIONS.LETTERS_CREATE),
  letterController.getNextLetterNumber
);

/**
 * @route   GET /api/managerial-work/letters/template/service-list
 * @desc    Get service list template
 * @access  Manager, Admin
 */
router.get(
  '/letters/template/service-list',
  authenticate,
  requirePermission(PERMISSIONS.LETTERS_VIEW),
  letterController.getServiceListTemplate
);

/**
 * @route   GET /api/managerial-work/letters/tags
 * @desc    Get all unique tags
 * @access  Manager, Admin
 */
router.get(
  '/letters/tags',
  authenticate,
  requirePermission(PERMISSIONS.LETTERS_VIEW),
  letterController.getAllTags
);

/**
 * @route   GET /api/managerial-work/letters/:id
 * @desc    Get single letter
 * @access  Manager, Admin
 */
router.get(
  '/letters/:id',
  authenticate,
  requirePermission(PERMISSIONS.LETTERS_VIEW),
  letterController.getLetterById
);

/**
 * @route   POST /api/managerial-work/letters
 * @desc    Create new letter
 * @access  Manager, Admin
 */
router.post(
  '/letters',
  authenticate,
  requirePermission(PERMISSIONS.LETTERS_CREATE),
  letterController.createLetter
);

/**
 * @route   PUT /api/managerial-work/letters/:id
 * @desc    Update letter
 * @access  Manager, Admin
 */
router.put(
  '/letters/:id',
  authenticate,
  requirePermission(PERMISSIONS.LETTERS_EDIT),
  letterController.updateLetter
);

/**
 * @route   PUT /api/managerial-work/letters/:id/pdf
 * @desc    Update PDF reference
 * @access  Manager, Admin
 */
router.put(
  '/letters/:id/pdf',
  authenticate,
  requirePermission(PERMISSIONS.LETTERS_EDIT),
  letterController.updatePdfReference
);

/**
 * @route   DELETE /api/managerial-work/letters/:id
 * @desc    Delete letter (soft delete)
 * @access  Manager, Admin
 */
router.delete(
  '/letters/:id',
  authenticate,
  requirePermission(PERMISSIONS.LETTERS_DELETE),
  letterController.deleteLetter
);

module.exports = router;

const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Project = require('../models/Project');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const isLandscapingProject = (project) => {
  if (!project) return false;
  if (project.category && String(project.category).toUpperCase() === 'LANDSCAPING') return true;
  if (project.projectType && String(project.projectType).toLowerCase() === 'landscaping') return true;
  if (project.needsLandscapingConsultancy === true) return true;
  return false;
};

const stripHtml = (html = '') =>
  String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

class QuotationService {
  /**
   * Create a new quotation for a project.
   *
   * Standard flow (pending_quotation → pending_acceptance): supersedes any
   * existing active quotation and moves the project into `pending_acceptance`.
   *
   * Attach-on-create flow (`payload.attachInitial=true`): used when an
   * admin/manager creates a farm AND wants to attach a quotation in the same
   * step. The project is already 'approved' (manager-direct registration),
   * so we skip the "already approved" guard and mark the quotation as
   * 'accepted' on creation — the farmer accepted implicitly by way of the
   * manager creating the record. Project status is not changed by this
   * service; the caller decides whether to activate.
   */
  async createQuotation(projectId, payload, user) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });
    if (!project) throw new Error('Project not found');

    const isFarm = project.category === 'FARM' || project.projectType === 'farm';
    if (!isFarm) throw new Error('Quotations are only supported for farm projects.');

    const attachInitial = !!payload?.attachInitial;

    if (!attachInitial && (
        project.status === 'approved' || project.status === 'Running' ||
        project.status === 'Completed' || project.status === 'On Hold')) {
      throw new Error('Quotation cannot be created — project is already approved.');
    }

    const content = String(payload?.content || '').trim();
    const amountPerYear = Number(payload?.amountPerYear);

    if (!content) throw new Error('Quotation details are required.');
    if (!Number.isFinite(amountPerYear) || amountPerYear <= 0) {
      throw new Error('A valid annual amount is required.');
    }

    // Supersede any prior submitted quotations for this project
    await Quotation.updateMany(
      { project: project._id, status: 'submitted' },
      { $set: { status: 'superseded' } }
    );

    const startDate = payload?.startDate ? new Date(payload.startDate) : new Date();

    const quotation = await Quotation.create({
      project: project._id,
      content,
      contentText: stripHtml(content).slice(0, 1000),
      amountPerYear,
      startDate,
      // Inline-with-create quotations are pre-accepted; everything else
      // starts in 'submitted' and waits for the farmer.
      status: attachInitial ? 'accepted' : 'submitted',
      submittedBy: user._id,
      submittedByName: user.name || user.fullName || '',
      acceptedBy: attachInitial ? user._id : undefined,
      acceptedAt: attachInitial ? new Date() : undefined
    });

    if (!attachInitial) {
      project.status = 'pending_acceptance';
    }
    project.activeQuotation = quotation._id;
    if (attachInitial && !project.quotationAcceptedAt) {
      project.quotationAcceptedAt = new Date();
    }
    project.lastUpdatedBy = user._id;
    await project.save();

    // Archive any pending farm_registration / farm_quotation_required notifications
    await notificationService.archiveFarmRegistration(project._id);

    // Notify the farmer — only for the standard flow. The attach-on-create
    // case is silent because the manager already acted on the farmer's behalf.
    const farmerId = project.submittedBy || project.clientId;
    if (!attachInitial && farmerId) {
      await notificationService.createForUser(farmerId, {
        type: 'farm_quotation_received',
        title: 'Quotation received',
        message: `A quotation for ${project.name} is ready. Open the farm to review and accept.`,
        project: project._id,
        submittingUser: user._id,
        metadata: {
          farmName: project.name,
          quotationId: String(quotation._id)
        }
      });
    }

    logger.info(`Quotation ${quotation._id} created for project ${project._id} by ${user._id} (attachInitial=${attachInitial})`);
    return { quotation, project };
  }

  async getQuotationsForProject(projectId, { kind } = {}) {
    const query = { project: projectId };
    if (kind) query.kind = kind;
    const quotations = await Quotation.find(query)
      .sort({ createdAt: -1 })
      .lean();
    return quotations;
  }

  // ========================
  // BOP Quotations (landscaping projects only)
  // ========================

  /**
   * Create an adhoc BOP (Bill of Project) quotation for a landscaping project.
   * BOP quotations are NOT part of the annual pending-quotation status flow —
   * they do not change the project status and do not supersede the annual
   * quotation.
   */
  async createBopQuotation(projectId, payload, user) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });
    if (!project) throw new Error('Project not found');

    if (!isLandscapingProject(project)) {
      throw new Error('BOP quotations are only supported for landscaping projects.');
    }

    const content = String(payload?.content || '').trim();
    const items = Array.isArray(payload?.bopItems) ? payload.bopItems : [];
    if (!content) throw new Error('Quotation details are required.');
    if (!items.length) throw new Error('A BOP quotation must have at least one line item.');

    const processedItems = items.map((item) => {
      const quantity = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const total = Number.isFinite(item.total) ? Number(item.total) : quantity * rate;
      return {
        description: String(item.description || '').trim(),
        quantity,
        rate,
        total
      };
    });

    const amountPerYear = processedItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0);

    const quotation = await Quotation.create({
      project: project._id,
      kind: 'bop',
      title: payload?.title ? String(payload.title).trim().slice(0, 200) : '',
      content,
      contentText: stripHtml(content).slice(0, 1000),
      amountPerYear,
      bopItems: processedItems,
      startDate: payload?.startDate ? new Date(payload.startDate) : new Date(),
      submittedBy: user._id,
      submittedByName: user.name || user.fullName || ''
    });

    logger.info(`BOP quotation ${quotation._id} created for landscaping project ${project._id} by ${user._id}`);
    return { quotation, project };
  }

  // ========================
  // Installment payment + idempotent invoice creation
  // ========================

  /**
   * Mark a quotation installment as paid and create an invoice from the farm
   * project + installment amount. Idempotent: if the installment is already
   * paid AND has an invoiceId, the existing invoice is returned rather than
   * creating a duplicate.
   */
  async markInstallmentPaid(projectId, quotationId, installmentNumber, user) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });
    if (!project) throw new Error('Project not found');

    const quotation = await Quotation.findOne({ _id: quotationId, project: project._id });
    if (!quotation) throw new Error('Quotation not found');

    const num = Number(installmentNumber);
    const installment = (quotation.installments || []).find(
      (i) => i.installmentNumber === num
    );
    if (!installment) throw new Error(`Installment ${num} not found on this quotation`);

    // Idempotent path — already paid with an invoice attached.
    if (installment.status === 'paid' && installment.invoiceId) {
      const existing = await Invoice.findOne({ _id: installment.invoiceId, isDeleted: false });
      if (existing) {
        logger.info(
          `[Quotation] Installment ${num} on quotation ${quotation._id} is already paid — ` +
          `returning existing invoice ${existing.invoiceNumber}`
        );
        return { quotation, invoice: existing, alreadyPaid: true };
      }
      // Invoice missing/deleted — fall through to recreate.
    }

    const amount = Number(installment.amount) || 0;
    const invoiceNumber = await Invoice.getNextInvoiceNumber();

    const invoiceDescription = quotation.kind === 'bop'
      ? `BOP installment ${num} of 4 — ${project.name}`
      : `Annual fee — installment ${num} of 4 — ${project.name}`;

    // Map project location into the invoice template fields.
    // Template uses:  સરનામું (address) → referenceNumber, ગામ (village) → village,
    //                  સ્થળ (place) → location, તાલુકો → taluka, જિલ્લો → district.
    // The old reference-number-as-address bug was caused by stuffing the
    // quotation ObjectId into referenceNumber; addresses now come from the
    // project's location subdocument.
    const loc = project.location || {};
    const invoice = await Invoice.create({
      invoiceNumber,
      invoiceType: 'cash',
      date: new Date(),
      customerName: project.clientName || '',
      // The template renders this slot as "Address" (સરનામું).
      referenceNumber: (loc.address || '').trim(),
      // "Place" / general location column.
      location: (loc.city || '').trim(),
      // "Village" column — we don't track a separate village field, so we
      // fall back to taluka here for backwards-compat with the template.
      village: (loc.taluka || '').trim(),
      taluka: (loc.taluka || '').trim(),
      district: (loc.district || '').trim(),
      state: (loc.state || '').trim(),
      pincode: (loc.postalCode || loc.pincode || '').trim(),
      phoneNumber: project.clientPhone || '',
      mobileNumber: project.clientPhone || '',
      items: [{
        serialNumber: 1,
        description: invoiceDescription,
        rate: amount,
        quantity: 1,
        total: amount
      }],
      subtotal: amount,
      taxAmount: 0,
      discount: 0,
      grandTotal: amount,
      paymentStatus: 'paid',
      paidAmount: amount,
      // Soft link back to the source for the future revert flow.
      sourceQuotationId: quotation._id,
      sourceInstallmentNumber: num,
      createdBy: user._id
    });

    // Persist payment + invoice link on the installment. Use positional update
    // so we don't accidentally overwrite other installments.
    await Quotation.updateOne(
      { _id: quotation._id, 'installments.installmentNumber': num },
      {
        $set: {
          'installments.$.status': 'paid',
          'installments.$.paidAt': new Date(),
          'installments.$.paidAmount': amount,
          'installments.$.invoiceId': invoice._id,
          'installments.$.invoiceNumber': invoice.invoiceNumber,
          'installments.$.paidBy': user._id
        }
      }
    );

    const fresh = await Quotation.findById(quotation._id).lean();

    logger.info(
      `[Quotation] Installment ${num} paid for quotation ${quotation._id} ` +
      `(project ${project._id}) — invoice ${invoice.invoiceNumber} created by ${user._id}`
    );

    return { quotation: fresh, invoice, alreadyPaid: false };
  }

  /**
   * Admin-only: revert a previously-marked-paid installment.
   *
   * Resets the installment back to 'pending' (clears paidAt, paidAmount,
   * invoiceId, invoiceNumber, paidBy) and soft-deletes the generated
   * invoice so it disappears from the invoice list. If no installment
   * is found, or the installment isn't currently paid, throws.
   */
  async revertInstallmentPayment(projectId, quotationId, installmentNumber, user) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });
    if (!project) throw new Error('Project not found');

    const quotation = await Quotation.findOne({ _id: quotationId, project: project._id });
    if (!quotation) throw new Error('Quotation not found');

    const num = Number(installmentNumber);
    const installment = (quotation.installments || []).find(
      (i) => i.installmentNumber === num
    );
    if (!installment) throw new Error(`Installment ${num} not found on this quotation`);
    if (installment.status !== 'paid') {
      throw new Error(`Installment ${num} is not in a paid state — nothing to revert.`);
    }

    const invoiceId = installment.invoiceId;
    const invoiceNumber = installment.invoiceNumber;

    // Reset the installment in-place. The pre('validate') hook won't be
    // triggered because we're using $set on existing fields, but $unset is
    // not available on Map paths in arrays — using $set: null instead.
    await Quotation.updateOne(
      { _id: quotation._id, 'installments.installmentNumber': num },
      {
        $set: {
          'installments.$.status': 'pending',
          'installments.$.paidAt': null,
          'installments.$.paidAmount': 0,
          'installments.$.invoiceId': null,
          'installments.$.invoiceNumber': '',
          'installments.$.paidBy': null
        }
      }
    );

    // Soft-delete the linked invoice so it's no longer visible in lists or
    // the customer's history. Hard delete would lose audit trail; the
    // existing `isDeleted` + `deletedAt` + `deletedBy` fields are designed
    // for exactly this case.
    let invoiceUpdated = false;
    if (invoiceId) {
      const result = await Invoice.updateOne(
        { _id: invoiceId, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: user._id
          }
        }
      );
      invoiceUpdated = result.modifiedCount > 0;
    }

    const fresh = await Quotation.findById(quotation._id).lean();

    logger.info(
      `[Quotation] Installment ${num} payment reverted for quotation ${quotation._id} ` +
      `(project ${project._id}) — invoice ${invoiceNumber || '(none)'} soft-deleted=${invoiceUpdated} ` +
      `by ${user._id}`
    );

    return {
      quotation: fresh,
      revertedInstallment: num,
      invoiceNumber: invoiceNumber || null,
      invoiceSoftDeleted: invoiceUpdated
    };
  }

  async getQuotationById(projectId, quotationId) {
    const quotation = await Quotation.findOne({ _id: quotationId, project: projectId }).lean();
    if (!quotation) throw new Error('Quotation not found');
    return quotation;
  }

  async getActiveQuotation(projectId) {
    return Quotation.findOne({ project: projectId, status: { $in: ['submitted', 'accepted'] } })
      .sort({ createdAt: -1 })
      .lean();
  }

  async acceptQuotation(projectId, quotationId, user) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });
    if (!project) throw new Error('Project not found');

    const quotation = await Quotation.findOne({ _id: quotationId, project: project._id });
    if (!quotation) throw new Error('Quotation not found');
    if (quotation.status !== 'submitted') {
      throw new Error('Only a pending quotation can be accepted.');
    }

    // Only the farmer (submittedBy / clientId) can accept
    const userId = user._id.toString();
    const farmerIds = [project.submittedBy, project.clientId]
      .filter(Boolean).map((id) => id.toString());
    if (!farmerIds.includes(userId)) {
      throw new Error('Only the farm owner can accept this quotation.');
    }

    quotation.status = 'accepted';
    quotation.acceptedBy = user._id;
    quotation.acceptedAt = new Date();
    await quotation.save();

    project.status = 'approved';
    project.approvedBy = user._id;
    project.approvedAt = new Date();
    project.quotationAcceptedAt = new Date();
    project.activeQuotation = quotation._id;
    project.lastUpdatedBy = user._id;
    await project.save();

    // Notify admins / managers
    await notificationService.createForUsersWithPermission('farm.projects.approve', {
      type: 'farm_quotation_accepted',
      title: 'Quotation accepted',
      message: `${project.clientName || 'Farmer'} accepted the quotation for ${project.name}.`,
      project: project._id,
      submittingUser: user._id,
      metadata: {
        farmName: project.name,
        quotationId: String(quotation._id)
      }
    });

    logger.info(`Quotation ${quotation._id} accepted by ${user._id} for project ${project._id}`);
    return { quotation, project };
  }

  async rejectQuotation(projectId, quotationId, user, reason = '') {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });
    if (!project) throw new Error('Project not found');

    const quotation = await Quotation.findOne({ _id: quotationId, project: project._id });
    if (!quotation) throw new Error('Quotation not found');
    if (quotation.status !== 'submitted') {
      throw new Error('Only a pending quotation can be rejected.');
    }

    const userId = user._id.toString();
    const farmerIds = [project.submittedBy, project.clientId]
      .filter(Boolean).map((id) => id.toString());
    if (!farmerIds.includes(userId)) {
      throw new Error('Only the farm owner can reject this quotation.');
    }

    quotation.status = 'rejected';
    quotation.rejectedBy = user._id;
    quotation.rejectedAt = new Date();
    quotation.rejectedReason = reason ? String(reason).trim().slice(0, 500) : '';
    await quotation.save();

    project.status = 'pending_quotation';
    project.activeQuotation = undefined;
    project.lastUpdatedBy = user._id;
    await project.save();

    // Notify admins / managers — they'll need to revise the quotation
    await notificationService.createForUsersWithPermission('farm.projects.approve', {
      type: 'farm_quotation_required',
      title: 'Quotation revision requested',
      message: quotation.rejectedReason
        ? `${project.clientName || 'Farmer'} rejected the quotation for ${project.name}: ${quotation.rejectedReason}`
        : `${project.clientName || 'Farmer'} rejected the quotation for ${project.name}. Please revise.`,
      project: project._id,
      submittingUser: user._id,
      metadata: {
        farmName: project.name,
        rejectionReason: quotation.rejectedReason
      }
    });

    logger.info(`Quotation ${quotation._id} rejected by ${user._id} for project ${project._id}`);
    return { quotation, project };
  }
}

module.exports = new QuotationService();

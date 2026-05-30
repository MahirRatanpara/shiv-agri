const Quotation = require('../models/Quotation');
const Project = require('../models/Project');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const stripHtml = (html = '') =>
  String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

class QuotationService {
  /**
   * Create a new quotation for a project. Supersedes any existing active
   * quotation and moves the project into the `pending_acceptance` state.
   */
  async createQuotation(projectId, payload, user) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });
    if (!project) throw new Error('Project not found');

    const isFarm = project.category === 'FARM' || project.projectType === 'farm';
    if (!isFarm) throw new Error('Quotations are only supported for farm projects.');

    if (project.status === 'approved' || project.status === 'Running' ||
        project.status === 'Completed' || project.status === 'On Hold') {
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
      submittedBy: user._id,
      submittedByName: user.name || user.fullName || ''
    });

    project.status = 'pending_acceptance';
    project.activeQuotation = quotation._id;
    project.lastUpdatedBy = user._id;
    await project.save();

    // Archive any pending farm_registration / farm_quotation_required notifications
    await notificationService.archiveFarmRegistration(project._id);

    // Notify the farmer
    const farmerId = project.submittedBy || project.clientId;
    if (farmerId) {
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

    logger.info(`Quotation ${quotation._id} created for project ${project._id} by ${user._id}`);
    return { quotation, project };
  }

  async getQuotationsForProject(projectId) {
    const quotations = await Quotation.find({ project: projectId })
      .sort({ createdAt: -1 })
      .lean();
    return quotations;
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

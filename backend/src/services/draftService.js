const mongoose = require('mongoose');
const Project = require('../models/Project');
const Draft = require('../models/Draft');
const logger = require('../utils/logger');
const { logActivity } = require('./activityLogService');

/**
 * Create a new draft project (Step 1 of wizard).
 * Creates a minimal Project doc with isDraft=true and a Draft doc.
 */
async function createProjectWithDraft(draftData, wizardStep, userId) {
  const category = (draftData.category || 'FARM').toUpperCase();

  const project = new Project({
    name: draftData.name || 'Untitled Project',
    category,
    status: draftData.status || 'Upcoming',
    budget: draftData.budget || 0,
    isDraft: true,
    createdBy: userId,
    lastUpdatedBy: userId,
    // Spread basic fields if provided
    ...(draftData.clientName && { clientName: draftData.clientName }),
    ...(draftData.clientEmail && { clientEmail: draftData.clientEmail }),
    ...(draftData.clientPhone && { clientPhone: draftData.clientPhone }),
    ...(draftData.description && { description: draftData.description }),
    ...(draftData.priority && { priority: draftData.priority })
  });

  const savedProject = await project.save();

  const draft = new Draft({
    projectId: savedProject._id,
    wizardStep: wizardStep || 1,
    draftData,
    createdBy: userId
  });
  await draft.save();

  logger.info(`[DraftService] Draft created: project ${savedProject._id}, step ${wizardStep}`);
  return { project: savedProject, draft };
}

/**
 * Update an existing draft (auto-save or manual save).
 */
async function updateDraft(projectId, draftData, wizardStep, userId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new Error('Invalid project ID');
  }

  const project = await Project.findById(projectId);
  if (!project) throw new Error('Draft project not found');

  // Update basic project fields from draft data
  if (draftData.name) project.name = draftData.name;
  if (draftData.category) project.category = draftData.category.toUpperCase();
  if (draftData.status) project.status = draftData.status;
  if (draftData.description !== undefined) project.description = draftData.description;
  if (draftData.priority) project.priority = draftData.priority;
  if (draftData.budget !== undefined) project.budget = draftData.budget;

  // Client info
  if (draftData.clientName !== undefined) project.clientName = draftData.clientName;
  if (draftData.clientEmail !== undefined) project.clientEmail = draftData.clientEmail;
  if (draftData.clientPhone !== undefined) project.clientPhone = draftData.clientPhone;
  if (draftData.alternativeContact !== undefined) project.alternativeContact = draftData.alternativeContact;

  // Location
  if (draftData.location) {
    project.location = { ...(project.location?.toObject?.() || project.location || {}), ...draftData.location };
  }

  // Land details
  if (draftData.landDetails) {
    project.landDetails = { ...(project.landDetails?.toObject?.() || project.landDetails || {}), ...draftData.landDetails };
  }

  // Budget categories
  if (draftData.budgetCategories) project.budgetCategories = draftData.budgetCategories;

  // Contacts
  if (draftData.contacts) project.contacts = draftData.contacts;

  // Crops
  if (draftData.crops) project.crops = draftData.crops;

  // Team
  if (draftData.assignedTo !== undefined) project.assignedTo = draftData.assignedTo || undefined;
  if (draftData.projectManager !== undefined) project.projectManager = draftData.projectManager || undefined;
  if (draftData.fieldWorkers) project.fieldWorkers = draftData.fieldWorkers;
  if (draftData.consultants) project.consultants = draftData.consultants;
  if (draftData.assignedTeam) project.assignedTeam = draftData.assignedTeam;

  // Timeline
  if (draftData.startDate !== undefined) project.startDate = draftData.startDate || undefined;
  if (draftData.expectedCompletionDate !== undefined) project.expectedCompletionDate = draftData.expectedCompletionDate || undefined;

  // Visit config
  if (draftData.visitFrequencyConfig) project.visitFrequencyConfig = draftData.visitFrequencyConfig;
  if (draftData.totalVisitsPlanned !== undefined) project.totalVisitsPlanned = draftData.totalVisitsPlanned;
  if (draftData.numberOfYears !== undefined) project.numberOfYears = draftData.numberOfYears;

  project.lastUpdatedBy = userId;
  await project.save();

  // Upsert draft document
  await Draft.findOneAndUpdate(
    { projectId },
    { wizardStep: wizardStep || 1, draftData, createdBy: userId },
    { upsert: true, new: true }
  );

  logger.info(`[DraftService] Draft updated: project ${projectId}, step ${wizardStep}`);
  return project;
}

/**
 * Get a draft by project ID.
 */
async function getDraftByProjectId(projectId, userId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) return null;

  const draft = await Draft.findOne({ projectId })
    .populate({
      path: 'projectId',
      match: { isDraft: true, isDeleted: { $ne: true } }
    })
    .lean();

  if (!draft || !draft.projectId) return null;
  return draft;
}

/**
 * Get all drafts for a user.
 */
async function getUserDrafts(userId) {
  const drafts = await Draft.find({ createdBy: userId })
    .populate({
      path: 'projectId',
      match: { isDraft: true, isDeleted: { $ne: true } },
      select: 'name category status budget createdAt updatedAt'
    })
    .sort({ updatedAt: -1 })
    .lean();

  // Filter out nulls (deleted or completed projects)
  return drafts.filter(d => d.projectId !== null);
}

/**
 * Complete a draft — convert to a final project.
 */
async function completeDraft(projectId, finalProjectData, userId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    // Create a new project directly
    return createFinalProject(finalProjectData, userId);
  }

  const project = await Project.findById(projectId);
  if (!project) {
    return createFinalProject(finalProjectData, userId);
  }

  // Apply all final data
  const fieldsToUpdate = [
    'name', 'category', 'status', 'description', 'notes', 'priority', 'tags',
    'clientName', 'clientEmail', 'clientPhone', 'clientAvatar', 'alternativeContact',
    'budget', 'budgetCategories',
    'startDate', 'completionDate', 'expectedCompletionDate',
    'contacts', 'crops',
    'totalVisitsPlanned', 'numberOfYears', 'visitFrequencyConfig',
    'coverImage'
  ];

  fieldsToUpdate.forEach(field => {
    if (finalProjectData[field] !== undefined) {
      project[field] = finalProjectData[field];
    }
  });

  // Location (merge)
  if (finalProjectData.location) {
    project.location = { ...(project.location?.toObject?.() || project.location || {}), ...finalProjectData.location };
  }

  // Land details (merge)
  if (finalProjectData.landDetails) {
    project.landDetails = { ...(project.landDetails?.toObject?.() || project.landDetails || {}), ...finalProjectData.landDetails };
  }

  // Team refs
  if (finalProjectData.assignedTo !== undefined) project.assignedTo = finalProjectData.assignedTo || undefined;
  if (finalProjectData.projectManager !== undefined) project.projectManager = finalProjectData.projectManager || undefined;
  if (finalProjectData.fieldWorkers) project.fieldWorkers = finalProjectData.fieldWorkers;
  if (finalProjectData.consultants) project.consultants = finalProjectData.consultants;
  if (finalProjectData.assignedTeam) project.assignedTeam = finalProjectData.assignedTeam;

  // Mark as non-draft
  project.isDraft = false;
  project.lastUpdatedBy = userId;

  if (finalProjectData.category) {
    project.category = finalProjectData.category.toUpperCase();
  }

  await project.save();

  // Delete the draft document
  await Draft.deleteMany({ projectId });

  logActivity(project._id, userId, 'created', `Project "${project.name}" created`, {
    entityType: 'project',
    entityId: project._id,
    category: project.category
  });

  logger.info(`[DraftService] Draft completed: project ${projectId} is now live`);
  return project;
}

/**
 * Create a final project directly (no draft).
 */
async function createFinalProject(data, userId) {
  const project = new Project({
    ...data,
    category: (data.category || 'FARM').toUpperCase(),
    isDraft: false,
    createdBy: userId,
    lastUpdatedBy: userId
  });
  const saved = await project.save();

  logActivity(saved._id, userId, 'created', `Project "${saved.name}" created`, {
    entityType: 'project',
    entityId: saved._id,
    category: saved.category
  });

  logger.info(`[DraftService] Final project created directly: ${saved._id}`);
  return saved;
}

/**
 * Delete a draft and its associated project.
 */
async function deleteDraft(projectId, userId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new Error('Invalid project ID');
  }

  await Promise.all([
    Draft.deleteMany({ projectId }),
    Project.findByIdAndDelete(projectId)
  ]);

  logger.info(`[DraftService] Draft deleted: project ${projectId}`);
  return { message: 'Draft deleted' };
}

module.exports = {
  createProjectWithDraft,
  updateDraft,
  getDraftByProjectId,
  getUserDrafts,
  completeDraft,
  createFinalProject,
  deleteDraft
};

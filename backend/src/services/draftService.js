const Draft = require('../models/Draft');
const Project = require('../models/Project');
const mongoose = require('mongoose');

class DraftService {
  /**
   * Create a new project with minimal data and save draft
   * This is called when user starts the wizard
   */
  async createProjectWithDraft(draftData, wizardStep, userId) {
    // Determine category from draftData
    let category = 'FARM'; // Default
    if (draftData.category) {
      category = draftData.category.toUpperCase();
    } else if (draftData.projectType) {
      category = draftData.projectType.toUpperCase();
    }

    // Create a minimal project first
    const project = new Project({
      name: draftData.name || 'Untitled Project',
      category: category,
      status: 'Upcoming',
      clientName: draftData.clientName || 'Unknown Client',
      budget: draftData.budget || 0,
      isDraft: true, // Mark as draft until completed
      createdBy: userId,
      lastUpdatedBy: userId,
      location: {
        address: draftData.location?.address || '',
        city: draftData.location?.city || '',
        district: draftData.location?.district || '',
        state: draftData.location?.state || ''
      }
    });

    await project.save();

    // Create draft document linked to this project
    const draft = new Draft({
      projectId: project._id,
      wizardStep: wizardStep || 1,
      draftData: draftData,
      createdBy: userId
    });

    await draft.save();

    return {
      project,
      draft
    };
  }

  /**
   * Update existing draft for a project
   */
  async updateDraft(projectId, draftData, wizardStep, userId) {
    // Validate projectId
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      throw new Error('Invalid project ID');
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Update project's basic info
    if (draftData.name) project.name = draftData.name;

    // Handle category update
    if (draftData.category) {
      project.category = draftData.category.toUpperCase();
    } else if (draftData.projectType) {
      project.category = draftData.projectType.toUpperCase();
    }

    if (draftData.clientName) project.clientName = draftData.clientName;
    if (draftData.budget) project.budget = draftData.budget;
    if (draftData.location) {
      project.location = {
        ...project.location,
        ...draftData.location
      };
    }
    project.lastUpdatedBy = userId;
    await project.save();

    // Find and update draft, or create new one
    let draft = await Draft.findOne({ projectId, createdBy: userId });

    if (draft) {
      // Update existing draft
      draft.wizardStep = wizardStep;
      draft.draftData = draftData;
      await draft.save();
    } else {
      // Create new draft
      draft = new Draft({
        projectId,
        wizardStep,
        draftData,
        createdBy: userId
      });
      await draft.save();
    }

    return {
      project,
      draft
    };
  }

  /**
   * Get draft for a specific project
   */
  async getDraftByProjectId(projectId, userId) {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return null;
    }

    const draft = await Draft.findOne({ projectId, createdBy: userId })
      .populate('projectId')
      .lean();

    return draft;
  }

  /**
   * Get all drafts for a user
   */
  async getUserDrafts(userId) {
    const drafts = await Draft.find({ createdBy: userId })
      .populate({
        path: 'projectId',
        match: { isDraft: true }, // Only get projects that are still drafts
        select: 'name projectType status clientName budget location createdAt updatedAt'
      })
      .sort({ updatedAt: -1 })
      .lean();

    // Filter out drafts where project was deleted or completed
    return drafts.filter(draft => draft.projectId !== null);
  }

  /**
   * Complete draft and finalize project
   * This is called when user submits the wizard
   */
  async completeDraft(projectId, finalProjectData, userId) {
    // If projectId is not a valid ObjectId (e.g., mock ID from development),
    // create a new project instead
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      console.log('Invalid ObjectId, creating new project instead:', projectId);
      return await this.createFinalProject(finalProjectData, userId);
    }

    // Find the project
    const project = await Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Update project fields carefully to avoid overwriting required fields
    if (finalProjectData.name) project.name = finalProjectData.name;

    // Handle category (primary field)
    if (finalProjectData.category) {
      project.category = finalProjectData.category.toUpperCase();
    } else if (finalProjectData.projectType) {
      // Legacy support - convert projectType to category
      project.category = finalProjectData.projectType.toUpperCase();
    }

    // Legacy projectType field (will be auto-synced via pre-save middleware)
    if (finalProjectData.projectType) project.projectType = finalProjectData.projectType;

    if (finalProjectData.status) project.status = finalProjectData.status;
    if (finalProjectData.clientName) project.clientName = finalProjectData.clientName;
    if (finalProjectData.clientPhone) project.clientPhone = finalProjectData.clientPhone;
    if (finalProjectData.clientEmail) project.clientEmail = finalProjectData.clientEmail;
    if (finalProjectData.alternativeContact) project.alternativeContact = finalProjectData.alternativeContact;
    if (finalProjectData.budget !== undefined) project.budget = finalProjectData.budget;

    // Location
    if (finalProjectData.location) {
      project.location = {
        ...project.location,
        ...finalProjectData.location
      };
    }

    // Land details
    if (finalProjectData.landDetails) {
      project.landDetails = finalProjectData.landDetails;
    }

    // Budget categories
    if (finalProjectData.budgetCategories) {
      project.budgetCategories = finalProjectData.budgetCategories;
    }

    // Contacts
    if (finalProjectData.contacts) {
      project.contacts = finalProjectData.contacts;
    }

    // Crops
    if (finalProjectData.crops) {
      project.crops = finalProjectData.crops;
    }

    // Team assignments
    if (finalProjectData.projectManager) project.projectManager = finalProjectData.projectManager;
    if (finalProjectData.fieldWorkers) project.fieldWorkers = finalProjectData.fieldWorkers;
    if (finalProjectData.consultants) project.consultants = finalProjectData.consultants;

    // Mark as completed
    project.isDraft = false;
    project.lastUpdatedBy = userId;

    await project.save();

    // Delete the draft since project is now complete
    await Draft.deleteOne({ projectId, createdBy: userId });

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      project._id,
      userId,
      'created',
      `Project "${project.name}" was created`
    );

    return project;
  }

  /**
   * Create a final project from scratch (used when draft has invalid ID)
   * This is called when projectId is not a valid ObjectId
   */
  async createFinalProject(finalProjectData, userId) {
    // Determine category
    let category = 'FARM'; // Default
    if (finalProjectData.category) {
      category = finalProjectData.category.toUpperCase();
    } else if (finalProjectData.projectType) {
      category = finalProjectData.projectType.toUpperCase();
    }

    // Create new project
    const project = new Project({
      name: finalProjectData.name || 'Untitled Project',
      category: category,
      status: finalProjectData.status || 'Upcoming',
      clientName: finalProjectData.clientName || 'Unknown Client',
      clientPhone: finalProjectData.clientPhone,
      clientEmail: finalProjectData.clientEmail,
      alternativeContact: finalProjectData.alternativeContact,
      budget: finalProjectData.budget || 0,
      location: finalProjectData.location || {},
      landDetails: finalProjectData.landDetails || {},
      budgetCategories: finalProjectData.budgetCategories || [],
      contacts: finalProjectData.contacts || [],
      crops: finalProjectData.crops || [],
      projectManager: finalProjectData.projectManager,
      fieldWorkers: finalProjectData.fieldWorkers || [],
      consultants: finalProjectData.consultants || [],
      isDraft: false,
      createdBy: userId,
      lastUpdatedBy: userId
    });

    await project.save();

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      project._id,
      userId,
      'created',
      `Project "${project.name}" was created`
    );

    return project;
  }

  /**
   * Delete a draft and its associated project
   * This is called when user cancels/deletes a draft
   */
  async deleteDraft(projectId, userId) {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      throw new Error('Invalid project ID');
    }

    // Find the project
    const project = await Project.findOne({ _id: projectId, createdBy: userId, isDraft: true });
    if (!project) {
      throw new Error('Draft project not found');
    }

    // Delete both draft and project
    await Draft.deleteOne({ projectId, createdBy: userId });
    await Project.findByIdAndDelete(projectId);

    return { success: true, message: 'Draft deleted successfully' };
  }
}

module.exports = new DraftService();

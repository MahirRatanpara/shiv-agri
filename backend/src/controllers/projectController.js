const projectService = require('../services/projectService');
const draftService = require('../services/draftService');
const {log} = require("winston");
const logger = require('../utils/logger');

/**
 * Project Controller - Request Handling Layer
 * Handles HTTP requests and responses for project operations
 */

/**
 * @route   GET /api/projects
 * @desc    Get paginated list of projects with filtering, sorting, and search
 * @access  Private
 */
exports.getProjects = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      // Category filters (primary)
      categoryInclude,
      categoryExclude,
      // Legacy projectType support
      projectType,
      status,
      city,
      state,
      clientId,
      assignedTo,
      assignedTeam,
      budgetMin,
      budgetMax,
      createdAfter,
      createdBefore,
      startAfter,
      startBefore,
      isFavorite,
      sortBy,
      sortOrder
    } = req.query;

    // Parse array parameters
    const filters = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      // Category filters
      categoryInclude: categoryInclude ?
        (typeof categoryInclude === 'string' ? categoryInclude.split(',') : categoryInclude) :
        undefined,
      categoryExclude: categoryExclude ?
        (typeof categoryExclude === 'string' ? categoryExclude.split(',') : categoryExclude) :
        undefined,
      // Legacy projectType filter
      projectType: projectType ? (typeof projectType === 'string' ? [projectType] : projectType) : undefined,
      status: status ? (typeof status === 'string' ? status.split(',') : status) : undefined,
      city,
      state,
      clientId,
      assignedTo: assignedTo ? (typeof assignedTo === 'string' ? assignedTo.split(',') : assignedTo) : undefined,
      assignedTeam: assignedTeam ? (typeof assignedTeam === 'string' ? assignedTeam.split(',') : assignedTeam) : undefined,
      budgetMin: budgetMin ? parseFloat(budgetMin) : undefined,
      budgetMax: budgetMax ? parseFloat(budgetMax) : undefined,
      createdAfter,
      createdBefore,
      startAfter,
      startBefore,
      isFavorite: isFavorite === 'true'
    };

    const sort = {
      sortBy: sortBy || 'updatedAt',
      sortOrder: sortOrder || 'desc'
    };

    const result = await projectService.getProjectList(filters, {}, sort, req.user._id);

    logger.info('Successfully retrieved project list of size ' + (result.projects.length));
    res.status(200).json({
      success: true,
      projects: result.projects,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects',
      message: error.message
    });
  }
};

/**
 * @route   GET /api/projects/stats
 * @desc    Get project statistics and summary
 * @access  Private
 */
exports.getProjectStats = async (req, res) => {
  try {
    const { forUser } = req.query;
    const userId = forUser === 'true' ? req.user._id : null;

    const stats = await projectService.getProjectStats(userId);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching project stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project statistics',
      message: error.message
    });
  }
};

/**
 * @route   GET /api/projects/:id
 * @desc    Get project by ID
 * @access  Private
 */
exports.getProjectById = async (req, res) => {
  try {
    const project = await projectService.getProjectById(req.params.id);

    res.status(200).json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    const statusCode = error.message === 'Project not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * @route   POST /api/projects
 * @desc    Create new project
 * @access  Private (requires project.create permission)
 */
exports.createProject = async (req, res) => {
  try {
    const project = await projectService.createProject(req.body, req.user._id);

    res.status(201).json({
      success: true,
      data: project,
      message: 'Project created successfully'
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create project',
      message: error.message,
      details: error.errors ? Object.values(error.errors).map(e => e.message) : []
    });
  }
};

/**
 * @route   PATCH /api/projects/:id
 * @desc    Update project
 * @access  Private (requires project.update permission)
 */
exports.updateProject = async (req, res) => {
  try {
    const project = await projectService.updateProject(
      req.params.id,
      req.body,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: project,
      message: 'Project updated successfully'
    });
  } catch (error) {
    console.error('Error updating project:', error);
    const statusCode = error.message === 'Project not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to update project',
      message: error.message
    });
  }
};

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project (soft delete)
 * @access  Private (requires project.delete permission)
 */
exports.deleteProject = async (req, res) => {
  try {
    const result = await projectService.deleteProject(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    const statusCode = error.message === 'Project not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to delete project',
      message: error.message
    });
  }
};

/**
 * @route   DELETE /api/projects/:id/hard
 * @desc    Permanently delete a project (admin only)
 * @access  Private (Admin)
 */
exports.hardDeleteProject = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }

    const result = await projectService.hardDeleteProject(req.params.id);

    logger.info(`Project ${req.params.id} permanently deleted by admin ${req.user._id}`);
    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error permanently deleting project:', error);
    const statusCode = error.message === 'Project not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to permanently delete project',
      message: error.message
    });
  }
};

/**
 * @route   PATCH /api/projects/:id/favorite
 * @desc    Toggle favorite status for a project
 * @access  Private
 */
exports.toggleFavorite = async (req, res) => {
  try {
    const result = await projectService.toggleFavorite(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      data: result,
      message: result.isFavorite ? 'Added to favorites' : 'Removed from favorites'
    });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    const statusCode = error.message === 'Project not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to toggle favorite',
      message: error.message
    });
  }
};

/**
 * @route   PATCH /api/projects/bulk
 * @desc    Bulk update projects
 * @access  Private (requires project.update permission)
 */
exports.bulkUpdateProjects = async (req, res) => {
  try {
    const { projectIds, updates } = req.body;

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Project IDs array is required'
      });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Updates object is required'
      });
    }

    // Prevent updating sensitive fields
    const forbiddenFields = ['_id', 'createdBy', 'createdAt', 'isDeleted'];
    forbiddenFields.forEach(field => delete updates[field]);

    const result = await projectService.bulkUpdateProjects(
      projectIds,
      updates,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: result,
      message: `Successfully updated ${result.updated} project(s)`
    });
  } catch (error) {
    console.error('Error bulk updating projects:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to bulk update projects',
      message: error.message
    });
  }
};

/**
 * @route   POST /api/projects/bulk-delete
 * @desc    Bulk delete projects (soft delete)
 * @access  Private (requires project.delete permission)
 */
exports.bulkDeleteProjects = async (req, res) => {
  try {
    const { projectIds } = req.body;

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Project IDs array is required'
      });
    }

    const result = await projectService.bulkDeleteProjects(projectIds, req.user._id);

    res.status(200).json({
      success: true,
      data: result,
      message: `Successfully deleted ${result.deleted} project(s)`
    });
  } catch (error) {
    console.error('Error bulk deleting projects:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to bulk delete projects',
      message: error.message
    });
  }
};

/**
 * @route   GET /api/projects/export
 * @desc    Export projects to Excel or CSV
 * @access  Private
 */
exports.exportProjects = async (req, res) => {
  try {
    const {
      format = 'excel',
      projectIds,
      ...filters
    } = req.query;

    // Parse projectIds if provided
    const parsedProjectIds = projectIds ?
      (typeof projectIds === 'string' ? projectIds.split(',') : projectIds) :
      null;

    // Generate export file
    let buffer;
    let contentType;
    let filename;

    if (format === 'csv') {
      buffer = await projectService.exportProjectsToCSV(filters, parsedProjectIds);
      contentType = 'text/csv';
      filename = `projects_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      // Default to Excel
      buffer = await projectService.exportProjectsToExcel(filters, parsedProjectIds);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `projects_${new Date().toISOString().split('T')[0]}.xlsx`;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export projects',
      message: error.message
    });
  }
};

// ========================
// Draft Management
// ========================

/**
 * @route   POST /api/projects/drafts
 * @desc    Save project as draft (creates project + draft or updates existing)
 * @access  Private
 */
exports.saveDraft = async (req, res) => {
  try {
    const { wizardStep = 1, projectId, ...draftData } = req.body;

    let result;

    if (projectId) {
      // Update existing draft
      result = await draftService.updateDraft(projectId, draftData, wizardStep, req.user._id);
      logger.info(`Draft updated for project ${projectId}, user ${req.user._id}, step ${wizardStep}`);
    } else {
      // Create new project with draft
      result = await draftService.createProjectWithDraft(draftData, wizardStep, req.user._id);
      logger.info(`New project with draft created for user ${req.user._id}, step ${wizardStep}`);
    }

    res.status(projectId ? 200 : 201).json({
      success: true,
      data: {
        project: result.project,
        draft: result.draft,
        projectId: result.project._id
      },
      message: projectId ? 'Draft updated successfully' : 'Draft saved successfully'
    });
  } catch (error) {
    console.error('Error saving draft:', error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: validationErrors.join(', '),
        details: error.errors
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to save draft',
      message: error.message
    });
  }
};

/**
 * @route   PUT /api/projects/drafts/:id
 * @desc    Update existing draft (id is projectId)
 * @access  Private
 */
exports.updateDraft = async (req, res) => {
  try {
    const { wizardStep = 1, ...draftData } = req.body;
    const projectId = req.params.id;

    const result = await draftService.updateDraft(
      projectId,
      draftData,
      wizardStep,
      req.user._id
    );

    logger.info(`Draft updated for project ${projectId}, step ${wizardStep}`);
    res.status(200).json({
      success: true,
      data: {
        project: result.project,
        draft: result.draft,
        projectId: result.project._id
      },
      message: 'Draft updated successfully'
    });
  } catch (error) {
    console.error('Error updating draft:', error);
    const statusCode = error.message === 'Project not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to update draft',
      message: error.message
    });
  }
};

/**
 * @route   GET /api/projects/drafts/list
 * @desc    Get user's drafts
 * @access  Private
 */
exports.getUserDrafts = async (req, res) => {
  try {
    const drafts = await draftService.getUserDrafts(req.user._id);

    res.status(200).json({
      success: true,
      data: drafts,
      count: drafts.length
    });
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch drafts',
      message: error.message
    });
  }
};

/**
 * @route   GET /api/projects/drafts/:id
 * @desc    Get specific draft by project ID
 * @access  Private
 */
exports.getDraft = async (req, res) => {
  try {
    const projectId = req.params.id;
    const draft = await draftService.getDraftByProjectId(projectId, req.user._id);

    if (!draft) {
      return res.status(404).json({
        success: false,
        error: 'Draft not found'
      });
    }

    res.status(200).json({
      success: true,
      data: draft
    });
  } catch (error) {
    console.error('Error fetching draft:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch draft',
      message: error.message
    });
  }
};

/**
 * @route   POST /api/projects/drafts/:id/complete
 * @desc    Convert draft to final project (id is projectId)
 * @access  Private
 */
exports.completeDraft = async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await draftService.completeDraft(projectId, req.body, req.user._id);

    logger.info(`Draft for project ${projectId} completed and project finalized`);
    res.status(200).json({
      success: true,
      data: project,
      message: 'Project created successfully'
    });
  } catch (error) {
    console.error('Error completing draft:', error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: validationErrors.join(', '),
        details: error.errors
      });
    }

    const statusCode = error.message === 'Project not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to complete draft',
      message: error.message
    });
  }
};

// ========================
// Contact Management
// ========================

/**
 * @route   POST /api/projects/:id/contacts
 * @desc    Add contact to project
 * @access  Private
 */
exports.addContact = async (req, res) => {
  try {
    const project = await projectService.addContact(
      req.params.id,
      req.body,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: project,
      message: 'Contact added successfully'
    });
  } catch (error) {
    console.error('Error adding contact:', error);
    const statusCode = error.message === 'Project not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to add contact',
      message: error.message
    });
  }
};

/**
 * @route   PUT /api/projects/:id/contacts/:contactId
 * @desc    Update contact in project
 * @access  Private
 */
exports.updateContact = async (req, res) => {
  try {
    const project = await projectService.updateContact(
      req.params.id,
      req.params.contactId,
      req.body,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: project,
      message: 'Contact updated successfully'
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to update contact',
      message: error.message
    });
  }
};

/**
 * @route   DELETE /api/projects/:id/contacts/:contactId
 * @desc    Remove contact from project
 * @access  Private
 */
exports.removeContact = async (req, res) => {
  try {
    const project = await projectService.removeContact(
      req.params.id,
      req.params.contactId,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: project,
      message: 'Contact removed successfully'
    });
  } catch (error) {
    console.error('Error removing contact:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to remove contact',
      message: error.message
    });
  }
};

// ========================
// Timeline & Milestones
// ========================

/**
 * @route   GET /api/projects/:id/timeline
 * @desc    Get project timeline
 * @access  Private
 */
exports.getProjectTimeline = async (req, res) => {
  try {
    const timeline = await projectService.getProjectTimeline(req.params.id);

    res.status(200).json({
      success: true,
      data: timeline
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    const statusCode = error.message === 'Project not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to fetch timeline',
      message: error.message
    });
  }
};

/**
 * @route   POST /api/projects/:id/milestones
 * @desc    Add milestone to project
 * @access  Private
 */
exports.addMilestone = async (req, res) => {
  try {
    const project = await projectService.addMilestone(
      req.params.id,
      req.body,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: project,
      message: 'Milestone added successfully'
    });
  } catch (error) {
    console.error('Error adding milestone:', error);
    const statusCode = error.message === 'Project not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to add milestone',
      message: error.message
    });
  }
};

// ========================
// Activity Log
// ========================

/**
 * @route   GET /api/projects/:id/activity
 * @desc    Get project activity log
 * @access  Private
 */
exports.getProjectActivity = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      actionType = null
    } = req.query;

    const result = await projectService.getProjectActivity(
      req.params.id,
      parseInt(page),
      parseInt(limit),
      actionType
    );

    res.status(200).json({
      success: true,
      activities: result.activities,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching activity log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity log',
      message: error.message
    });
  }
};

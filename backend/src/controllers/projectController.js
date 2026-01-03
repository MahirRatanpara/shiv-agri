const projectService = require('../services/projectService');
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

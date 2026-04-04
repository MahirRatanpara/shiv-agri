const projectService = require('../services/projectService');
const draftService = require('../services/draftService');
const logger = require('../utils/logger');

// ─── List & Stats ───

exports.getProjects = async (req, res) => {
  try {
    const {
      page, limit, search, category,
      categoryInclude, categoryExclude,
      status, city, state, clientId,
      assignedTo, assignedTeam, projectManager,
      budgetMin, budgetMax, dateFrom, dateTo,
      isFavorite, isDraft,
      sortBy, sortOrder
    } = req.query;

    const filters = { search, category, city, state, clientId, assignedTo, assignedTeam, projectManager, budgetMin, budgetMax, dateFrom, dateTo };

    if (categoryInclude) filters.categoryInclude = Array.isArray(categoryInclude) ? categoryInclude : [categoryInclude];
    if (categoryExclude) filters.categoryExclude = Array.isArray(categoryExclude) ? categoryExclude : [categoryExclude];
    if (status) filters.status = Array.isArray(status) ? status : [status];
    if (isFavorite === 'true') filters.isFavorite = true;
    if (isDraft !== undefined) filters.isDraft = isDraft;

    const result = await projectService.getProjectList(
      filters,
      { page: parseInt(page) || 1, limit: parseInt(limit) || 50 },
      { sortBy, sortOrder },
      req.user?.id
    );

    logger.info(`[ProjectController] getProjects: ${result.pagination.total} results`);
    res.json({ success: true, data: result.projects, pagination: result.pagination });
  } catch (error) {
    logger.error('[ProjectController] getProjects error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects', message: error.message });
  }
};

exports.getProjectStats = async (req, res) => {
  try {
    const stats = await projectService.getProjectStats(req.user?.id);
    logger.info('[ProjectController] getProjectStats: success');
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('[ProjectController] getProjectStats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats', message: error.message });
  }
};

// ─── CRUD ───

exports.getProject = async (req, res) => {
  try {
    const project = await projectService.getProjectById(req.params.id);
    res.json({ success: true, data: project });
  } catch (error) {
    logger.error(`[ProjectController] getProject ${req.params.id} error:`, error);
    const status = error.message === 'Project not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.createProject = async (req, res) => {
  try {
    const project = await projectService.createProject(req.body, req.user.id);
    logger.info(`[ProjectController] createProject: ${project._id}`);
    res.status(201).json({ success: true, data: project, message: 'Project created successfully' });
  } catch (error) {
    logger.error('[ProjectController] createProject error:', error);
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map(e => ({ field: e.path, message: e.message }));
      return res.status(400).json({ success: false, error: 'Validation failed', details });
    }
    res.status(500).json({ success: false, error: 'Failed to create project', message: error.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const project = await projectService.updateProject(req.params.id, req.body, req.user.id);
    logger.info(`[ProjectController] updateProject: ${req.params.id}`);
    res.json({ success: true, data: project, message: 'Project updated successfully' });
  } catch (error) {
    logger.error(`[ProjectController] updateProject ${req.params.id} error:`, error);
    const status = error.message === 'Project not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    await projectService.deleteProject(req.params.id, req.user.id);
    logger.info(`[ProjectController] deleteProject: ${req.params.id}`);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    logger.error(`[ProjectController] deleteProject ${req.params.id} error:`, error);
    const status = error.message === 'Project not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.hardDeleteProject = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    await projectService.hardDeleteProject(req.params.id);
    logger.info(`[ProjectController] hardDeleteProject: ${req.params.id}`);
    res.json({ success: true, message: 'Project permanently deleted' });
  } catch (error) {
    logger.error(`[ProjectController] hardDeleteProject ${req.params.id} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Favorites ───

exports.toggleFavorite = async (req, res) => {
  try {
    const result = await projectService.toggleFavorite(req.params.id, req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`[ProjectController] toggleFavorite ${req.params.id} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Bulk Operations ───

exports.bulkUpdateProjects = async (req, res) => {
  try {
    const { projectIds, updateData } = req.body;
    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ success: false, error: 'projectIds array required' });
    }
    const result = await projectService.bulkUpdateProjects(projectIds, updateData || {}, req.user.id);
    logger.info(`[ProjectController] bulkUpdate: ${result.modifiedCount} projects`);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[ProjectController] bulkUpdate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.bulkDeleteProjects = async (req, res) => {
  try {
    const { projectIds } = req.body;
    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ success: false, error: 'projectIds array required' });
    }
    const result = await projectService.bulkDeleteProjects(projectIds, req.user.id);
    logger.info(`[ProjectController] bulkDelete: ${result.deletedCount} projects`);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[ProjectController] bulkDelete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Export ───

exports.exportProjects = async (req, res) => {
  try {
    const { format = 'xlsx', category, status, projectIds } = req.query;
    const filters = {};
    if (category) filters.category = category;
    if (status) filters.status = status;
    if (projectIds) filters.projectIds = projectIds.split(',');

    if (format === 'csv') {
      const buffer = await projectService.exportProjectsToCSV(filters, req.user.id);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=projects.csv');
      return res.send(buffer);
    }

    const buffer = await projectService.exportProjectsToExcel(filters, req.user.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=projects.xlsx');
    res.send(buffer);
  } catch (error) {
    logger.error('[ProjectController] export error:', error);
    res.status(500).json({ success: false, error: 'Export failed', message: error.message });
  }
};

// ─── Drafts ───

exports.saveDraft = async (req, res) => {
  try {
    const { draftData, wizardStep } = req.body;
    if (!draftData) return res.status(400).json({ success: false, error: 'draftData is required' });

    const result = await draftService.createProjectWithDraft(draftData, wizardStep || 1, req.user.id);
    logger.info(`[ProjectController] saveDraft: project ${result.project._id}`);
    res.status(201).json({ success: true, data: result.project, draft: result.draft, message: 'Draft saved' });
  } catch (error) {
    logger.error('[ProjectController] saveDraft error:', error);
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map(e => ({ field: e.path, message: e.message }));
      return res.status(400).json({ success: false, error: 'Validation failed', details });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateDraft = async (req, res) => {
  try {
    const { draftData, wizardStep } = req.body;
    const project = await draftService.updateDraft(req.params.id, draftData || {}, wizardStep, req.user.id);
    res.json({ success: true, data: project, message: 'Draft updated' });
  } catch (error) {
    logger.error(`[ProjectController] updateDraft ${req.params.id} error:`, error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.getUserDrafts = async (req, res) => {
  try {
    const drafts = await draftService.getUserDrafts(req.user.id);
    res.json({ success: true, data: drafts });
  } catch (error) {
    logger.error('[ProjectController] getUserDrafts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDraft = async (req, res) => {
  try {
    const draft = await draftService.getDraftByProjectId(req.params.id, req.user.id);
    if (!draft) return res.status(404).json({ success: false, error: 'Draft not found' });
    res.json({ success: true, data: draft });
  } catch (error) {
    logger.error(`[ProjectController] getDraft ${req.params.id} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.completeDraft = async (req, res) => {
  try {
    const project = await draftService.completeDraft(req.params.id, req.body, req.user.id);
    logger.info(`[ProjectController] completeDraft: project ${project._id}`);
    res.json({ success: true, data: project, message: 'Project created successfully' });
  } catch (error) {
    logger.error(`[ProjectController] completeDraft ${req.params.id} error:`, error);
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map(e => ({ field: e.path, message: e.message }));
      return res.status(400).json({ success: false, error: 'Validation failed', details });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteDraft = async (req, res) => {
  try {
    await draftService.deleteDraft(req.params.id, req.user.id);
    res.json({ success: true, message: 'Draft deleted' });
  } catch (error) {
    logger.error(`[ProjectController] deleteDraft ${req.params.id} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Contacts ───

exports.addContact = async (req, res) => {
  try {
    const contact = await projectService.addContact(req.params.id, req.body, req.user.id);
    res.status(201).json({ success: true, data: contact, message: 'Contact added' });
  } catch (error) {
    logger.error(`[ProjectController] addContact ${req.params.id} error:`, error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.updateContact = async (req, res) => {
  try {
    const contact = await projectService.updateContact(req.params.id, req.params.contactId, req.body, req.user.id);
    res.json({ success: true, data: contact, message: 'Contact updated' });
  } catch (error) {
    logger.error(`[ProjectController] updateContact error:`, error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.removeContact = async (req, res) => {
  try {
    await projectService.removeContact(req.params.id, req.params.contactId, req.user.id);
    res.json({ success: true, message: 'Contact removed' });
  } catch (error) {
    logger.error(`[ProjectController] removeContact error:`, error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Milestones ───

exports.addMilestone = async (req, res) => {
  try {
    const milestone = await projectService.addMilestone(req.params.id, req.body, req.user.id);
    res.status(201).json({ success: true, data: milestone, message: 'Milestone added' });
  } catch (error) {
    logger.error(`[ProjectController] addMilestone ${req.params.id} error:`, error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.updateMilestone = async (req, res) => {
  try {
    const milestone = await projectService.updateMilestone(req.params.id, req.params.milestoneId, req.body, req.user.id);
    res.json({ success: true, data: milestone, message: 'Milestone updated' });
  } catch (error) {
    logger.error(`[ProjectController] updateMilestone error:`, error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Timeline ───

exports.getProjectTimeline = async (req, res) => {
  try {
    const timeline = await projectService.getProjectTimeline(req.params.id);
    res.json({ success: true, data: timeline });
  } catch (error) {
    logger.error(`[ProjectController] getTimeline ${req.params.id} error:`, error);
    const status = error.message === 'Project not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Activity ───

exports.getProjectActivity = async (req, res) => {
  try {
    const { page, limit, actionType } = req.query;
    const result = await projectService.getProjectActivity(req.params.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      actionType
    });
    res.json({ success: true, data: result.activities, pagination: result.pagination });
  } catch (error) {
    logger.error(`[ProjectController] getActivity ${req.params.id} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

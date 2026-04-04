const visitService = require('../services/visitService');
const logger = require('../utils/logger');

// ─── List visits by project ───

exports.getVisits = async (req, res) => {
  try {
    const { page, limit, status, type, from, to } = req.query;
    const result = await visitService.getVisitsByProject(req.params.projectId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      type,
      from,
      to
    });

    logger.info(`[VisitController] getVisits: ${result.pagination.total} results for project ${req.params.projectId}`);
    res.json({ success: true, data: result.visits, pagination: result.pagination });
  } catch (error) {
    logger.error('[VisitController] getVisits error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch visits', message: error.message });
  }
};

// ─── Get single visit ───

exports.getVisit = async (req, res) => {
  try {
    const visit = await visitService.getVisitById(req.params.id);
    res.json({ success: true, data: visit });
  } catch (error) {
    logger.error(`[VisitController] getVisit ${req.params.id} error:`, error);
    const status = error.message === 'Visit not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Create visit ───

exports.createVisit = async (req, res) => {
  try {
    const visit = await visitService.createVisit(req.body, req.user.id);
    logger.info(`[VisitController] createVisit: ${visit._id}`);
    res.status(201).json({ success: true, data: visit, message: 'Visit created successfully' });
  } catch (error) {
    logger.error('[VisitController] createVisit error:', error);
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map(e => ({ field: e.path, message: e.message }));
      return res.status(400).json({ success: false, error: 'Validation failed', details });
    }
    res.status(500).json({ success: false, error: 'Failed to create visit', message: error.message });
  }
};

// ─── Update visit ───

exports.updateVisit = async (req, res) => {
  try {
    const visit = await visitService.updateVisit(req.params.id, req.body, req.user.id);
    logger.info(`[VisitController] updateVisit: ${req.params.id}`);
    res.json({ success: true, data: visit, message: 'Visit updated successfully' });
  } catch (error) {
    logger.error(`[VisitController] updateVisit ${req.params.id} error:`, error);
    const status = error.message === 'Visit not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Complete visit ───

exports.completeVisit = async (req, res) => {
  try {
    const visit = await visitService.completeVisit(req.params.id, req.body, req.user.id);
    logger.info(`[VisitController] completeVisit: ${req.params.id}`);
    res.json({ success: true, data: visit, message: 'Visit completed successfully' });
  } catch (error) {
    logger.error(`[VisitController] completeVisit ${req.params.id} error:`, error);
    const status = error.message === 'Visit not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Cancel visit ───

exports.cancelVisit = async (req, res) => {
  try {
    const visit = await visitService.cancelVisit(req.params.id, req.user.id);
    logger.info(`[VisitController] cancelVisit: ${req.params.id}`);
    res.json({ success: true, data: visit, message: 'Visit cancelled successfully' });
  } catch (error) {
    logger.error(`[VisitController] cancelVisit ${req.params.id} error:`, error);
    const status = error.message === 'Visit not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Upcoming visits ───

exports.getUpcomingVisits = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const visits = await visitService.getUpcomingVisits(req.params.projectId, days);
    res.json({ success: true, data: visits });
  } catch (error) {
    logger.error(`[VisitController] getUpcomingVisits error:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch upcoming visits', message: error.message });
  }
};

// ─── Visit stats ───

exports.getVisitStats = async (req, res) => {
  try {
    const stats = await visitService.getVisitStats(req.params.projectId);
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error(`[VisitController] getVisitStats error:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch visit stats', message: error.message });
  }
};

// ─── Schedule recurring ───

exports.scheduleRecurring = async (req, res) => {
  try {
    const visits = await visitService.scheduleRecurring(req.params.projectId, req.body, req.user.id);
    logger.info(`[VisitController] scheduleRecurring: ${visits.length} visits for project ${req.params.projectId}`);
    res.status(201).json({ success: true, data: visits, message: `${visits.length} recurring visits scheduled` });
  } catch (error) {
    logger.error('[VisitController] scheduleRecurring error:', error);
    res.status(500).json({ success: false, error: 'Failed to schedule recurring visits', message: error.message });
  }
};

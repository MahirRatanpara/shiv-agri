const taskService = require('../services/taskService');
const logger = require('../utils/logger');

// ─── Get Tasks ───

exports.getTasks = async (req, res) => {
  try {
    const { status, assignedTo, page, limit } = req.query;
    const result = await taskService.getTasksByProject(req.params.projectId, {
      status,
      assignedTo,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });
    res.json({ success: true, data: result.tasks, pagination: result.pagination });
  } catch (error) {
    logger.error(`[TaskController] getTasks error:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks', message: error.message });
  }
};

// ─── Get Task ───

exports.getTask = async (req, res) => {
  try {
    const task = await taskService.getTaskById(req.params.id);
    res.json({ success: true, data: task });
  } catch (error) {
    logger.error(`[TaskController] getTask ${req.params.id} error:`, error);
    const status = error.message === 'Task not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Create Task ───

exports.createTask = async (req, res) => {
  try {
    const task = await taskService.createTask(req.body, req.user.id);
    logger.info(`[TaskController] createTask: ${task._id}`);
    res.status(201).json({ success: true, data: task, message: 'Task created successfully' });
  } catch (error) {
    logger.error('[TaskController] createTask error:', error);
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map(e => ({ field: e.path, message: e.message }));
      return res.status(400).json({ success: false, error: 'Validation failed', details });
    }
    res.status(500).json({ success: false, error: 'Failed to create task', message: error.message });
  }
};

// ─── Update Task ───

exports.updateTask = async (req, res) => {
  try {
    const task = await taskService.updateTask(req.params.id, req.body, req.user.id);
    logger.info(`[TaskController] updateTask: ${req.params.id}`);
    res.json({ success: true, data: task, message: 'Task updated successfully' });
  } catch (error) {
    logger.error(`[TaskController] updateTask ${req.params.id} error:`, error);
    const status = error.message === 'Task not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Delete Task ───

exports.deleteTask = async (req, res) => {
  try {
    await taskService.deleteTask(req.params.id, req.user.id);
    logger.info(`[TaskController] deleteTask: ${req.params.id}`);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    logger.error(`[TaskController] deleteTask ${req.params.id} error:`, error);
    const status = error.message === 'Task not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Update Checklist ───

exports.updateChecklist = async (req, res) => {
  try {
    const { isDone } = req.body;
    if (isDone === undefined) {
      return res.status(400).json({ success: false, error: 'isDone is required' });
    }
    const task = await taskService.updateChecklist(req.params.id, req.params.index, isDone);
    res.json({ success: true, data: task, message: 'Checklist updated' });
  } catch (error) {
    logger.error(`[TaskController] updateChecklist error:`, error);
    const status = error.message === 'Task not found' ? 404
      : error.message === 'Invalid checklist index' ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Get Task Stats ───

exports.getTaskStats = async (req, res) => {
  try {
    const stats = await taskService.getTaskStats(req.params.projectId);
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error(`[TaskController] getTaskStats error:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch task stats', message: error.message });
  }
};

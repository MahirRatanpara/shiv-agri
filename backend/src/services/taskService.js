const mongoose = require('mongoose');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

// ─── Get Tasks by Project ───

async function getTasksByProject(projectId, { status, assignedTo, page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const query = { projectId };
  if (status) query.status = status;
  if (assignedTo) query.assignedTo = assignedTo;

  const [tasks, total] = await Promise.all([
    Task.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Task.countDocuments(query)
  ]);

  return {
    tasks,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      hasNext: safePage < Math.ceil(total / safeLimit),
      hasPrevious: safePage > 1
    }
  };
}

// ─── Get Task by ID ───

async function getTaskById(id) {
  const task = await Task.findById(id).lean();
  if (!task) throw new Error('Task not found');
  return task;
}

// ─── Create Task ───

async function createTask(data, userId) {
  const task = await Task.create({
    ...data,
    createdBy: userId
  });

  // Log activity
  try {
    await ActivityLog.logActivity(
      task.projectId,
      userId,
      'task_created',
      `Created task: ${task.title}`,
      { taskId: task._id }
    );
  } catch (err) {
    logger.error('[TaskService] Activity log error:', err);
  }

  // Notify assignee
  if (data.assignedTo && data.assignedTo.toString() !== userId.toString()) {
    try {
      await Notification.create({
        userId: data.assignedTo,
        type: 'task_assigned',
        title: 'New task assigned to you',
        message: task.title,
        projectId: task.projectId,
        referenceId: task._id.toString(),
        referenceType: 'Task',
        createdBy: userId
      });
    } catch (err) {
      logger.error('[TaskService] Notification creation error:', err);
    }
  }

  return task.toObject();
}

// ─── Update Task ───

async function updateTask(id, data, userId) {
  const task = await Task.findById(id);
  if (!task) throw new Error('Task not found');

  const oldStatus = task.status;

  Object.assign(task, data);

  // Handle status change to done
  if (data.status === 'done' && oldStatus !== 'done') {
    task.completedAt = new Date();
  } else if (data.status && data.status !== 'done' && oldStatus === 'done') {
    task.completedAt = undefined;
  }

  await task.save();

  // Log activity
  try {
    if (data.status && data.status !== oldStatus) {
      await ActivityLog.logActivity(
        task.projectId,
        userId,
        'status_changed',
        `Task "${task.title}" status changed from ${oldStatus} to ${data.status}`,
        { taskId: task._id, oldStatus, newStatus: data.status }
      );

      if (data.status === 'done') {
        await ActivityLog.logActivity(
          task.projectId,
          userId,
          'task_completed',
          `Completed task: ${task.title}`,
          { taskId: task._id }
        );
      }
    } else {
      await ActivityLog.logActivity(
        task.projectId,
        userId,
        'updated',
        `Updated task: ${task.title}`,
        { taskId: task._id }
      );
    }
  } catch (err) {
    logger.error('[TaskService] Activity log error:', err);
  }

  // Notify new assignee if assignment changed
  if (data.assignedTo && data.assignedTo.toString() !== userId.toString()) {
    try {
      await Notification.create({
        userId: data.assignedTo,
        type: 'task_assigned',
        title: 'Task assigned to you',
        message: task.title,
        projectId: task.projectId,
        referenceId: task._id.toString(),
        referenceType: 'Task',
        createdBy: userId
      });
    } catch (err) {
      logger.error('[TaskService] Notification creation error:', err);
    }
  }

  return task.toObject();
}

// ─── Delete Task ───

async function deleteTask(id, userId) {
  const task = await Task.findById(id);
  if (!task) throw new Error('Task not found');

  // Log activity before deletion
  try {
    await ActivityLog.logActivity(
      task.projectId,
      userId,
      'deleted',
      `Deleted task: ${task.title}`,
      { taskId: task._id }
    );
  } catch (err) {
    logger.error('[TaskService] Activity log error:', err);
  }

  await Task.findByIdAndDelete(id);
  logger.info(`[TaskService] Task ${id} deleted by user ${userId}`);
}

// ─── Update Checklist Item ───

async function updateChecklist(taskId, checklistIndex, isDone) {
  const task = await Task.findById(taskId);
  if (!task) throw new Error('Task not found');

  const index = parseInt(checklistIndex);
  if (index < 0 || index >= task.checklist.length) {
    throw new Error('Invalid checklist index');
  }

  task.checklist[index].isDone = isDone;
  await task.save();

  return task.toObject();
}

// ─── Get Task Stats ───

async function getTaskStats(projectId) {
  const stats = await Task.aggregate([
    { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    total: 0
  };

  stats.forEach(s => {
    result[s._id] = s.count;
    result.total += s.count;
  });

  return result;
}

module.exports = {
  getTasksByProject,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateChecklist,
  getTaskStats
};

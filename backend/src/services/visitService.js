const Visit = require('../models/Visit');
const Project = require('../models/Project');
const ActivityLog = require('../models/ActivityLog');
const logger = require('../utils/logger');

// ─── Get visits by project (paginated, filtered) ───

exports.getVisitsByProject = async (projectId, { page = 1, limit = 20, status, type, from, to } = {}) => {
  const query = { projectId };

  if (status) query.status = status;
  if (type) query.type = type;
  if (from || to) {
    query.scheduledDate = {};
    if (from) query.scheduledDate.$gte = new Date(from);
    if (to) query.scheduledDate.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;

  const [visits, total] = await Promise.all([
    Visit.find(query)
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Visit.countDocuments(query)
  ]);

  return {
    visits,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrevious: page > 1
    }
  };
};

// ─── Get single visit ───

exports.getVisitById = async (id) => {
  const visit = await Visit.findById(id).lean();
  if (!visit) throw new Error('Visit not found');
  return visit;
};

// ─── Create visit ───

exports.createVisit = async (data, userId) => {
  const visit = await Visit.create({ ...data, createdBy: userId });

  await ActivityLog.logActivity(
    visit.projectId,
    userId,
    'visit_scheduled',
    `Visit #${visit.visitNumber} scheduled for ${visit.scheduledDate.toLocaleDateString()}`,
    { visitId: visit._id, visitNumber: visit.visitNumber, type: visit.type }
  );

  logger.info(`[VisitService] createVisit: ${visit._id} for project ${visit.projectId}`);
  return visit;
};

// ─── Update visit ───

exports.updateVisit = async (id, data, userId) => {
  const visit = await Visit.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!visit) throw new Error('Visit not found');

  await ActivityLog.logActivity(
    visit.projectId,
    userId,
    'updated',
    `Visit #${visit.visitNumber} updated`,
    { visitId: visit._id, visitNumber: visit.visitNumber }
  );

  logger.info(`[VisitService] updateVisit: ${id}`);
  return visit;
};

// ─── Complete visit ───

exports.completeVisit = async (id, { inspection, diagnosis, prescription, notes, duration, actualDate }, userId) => {
  const visit = await Visit.findById(id);
  if (!visit) throw new Error('Visit not found');

  visit.status = 'completed';
  visit.completedAt = new Date();
  if (inspection) visit.inspection = inspection;
  if (diagnosis) visit.diagnosis = diagnosis;
  if (prescription) visit.prescription = prescription;
  if (notes) visit.notes = notes;
  if (duration) visit.duration = duration;
  visit.actualDate = actualDate || new Date();

  await visit.save();

  // Update project totalVisitsCompleted
  await Project.findByIdAndUpdate(visit.projectId, {
    $inc: { totalVisitsCompleted: 1 }
  });

  await ActivityLog.logActivity(
    visit.projectId,
    userId,
    'visit_completed',
    `Visit #${visit.visitNumber} completed`,
    { visitId: visit._id, visitNumber: visit.visitNumber, duration: visit.duration }
  );

  logger.info(`[VisitService] completeVisit: ${id}`);
  return visit;
};

// ─── Cancel visit ───

exports.cancelVisit = async (id, userId) => {
  const visit = await Visit.findById(id);
  if (!visit) throw new Error('Visit not found');

  visit.status = 'cancelled';
  await visit.save();

  await ActivityLog.logActivity(
    visit.projectId,
    userId,
    'visit_cancelled',
    `Visit #${visit.visitNumber} cancelled`,
    { visitId: visit._id, visitNumber: visit.visitNumber }
  );

  logger.info(`[VisitService] cancelVisit: ${id}`);
  return visit;
};

// ─── Upcoming visits ───

exports.getUpcomingVisits = async (projectId, days = 7) => {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  return Visit.find({
    projectId,
    scheduledDate: { $gte: now, $lte: future },
    status: { $in: ['scheduled', 'in_progress'] }
  })
    .sort({ scheduledDate: 1 })
    .lean();
};

// ─── Visit stats ───

exports.getVisitStats = async (projectId) => {
  const [stats] = await Visit.aggregate([
    { $match: { projectId: require('mongoose').Types.ObjectId.createFromHexString(projectId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        avgDuration: { $avg: { $cond: [{ $eq: ['$status', 'completed'] }, '$duration', null] } }
      }
    }
  ]);

  return stats || { total: 0, completed: 0, missed: 0, cancelled: 0, avgDuration: 0 };
};

// ─── Schedule recurring visits ───

exports.scheduleRecurring = async (projectId, config, userId) => {
  const { startDate, endDate, frequencyDays, type = 'routine', assignedTo } = config;

  const visits = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  while (current <= end) {
    visits.push({
      projectId,
      scheduledDate: new Date(current),
      type,
      assignedTo,
      createdBy: userId
    });
    current.setDate(current.getDate() + frequencyDays);
  }

  const created = await Visit.insertMany(visits);

  await ActivityLog.logActivity(
    projectId,
    userId,
    'visit_scheduled',
    `${created.length} recurring visits scheduled`,
    { count: created.length, frequencyDays, type }
  );

  logger.info(`[VisitService] scheduleRecurring: ${created.length} visits for project ${projectId}`);
  return created;
};

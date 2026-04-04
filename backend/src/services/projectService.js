const mongoose = require('mongoose');
const Project = require('../models/Project');
const Draft = require('../models/Draft');
const ActivityLog = require('../models/ActivityLog');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const { logActivity } = require('./activityLogService');

// ─── List & Search ───

async function getProjectList(filters = {}, pagination = {}, sort = {}, userId = null) {
  const { page = 1, limit = 50 } = pagination;
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));
  const skip = (safePage - 1) * safeLimit;

  const query = { isDeleted: { $ne: true } };

  // Category filter
  if (filters.categoryInclude && filters.categoryInclude.length > 0) {
    query.category = { $in: filters.categoryInclude.map(c => c.toUpperCase()) };
  }
  if (filters.categoryExclude && filters.categoryExclude.length > 0) {
    query.category = { ...query.category, $nin: filters.categoryExclude.map(c => c.toUpperCase()) };
  }
  if (filters.category) {
    query.category = filters.category.toUpperCase();
  }

  // Status filter
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    query.status = { $in: statuses };
  }

  // Location filters
  if (filters.city) query['location.city'] = { $regex: filters.city, $options: 'i' };
  if (filters.state) query['location.state'] = { $regex: filters.state, $options: 'i' };

  // Budget range
  if (filters.budgetMin || filters.budgetMax) {
    query.budget = {};
    if (filters.budgetMin) query.budget.$gte = parseFloat(filters.budgetMin);
    if (filters.budgetMax) query.budget.$lte = parseFloat(filters.budgetMax);
  }

  // Date range
  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
  }

  // Team filters
  if (filters.assignedTo) query.assignedTo = filters.assignedTo;
  if (filters.projectManager) query.projectManager = filters.projectManager;
  if (filters.clientId) query.clientId = filters.clientId;
  if (filters.assignedTeam) {
    const teamIds = Array.isArray(filters.assignedTeam) ? filters.assignedTeam : [filters.assignedTeam];
    query.$or = [
      { assignedTo: { $in: teamIds } },
      { projectManager: { $in: teamIds } },
      { fieldWorkers: { $in: teamIds } },
      { consultants: { $in: teamIds } },
      { assignedTeam: { $in: teamIds } }
    ];
  }

  // Favorites
  if (filters.isFavorite && userId) {
    query.isFavorite = userId;
  }

  // Drafts
  if (filters.isDraft !== undefined) {
    query.isDraft = filters.isDraft === true || filters.isDraft === 'true';
  } else {
    query.isDraft = { $ne: true };
  }

  // Text search
  let sortOptions = {};
  if (filters.search && filters.search.trim()) {
    query.$text = { $search: filters.search.trim() };
    sortOptions = { score: { $meta: 'textScore' } };
  }

  // Sort
  if (!filters.search) {
    const sortField = sort.sortBy || 'updatedAt';
    const sortOrder = sort.sortOrder === 'asc' ? 1 : -1;
    sortOptions = { [sortField]: sortOrder };
  }

  const [projects, total] = await Promise.all([
    Project.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(safeLimit)
      .populate('assignedTo', 'name email profilePhoto')
      .populate('projectManager', 'name email profilePhoto')
      .populate('createdBy', 'name email profilePhoto')
      .lean(),
    Project.countDocuments(query)
  ]);

  logger.info(`Project list fetched: ${projects.length} of ${total} (page ${safePage})`);

  return {
    projects,
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

// ─── Stats ───

async function getProjectStats(userId = null) {
  const baseQuery = { isDeleted: { $ne: true }, isDraft: { $ne: true } };

  const [
    totalProjects,
    totalBudget,
    totalExpenses,
    totalIncome,
    statusBreakdown
  ] = await Promise.all([
    Project.countDocuments(baseQuery),
    Project.aggregate([
      { $match: baseQuery },
      { $group: { _id: null, total: { $sum: '$budget' } } }
    ]),
    Project.aggregate([
      { $match: baseQuery },
      { $group: { _id: null, total: { $sum: '$expenses' } } }
    ]),
    Project.aggregate([
      { $match: baseQuery },
      { $group: { _id: null, total: { $sum: '$income' } } }
    ]),
    Project.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);

  const statusMap = {};
  statusBreakdown.forEach(s => { statusMap[s._id] = s.count; });

  logger.info(`Project stats calculated: ${totalProjects} total projects`);

  return {
    totalProjects,
    totalBudget: totalBudget[0]?.total || 0,
    totalExpenses: totalExpenses[0]?.total || 0,
    totalIncome: totalIncome[0]?.total || 0,
    statusBreakdown: statusMap,
    activeProjects: (statusMap['Running'] || 0) + (statusMap['Upcoming'] || 0),
    completedProjects: statusMap['Completed'] || 0
  };
}

// ─── CRUD ───

async function createProject(data, userId) {
  const project = new Project({ ...data, createdBy: userId, lastUpdatedBy: userId });
  const saved = await project.save();

  logActivity(saved._id, userId, 'created', `Project "${saved.name}" created`, {
    entityType: 'project',
    entityId: saved._id,
    category: saved.category
  });

  logger.info(`Project created: ${saved._id} - "${saved.name}" by user ${userId}`);
  return saved;
}

async function getProjectById(projectId) {
  const project = await Project.findById(projectId)
    .populate('assignedTo', 'name email profilePhoto')
    .populate('projectManager', 'name email profilePhoto')
    .populate('fieldWorkers', 'name email profilePhoto')
    .populate('consultants', 'name email profilePhoto')
    .populate('assignedTeam', 'name email profilePhoto')
    .populate('createdBy', 'name email profilePhoto');

  if (!project) throw new Error('Project not found');
  return project;
}

async function updateProject(projectId, updateData, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  Object.assign(project, updateData);
  project.lastUpdatedBy = userId;
  const saved = await project.save();

  logActivity(saved._id, userId, 'updated', `Project "${saved.name}" updated`, {
    entityType: 'project',
    entityId: saved._id
  });

  logger.info(`Project updated: ${saved._id} by user ${userId}`);
  return saved;
}

async function deleteProject(projectId, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  await project.softDelete(userId);

  logActivity(projectId, userId, 'deleted', `Project "${project.name}" deleted`, {
    entityType: 'project',
    entityId: projectId
  });

  logger.info(`Project soft-deleted: ${projectId} by user ${userId}`);
  return { message: 'Project deleted' };
}

async function hardDeleteProject(projectId) {
  const project = await Project.findById(projectId).setOptions({ isDeleted: true });
  if (!project) throw new Error('Project not found');

  await Promise.all([
    Project.findByIdAndDelete(projectId),
    Draft.deleteMany({ projectId }),
    Transaction.deleteMany({ projectId }),
    ActivityLog.deleteMany({ projectId })
  ]);

  logger.info(`Project hard-deleted: ${projectId}`);
  return { message: 'Project permanently deleted' };
}

// ─── Favorites ───

async function toggleFavorite(projectId, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  const isFav = project.isFavorite.some(id => id.toString() === userId.toString());
  if (isFav) {
    await project.removeFromFavorites(userId);
  } else {
    await project.addToFavorites(userId);
  }

  logger.info(`Favorite toggled for project ${projectId} by user ${userId}: ${!isFav}`);
  return { isFavorite: !isFav };
}

// ─── Bulk Operations ───

async function bulkUpdateProjects(projectIds, updateData, userId) {
  const protectedFields = ['_id', 'createdBy', 'createdAt', 'isDeleted', 'deletedAt', 'deletedBy'];
  protectedFields.forEach(f => delete updateData[f]);

  const result = await Project.updateMany(
    { _id: { $in: projectIds }, isDeleted: { $ne: true } },
    { ...updateData, lastUpdatedBy: userId }
  );

  logger.info(`Bulk update: ${result.modifiedCount} projects updated by user ${userId}`);
  return { modifiedCount: result.modifiedCount };
}

async function bulkDeleteProjects(projectIds, userId) {
  const result = await Project.updateMany(
    { _id: { $in: projectIds }, isDeleted: { $ne: true } },
    { isDeleted: true, deletedAt: new Date(), deletedBy: userId }
  );

  logger.info(`Bulk delete: ${result.modifiedCount} projects deleted by user ${userId}`);
  return { deletedCount: result.modifiedCount };
}

// ─── Export ───

async function exportProjectsToExcel(filters = {}, userId = null) {
  const ExcelJS = require('exceljs');

  const query = { isDeleted: { $ne: true }, isDraft: { $ne: true } };
  if (filters.projectIds && filters.projectIds.length > 0) {
    query._id = { $in: filters.projectIds };
  }
  if (filters.category) query.category = filters.category.toUpperCase();
  if (filters.status) query.status = filters.status;

  const projects = await Project.find(query)
    .populate('assignedTo', 'name email')
    .populate('projectManager', 'name email')
    .sort({ updatedAt: -1 })
    .lean();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Projects');

  sheet.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Client', key: 'clientName', width: 25 },
    { header: 'Location', key: 'location', width: 30 },
    { header: 'Budget (₹)', key: 'budget', width: 18 },
    { header: 'Expenses (₹)', key: 'expenses', width: 18 },
    { header: 'Income (₹)', key: 'income', width: 18 },
    { header: 'Budget Utilization %', key: 'budgetUtil', width: 20 },
    { header: 'Assigned To', key: 'assignedTo', width: 25 },
    { header: 'Project Manager', key: 'projectManager', width: 25 },
    { header: 'Start Date', key: 'startDate', width: 15 },
    { header: 'Created', key: 'createdAt', width: 15 }
  ];

  // Style header row
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  projects.forEach(p => {
    sheet.addRow({
      name: p.name,
      category: p.category,
      status: p.status,
      clientName: p.clientName || '',
      location: [p.location?.city, p.location?.state].filter(Boolean).join(', '),
      budget: p.budget || 0,
      expenses: p.expenses || 0,
      income: p.income || 0,
      budgetUtil: p.budgetUtilizationPercentage || 0,
      assignedTo: p.assignedTo?.name || '',
      projectManager: p.projectManager?.name || '',
      startDate: p.startDate ? new Date(p.startDate).toLocaleDateString() : '',
      createdAt: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''
    });
  });

  logger.info(`Export: ${projects.length} projects exported to Excel by user ${userId}`);
  return workbook.xlsx.writeBuffer();
}

async function exportProjectsToCSV(filters = {}, userId = null) {
  const query = { isDeleted: { $ne: true }, isDraft: { $ne: true } };
  if (filters.projectIds && filters.projectIds.length > 0) {
    query._id = { $in: filters.projectIds };
  }

  const projects = await Project.find(query).sort({ updatedAt: -1 }).lean();

  const headers = ['Name', 'Category', 'Status', 'Client', 'City', 'State', 'Budget', 'Expenses', 'Income'];
  const rows = projects.map(p => [
    `"${(p.name || '').replace(/"/g, '""')}"`,
    p.category,
    p.status,
    `"${(p.clientName || '').replace(/"/g, '""')}"`,
    `"${(p.location?.city || '').replace(/"/g, '""')}"`,
    `"${(p.location?.state || '').replace(/"/g, '""')}"`,
    p.budget || 0,
    p.expenses || 0,
    p.income || 0
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  logger.info(`Export: ${projects.length} projects exported to CSV by user ${userId}`);
  return Buffer.from(csv, 'utf-8');
}

// ─── Contacts ───

async function addContact(projectId, contactData, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  project.contacts.push(contactData);
  project.lastUpdatedBy = userId;
  await project.save();

  logActivity(projectId, userId, 'contact_added', `Contact "${contactData.fullName}" added`, {
    entityType: 'contact',
    contactName: contactData.fullName
  });

  logger.info(`Contact added to project ${projectId}: ${contactData.fullName}`);
  return project.contacts[project.contacts.length - 1];
}

async function updateContact(projectId, contactId, contactData, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  const contact = project.contacts.id(contactId);
  if (!contact) throw new Error('Contact not found');

  Object.assign(contact, contactData);
  project.lastUpdatedBy = userId;
  await project.save();

  logActivity(projectId, userId, 'contact_updated', `Contact "${contact.fullName}" updated`, {
    entityType: 'contact',
    contactId
  });

  logger.info(`Contact updated in project ${projectId}: ${contactId}`);
  return contact;
}

async function removeContact(projectId, contactId, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  const contact = project.contacts.id(contactId);
  if (!contact) throw new Error('Contact not found');

  const contactName = contact.fullName;
  project.contacts.pull(contactId);
  project.lastUpdatedBy = userId;
  await project.save();

  logActivity(projectId, userId, 'contact_removed', `Contact "${contactName}" removed`, {
    entityType: 'contact',
    contactId
  });

  logger.info(`Contact removed from project ${projectId}: ${contactId}`);
  return { message: 'Contact removed' };
}

// ─── Milestones ───

async function addMilestone(projectId, milestoneData, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  project.milestones.push(milestoneData);
  project.lastUpdatedBy = userId;
  await project.save();

  logActivity(projectId, userId, 'milestone_added', `Milestone "${milestoneData.name}" added`, {
    entityType: 'milestone',
    milestoneName: milestoneData.name
  });

  logger.info(`Milestone added to project ${projectId}: ${milestoneData.name}`);
  return project.milestones[project.milestones.length - 1];
}

async function updateMilestone(projectId, milestoneId, milestoneData, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  const milestone = project.milestones.id(milestoneId);
  if (!milestone) throw new Error('Milestone not found');

  Object.assign(milestone, milestoneData);
  if (milestoneData.isCompleted && !milestone.completedAt) {
    milestone.completedAt = new Date();
  }
  project.lastUpdatedBy = userId;
  await project.save();

  if (milestoneData.isCompleted) {
    logActivity(projectId, userId, 'milestone_completed', `Milestone "${milestone.name}" completed`, {
      entityType: 'milestone',
      milestoneId
    });
  }

  logger.info(`Milestone updated in project ${projectId}: ${milestoneId}`);
  return milestone;
}

// ─── Timeline ───

async function getProjectTimeline(projectId) {
  const project = await Project.findById(projectId)
    .select('milestones startDate completionDate expectedCompletionDate totalVisitsPlanned totalVisitsCompleted')
    .lean();
  if (!project) throw new Error('Project not found');

  const totalMilestones = project.milestones?.length || 0;
  const completedMilestones = project.milestones?.filter(m => m.isCompleted).length || 0;
  const progressPercentage = totalMilestones > 0
    ? Math.round((completedMilestones / totalMilestones) * 100)
    : 0;

  return {
    milestones: project.milestones || [],
    startDate: project.startDate,
    completionDate: project.completionDate,
    expectedCompletionDate: project.expectedCompletionDate,
    totalMilestones,
    completedMilestones,
    progressPercentage,
    totalVisitsPlanned: project.totalVisitsPlanned || 0,
    totalVisitsCompleted: project.totalVisitsCompleted || 0
  };
}

// ─── Activity ───

async function getProjectActivity(projectId, options = {}) {
  return ActivityLog.getProjectActivity(projectId, options);
}

module.exports = {
  getProjectList,
  getProjectStats,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  hardDeleteProject,
  toggleFavorite,
  bulkUpdateProjects,
  bulkDeleteProjects,
  exportProjectsToExcel,
  exportProjectsToCSV,
  addContact,
  updateContact,
  removeContact,
  addMilestone,
  updateMilestone,
  getProjectTimeline,
  getProjectActivity
};

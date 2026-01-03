const Project = require('../models/Project');
const ExcelJS = require('exceljs'); // You'll need to npm install exceljs

/**
 * Project Service - Business Logic Layer
 * Handles all project-related operations with optimized queries
 */
class ProjectService {
  /**
   * Get paginated project list with advanced filtering, sorting, and search
   */
  async getProjectList(filters = {}, pagination = {}, sort = {}, userId = null) {
    const {
      page = 1,
      limit = 50,
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
      isFavorite
    } = filters;

    const { sortBy = 'updatedAt', sortOrder = 'desc' } = sort;

    // Build query
    const query = { isDeleted: false };

    // Text search
    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
    }

    // Filter by project type
    if (projectType && Array.isArray(projectType) && projectType.length > 0) {
      query.projectType = { $in: projectType };
    } else if (projectType) {
      query.projectType = projectType;
    }

    // Filter by status
    if (status && Array.isArray(status) && status.length > 0) {
      query.status = { $in: status };
    } else if (status) {
      query.status = status;
    }

    // Location filters
    if (city) query['location.city'] = city;
    if (state) query['location.state'] = state;

    // Client filter
    if (clientId) query.clientId = clientId;

    // Team filters
    if (assignedTo) {
      if (Array.isArray(assignedTo)) {
        query.assignedTo = { $in: assignedTo };
      } else {
        query.assignedTo = assignedTo;
      }
    }

    if (assignedTeam && Array.isArray(assignedTeam) && assignedTeam.length > 0) {
      query.assignedTeam = { $in: assignedTeam };
    }

    // Budget range filter
    if (budgetMin !== undefined || budgetMax !== undefined) {
      query.budget = {};
      if (budgetMin !== undefined) query.budget.$gte = Number(budgetMin);
      if (budgetMax !== undefined) query.budget.$lte = Number(budgetMax);
    }

    // Date filters
    if (createdAfter || createdBefore) {
      query.createdAt = {};
      if (createdAfter) query.createdAt.$gte = new Date(createdAfter);
      if (createdBefore) query.createdAt.$lte = new Date(createdBefore);
    }

    if (startAfter || startBefore) {
      query.startDate = {};
      if (startAfter) query.startDate.$gte = new Date(startAfter);
      if (startBefore) query.startDate.$lte = new Date(startBefore);
    }

    // Favorites filter
    if (isFavorite && userId) {
      query.isFavorite = userId;
    }

    // Build sort object
    const sortObj = {};
    if (search && search.trim()) {
      sortObj.score = { $meta: 'textScore' }; // Sort by relevance for text search
    }
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (page - 1) * limit;
    const maxLimit = 100; // Max items per page
    const actualLimit = Math.min(limit, maxLimit);

    // Execute query with pagination
    const [projects, total] = await Promise.all([
      Project.find(query)
        .select('name projectType status clientName clientAvatar location size budget expenses budgetUtilizationPercentage assignedTo assignedToName visitCompletionPercentage coverImage thumbnailUrl createdAt updatedAt startDate completionDate isFavorite crops')
        .sort(sortObj)
        .skip(skip)
        .limit(actualLimit)
        .lean(), // Convert to plain JS objects for better performance
      Project.countDocuments(query)
    ]);

    // Add isFavorite flag for current user
    if (userId) {
      projects.forEach(project => {
        project.isFavoriteForUser = project.isFavorite && project.isFavorite.some(
          id => id.toString() === userId.toString()
        );
      });
    }

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / actualLimit);

    return {
      projects,
      pagination: {
        total,
        page: Number(page),
        limit: actualLimit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      }
    };
  }

  /**
   * Get project statistics/summary
   */
  async getProjectStats(userId = null) {
    const query = userId ? { createdBy: userId, isDeleted: false } : { isDeleted: false };

    const stats = await Project.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalProjects: { $sum: 1 },
          totalBudget: { $sum: '$budget' },
          totalExpenses: { $sum: '$expenses' },
          activeProjects: {
            $sum: { $cond: [{ $eq: ['$status', 'Running'] }, 1, 0] }
          },
          completedProjects: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
          },
          upcomingProjects: {
            $sum: { $cond: [{ $eq: ['$status', 'Upcoming'] }, 1, 0] }
          },
          onHoldProjects: {
            $sum: { $cond: [{ $eq: ['$status', 'On Hold'] }, 1, 0] }
          },
          cancelledProjects: {
            $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get status breakdown
    const statusBreakdown = await Project.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      summary: stats[0] || {
        totalProjects: 0,
        totalBudget: 0,
        totalExpenses: 0,
        activeProjects: 0,
        completedProjects: 0,
        upcomingProjects: 0,
        onHoldProjects: 0,
        cancelledProjects: 0
      },
      statusBreakdown: statusBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };
  }

  /**
   * Create new project
   */
  async createProject(projectData, userId) {
    const project = new Project({
      ...projectData,
      createdBy: userId,
      lastUpdatedBy: userId
    });

    await project.save();
    return project;
  }

  /**
   * Update project
   */
  async updateProject(projectId, updateData, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    // Update fields
    Object.assign(project, updateData);
    project.lastUpdatedBy = userId;

    await project.save();
    return project;
  }

  /**
   * Delete project (soft delete)
   */
  async deleteProject(projectId, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    await project.softDelete(userId);
    return { success: true, message: 'Project deleted successfully' };
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(projectId, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    const isFavorite = project.isFavorite.some(id => id.equals(userId));

    if (isFavorite) {
      await project.removeFromFavorites(userId);
      return { isFavorite: false };
    } else {
      await project.addToFavorites(userId);
      return { isFavorite: true };
    }
  }

  /**
   * Bulk update projects
   */
  async bulkUpdateProjects(projectIds, updateData, userId) {
    const validProjectIds = projectIds.filter(id => id && id.length === 24);

    if (validProjectIds.length === 0) {
      throw new Error('No valid project IDs provided');
    }

    const updateObject = {
      ...updateData,
      lastUpdatedBy: userId,
      updatedAt: new Date()
    };

    const result = await Project.updateMany(
      { _id: { $in: validProjectIds }, isDeleted: false },
      { $set: updateObject }
    );

    return {
      success: true,
      updated: result.modifiedCount,
      total: validProjectIds.length
    };
  }

  /**
   * Bulk delete projects (soft delete)
   */
  async bulkDeleteProjects(projectIds, userId) {
    const validProjectIds = projectIds.filter(id => id && id.length === 24);

    if (validProjectIds.length === 0) {
      throw new Error('No valid project IDs provided');
    }

    const result = await Project.updateMany(
      { _id: { $in: validProjectIds }, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: userId
        }
      }
    );

    return {
      success: true,
      deleted: result.modifiedCount,
      total: validProjectIds.length
    };
  }

  /**
   * Export projects to Excel
   */
  async exportProjectsToExcel(filters = {}, projectIds = null) {
    let projects;

    if (projectIds && projectIds.length > 0) {
      // Export specific projects
      projects = await Project.find({
        _id: { $in: projectIds },
        isDeleted: false
      }).lean();
    } else {
      // Export filtered projects
      const result = await this.getProjectList(filters, { page: 1, limit: 10000 });
      projects = result.projects;
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Projects');

    // Define columns
    worksheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Type', key: 'projectType', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Client', key: 'clientName', width: 25 },
      { header: 'Location', key: 'location', width: 30 },
      { header: 'Size', key: 'size', width: 15 },
      { header: 'Budget', key: 'budget', width: 15 },
      { header: 'Expenses', key: 'expenses', width: 15 },
      { header: 'Budget Utilization %', key: 'budgetUtilization', width: 20 },
      { header: 'Visit Completion %', key: 'visitCompletion', width: 20 },
      { header: 'Start Date', key: 'startDate', width: 15 },
      { header: 'Created Date', key: 'createdAt', width: 15 }
    ];

    // Add rows
    projects.forEach(project => {
      worksheet.addRow({
        name: project.name,
        projectType: project.projectType === 'farm' ? 'Farm' : 'Landscaping',
        status: project.status,
        clientName: project.clientName,
        location: project.location ?
          `${project.location.city || ''}, ${project.location.state || ''}`.trim() : '',
        size: project.size ? `${project.size.value} ${project.size.unit}` : '',
        budget: project.budget,
        expenses: project.expenses || 0,
        budgetUtilization: project.budgetUtilizationPercentage || 0,
        visitCompletion: project.visitCompletionPercentage || 0,
        startDate: project.startDate ? new Date(project.startDate).toLocaleDateString() : '',
        createdAt: new Date(project.createdAt).toLocaleDateString()
      });
    });

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '667eea' }
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  /**
   * Export projects to CSV
   */
  async exportProjectsToCSV(filters = {}, projectIds = null) {
    let projects;

    if (projectIds && projectIds.length > 0) {
      projects = await Project.find({
        _id: { $in: projectIds },
        isDeleted: false
      }).lean();
    } else {
      const result = await this.getProjectList(filters, { page: 1, limit: 10000 });
      projects = result.projects;
    }

    // Create CSV header
    const headers = [
      'Project Name',
      'Type',
      'Status',
      'Client',
      'Location',
      'Size',
      'Budget',
      'Expenses',
      'Budget Utilization %',
      'Visit Completion %',
      'Start Date',
      'Created Date'
    ];

    // Create CSV rows
    const rows = projects.map(project => [
      project.name,
      project.projectType === 'farm' ? 'Farm' : 'Landscaping',
      project.status,
      project.clientName,
      project.location ?
        `${project.location.city || ''}, ${project.location.state || ''}`.trim() : '',
      project.size ? `${project.size.value} ${project.size.unit}` : '',
      project.budget,
      project.expenses || 0,
      project.budgetUtilizationPercentage || 0,
      project.visitCompletionPercentage || 0,
      project.startDate ? new Date(project.startDate).toLocaleDateString() : '',
      new Date(project.createdAt).toLocaleDateString()
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Get project by ID
   */
  async getProjectById(projectId) {
    const project = await Project.findById(projectId)
      .populate('assignedTo', 'name email profilePhoto')
      .populate('assignedTeam', 'name email profilePhoto')
      .populate('clientId', 'name email profilePhoto')
      .populate('createdBy', 'name email');

    if (!project) {
      throw new Error('Project not found');
    }

    return project;
  }
}

module.exports = new ProjectService();

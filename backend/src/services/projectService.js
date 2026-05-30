const Project = require('../models/Project');
const User = require('../models/User');
const Role = require('../models/Role');
const ExcelJS = require('exceljs'); // You'll need to npm install exceljs
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const normalizePhoneNumber = (phoneNumber = '') => String(phoneNumber).replace(/\D/g, '');
const DEFAULT_COUNTRY_DIGITS = normalizePhoneNumber(process.env.DEFAULT_PHONE_COUNTRY_CODE || '+91') || '91';

/**
 * Parse a free-form client phone ("+91 9876543210", "9876543210", "+919876543210")
 * into the canonical shape stored at signup, so a manager-provisioned account and a
 * later phone-OTP login resolve to the SAME normalized key (`<cc><national>`).
 */
const parseClientPhone = (raw) => {
  const trimmed = String(raw || '').trim();
  let ccDigits = DEFAULT_COUNTRY_DIGITS;
  let nationalDigits = '';

  if (trimmed.startsWith('+')) {
    const [ccPart, ...rest] = trimmed.slice(1).split(/\s+/);
    if (rest.length) {
      ccDigits = normalizePhoneNumber(ccPart) || DEFAULT_COUNTRY_DIGITS;
      nationalDigits = normalizePhoneNumber(rest.join(''));
    } else {
      const all = normalizePhoneNumber(trimmed);
      if (all.startsWith(DEFAULT_COUNTRY_DIGITS) && all.length > 10) {
        nationalDigits = all.slice(DEFAULT_COUNTRY_DIGITS.length);
      } else {
        nationalDigits = all;
      }
    }
  } else {
    const all = normalizePhoneNumber(trimmed);
    if (all.startsWith(DEFAULT_COUNTRY_DIGITS) && all.length > 10) {
      nationalDigits = all.slice(DEFAULT_COUNTRY_DIGITS.length);
    } else {
      nationalDigits = all;
    }
  }

  return {
    ccDigits,
    nationalDigits,
    normalizedKey: nationalDigits ? `${ccDigits}${nationalDigits}` : '',
    formattedCountryCode: `+${ccDigits}`,
    formattedPhone: nationalDigits ? `+${ccDigits} ${nationalDigits}` : ''
  };
};

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
      // Category filters (primary)
      categoryInclude,    // Array of categories to include
      categoryExclude,    // Array of categories to exclude
      // Legacy projectType support
      projectType,
      status,
      city,
      district,
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
      submittedBy,
      showDrafts
    } = filters;

    const { sortBy = 'updatedAt', sortOrder = 'desc' } = sort;

    // Build query
    const query = { isDeleted: false };

    // Return both draft and non-draft projects - filtering will be done on frontend
    // No draft filtering here

    // Text search
    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
    }

    // ========================
    // CATEGORY FILTERING (Primary, Top-level constraint)
    // ========================
    // Category filter takes precedence and is applied first
    const categoryFilter = {};

    // Include specific categories
    if (categoryInclude && Array.isArray(categoryInclude) && categoryInclude.length > 0) {
      const normalizedInclude = categoryInclude.map(cat => cat.toUpperCase());
      categoryFilter.$in = normalizedInclude;
    }

    // Exclude specific categories
    if (categoryExclude && Array.isArray(categoryExclude) && categoryExclude.length > 0) {
      const normalizedExclude = categoryExclude.map(cat => cat.toUpperCase());
      categoryFilter.$nin = normalizedExclude;
    }

    // Apply category filter if any conditions exist
    if (Object.keys(categoryFilter).length > 0) {
      query.category = categoryFilter;
    }

    // ========================
    // Legacy projectType support (backward compatibility)
    // ========================
    // Only apply if category filters are not used
    if (!categoryInclude && !categoryExclude) {
      if (projectType && Array.isArray(projectType) && projectType.length > 0) {
        query.projectType = { $in: projectType };
      } else if (projectType) {
        query.projectType = projectType;
      }
    }

    // Filter by status
    if (status && Array.isArray(status) && status.length > 0) {
      query.status = { $in: status };
    } else if (status) {
      query.status = status;
    }

    // Location filters
    if (city) query['location.city'] = city;
    if (district) query['location.district'] = district;
    if (state) query['location.state'] = state;

    // Client filter
    if (clientId) query.clientId = clientId;

    if (submittedBy) {
      query.submittedBy = submittedBy;
    }

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
    // For drafts, we need all fields to resume editing
    // For regular projects, we only need summary fields for list view
    const projectQuery = Project.find(query);

    // Only select limited fields for non-draft projects
    // Drafts need all fields for wizard population
    projectQuery
      .sort(sortObj)
      .skip(skip)
      .limit(actualLimit)
      .lean(); // Convert to plain JS objects for better performance

    const [projects, total] = await Promise.all([
      projectQuery,
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
   * Resolve the farmer a manager-created farm belongs to, by mobile number.
   *
   * Order of precedence (enforces the 1-1 phone/email identity):
   *   1. An existing user already owning this phone → reuse.
   *   2. An existing user with the supplied email but no phone yet → attach phone (pre-provision).
   *      (If that email-user already has a *different* phone → block.)
   *   3. Nobody matches → create a brand-new pre-provisioned farmer (phone + optional email),
   *      role 'user', phoneVerified=false. They claim it on first phone-OTP / Google login.
   *
   * The created user carries the same normalized phone key signup uses, so the farmer's
   * first login lands on this exact account and inherits every farm created for them.
   */
  async resolveOrCreateFarmer({ rawPhone, email, name }) {
    const parsed = parseClientPhone(rawPhone);
    if (!parsed.nationalDigits) {
      throw new Error('Client mobile number is required to create a farm project.');
    }

    const allDigits = normalizePhoneNumber(rawPhone);
    const localDigits = allDigits.startsWith(parsed.ccDigits)
      ? allDigits.slice(parsed.ccDigits.length)
      : allDigits;
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    // 1. Existing user by phone (loose match across stored variants).
    let user = await User.findOne({
      $or: [
        { 'metadata.phoneNumberNormalized': parsed.normalizedKey },
        { 'metadata.phoneNumberNormalized': allDigits },
        { 'metadata.phoneNumberNormalized': localDigits },
        { 'metadata.phoneNumber': String(rawPhone).trim() },
        { 'metadata.phoneNumber': parsed.formattedPhone }
      ]
    });
    if (user) return user;

    const applyPhone = (target) => {
      const meta = target.metadata?.toObject ? target.metadata.toObject() : (target.metadata || {});
      target.metadata = {
        ...meta,
        phoneCountryCode: parsed.formattedCountryCode,
        phoneNumber: parsed.formattedPhone,
        phoneNumberNormalized: parsed.normalizedKey
      };
    };

    const saveWithDupGuard = async (doc, label) => {
      try {
        await doc.save();
      } catch (err) {
        if (err.code === 11000) {
          throw new Error('This mobile number or email is already linked to another account.');
        }
        throw err;
      }
      logger.info(`${label} farmer ${doc._id} for phone ${parsed.formattedPhone}`);
    };

    // 2. Existing user by email — pre-provision their phone if they have none.
    if (cleanEmail) {
      user = await User.findOne({ email: cleanEmail });
      if (user) {
        if (user.metadata?.phoneNumberNormalized &&
            user.metadata.phoneNumberNormalized !== parsed.normalizedKey) {
          throw new Error('This email is already linked to a different mobile number.');
        }
        applyPhone(user);
        await saveWithDupGuard(user, 'Linked phone to existing');
        return user;
      }
    }

    // 3. Create a fresh pre-provisioned farmer.
    user = new User({
      name: (name && name.trim()) || 'New User',
      email: cleanEmail || undefined,
      role: 'user',
      phoneVerified: false,
      metadata: {
        phoneCountryCode: parsed.formattedCountryCode,
        phoneNumber: parsed.formattedPhone,
        phoneNumberNormalized: parsed.normalizedKey
      }
    });
    const roleDoc = await Role.findOne({ name: user.role });
    if (roleDoc) user.roleRef = roleDoc._id;
    await saveWithDupGuard(user, 'Created');
    return user;
  }

  /**
   * Create new project
   */
  async createProject(projectData, userContext) {
    const userId = userContext?._id || userContext;
    const userRole = userContext?.role;
    const isFarmerRegistration = userRole === 'end_user' || userRole === 'user';

    const normalizedData = {
      ...projectData,
      category: projectData.category || 'FARM',
      projectType: projectData.projectType || 'farm',
      budget: projectData.budget ?? 0
    };

    if (isFarmerRegistration) {
      const farmerPhone = userContext?.metadata?.phoneNumber?.trim();
      if (!farmerPhone) {
        throw new Error('Mobile number is required. Please update your profile before registering a farm.');
      }

      normalizedData.status = 'pending_approval';
      normalizedData.registrationSource = 'farmer_self';
      normalizedData.submittedBy = userId;
      normalizedData.submittedAt = new Date();
      normalizedData.clientId = userId;
      normalizedData.clientName = normalizedData.clientName || userContext.name;
      normalizedData.clientEmail = normalizedData.clientEmail || userContext.email;
      normalizedData.clientPhone = farmerPhone;
    } else {
      const isFarm = normalizedData.category === 'FARM' || normalizedData.projectType === 'farm';
      const phone = String(normalizedData.clientPhone || '').trim();

      if (isFarm && !phone) {
        throw new Error('Client mobile number is required to create a farm project.');
      }

      if (isFarm) {
        // Reuse an existing farmer or auto-provision one — the farm is linked by userId.
        const mappedUser = await this.resolveOrCreateFarmer({
          rawPhone: phone,
          email: normalizedData.clientEmail,
          name: normalizedData.clientName
        });

        normalizedData.clientId = mappedUser._id;
        normalizedData.clientName = mappedUser.name;
        normalizedData.clientEmail = mappedUser.email;
        normalizedData.clientPhone = mappedUser.metadata?.phoneNumber || phone;

        normalizedData.status = 'approved';
        normalizedData.registrationSource = 'manager_direct';
        normalizedData.approvedBy = userId;
        normalizedData.approvedAt = new Date();
      }
      normalizedData.submittedBy = normalizedData.submittedBy || userId;
      normalizedData.submittedAt = normalizedData.submittedAt || new Date();
    }

    const project = new Project({
      ...normalizedData,
      createdBy: userId,
      lastUpdatedBy: userId
    });

    await project.save();

    if (project.status === 'pending_approval') {
      await notificationService.createForUsersWithPermission('farm.projects.approve', {
        type: 'farm_registration',
        title: 'Farm registration pending',
        message: `${project.clientName} submitted ${project.name}. Open request to review details.`,
        project: project._id,
        submittingUser: userId,
        metadata: {
          farmName: project.name,
          submitterName: project.clientName
        }
      });
    }

    logger.info(`Project ${project._id} created by ${userId} with status ${project.status}`);
    return project;
  }

  async approveProject(projectId, approverId) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });

    if (!project) {
      throw new Error('Project not found');
    }
    if (!project.clientPhone || !project.clientPhone.trim()) {
      throw new Error('Project cannot be approved without a linked mobile number.');
    }

    project.status = 'approved';
    project.approvedBy = approverId;
    project.approvedAt = new Date();
    project.rejectedReason = undefined;
    project.lastUpdatedBy = approverId;

    await project.save();
    await notificationService.archiveFarmRegistration(project._id);

    if (project.submittedBy) {
      await notificationService.createForUser(project.submittedBy, {
        type: 'farm_approved',
        title: 'Farm approved',
        message: `${project.name} has been approved.`,
        project: project._id,
        metadata: {
          farmName: project.name
        }
      });
    }

    logger.info(`Project ${project._id} approved by ${approverId}`);
    return project;
  }

  async rejectProject(projectId, rejectedBy, reason = '') {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });

    if (!project) {
      throw new Error('Project not found');
    }

    project.status = 'rejected';
    project.approvedBy = undefined;
    project.approvedAt = undefined;
    project.rejectedReason = reason ? String(reason).trim().slice(0, 500) : '';
    project.lastUpdatedBy = rejectedBy;

    await project.save();
    await notificationService.archiveFarmRegistration(project._id);

    if (project.submittedBy) {
      await notificationService.createForUser(project.submittedBy, {
        type: 'farm_rejected',
        title: 'Farm registration rejected',
        message: project.rejectedReason
          ? `${project.name} was rejected: ${project.rejectedReason}`
          : `${project.name} was rejected.`,
        project: project._id,
        metadata: {
          farmName: project.name,
          rejectionReason: project.rejectedReason
        }
      });
    }

    logger.info(`Project ${project._id} rejected by ${rejectedBy}`);
    return project;
  }

  async startFarmProject(projectId, startedBy) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });

    if (!project) {
      throw new Error('Project not found');
    }

    const isFarm = project.category === 'FARM' || project.projectType === 'farm';
    if (!isFarm) {
      throw new Error('Only farm projects can be started from this workflow.');
    }

    if (project.status !== 'approved') {
      throw new Error('Only approved farm projects can be started.');
    }

    project.status = 'Running';
    project.startDate = project.startDate || new Date();
    project.lastUpdatedBy = startedBy;

    await project.save();

    logger.info(`Farm project ${project._id} started by ${startedBy}`);
    return project;
  }

  async completeFarmProject(projectId, completedBy) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });

    if (!project) {
      throw new Error('Project not found');
    }

    const isFarm = project.category === 'FARM' || project.projectType === 'farm';
    if (!isFarm) {
      throw new Error('Only farm projects can be completed from this workflow.');
    }

    if (project.status !== 'Running') {
      throw new Error('Only running farm projects can be completed.');
    }

    project.status = 'Completed';
    project.completionDate = new Date();
    project.lastUpdatedBy = completedBy;

    await project.save();

    logger.info(`Farm project ${project._id} completed by ${completedBy}`);
    return project;
  }

  async updateFarmProjectStatus(projectId, status, updatedBy) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });

    if (!project) {
      throw new Error('Project not found');
    }

    const isFarm = project.category === 'FARM' || project.projectType === 'farm';
    if (!isFarm) {
      throw new Error('Only farm project status can be managed from this workflow.');
    }

    const allowedStatuses = ['approved', 'Running', 'Completed', 'On Hold', 'Cancelled'];
    if (!allowedStatuses.includes(status)) {
      throw new Error('Invalid project status.');
    }

    if (project.status === 'pending_approval') {
      throw new Error('Pending farm requests must be approved or rejected first.');
    }

    if (project.status === 'rejected') {
      throw new Error('Rejected farm requests must be approved before project state can be changed.');
    }

    project.status = status;
    if (status === 'Running' && !project.startDate) {
      project.startDate = new Date();
    }
    if (status === 'Completed') {
      project.completionDate = new Date();
    }
    if (status !== 'Completed') {
      project.completionDate = undefined;
    }
    project.lastUpdatedBy = updatedBy;

    await project.save();

    logger.info(`Farm project ${project._id} status changed to ${status} by ${updatedBy}`);
    return project;
  }

  async requestProjectEdit(projectId, updates, requester) {
    const project = await Project.findOne({ _id: projectId, isDeleted: false });
    if (!project) {
      throw new Error('Project not found');
    }

    const requesterId = requester?._id || requester;
    const isApprover = requester?.role === 'admin' || requester?.roleRef?.permissions?.some((perm) => perm.name === 'farm.projects.approve');
    const isSubmittedByRequester = project.submittedBy && String(project.submittedBy) === String(requesterId);
    const isLinkedClient = project.clientId && String(project.clientId) === String(requesterId);
    const isOwner = isSubmittedByRequester || isLinkedClient;

    if (!isOwner && !isApprover) {
      throw new Error('You are not allowed to edit this project.');
    }

    const blockedFields = new Set([
      '_id', 'id', 'createdBy', 'createdAt', 'approvedBy', 'approvedAt', 'submittedBy', 'submittedAt', 'isDeleted', 'deletedAt', 'deletedBy'
    ]);

    const cleanedUpdates = { ...updates };
    Object.keys(cleanedUpdates).forEach((key) => {
      if (blockedFields.has(key)) delete cleanedUpdates[key];
    });

    if (!isApprover) {
      const requesterPhone = requester?.metadata?.phoneNumber?.trim();
      if (!requesterPhone) {
        throw new Error('Mobile number is required before submitting edit requests.');
      }
      cleanedUpdates.clientPhone = requesterPhone;
      cleanedUpdates.clientName = requester?.name || project.clientName;
      cleanedUpdates.clientEmail = requester?.email || project.clientEmail;
      cleanedUpdates.clientId = requesterId;
    } else {
      const isFarm = (cleanedUpdates.category || project.category) === 'FARM' ||
        (cleanedUpdates.projectType || project.projectType) === 'farm';
      const phone = String(cleanedUpdates.clientPhone || project.clientPhone || '').trim();

      if (isFarm && !phone) {
        throw new Error('Client mobile number is required to edit a farm project.');
      }

      if (isFarm) {
        const mappedUser = await this.resolveOrCreateFarmer({
          rawPhone: phone,
          email: cleanedUpdates.clientEmail || project.clientEmail,
          name: cleanedUpdates.clientName || project.clientName
        });

        cleanedUpdates.clientId = mappedUser._id;
        cleanedUpdates.clientName = mappedUser.name;
        cleanedUpdates.clientEmail = mappedUser.email;
        cleanedUpdates.clientPhone = mappedUser.metadata?.phoneNumber || phone;
      }
    }

    Object.assign(project, cleanedUpdates);
    project.status = 'pending_approval';
    project.registrationSource = 'farmer_self';
    project.submittedBy = requesterId;
    project.submittedAt = new Date();
    project.rejectedReason = '';
    project.approvedBy = undefined;
    project.approvedAt = undefined;
    project.lastUpdatedBy = requesterId;

    await project.save();

    await notificationService.createForUsersWithPermission('farm.projects.approve', {
      type: 'farm_registration',
      title: 'Farm update request pending',
      message: `${project.clientName} requested updates for ${project.name}. Open request to review.`,
      project: project._id,
      submittingUser: requesterId,
      metadata: {
        farmName: project.name,
        submitterName: project.clientName
      }
    });

    logger.info(`Project ${project._id} edit requested by ${requesterId}`);
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
   * Permanently delete a project (admin only)
   */
  async hardDeleteProject(projectId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    // Delete associated draft if exists
    const Draft = require('../models/Draft');
    await Draft.deleteMany({ projectId });

    // Permanently delete project
    await Project.findByIdAndDelete(projectId);

    return { success: true, message: 'Project permanently deleted' };
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
      { header: 'Category', key: 'category', width: 15 },
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
        category: project.category || (project.projectType ? project.projectType.toUpperCase() : ''),
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
      'Category',
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
      project.category || (project.projectType ? project.projectType.toUpperCase() : ''),
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
      .populate('assignedTo', 'fullName email profilePhoto')
      .populate('projectManager', 'fullName email profilePhoto')
      .populate('fieldWorkers', 'fullName email profilePhoto')
      .populate('consultants', 'fullName email profilePhoto')
      .populate('assignedTeam', 'fullName email profilePhoto')
      .populate('clientId', 'fullName email profilePhoto')
      .populate('createdBy', 'fullName email');

    if (!project) {
      throw new Error('Project not found');
    }

    return project;
  }

  // ========================
  // Draft Management
  // ========================

  /**
   * Save project as draft
   */
  async saveDraft(draftData, wizardStep, userId) {
    const draft = new Project({
      ...draftData,
      isDraft: true,
      wizardStep,
      createdBy: userId,
      lastUpdatedBy: userId
    });

    await draft.save();
    return draft;
  }

  /**
   * Update existing draft
   */
  async updateDraft(draftId, draftData, wizardStep, userId) {
    const mongoose = require('mongoose');

    // Check if draftId is a valid MongoDB ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(draftId) &&
                           /^[0-9a-fA-F]{24}$/.test(draftId);

    // If not a valid ObjectId (client-side generated ID), create a new draft
    if (!isValidObjectId) {
      return this.saveDraft(draftData, wizardStep, userId);
    }

    const draft = await Project.findOne({ _id: draftId, isDraft: true });

    if (!draft) {
      // If draft not found, create a new one instead of throwing error
      return this.saveDraft(draftData, wizardStep, userId);
    }

    Object.assign(draft, draftData);
    draft.wizardStep = wizardStep;
    draft.lastUpdatedBy = userId;

    await draft.save();
    return draft;
  }

  /**
   * Get user's drafts
   */
  async getUserDrafts(userId) {
    const drafts = await Project.find({
      createdBy: userId,
      isDraft: true,
      isDeleted: false
    })
      .select('name projectType wizardStep draftData createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    return drafts;
  }

  /**
   * Get specific draft by ID
   */
  async getDraftById(draftId, userId) {
    const draft = await Project.findOne({
      _id: draftId,
      createdBy: userId,
      isDraft: true,
      isDeleted: false
    }).lean();

    return draft;
  }

  /**
   * Convert draft to final project
   */
  async completeDraft(draftId, projectData, userId) {
    const draft = await Project.findOne({ _id: draftId, isDraft: true });

    if (!draft) {
      throw new Error('Draft not found');
    }

    // Update draft with final project data
    Object.assign(draft, projectData);

    // Mark as non-draft
    draft.isDraft = false;
    draft.wizardStep = 6; // Completed
    draft.draftData = undefined; // Clear draft data
    draft.lastUpdatedBy = userId;

    await draft.save();

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      draft._id,
      userId,
      'created',
      `Project "${draft.name}" was created`
    );

    return draft;
  }

  // ========================
  // Contact Management
  // ========================

  /**
   * Add contact to project
   */
  async addContact(projectId, contactData, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    project.contacts.push(contactData);
    project.lastUpdatedBy = userId;
    await project.save();

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      projectId,
      userId,
      'contact_added',
      `Added contact: ${contactData.fullName}`,
      { contactData }
    );

    return project;
  }

  /**
   * Update contact in project
   */
  async updateContact(projectId, contactId, contactData, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    const contact = project.contacts.id(contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }

    Object.assign(contact, contactData);
    project.lastUpdatedBy = userId;
    await project.save();

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      projectId,
      userId,
      'contact_updated',
      `Updated contact: ${contact.fullName}`,
      { contactData }
    );

    return project;
  }

  /**
   * Remove contact from project
   */
  async removeContact(projectId, contactId, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    const contact = project.contacts.id(contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }

    const contactName = contact.fullName;
    contact.remove();
    project.lastUpdatedBy = userId;
    await project.save();

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      projectId,
      userId,
      'contact_removed',
      `Removed contact: ${contactName}`
    );

    return project;
  }

  // ========================
  // Timeline & Milestones
  // ========================

  /**
   * Add milestone to project
   */
  async addMilestone(projectId, milestoneData, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    project.milestones.push(milestoneData);
    project.lastUpdatedBy = userId;
    await project.save();

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      projectId,
      userId,
      'milestone_added',
      `Added milestone: ${milestoneData.name}`,
      { milestoneData }
    );

    return project;
  }

  /**
   * Get project timeline
   */
  async getProjectTimeline(projectId) {
    const project = await Project.findById(projectId)
      .select('name startDate expectedCompletionDate completionDate milestones createdAt status')
      .lean();

    if (!project) {
      throw new Error('Project not found');
    }

    // Calculate progress
    const today = new Date();
    const start = project.startDate || project.createdAt;
    const end = project.completionDate || project.expectedCompletionDate || today;

    const totalDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.max(0, (today - start) / (1000 * 60 * 60 * 24));
    const progressPercentage = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

    return {
      project: {
        name: project.name,
        startDate: start,
        expectedEndDate: end,
        actualEndDate: project.completionDate,
        status: project.status
      },
      milestones: project.milestones || [],
      progress: {
        percentage: progressPercentage,
        totalDays: Math.round(totalDays),
        elapsedDays: Math.round(elapsedDays),
        remainingDays: Math.max(0, Math.round(totalDays - elapsedDays))
      }
    };
  }

  // ========================
  // Transaction Management
  // ========================

  /**
   * Get project transactions with pagination and summary
   */
  async getProjectTransactions(projectId, page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc') {
    const project = await Project.findById(projectId)
      .select('expenseEntries budget expenses')
      .lean();

    if (!project) {
      throw new Error('Project not found');
    }

    // Use model method for pagination
    const projectDoc = await Project.findById(projectId);
    const result = projectDoc.getTransactionsPaginated(page, limit, sortBy, sortOrder);

    // Calculate summary
    const totalCredits = project.expenseEntries
      .filter(entry => entry.type === 'credit')
      .reduce((sum, entry) => sum + entry.amount, 0);

    const totalDebits = project.expenseEntries
      .filter(entry => entry.type === 'debit')
      .reduce((sum, entry) => sum + entry.amount, 0);

    const netExpense = totalDebits - totalCredits;
    const budgetRemaining = project.budget - netExpense;
    const budgetUtilization = project.budget > 0 ? Math.round((netExpense / project.budget) * 100) : 0;

    return {
      transactions: result.transactions,
      pagination: result.pagination,
      summary: {
        totalCredits,
        totalDebits,
        netExpense,
        budget: project.budget,
        budgetRemaining,
        budgetUtilization,
        transactionCount: project.expenseEntries.length
      }
    };
  }

  /**
   * Add transaction to project
   */
  async addTransaction(projectId, transactionData, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    // Add transaction using model method
    await project.addTransaction(transactionData, userId);

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      projectId,
      userId,
      'transaction_added',
      `Added ${transactionData.type} transaction: ₹${transactionData.amount}`,
      { transactionData }
    );

    // Get the newly added transaction (last one in array)
    const transaction = project.expenseEntries[project.expenseEntries.length - 1];

    return {
      project,
      transaction
    };
  }

  /**
   * Update transaction in project
   */
  async updateTransaction(projectId, transactionId, updateData, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    // Update transaction using model method
    await project.updateTransaction(transactionId, updateData, userId);

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      projectId,
      userId,
      'transaction_updated',
      `Updated transaction: ${transactionId}`,
      { transactionId, updateData }
    );

    // Get the updated transaction
    const transaction = project.expenseEntries.id(transactionId);

    return {
      project,
      transaction
    };
  }

  /**
   * Remove transaction from project
   */
  async removeTransaction(projectId, transactionId, userId) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    // Get transaction details before removing (for logging)
    const transaction = project.expenseEntries.id(transactionId);
    const transactionDetails = transaction ? {
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type
    } : null;

    // Remove transaction using model method
    await project.removeTransaction(transactionId);

    // Log activity
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.logActivity(
      projectId,
      userId,
      'transaction_removed',
      `Removed transaction: ${transactionDetails?.description || transactionId}`,
      { transactionId, transactionDetails }
    );

    return {
      project
    };
  }

  // ========================
  // Activity Log
  // ========================

  /**
   * Get project activity log
   */
  async getProjectActivity(projectId, page = 1, limit = 50, actionType = null) {
    const ActivityLog = require('../models/ActivityLog');

    const [activities, total] = await Promise.all([
      ActivityLog.getProjectActivity(projectId, { page, limit, actionType }),
      ActivityLog.getProjectActivityCount(projectId, actionType)
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      activities,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      }
    };
  }
}

module.exports = new ProjectService();

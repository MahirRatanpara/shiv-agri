const Project = require('../models/landscaping.model');

class LandscapingDAO {
  /**
   * Create a new project
   * @param {Object} projectData - Project data
   * @returns {Promise<Object>} Created project
   */
  async createProject(projectData) {
    try {
      const project = new Project(projectData);
      return await project.save();
    } catch (error) {
      throw new Error(`Error creating project: ${error.message}`);
    }
  }

  /**
   * Get all projects with filters and pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Pagination and sorting options
   * @returns {Promise<Object>} Projects and pagination info
   */
  async getProjects(filters = {}, options = {}) {
    try {
      const {
        status,
        searchTerm,
        city,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 10
      } = options;

      // Build query
      const query = { ...filters };

      if (status) {
        query.status = status;
      }

      if (city) {
        query['location.city'] = city;
      }

      if (startDate || endDate) {
        query.startDate = {};
        if (startDate) query.startDate.$gte = new Date(startDate);
        if (endDate) query.startDate.$lte = new Date(endDate);
      }

      // Handle text search
      if (searchTerm) {
        query.$or = [
          { projectName: { $regex: searchTerm, $options: 'i' } },
          { farmName: { $regex: searchTerm, $options: 'i' } },
          { 'location.city': { $regex: searchTerm, $options: 'i' } },
          { 'location.address': { $regex: searchTerm, $options: 'i' } },
          { 'contacts.name': { $regex: searchTerm, $options: 'i' } }
        ];
      }

      // Pagination
      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      // Execute query
      const [projects, total] = await Promise.all([
        Project.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Project.countDocuments(query)
      ]);

      return {
        projects,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new Error(`Error fetching projects: ${error.message}`);
    }
  }

  /**
   * Get a single project by ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Project details
   */
  async getProjectById(projectId) {
    try {
      const project = await Project.findById(projectId).lean();
      if (!project) {
        throw new Error('Project not found');
      }
      return project;
    } catch (error) {
      throw new Error(`Error fetching project: ${error.message}`);
    }
  }

  /**
   * Update a project
   * @param {string} projectId - Project ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated project
   */
  async updateProject(projectId, updateData) {
    try {
      const project = await Project.findByIdAndUpdate(
        projectId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).lean();

      if (!project) {
        throw new Error('Project not found');
      }

      return project;
    } catch (error) {
      throw new Error(`Error updating project: ${error.message}`);
    }
  }

  /**
   * Delete a project
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteProject(projectId) {
    try {
      const result = await Project.findByIdAndDelete(projectId);
      if (!result) {
        throw new Error('Project not found');
      }
      return { success: true, message: 'Project deleted successfully' };
    } catch (error) {
      throw new Error(`Error deleting project: ${error.message}`);
    }
  }

  /**
   * Add a file to a project
   * @param {string} projectId - Project ID
   * @param {Object} fileData - File data
   * @returns {Promise<Object>} Updated project
   */
  async addFile(projectId, fileData) {
    try {
      const project = await Project.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      project.files.push(fileData);
      await project.save();

      return project.lean();
    } catch (error) {
      throw new Error(`Error adding file: ${error.message}`);
    }
  }

  /**
   * Remove a file from a project
   * @param {string} projectId - Project ID
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} Updated project
   */
  async removeFile(projectId, fileId) {
    try {
      const project = await Project.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      project.files = project.files.filter(file => file._id.toString() !== fileId);
      await project.save();

      return project.lean();
    } catch (error) {
      throw new Error(`Error removing file: ${error.message}`);
    }
  }

  /**
   * Get unique cities from all projects
   * @returns {Promise<Array>} Array of unique cities
   */
  async getCities() {
    try {
      const cities = await Project.distinct('location.city');
      return cities.filter(city => city && city.trim() !== '').sort();
    } catch (error) {
      throw new Error(`Error fetching cities: ${error.message}`);
    }
  }

  /**
   * Get project statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getProjectStats() {
    try {
      const [total, completed, running, upcoming] = await Promise.all([
        Project.countDocuments(),
        Project.countDocuments({ status: 'COMPLETED' }),
        Project.countDocuments({ status: 'RUNNING' }),
        Project.countDocuments({ status: 'UPCOMING' })
      ]);

      return {
        total,
        completed,
        running,
        upcoming
      };
    } catch (error) {
      throw new Error(`Error fetching statistics: ${error.message}`);
    }
  }

  /**
   * Get projects by status
   * @param {string} status - Project status
   * @returns {Promise<Array>} Array of projects
   */
  async getProjectsByStatus(status) {
    try {
      return await Project.find({ status }).sort({ createdAt: -1 }).lean();
    } catch (error) {
      throw new Error(`Error fetching projects by status: ${error.message}`);
    }
  }

  /**
   * Get projects by city
   * @param {string} city - City name
   * @returns {Promise<Array>} Array of projects
   */
  async getProjectsByCity(city) {
    try {
      return await Project.find({ 'location.city': city }).sort({ createdAt: -1 }).lean();
    } catch (error) {
      throw new Error(`Error fetching projects by city: ${error.message}`);
    }
  }

  /**
   * Search projects by text
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Array of projects
   */
  async searchProjects(searchTerm) {
    try {
      return await Project.find({
        $text: { $search: searchTerm }
      })
        .sort({ score: { $meta: 'textScore' } })
        .lean();
    } catch (error) {
      throw new Error(`Error searching projects: ${error.message}`);
    }
  }

  /**
   * Get files by project ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Array>} Array of files
   */
  async getFilesByProjectId(projectId) {
    try {
      const project = await Project.findById(projectId).select('files').lean();
      if (!project) {
        throw new Error('Project not found');
      }
      return project.files || [];
    } catch (error) {
      throw new Error(`Error fetching files: ${error.message}`);
    }
  }

  /**
   * Get projects with pagination and advanced filters
   * @param {Object} filters - Advanced filter criteria
   * @returns {Promise<Object>} Filtered projects with pagination
   */
  async getAdvancedFilteredProjects(filters) {
    try {
      const {
        minCost,
        maxCost,
        minLandSize,
        maxLandSize,
        landUnit,
        soilType,
        irrigationType,
        ...otherFilters
      } = filters;

      const query = {};

      if (minCost || maxCost) {
        query.estimatedCost = {};
        if (minCost) query.estimatedCost.$gte = minCost;
        if (maxCost) query.estimatedCost.$lte = maxCost;
      }

      if (minLandSize || maxLandSize) {
        query['landInfo.size'] = {};
        if (minLandSize) query['landInfo.size'].$gte = minLandSize;
        if (maxLandSize) query['landInfo.size'].$lte = maxLandSize;
      }

      if (landUnit) {
        query['landInfo.unit'] = landUnit;
      }

      if (soilType) {
        query['landInfo.soilType'] = { $regex: soilType, $options: 'i' };
      }

      if (irrigationType) {
        query['landInfo.irrigationType'] = { $regex: irrigationType, $options: 'i' };
      }

      return await this.getProjects(query, otherFilters);
    } catch (error) {
      throw new Error(`Error with advanced filtering: ${error.message}`);
    }
  }
}

module.exports = new LandscapingDAO();

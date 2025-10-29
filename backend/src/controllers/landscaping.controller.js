const landscapingDAO = require('../dao/landscaping.dao');

class LandscapingController {
  /**
   * Get all projects with filters and pagination
   * GET /api/landscaping/projects
   */
  async getProjects(req, res) {
    try {
      const options = {
        status: req.query.status,
        searchTerm: req.query.searchTerm,
        city: req.query.city,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc',
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10
      };

      const result = await landscapingDAO.getProjects({}, options);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in getProjects:', error);
      res.status(500).json({
        error: 'Failed to fetch projects',
        message: error.message
      });
    }
  }

  /**
   * Get a single project by ID
   * GET /api/landscaping/project/:id
   */
  async getProjectById(req, res) {
    try {
      const { id } = req.params;
      const project = await landscapingDAO.getProjectById(id);
      res.status(200).json(project);
    } catch (error) {
      console.error('Error in getProjectById:', error);
      res.status(404).json({
        error: 'Project not found',
        message: error.message
      });
    }
  }

  /**
   * Create a new project
   * POST /api/landscaping/projects
   */
  async createProject(req, res) {
    try {
      const projectData = req.body;

      // Add createdBy if user is authenticated (future implementation)
      // projectData.createdBy = req.user?._id;

      const project = await landscapingDAO.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      console.error('Error in createProject:', error);
      res.status(400).json({
        error: 'Failed to create project',
        message: error.message
      });
    }
  }

  /**
   * Update a project
   * PUT /api/landscaping/project/:id
   */
  async updateProject(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const project = await landscapingDAO.updateProject(id, updateData);
      res.status(200).json(project);
    } catch (error) {
      console.error('Error in updateProject:', error);
      res.status(400).json({
        error: 'Failed to update project',
        message: error.message
      });
    }
  }

  /**
   * Delete a project
   * DELETE /api/landscaping/project/:id
   */
  async deleteProject(req, res) {
    try {
      const { id } = req.params;
      const result = await landscapingDAO.deleteProject(id);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in deleteProject:', error);
      res.status(400).json({
        error: 'Failed to delete project',
        message: error.message
      });
    }
  }

  /**
   * Add a file to a project
   * POST /api/landscaping/project/:id/file
   */
  async addFile(req, res) {
    try {
      const { id } = req.params;
      const fileData = req.body;

      const project = await landscapingDAO.addFile(id, fileData);
      res.status(200).json(project);
    } catch (error) {
      console.error('Error in addFile:', error);
      res.status(400).json({
        error: 'Failed to add file',
        message: error.message
      });
    }
  }

  /**
   * Remove a file from a project
   * DELETE /api/landscaping/project/:id/file/:fileId
   */
  async removeFile(req, res) {
    try {
      const { id, fileId } = req.params;
      const project = await landscapingDAO.removeFile(id, fileId);
      res.status(200).json({
        message: 'File removed successfully',
        project
      });
    } catch (error) {
      console.error('Error in removeFile:', error);
      res.status(400).json({
        error: 'Failed to remove file',
        message: error.message
      });
    }
  }

  /**
   * Get unique cities
   * GET /api/landscaping/cities
   */
  async getCities(req, res) {
    try {
      const cities = await landscapingDAO.getCities();
      res.status(200).json(cities);
    } catch (error) {
      console.error('Error in getCities:', error);
      res.status(500).json({
        error: 'Failed to fetch cities',
        message: error.message
      });
    }
  }

  /**
   * Get project statistics
   * GET /api/landscaping/stats
   */
  async getProjectStats(req, res) {
    try {
      const stats = await landscapingDAO.getProjectStats();
      res.status(200).json(stats);
    } catch (error) {
      console.error('Error in getProjectStats:', error);
      res.status(500).json({
        error: 'Failed to fetch statistics',
        message: error.message
      });
    }
  }

  /**
   * Get projects by status
   * GET /api/landscaping/projects/status/:status
   */
  async getProjectsByStatus(req, res) {
    try {
      const { status } = req.params;
      const projects = await landscapingDAO.getProjectsByStatus(status);
      res.status(200).json(projects);
    } catch (error) {
      console.error('Error in getProjectsByStatus:', error);
      res.status(500).json({
        error: 'Failed to fetch projects by status',
        message: error.message
      });
    }
  }

  /**
   * Get projects by city
   * GET /api/landscaping/projects/city/:city
   */
  async getProjectsByCity(req, res) {
    try {
      const { city } = req.params;
      const projects = await landscapingDAO.getProjectsByCity(city);
      res.status(200).json(projects);
    } catch (error) {
      console.error('Error in getProjectsByCity:', error);
      res.status(500).json({
        error: 'Failed to fetch projects by city',
        message: error.message
      });
    }
  }

  /**
   * Search projects
   * GET /api/landscaping/search
   */
  async searchProjects(req, res) {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({
          error: 'Search term is required',
          message: 'Please provide a search term using the "q" query parameter'
        });
      }

      const projects = await landscapingDAO.searchProjects(q);
      res.status(200).json(projects);
    } catch (error) {
      console.error('Error in searchProjects:', error);
      res.status(500).json({
        error: 'Failed to search projects',
        message: error.message
      });
    }
  }

  /**
   * Send documents via Email/WhatsApp
   * POST /api/landscaping/send-documents
   */
  async sendDocuments(req, res) {
    try {
      const { projectId, fileIds, recipients, channel, message, subject } = req.body;

      // Validate request
      if (!projectId || !fileIds || !recipients || !channel) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'projectId, fileIds, recipients, and channel are required'
        });
      }

      // TODO: Implement email and WhatsApp sending logic
      // This will be implemented in the next steps

      res.status(200).json({
        message: 'Documents will be sent (implementation pending)',
        details: {
          projectId,
          fileIds,
          recipients,
          channel,
          message,
          subject
        }
      });
    } catch (error) {
      console.error('Error in sendDocuments:', error);
      res.status(500).json({
        error: 'Failed to send documents',
        message: error.message
      });
    }
  }

  /**
   * Get files by project ID
   * GET /api/landscaping/project/:id/files
   */
  async getFilesByProjectId(req, res) {
    try {
      const { id } = req.params;
      const files = await landscapingDAO.getFilesByProjectId(id);
      res.status(200).json(files);
    } catch (error) {
      console.error('Error in getFilesByProjectId:', error);
      res.status(404).json({
        error: 'Failed to fetch files',
        message: error.message
      });
    }
  }

  /**
   * Advanced filtering for projects
   * POST /api/landscaping/projects/filter
   */
  async getAdvancedFilteredProjects(req, res) {
    try {
      const filters = req.body;
      const result = await landscapingDAO.getAdvancedFilteredProjects(filters);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in getAdvancedFilteredProjects:', error);
      res.status(500).json({
        error: 'Failed to fetch filtered projects',
        message: error.message
      });
    }
  }
}

module.exports = new LandscapingController();

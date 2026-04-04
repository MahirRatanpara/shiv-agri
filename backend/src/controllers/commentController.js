const commentService = require('../services/commentService');
const logger = require('../utils/logger');

// ─── Get Comments ───

exports.getComments = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await commentService.getCommentsByProject(req.params.projectId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });
    res.json({ success: true, data: result.comments, pagination: result.pagination });
  } catch (error) {
    logger.error(`[CommentController] getComments error:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch comments', message: error.message });
  }
};

// ─── Create Comment ───

exports.createComment = async (req, res) => {
  try {
    const comment = await commentService.createComment(req.body, req.user.id);
    logger.info(`[CommentController] createComment: ${comment._id}`);
    res.status(201).json({ success: true, data: comment, message: 'Comment created successfully' });
  } catch (error) {
    logger.error('[CommentController] createComment error:', error);
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map(e => ({ field: e.path, message: e.message }));
      return res.status(400).json({ success: false, error: 'Validation failed', details });
    }
    res.status(500).json({ success: false, error: 'Failed to create comment', message: error.message });
  }
};

// ─── Update Comment ───

exports.updateComment = async (req, res) => {
  try {
    const comment = await commentService.updateComment(req.params.id, req.body.content, req.user.id);
    logger.info(`[CommentController] updateComment: ${req.params.id}`);
    res.json({ success: true, data: comment, message: 'Comment updated successfully' });
  } catch (error) {
    logger.error(`[CommentController] updateComment ${req.params.id} error:`, error);
    const status = error.message === 'Comment not found' ? 404
      : error.message.includes('Not authorized') ? 403 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Delete Comment ───

exports.deleteComment = async (req, res) => {
  try {
    await commentService.deleteComment(req.params.id, req.user.id);
    logger.info(`[CommentController] deleteComment: ${req.params.id}`);
    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    logger.error(`[CommentController] deleteComment ${req.params.id} error:`, error);
    const status = error.message === 'Comment not found' ? 404
      : error.message.includes('Not authorized') ? 403 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Add Reaction ───

exports.addReaction = async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) {
      return res.status(400).json({ success: false, error: 'emoji is required' });
    }
    const comment = await commentService.addReaction(req.params.id, req.user.id, emoji);
    res.json({ success: true, data: comment, message: 'Reaction toggled' });
  } catch (error) {
    logger.error(`[CommentController] addReaction ${req.params.id} error:`, error);
    const status = error.message === 'Comment not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ─── Get Replies ───

exports.getReplies = async (req, res) => {
  try {
    const replies = await commentService.getThreadReplies(req.params.id);
    res.json({ success: true, data: replies });
  } catch (error) {
    logger.error(`[CommentController] getReplies ${req.params.id} error:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch replies', message: error.message });
  }
};

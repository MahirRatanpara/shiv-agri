const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

// ─── Get Comments by Project ───

async function getCommentsByProject(projectId, { page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  // Get top-level comments (no parentId)
  const query = { projectId, parentId: null, isDeleted: { $ne: true } };

  const [comments, total] = await Promise.all([
    Comment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Comment.countDocuments(query)
  ]);

  // Populate replies for each comment
  const commentIds = comments.map(c => c._id);
  const replies = await Comment.find({
    parentId: { $in: commentIds },
    isDeleted: { $ne: true }
  })
    .sort({ createdAt: 1 })
    .lean();

  // Attach replies to their parent comments
  const repliesMap = {};
  replies.forEach(reply => {
    const parentKey = reply.parentId.toString();
    if (!repliesMap[parentKey]) repliesMap[parentKey] = [];
    repliesMap[parentKey].push(reply);
  });

  const commentsWithReplies = comments.map(comment => ({
    ...comment,
    replies: repliesMap[comment._id.toString()] || []
  }));

  return {
    comments: commentsWithReplies,
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

// ─── Create Comment ───

async function createComment(data, userId) {
  const comment = await Comment.create({
    ...data,
    userId
  });

  // Log activity
  try {
    await ActivityLog.logActivity(
      comment.projectId,
      userId,
      'comment_posted',
      `Posted a comment`,
      { commentId: comment._id }
    );
  } catch (err) {
    logger.error('[CommentService] Activity log error:', err);
  }

  // Create notifications for mentions
  if (data.mentions && data.mentions.length > 0) {
    try {
      const notifications = data.mentions.map(mention => ({
        userId: mention.userId,
        type: 'mention',
        title: 'You were mentioned in a comment',
        message: comment.content.substring(0, 200),
        projectId: comment.projectId,
        referenceId: comment._id.toString(),
        referenceType: 'Comment',
        createdBy: userId
      }));
      await Notification.insertMany(notifications);
    } catch (err) {
      logger.error('[CommentService] Notification creation error:', err);
    }
  }

  return comment.toObject();
}

// ─── Update Comment ───

async function updateComment(id, content, userId) {
  const comment = await Comment.findById(id);
  if (!comment) throw new Error('Comment not found');
  if (comment.userId.toString() !== userId.toString()) {
    throw new Error('Not authorized to update this comment');
  }

  comment.content = content;
  comment.isEdited = true;
  comment.editedAt = new Date();
  await comment.save();

  logger.info(`[CommentService] Comment ${id} updated by user ${userId}`);
  return comment.toObject();
}

// ─── Delete Comment (Soft) ───

async function deleteComment(id, userId) {
  const comment = await Comment.findById(id);
  if (!comment) throw new Error('Comment not found');
  if (comment.userId.toString() !== userId.toString()) {
    throw new Error('Not authorized to delete this comment');
  }

  comment.isDeleted = true;
  comment.deletedAt = new Date();
  await comment.save();

  logger.info(`[CommentService] Comment ${id} soft-deleted by user ${userId}`);
  return comment.toObject();
}

// ─── Add / Toggle Reaction ───

async function addReaction(commentId, userId, emoji) {
  const comment = await Comment.findById(commentId);
  if (!comment) throw new Error('Comment not found');

  const existingIndex = comment.reactions.findIndex(
    r => r.userId.toString() === userId.toString() && r.emoji === emoji
  );

  if (existingIndex >= 0) {
    // Toggle off — remove existing reaction
    comment.reactions.splice(existingIndex, 1);
  } else {
    // Add reaction
    comment.reactions.push({ userId, emoji });
  }

  await comment.save();

  // Log activity
  try {
    await ActivityLog.logActivity(
      comment.projectId,
      userId,
      'reaction_added',
      `Reacted with ${emoji}`,
      { commentId: comment._id, emoji }
    );
  } catch (err) {
    logger.error('[CommentService] Activity log error:', err);
  }

  return comment.toObject();
}

// ─── Get Thread Replies ───

async function getThreadReplies(commentId) {
  const replies = await Comment.find({
    parentId: commentId,
    isDeleted: { $ne: true }
  })
    .sort({ createdAt: 1 })
    .lean();

  return replies;
}

module.exports = {
  getCommentsByProject,
  createComment,
  updateComment,
  deleteComment,
  addReaction,
  getThreadReplies
};

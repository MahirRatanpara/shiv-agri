const Project = require('../models/Project');
const logger = require('../utils/logger');

/**
 * Propagate an identity change to every project that denormalizes the
 * user's name / email / phone (clientName, clientEmail, clientPhone).
 *
 * Why this exists: those fields are stored on each Project document for
 * read performance (denormalization — list/search endpoints don't need to
 * populate User). Without propagation, an admin edit of the user — or a
 * form back-fill from the project edit screen — only updates the User
 * document and the farms keep showing the stale snapshot.
 *
 * Only the fields that are actually present in `changes` get pushed.
 * Empty strings clear the denormalized value. Best-effort: returns 0 on
 * any error rather than throwing, so the caller's primary write is never
 * blocked by a follow-up sync failure.
 *
 * @param {string|ObjectId} userId — the User whose identity changed
 * @param {Object} changes — partial { name, email, phone } (only changed)
 * @returns {Promise<number>} count of project documents touched
 */
async function propagateIdentityToProjects(userId, changes) {
  const setFields = {};
  if (changes.name !== undefined) setFields.clientName = changes.name;
  if (changes.email !== undefined) setFields.clientEmail = changes.email;
  if (changes.phone !== undefined) setFields.clientPhone = changes.phone;

  if (Object.keys(setFields).length === 0) return 0;

  // Match by linked farmer identity — clientId is the contractually correct
  // anchor. We also OR in submittedBy/createdBy so older farms that haven't
  // been re-saved (and so might be missing clientId) still get touched.
  const filter = {
    isDeleted: false,
    $or: [
      { clientId: userId },
      { submittedBy: userId },
      { createdBy: userId }
    ]
  };

  try {
    const result = await Project.updateMany(filter, { $set: setFields });
    const count = result?.modifiedCount || result?.nModified || 0;
    if (count > 0) {
      logger.info(
        `[IdentityPropagation] Synced ${Object.keys(changes).join(',')} to ${count} project(s) for user ${userId}`
      );
    }
    return count;
  } catch (err) {
    logger.error(`[IdentityPropagation] Failed for user ${userId}: ${err.message}`);
    return 0;
  }
}

module.exports = { propagateIdentityToProjects };

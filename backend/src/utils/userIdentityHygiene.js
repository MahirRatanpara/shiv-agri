/**
 * Idempotent startup hygiene for the User identity uniqueness indexes.
 *
 * Why this exists: the User collection's email, googleId and
 * metadata.phoneNumberNormalized fields are conceptually optional but
 * uniqueness must hold for non-empty values. The original schema used
 * Mongoose's `sparse: true`, which only excludes documents where the field
 * is *missing*. Any record with the field literally set to `null` or `""`
 * still goes into the index and would collide with the next blank-valued
 * insert — exactly the bug a manager hit when creating a second farmer with
 * no email on file.
 *
 * The fix has two parts:
 *
 *   1. Schema-side: the index definitions on the model are now
 *      partialFilterExpression-based so they only cover non-empty strings.
 *   2. Data + index-side (this file): unset any existing empty/null values
 *      on the affected fields so the new index can build, and drop the
 *      legacy `sparse` indexes if they still exist. Safe to run every boot.
 *
 * This is best-effort. Failures are logged but never throw — a hygiene
 * issue must not take the server down.
 */
const mongoose = require('mongoose');
const logger = require('./logger');

const TARGET_FIELDS = [
  { fieldPath: 'email', indexName: 'email_1' },
  { fieldPath: 'googleId', indexName: 'googleId_1' },
  { fieldPath: 'metadata.phoneNumberNormalized', indexName: 'metadata.phoneNumberNormalized_1' }
];

async function normalizeEmptyIdentityFields(collection) {
  for (const { fieldPath } of TARGET_FIELDS) {
    try {
      const result = await collection.updateMany(
        { $or: [{ [fieldPath]: null }, { [fieldPath]: '' }] },
        { $unset: { [fieldPath]: '' } }
      );
      const modified = result?.modifiedCount || result?.nModified || 0;
      if (modified > 0) {
        logger.info(`[UserHygiene] Unset blank ${fieldPath} on ${modified} user document(s)`);
      }
    } catch (err) {
      logger.warn(`[UserHygiene] Failed to normalise ${fieldPath}: ${err.message}`);
    }
  }
}

async function dropLegacySparseIndexes(collection) {
  let existing = [];
  try {
    existing = await collection.indexes();
  } catch (err) {
    logger.warn(`[UserHygiene] Could not list indexes: ${err.message}`);
    return;
  }

  for (const idx of existing) {
    const keys = Object.keys(idx.key || {});
    if (keys.length !== 1) continue;
    const field = keys[0];

    // Only consider indexes we own
    if (!TARGET_FIELDS.some((t) => t.fieldPath === field)) continue;
    if (!idx.unique) continue;

    // Already partial with a filter targeting non-empty strings — leave alone.
    if (idx.partialFilterExpression) continue;

    try {
      await collection.dropIndex(idx.name);
      logger.info(`[UserHygiene] Dropped legacy sparse-unique index "${idx.name}" on ${field}`);
    } catch (err) {
      logger.warn(`[UserHygiene] Could not drop legacy index ${idx.name}: ${err.message}`);
    }
  }
}

/**
 * Run the hygiene pass. Designed to be called once at server startup AFTER
 * mongoose.connect() resolves and BEFORE the User model auto-builds its
 * new indexes (Mongoose builds indexes asynchronously on first model use,
 * which is fine — our dropLegacy step runs first either way).
 */
async function runUserIdentityHygiene() {
  if (mongoose.connection.readyState !== 1) {
    logger.debug('[UserHygiene] Mongo not connected yet — skipping');
    return;
  }
  const collection = mongoose.connection.db.collection('users');

  await normalizeEmptyIdentityFields(collection);
  await dropLegacySparseIndexes(collection);

  // Force the User model to rebuild its indexes against the cleaned data.
  // syncIndexes() drops indexes not in the schema and creates missing ones.
  try {
    const User = mongoose.models.User || mongoose.model('User');
    await User.syncIndexes();
    logger.info('[UserHygiene] User indexes synced');
  } catch (err) {
    logger.warn(`[UserHygiene] syncIndexes failed: ${err.message}`);
  }
}

module.exports = { runUserIdentityHygiene };

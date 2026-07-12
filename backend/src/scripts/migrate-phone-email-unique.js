#!/usr/bin/env node

/**
 * One-time migration to enforce the 1-1 email/phone identity model.
 *
 * What it does (idempotent — safe to re-run):
 *   1. Unsets empty-string `metadata.phoneNumberNormalized` / `phoneNumber` so the new
 *      sparse unique index doesn't treat "" as a colliding value across many users.
 *   2. Rebuilds the `email` index as { unique: true, sparse: true } (the live index was
 *      created non-sparse, which rejects phone-only signups that have no email).
 *   3. Creates a { unique: true, sparse: true } index on `metadata.phoneNumberNormalized`.
 *
 * Before step 2/3 it reports any DUPLICATE emails or phones — those must be resolved by
 * hand first (the unique index build will otherwise fail).
 *
 * Usage:
 *   node src/scripts/migrate-phone-email-unique.js [--dry-run]
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shiv-agri';

const log = (...args) => console.log('[migrate-phone-email]', ...args);

async function findDuplicates(coll, field) {
  const pipeline = [
    { $match: { [field]: { $exists: true, $nin: [null, ''] } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ];
  return coll.aggregate(pipeline).toArray();
}

async function ensureIndex(coll, key, name) {
  const existing = await coll.indexes();
  const match = existing.find((idx) => idx.name === name);
  if (match) {
    const isUnique = !!match.unique;
    const isSparse = !!match.sparse;
    if (isUnique && isSparse) {
      log(`Index ${name} already unique+sparse — skipping.`);
      return;
    }
    log(`Dropping stale index ${name} (unique=${isUnique}, sparse=${isSparse})...`);
    if (!DRY_RUN) await coll.dropIndex(name);
  }
  log(`Creating index ${name} { ${JSON.stringify(key)} } unique+sparse...`);
  if (!DRY_RUN) await coll.createIndex(key, { unique: true, sparse: true, name });
}

async function main() {
  log(DRY_RUN ? 'DRY RUN — no changes will be written.' : 'Applying migration...');
  await mongoose.connect(MONGODB_URI);
  const coll = mongoose.connection.collection('users');

  // 1. Clean empty-string identity values — each field independently so a valid value
  //    on the same document is never collaterally removed.
  if (!DRY_RUN) {
    const r1 = await coll.updateMany({ 'metadata.phoneNumberNormalized': '' }, { $unset: { 'metadata.phoneNumberNormalized': '' } });
    const r2 = await coll.updateMany({ 'metadata.phoneNumber': '' }, { $unset: { 'metadata.phoneNumber': '' } });
    const r3 = await coll.updateMany({ email: '' }, { $unset: { email: '' } });
    log(`Empty-value cleanup: phoneNormalized=${r1.modifiedCount}, phoneNumber=${r2.modifiedCount}, email=${r3.modifiedCount}.`);
  } else {
    const c1 = await coll.countDocuments({ 'metadata.phoneNumberNormalized': '' });
    const c3 = await coll.countDocuments({ email: '' });
    log(`Empty-value cleanup (dry-run): phoneNormalized=${c1}, email=${c3} would be unset.`);
  }

  // 2. Report duplicates that would block unique index builds.
  const dupEmails = await findDuplicates(coll, 'email');
  const dupPhones = await findDuplicates(coll, 'metadata.phoneNumberNormalized');
  if (dupEmails.length) {
    log(`WARNING: ${dupEmails.length} duplicate email(s) found — resolve before unique index can build:`);
    dupEmails.forEach((d) => log(`  email="${d._id}" -> ${d.ids.join(', ')}`));
  }
  if (dupPhones.length) {
    log(`WARNING: ${dupPhones.length} duplicate phone(s) found — resolve before unique index can build:`);
    dupPhones.forEach((d) => log(`  phone="${d._id}" -> ${d.ids.join(', ')}`));
  }
  if (dupEmails.length || dupPhones.length) {
    log('Aborting index creation due to duplicates. Resolve them and re-run.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // 3. Rebuild indexes.
  await ensureIndex(coll, { email: 1 }, 'email_1');
  await ensureIndex(coll, { 'metadata.phoneNumberNormalized': 1 }, 'metadata.phoneNumberNormalized_1');

  log('Done.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[migrate-phone-email] FAILED:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

const mongoose = require('mongoose');
const Project = require('../models/Project');
const SoilSample = require('../models/SoilSample');
const logger = require('../utils/logger');

const SAMPLE_MODEL_BY_TYPE = {
  soil: 'SoilSample',
  water: 'WaterSample',
  fertilizer: 'FertilizerSample'
};

/**
 * Reduce a raw phone string to the last 10 digits used for matching.
 *
 * India default: a bare 10-digit number is treated as if it had a +91 country
 * code (so "9876543210" and "+91 98765 43210" and "919876543210" all collapse
 * to "9876543210"). Anything 11+ digits long keeps only its trailing 10
 * digits — that strips the country code regardless of which one is present.
 */
const normalizePhone = (raw) => {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return digits; // implicit +91
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

/**
 * Format a phone number for display/storage. A 10-digit input gets the
 * default Indian country code prefixed; longer inputs keep their existing
 * country code (we just guarantee a leading "+").
 */
const formatPhoneForDisplay = (raw) => {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+91 ${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return digits;
};

const normalizeName = (raw) => (raw ? String(raw).trim().toLowerCase() : '');

const escapeRegex = (raw) => String(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find a Project whose name matches the sample's farmsName (case-insensitive,
 * trimmed) AND whose clientPhone matches the sample's mobileNo (last-10 digits).
 * Returns null if either field is missing or no match is found.
 */
async function findMatchingProject(farmsName, mobileNo) {
  const farmKey = normalizeName(farmsName);
  const phoneKey = normalizePhone(mobileNo);
  if (!farmKey || !phoneKey) return null;

  // Case-insensitive exact match on name. Anchored to avoid partial collisions.
  const nameRegex = new RegExp(`^${escapeRegex(farmKey)}$`, 'i');
  const candidates = await Project.find({
    name: { $regex: nameRegex },
    clientPhone: { $exists: true, $ne: null, $ne: '' }
  })
    .select('_id name clientPhone')
    .lean();

  for (const candidate of candidates) {
    if (normalizePhone(candidate.clientPhone) === phoneKey) {
      return candidate;
    }
  }
  return null;
}

/**
 * Build the embedded report subdoc from a sample.
 */
function buildReportEntry({ sampleType, sample, user, mobileNoOverride }) {
  const sampleModel = SAMPLE_MODEL_BY_TYPE[sampleType];
  const farmerName = sample.farmersName || sample.farmerName || '';
  const rawMobile = mobileNoOverride != null ? mobileNoOverride : (sample.mobileNo || '');
  const mobileNo = formatPhoneForDisplay(rawMobile);

  return {
    sampleType,
    sampleId: sample._id,
    sampleModel,
    sessionId: sample.sessionId,
    sampleNumber: sample.sampleNumber || '',
    farmerName,
    farmsName: sample.farmsName || '',
    mobileNo,
    cropName: sample.cropName || '',
    fertilizerType: sampleType === 'fertilizer' ? (sample.type || '') : '',
    sessionDate: sample.sessionDate || '',
    generatedAt: new Date(),
    generatedBy: user?._id,
    generatedByName: user?.name || ''
  };
}

/**
 * Resolve the (farmsName, mobileNo) pair to use for matching.
 * Fertilizer samples don't carry mobileNo themselves — fall back to the
 * linked soil sample.
 */
async function resolveMatchKeys(sampleType, sample) {
  if (sampleType === 'fertilizer') {
    let mobileNo = '';
    let farmsName = sample.farmsName || '';
    if (sample.soilSampleId) {
      const soil = await SoilSample.findById(sample.soilSampleId)
        .select('mobileNo farmsName')
        .lean();
      if (soil) {
        mobileNo = soil.mobileNo || '';
        if (!farmsName) farmsName = soil.farmsName || '';
      }
    }
    return { farmsName, mobileNo };
  }
  return {
    farmsName: sample.farmsName || '',
    mobileNo: sample.mobileNo || ''
  };
}

/**
 * Link a sample to a matching Project (if any) and embed a report entry.
 * Idempotent: re-running for the same sample updates the existing entry's
 * generatedAt/generatedBy rather than creating a duplicate.
 *
 * @param {Object} args
 * @param {'soil'|'water'|'fertilizer'} args.sampleType
 * @param {Object} args.sample - Mongoose doc OR plain object with the fields
 * @param {Object} [args.user] - Authenticated user (req.user)
 * @returns {Promise<{ projectId: string|null, linked: boolean }>}
 */
async function linkSampleToFarm({ sampleType, sample, user }) {
  if (!sample || !sample._id) return { projectId: null, linked: false };
  const sampleModel = SAMPLE_MODEL_BY_TYPE[sampleType];
  if (!sampleModel) return { projectId: null, linked: false };

  try {
    const { farmsName, mobileNo } = await resolveMatchKeys(sampleType, sample);
    const project = await findMatchingProject(farmsName, mobileNo);

    if (!project) {
      logger.debug(
        `[FarmReportLinker] No farm match for ${sampleType} sample ${sample._id} ` +
          `(farmsName="${farmsName}", mobileNo="${mobileNo}")`
      );
      return { projectId: null, linked: false };
    }

    const entry = buildReportEntry({
      sampleType,
      sample,
      user,
      mobileNoOverride: mobileNo
    });

    // Try to update an existing entry for this (sampleType, sampleId) pair first.
    const updateExisting = await Project.updateOne(
      {
        _id: project._id,
        'reports.sampleType': sampleType,
        'reports.sampleId': sample._id
      },
      {
        $set: {
          'reports.$.generatedAt': entry.generatedAt,
          'reports.$.generatedBy': entry.generatedBy,
          'reports.$.generatedByName': entry.generatedByName,
          'reports.$.sampleNumber': entry.sampleNumber,
          'reports.$.farmerName': entry.farmerName,
          'reports.$.cropName': entry.cropName,
          'reports.$.fertilizerType': entry.fertilizerType,
          'reports.$.sessionDate': entry.sessionDate
        }
      }
    );

    if (updateExisting.matchedCount === 0) {
      // No existing entry — push a new one.
      await Project.updateOne(
        { _id: project._id },
        { $push: { reports: entry } }
      );
    }

    // Stamp the sample with the project link so subsequent lookups don't
    // need to re-run the match.
    const SampleModel = mongoose.model(sampleModel);
    await SampleModel.updateOne(
      { _id: sample._id },
      { $set: { linkedProjectId: project._id, linkedAt: new Date() } }
    );

    logger.info(
      `[FarmReportLinker] Linked ${sampleType} sample ${sample._id} ` +
        `to farm ${project._id} (${project.name})`
    );

    return { projectId: project._id.toString(), linked: true };
  } catch (error) {
    // Linking is best-effort — never break the PDF response on a linker error.
    logger.error(
      `[FarmReportLinker] Failed to link ${sampleType} sample ${sample?._id}: ${error.message}`,
      { stack: error.stack }
    );
    return { projectId: null, linked: false };
  }
}

module.exports = {
  linkSampleToFarm,
  findMatchingProject,
  normalizePhone,
  formatPhoneForDisplay,
  normalizeName,
  SAMPLE_MODEL_BY_TYPE
};

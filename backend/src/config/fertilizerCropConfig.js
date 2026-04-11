const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

/**
 * Fertilizer Crop Defaults Config
 *
 * Loaded from `fertilizerCropDefaults.json` once at server startup. The JSON is
 * keyed by cropName and, for each crop, contains one or more variants:
 *   { "<cropName>": { "normal"|"small-fruit"|"large-fruit": { <field>: <value> } } }
 *
 * Lookup is case-insensitive on cropName (trimmed) so minor casing/spacing
 * differences in the Soil sample cropName still resolve to a valid default set.
 */

let rawConfig = {};
// Map of lowercased/trimmed cropName -> original cropName key (for case-insensitive match)
let lowerToKey = new Map();
// Sorted list of available crop names (original casing, for frontend dropdown)
let cropNamesCache = [];

function loadConfig() {
  try {
    const jsonPath = path.join(__dirname, 'fertilizerCropDefaults.json');
    const contents = fs.readFileSync(jsonPath, 'utf8');
    rawConfig = JSON.parse(contents);

    lowerToKey = new Map();
    Object.keys(rawConfig).forEach((key) => {
      lowerToKey.set(key.trim().toLowerCase(), key);
    });

    cropNamesCache = Object.keys(rawConfig).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    const variantCounts = Object.values(rawConfig).reduce((acc, variants) => {
      Object.keys(variants).forEach((v) => {
        acc[v] = (acc[v] || 0) + 1;
      });
      return acc;
    }, {});

    logger.info(
      `Fertilizer crop config loaded: ${cropNamesCache.length} crops ` +
        `(${Object.entries(variantCounts)
          .map(([t, c]) => `${t}:${c}`)
          .join(', ')})`
    );
  } catch (err) {
    logger.error(`Failed to load fertilizer crop config: ${err.message}`);
    rawConfig = {};
    lowerToKey = new Map();
    cropNamesCache = [];
  }
}

function getConfig() {
  return rawConfig;
}

function getCropNames() {
  return cropNamesCache;
}

/**
 * Case-insensitive resolve of cropName -> original key. Returns null if no match.
 */
function resolveCropKey(cropName) {
  if (!cropName || typeof cropName !== 'string') return null;
  const key = lowerToKey.get(cropName.trim().toLowerCase());
  return key || null;
}

/**
 * Get default field values for a given crop name + variant type. Returns an
 * empty object if the crop or variant is not configured.
 *
 * @param {string} cropName - raw cropName (e.g., "cotton", "COTTON", "Cotton ")
 * @param {'normal'|'small-fruit'|'large-fruit'} type
 * @returns {object}
 */
function getDefaultsForCrop(cropName, type) {
  const key = resolveCropKey(cropName);
  if (!key) return {};
  const variants = rawConfig[key] || {};
  const defaults = variants[type];
  if (!defaults || typeof defaults !== 'object') return {};
  // Return a shallow clone so callers can freely mutate
  return { ...defaults };
}

module.exports = {
  loadConfig,
  getConfig,
  getCropNames,
  resolveCropKey,
  getDefaultsForCrop,
};

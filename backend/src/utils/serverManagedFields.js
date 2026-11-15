/**
 * Fields on lab samples that only the server may write.
 *
 * `delivery` (embedded WhatsApp / email status) is maintained by reportDeliveryService and the
 * webhook reconciler. The testing grids PATCH whole rows back on every cell edit, so a row that
 * was loaded before a send completed would otherwise overwrite the live status with a stale copy.
 */
const SERVER_MANAGED_SAMPLE_FIELDS = ['delivery'];

const stripServerManagedFields = (samples) => {
  if (!Array.isArray(samples)) return samples;
  return samples.map((sample) => {
    if (!sample || typeof sample !== 'object') return sample;
    const copy = { ...sample };
    for (const field of SERVER_MANAGED_SAMPLE_FIELDS) delete copy[field];
    return copy;
  });
};

module.exports = { SERVER_MANAGED_SAMPLE_FIELDS, stripServerManagedFields };

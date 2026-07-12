/**
 * Pull a clean plain-text string out of an ExcelJS cell value.
 *
 * ExcelJS returns one of several shapes depending on how the source cell
 * was authored:
 *
 *   - primitive          → "foo" | 42 | true
 *   - Date               → JS Date
 *   - rich text          → { richText: [{ text: 'foo' }, { text: 'bar' }] }
 *   - formula            → { formula: 'A1+B1', result: 5 } (result may itself be rich text)
 *   - hyperlink          → { text: 'foo', hyperlink: 'https://…' }
 *                          OR { text: { richText: [...] }, hyperlink: '…' }
 *   - shared formula     → { sharedFormula: 'A1+B1', result: … }
 *   - error              → { error: '#REF!' }
 *
 * Calling `.toString()` on the object shapes returns the infamous
 * "[object Object]" — which is what shows up in soil/water/fertilizer
 * sample columns when a user pastes formatted text from Word/Excel.
 *
 * This helper unwraps every shape down to a primitive and returns the
 * trimmed string. Returns "" for null / undefined / error cells.
 *
 * @param {import('exceljs').Cell|null|undefined} cell — an ExcelJS Cell
 * @returns {string} plain trimmed text
 */
function extractCellText(cell) {
  if (cell == null) return '';
  const value = cell.value;
  return normalize(value);
}

/**
 * Same as extractCellText but accepts the raw value (useful when iterating
 * row.values or similar arrays that aren't full Cell objects).
 */
function extractValueText(value) {
  return normalize(value);
}

function normalize(value) {
  if (value == null) return '';

  // Primitives
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    // Rich text
    if (Array.isArray(value.richText)) {
      return value.richText
        .map((segment) => (segment && segment.text != null ? String(segment.text) : ''))
        .join('')
        .trim();
    }

    // Formula / shared formula — prefer the computed result, fall back to formula text
    if (value.formula !== undefined || value.sharedFormula !== undefined) {
      if (value.result !== undefined && value.result !== null) {
        return normalize(value.result);
      }
      return '';
    }

    // Hyperlink — the displayed text is what matters
    if (value.hyperlink !== undefined) {
      if (value.text !== undefined) return normalize(value.text);
      return String(value.hyperlink).trim();
    }

    // Error cells — return blank so downstream validation flags the row
    if (value.error !== undefined) return '';
  }

  // Last-resort fallback. We deliberately don't call .toString() here
  // because that's exactly the path that produces "[object Object]".
  try {
    const s = JSON.stringify(value);
    return s === undefined ? '' : s;
  } catch (_) {
    return '';
  }
}

module.exports = { extractCellText, extractValueText };

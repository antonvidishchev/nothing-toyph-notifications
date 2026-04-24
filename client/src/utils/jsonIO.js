/**
 * JSON export/import utilities for Toyph Glyph Generator.
 *
 * Handles serializing the 13×13 LED grid state to a downloadable JSON file
 * and deserializing/validating imported JSON files back into grid state.
 */

import { GRID_SIZE, TOTAL_CELLS, CIRCULAR_MASK, BRIGHTNESS_LEVELS } from './gridConstants.js';

/**
 * Snap a numeric value to the nearest valid brightness level.
 * The value is first clamped to the 0–4095 range, then snapped to
 * whichever of {0, 1024, 2048, 3072, 4095} is closest.
 * At exact midpoints, snaps to the higher level.
 *
 * @param {number} value - Input value (may be outside 0–4095)
 * @returns {number} Nearest valid brightness level
 */
export function snapToNearestLevel(value) {
  // Clamp to 0–4095
  const clamped = Math.max(0, Math.min(4095, value));

  let best = BRIGHTNESS_LEVELS[0];
  let bestDist = Math.abs(clamped - best);

  for (let i = 1; i < BRIGHTNESS_LEVELS.length; i++) {
    const dist = Math.abs(clamped - BRIGHTNESS_LEVELS[i]);
    if (dist < bestDist || (dist === bestDist && BRIGHTNESS_LEVELS[i] > best)) {
      best = BRIGHTNESS_LEVELS[i];
      bestDist = dist;
    }
  }

  return best;
}

/**
 * Build the export data object from the current grid state.
 *
 * The exported object includes metadata (device, gridSize, version) and the
 * 169-element brightness array in row-major order. Inactive positions are
 * forced to 0.
 *
 * Active positions are exported as-is (continuous values 0–4095 are preserved).
 * Values are clamped to [0, 4095] as a safety guard; no quantization to 5 levels.
 *
 * @param {number[]} grid - 169-element brightness grid (internal state)
 * @returns {{ device: string, gridSize: number, version: string, brightness: number[] }}
 */
export function buildExportData(grid) {
  // Enforce inactive positions at 0 and clamp active values to valid range.
  // Continuous values are preserved (no snapping to 5 levels).
  const brightness = grid.map((val, i) =>
    CIRCULAR_MASK[i] ? Math.max(0, Math.min(4095, Math.round(val))) : 0,
  );

  return {
    device: 'Phone4aPro',
    gridSize: GRID_SIZE,
    version: '1.0',
    brightness,
  };
}

/**
 * Validate and normalize imported data.
 *
 * Checks:
 * - Input is a non-null object
 * - Has a `brightness` property that is an array
 * - Array has exactly 169 elements
 * - All elements are integers
 *
 * Any integer 0–4095 is accepted (continuous values are preserved, not snapped to
 * 5 discrete levels). Out-of-range values are clamped to [0, 4095].
 * The circular mask is enforced (inactive positions set to 0).
 *
 * @param {unknown} data - Parsed JSON data to validate
 * @returns {{ valid: true, grid: number[] } | { valid: false, error: string }}
 */
export function validateImportData(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Invalid file format: expected a JSON object.' };
  }

  if (!('brightness' in data)) {
    return { valid: false, error: 'Missing "brightness" key in JSON file.' };
  }

  const { brightness } = data;

  if (!Array.isArray(brightness)) {
    return { valid: false, error: 'Invalid file format: "brightness" must be an array.' };
  }

  if (brightness.length !== TOTAL_CELLS) {
    return {
      valid: false,
      error: `Wrong array size: expected ${TOTAL_CELLS} elements, got ${brightness.length}.`,
    };
  }

  // Validate all values are integers
  for (let i = 0; i < brightness.length; i++) {
    if (typeof brightness[i] !== 'number' || !Number.isInteger(brightness[i])) {
      return {
        valid: false,
        error: `Invalid value at index ${i}: all brightness values must be integer numbers.`,
      };
    }
  }

  // Clamp to [0, 4095] and enforce circular mask (no snapping to 5 levels)
  const grid = brightness.map((val, i) => {
    if (!CIRCULAR_MASK[i]) return 0;
    return Math.max(0, Math.min(4095, val));
  });

  return { valid: true, grid };
}

/**
 * Read the text content of a File object.
 *
 * Uses FileReader for broad compatibility (jsdom, older browsers).
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

/**
 * Read and parse a JSON File object, then validate it.
 *
 * @param {File} file - JSON file from a file input
 * @returns {Promise<{ valid: true, grid: number[] } | { valid: false, error: string }>}
 */
export async function parseImportFile(file) {
  // Check for zero-byte file
  if (file.size === 0) {
    return { valid: false, error: 'File is empty (zero bytes). Please select a valid JSON file.' };
  }

  let text;
  try {
    text = await readFileText(file);
  } catch {
    return { valid: false, error: 'Failed to read file.' };
  }

  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'File is empty (zero bytes). Please select a valid JSON file.' };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { valid: false, error: 'Failed to parse JSON: file contains invalid JSON syntax.' };
  }

  return validateImportData(data);
}

/**
 * Trigger a browser download of the grid state as a JSON file.
 *
 * Creates a Blob from the export data and triggers a download via a
 * temporary anchor element. The filename includes 'glyph-pattern' and
 * the current date.
 *
 * @param {number[]} grid - 169-element brightness grid
 */
export function downloadExportJSON(grid) {
  const data = buildExportData(grid);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const filename = `glyph-pattern-${yyyy}-${mm}-${dd}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

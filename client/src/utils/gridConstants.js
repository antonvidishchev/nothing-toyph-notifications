/**
 * Grid constants for the Nothing Phone 4a Pro GlyphMatrix.
 *
 * The 13×13 LED matrix has 137 active LEDs arranged in a circular pattern.
 * 32 corner positions are inactive, forming a symmetric circular mask.
 */

/** Number of rows and columns in the grid. */
export const GRID_SIZE = 13;

/** Total cell count (GRID_SIZE × GRID_SIZE). */
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE; // 169

/**
 * The five discrete brightness levels supported by the GlyphMatrix SDK.
 * Values range from 0 (off) to 4095 (max brightness, 12-bit).
 */
export const BRIGHTNESS_LEVELS = [0, 1024, 2048, 3072, 4095];

/**
 * Mapping from brightness value to CSS grayscale color.
 * Provides visually distinct shades from dark to white.
 */
export const BRIGHTNESS_COLORS = {
  0: '#222',
  1024: '#555',
  2048: '#888',
  3072: '#bbb',
  4095: '#fff',
};

/**
 * Circular mask for the 13×13 grid.
 *
 * true  = active LED position (interactive)
 * false = inactive corner position (non-interactive)
 *
 * Derived from a circle of radius 6.5 centered at (6, 6).
 * Symmetric across both the horizontal and vertical axes.
 *
 * Visual layout (1 = active, 0 = inactive):
 *   Row  0: 0 0 0 0 1 1 1 1 1 0 0 0 0   ( 5)
 *   Row  1: 0 0 1 1 1 1 1 1 1 1 1 0 0   ( 9)
 *   Row  2: 0 1 1 1 1 1 1 1 1 1 1 1 0   (11)
 *   Row  3: 0 1 1 1 1 1 1 1 1 1 1 1 0   (11)
 *   Row  4: 1 1 1 1 1 1 1 1 1 1 1 1 1   (13)
 *   Row  5: 1 1 1 1 1 1 1 1 1 1 1 1 1   (13)
 *   Row  6: 1 1 1 1 1 1 1 1 1 1 1 1 1   (13)
 *   Row  7: 1 1 1 1 1 1 1 1 1 1 1 1 1   (13)
 *   Row  8: 1 1 1 1 1 1 1 1 1 1 1 1 1   (13)
 *   Row  9: 0 1 1 1 1 1 1 1 1 1 1 1 0   (11)
 *   Row 10: 0 1 1 1 1 1 1 1 1 1 1 1 0   (11)
 *   Row 11: 0 0 1 1 1 1 1 1 1 1 1 0 0   ( 9)
 *   Row 12: 0 0 0 0 1 1 1 1 1 0 0 0 0   ( 5)
 *
 * Total active: 137, Total inactive: 32
 */
// prettier-ignore
export const CIRCULAR_MASK = [
  // Row 0
  false, false, false, false, true,  true,  true,  true,  true,  false, false, false, false,
  // Row 1
  false, false, true,  true,  true,  true,  true,  true,  true,  true,  true,  false, false,
  // Row 2
  false, true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  false,
  // Row 3
  false, true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  false,
  // Row 4
  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,
  // Row 5
  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,
  // Row 6
  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,
  // Row 7
  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,
  // Row 8
  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,
  // Row 9
  false, true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  false,
  // Row 10
  false, true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  false,
  // Row 11
  false, false, true,  true,  true,  true,  true,  true,  true,  true,  true,  false, false,
  // Row 12
  false, false, false, false, true,  true,  true,  true,  true,  false, false, false, false,
];

/**
 * Convert any brightness value (0–4095) to a CSS hex color string using
 * linear grayscale interpolation.
 *
 * 0     → '#000000' (black)
 * 4095  → '#ffffff' (white)
 * 2048  → '#808080' (medium gray)
 *
 * Values outside 0–4095 are clamped before conversion.
 *
 * @param {number} value - Brightness value (0–4095)
 * @returns {string} CSS hex color string (e.g. '#808080')
 */
export function brightnessToColor(value) {
  const clamped = Math.max(0, Math.min(4095, Math.round(value)));
  const gray = Math.round((clamped * 255) / 4095);
  const hex = gray.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

/**
 * Advance brightness to the next level in the cycle.
 * 0 → 1024 → 2048 → 3072 → 4095 → 0
 *
 * If the current value is one of the 5 canonical levels, advance normally.
 * If the current value is a continuous (non-canonical) value, snap to the
 * nearest canonical level first, then advance.
 *
 * @param {number} current - Current brightness value
 * @returns {number} Next canonical brightness value
 */
export function nextBrightness(current) {
  const idx = BRIGHTNESS_LEVELS.indexOf(current);
  if (idx !== -1) {
    // Canonical value: advance normally
    return BRIGHTNESS_LEVELS[(idx + 1) % BRIGHTNESS_LEVELS.length];
  }
  // Continuous value: snap to nearest canonical level, then advance
  const nearestIdx = findNearestBrightnessLevelIndex(current);
  return BRIGHTNESS_LEVELS[(nearestIdx + 1) % BRIGHTNESS_LEVELS.length];
}

function findNearestBrightnessLevelIndex(current) {
  let nearestIdx = 0;
  let nearestDist = Math.abs(BRIGHTNESS_LEVELS[0] - current);
  for (let i = 1; i < BRIGHTNESS_LEVELS.length; i++) {
    const dist = Math.abs(BRIGHTNESS_LEVELS[i] - current);
    if (dist < nearestDist) {
      nearestIdx = i;
      nearestDist = dist;
    }
  }
  return nearestIdx;
}

/**
 * Move brightness to the previous level in the cycle.
 * 0 ← 1024 ← 2048 ← 3072 ← 4095 ← 0
 *
 * If the current value is one of the 5 canonical levels, move backward
 * normally. If the current value is continuous, snap to the nearest canonical
 * level first, then move backward.
 *
 * @param {number} current - Current brightness value
 * @returns {number} Previous canonical brightness value
 */
export function prevBrightness(current) {
  const idx = BRIGHTNESS_LEVELS.indexOf(current);
  const baseIdx = idx !== -1 ? idx : findNearestBrightnessLevelIndex(current);
  return BRIGHTNESS_LEVELS[(baseIdx - 1 + BRIGHTNESS_LEVELS.length) % BRIGHTNESS_LEVELS.length];
}

/**
 * Toggle between black and white brightness levels.
 *
 * Uses a midpoint threshold so continuous/non-binary values are interpreted
 * deterministically before toggling:
 *   - current >= 2048 → treated as white, next = 0
 *   - current < 2048  → treated as black, next = 4095
 *
 * @param {number} current - Current brightness value
 * @returns {number} Next binary brightness value (0 or 4095)
 */
export function nextBinaryBrightness(current) {
  return current >= 2048 ? 0 : 4095;
}

/**
 * Reverse-toggle between black and white brightness levels.
 *
 * This is the exact opposite action of `nextBinaryBrightness`:
 *   - current >= 2048 → treated as white-ish, reverse next = 4095
 *   - current < 2048  → treated as black-ish, reverse next = 0
 *
 * @param {number} current - Current brightness value
 * @returns {number} Reverse binary brightness value (0 or 4095)
 */
export function prevBinaryBrightness(current) {
  return current >= 2048 ? 4095 : 0;
}

/**
 * Apply master brightness slider transform to a single base brightness value.
 *
 * The master slider is a non-destructive display/output transform.
 * Formula (piecewise-linear):
 *   - If base === 0: effective = 0 (cannot brighten an off LED)
 *   - If slider <= 50: effective = Math.round(base * (slider / 50))  [darken toward 0]
 *   - If slider > 50:  effective = Math.round(base + (4095 - base) * ((slider - 50) / 50))  [push toward 4095]
 *   Result is clamped to [0, 4095].
 *
 * Examples (base=2048):
 *   slider=0  → 0
 *   slider=25 → 1024
 *   slider=50 → 2048 (identity)
 *   slider=75 → 3072
 *   slider=100 → 4095
 *
 * @param {number} base   - Base brightness value (0–4095)
 * @param {number} slider - Slider position (0–100), default 50 = identity
 * @returns {number} Effective brightness value, integer, clamped to [0, 4095]
 */
export function applyMasterBrightness(base, slider) {
  if (base === 0) return 0;
  let effective;
  if (slider <= 50) {
    effective = Math.round(base * (slider / 50));
  } else {
    effective = Math.round(base + (4095 - base) * ((slider - 50) / 50));
  }
  return Math.max(0, Math.min(4095, effective));
}

/**
 * Apply master contrast slider transform to a single base brightness value.
 *
 * Standard contrast formula centered at midpoint (2047.5):
 *   output = midpoint + (input - midpoint) * factor
 *   where factor = slider / 50
 *
 * Behavior:
 *   - slider=0:   factor=0   → all values collapse to midpoint (flat gray)
 *   - slider=50:  factor=1   → identity (no change)
 *   - slider=100: factor=2   → double contrast (values pushed away from midpoint)
 *
 * Result is clamped to [0, 4095] and rounded to integer.
 *
 * @param {number} base   - Base brightness value (0–4095)
 * @param {number} slider - Slider position (0–100), default 50 = identity
 * @returns {number} Contrast-adjusted brightness value, integer, clamped to [0, 4095]
 */
export function applyMasterContrast(base, slider) {
  const midpoint = 2047.5;
  const factor = slider / 50;
  const output = midpoint + (base - midpoint) * factor;
  return Math.max(0, Math.min(4095, Math.round(output)));
}

/**
 * Invert a single brightness value using the formula: 4095 - value.
 *
 * Works for any value in 0–4095 (including continuous/non-canonical values).
 * Examples:
 *   0    → 4095
 *   4095 → 0
 *   1024 → 3071
 *   2048 → 2047
 *   1500 → 2595
 *
 * @param {number} value - Current brightness value (0–4095)
 * @returns {number} Inverted brightness value
 */
export function invertBrightness(value) {
  return 4095 - value;
}

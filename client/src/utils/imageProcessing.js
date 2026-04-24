/**
 * Image processing utilities for Toyph Glyph Generator.
 *
 * Converts uploaded images into a 13×13 grayscale brightness grid
 * quantized to the 5 discrete GlyphMatrix brightness levels.
 */

import { GRID_SIZE, TOTAL_CELLS, CIRCULAR_MASK } from './gridConstants.js';

/**
 * Convert an RGBA pixel to grayscale luminance (0–255).
 * Uses the ITU-R BT.601 luma formula: 0.299R + 0.587G + 0.114B.
 * Alpha channel is composited against black (transparent → 0).
 *
 * @param {number} r - Red channel (0–255)
 * @param {number} g - Green channel (0–255)
 * @param {number} b - Blue channel (0–255)
 * @param {number} a - Alpha channel (0–255)
 * @returns {number} Grayscale value (0–255)
 */
export function rgbaToGrayscale(r, g, b, a) {
  // Composite against black: multiply by alpha/255
  const alpha = a / 255;
  const rr = r * alpha;
  const gg = g * alpha;
  const bb = b * alpha;
  return Math.round(0.299 * rr + 0.587 * gg + 0.114 * bb);
}

/**
 * Quantize a grayscale value (0–255) to the nearest of the 5 brightness levels.
 * Uses nearest-neighbor thresholds with midpoints between adjacent levels.
 *
 * Level mapping (0–255 → SDK values):
 *   0    (off)  ←→ 0
 *   1024 (25%)  ←→ 64
 *   2048 (50%)  ←→ 128
 *   3072 (75%)  ←→ 191
 *   4095 (100%) ←→ 255
 *
 * Thresholds (midpoints): 32, 96, 160, 223
 *
 * @param {number} gray - Grayscale value (0–255)
 * @returns {number} Quantized brightness level from {0, 1024, 2048, 3072, 4095}
 */
export function quantizeBrightness(gray) {
  // Map the 5 SDK levels to 0-255 equivalents: 0, 64, 128, 191, 255
  // Midpoint thresholds between adjacent equivalents:
  //   (0+64)/2 = 32, (64+128)/2 = 96, (128+191)/2 = ~160, (191+255)/2 = 223
  if (gray < 32) return 0;
  if (gray < 96) return 1024;
  if (gray < 160) return 2048;
  if (gray < 223) return 3072;
  return 4095;
}

/**
 * Apply the circular mask to a 169-element grid array.
 * Sets all 32 inactive positions to 0.
 *
 * @param {number[]} grid - 169-element brightness array
 * @returns {number[]} New array with inactive positions zeroed
 */
export function applyCircularMask(grid) {
  return grid.map((val, i) => (CIRCULAR_MASK[i] ? val : 0));
}

/**
 * Process RGBA pixel data (from a 13×13 canvas) into a continuous brightness grid.
 * Expects exactly 13×13×4 = 676 bytes of RGBA pixel data.
 *
 * Grayscale values (0–255) are mapped linearly to brightness values (0–4095):
 *   brightness = Math.round(gray * 4095 / 255)
 *
 * No quantization to 5 levels is applied. Use quantizeBrightness() separately
 * if discrete 5-level output is desired (e.g. default mode).
 *
 * @param {Uint8ClampedArray} pixelData - RGBA pixel data from canvas (676 bytes)
 * @returns {number[]} 169-element array of continuous brightness values with mask applied
 */
export function processPixelData(pixelData) {
  if (pixelData.length !== TOTAL_CELLS * 4) {
    throw new Error(`Expected ${TOTAL_CELLS * 4} bytes of pixel data, got ${pixelData.length}`);
  }

  const grid = [];
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const offset = i * 4;
    const r = pixelData[offset];
    const g = pixelData[offset + 1];
    const b = pixelData[offset + 2];
    const a = pixelData[offset + 3];
    const gray = rgbaToGrayscale(r, g, b, a);
    // Map grayscale 0–255 linearly to brightness 0–4095
    grid.push(Math.round((gray * 4095) / 255));
  }

  return applyCircularMask(grid);
}

/**
 * Apply a piecewise-linear brightness adjustment to a grayscale value (0–255).
 *
 * The brightness parameter is a 0–100 slider value where:
 *   - 50 is the identity (no change)
 *   - 0 pushes all pixels to black
 *   - 100 pushes all pixels to white
 *
 * Formula:
 *   slider <= 50: adjustedGray = gray * (slider / 50)
 *   slider >  50: adjustedGray = gray + (255 - gray) * ((slider - 50) / 50)
 *
 * @param {number} gray       - Grayscale value (0–255)
 * @param {number} brightness - Brightness slider value (0–100); 50 = identity
 * @returns {number} Adjusted grayscale value (may be non-integer, caller should round/clamp)
 */
export function applyBrightnessToGray(gray, brightness) {
  if (brightness <= 50) {
    return gray * (brightness / 50);
  } else {
    return gray + (255 - gray) * ((brightness - 50) / 50);
  }
}

/**
 * Apply a contrast adjustment to a grayscale value (0–255).
 *
 * Standard contrast formula centered at midpoint (127.5):
 *   output = 127.5 + (gray - 127.5) * (contrastSlider / 50)
 *
 * Behavior:
 *   - contrastSlider=0:   all values collapse to midpoint (flat gray)
 *   - contrastSlider=50:  identity (no change)
 *   - contrastSlider=100: double contrast (values pushed away from midpoint)
 *
 * Result is clamped to [0, 255] and rounded to integer.
 *
 * @param {number} gray           - Grayscale value (0–255)
 * @param {number} contrastSlider - Contrast slider value (0–100); 50 = identity
 * @returns {number} Contrast-adjusted grayscale value, integer, clamped to [0, 255]
 */
export function adjustContrast(gray, contrastSlider) {
  const midpoint = 127.5;
  const factor = contrastSlider / 50;
  const output = midpoint + (gray - midpoint) * factor;
  return Math.max(0, Math.min(255, Math.round(output)));
}

/**
 * Quantize a grayscale value (0–255) to one of 2 brightness levels (black or white).
 * Threshold at 128: values below map to 0 (off), values at or above map to 4095 (full).
 *
 * @param {number} gray - Grayscale value (0–255)
 * @returns {number} 0 or 4095
 */
export function quantize2Levels(gray) {
  return gray < 128 ? 0 : 4095;
}

/**
 * Process RGBA pixel data with an optional brightness adjustment.
 *
 * Always quantizes to 5 discrete brightness levels by default.
 * When only2Colors is true, quantizes to 2 levels (black/white) instead.
 *
 * @param {Uint8ClampedArray} pixelData       - RGBA pixel data from canvas (676 bytes)
 * @param {number}            [brightness=50] - Brightness slider (0–100); 50 = identity
 * @param {boolean}           [only2Colors=false] - Snap output to 2 levels (black/white)
 * @returns {number[]} 169-element brightness array with circular mask applied
 */
export function processPixelDataWithBrightness(pixelData, brightness = 50, only2Colors = false) {
  if (pixelData.length !== TOTAL_CELLS * 4) {
    throw new Error(`Expected ${TOTAL_CELLS * 4} bytes of pixel data, got ${pixelData.length}`);
  }

  const grid = [];
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const offset = i * 4;
    const r = pixelData[offset];
    const g = pixelData[offset + 1];
    const b = pixelData[offset + 2];
    const a = pixelData[offset + 3];
    const gray = rgbaToGrayscale(r, g, b, a);
    const adjustedGray = Math.round(
      Math.max(0, Math.min(255, applyBrightnessToGray(gray, brightness))),
    );
    if (only2Colors) {
      grid.push(quantize2Levels(adjustedGray));
    } else {
      grid.push(quantizeBrightness(adjustedGray));
    }
  }

  return applyCircularMask(grid);
}

/**
 * Try to process an image using the Canvas API (frontend).
 * Returns null if the Canvas API is unavailable or fails.
 *
 * @param {File} file - Image file
 * @returns {Promise<number[]|null>} Grid array or null on failure
 */
function tryCanvasProcessing(file) {
  return new Promise((resolve) => {
    try {
      // Check if Canvas API is available (e.g., not in a worker or unsupported env)
      if (typeof document === 'undefined' || typeof Image === 'undefined') {
        resolve(null);
        return;
      }

      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = GRID_SIZE;
          canvas.height = GRID_SIZE;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }

          // Fill with black first (composites transparent regions against black)
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);

          // Draw image stretched to 13×13
          ctx.drawImage(img, 0, 0, GRID_SIZE, GRID_SIZE);

          // Get pixel data
          const imageData = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
          const grid = processPixelData(imageData.data);

          URL.revokeObjectURL(url);
          resolve(grid);
        } catch {
          URL.revokeObjectURL(url);
          resolve(null); // Canvas processing failed
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null); // Image load failed
      };

      img.src = url;
    } catch {
      resolve(null); // Any unexpected error
    }
  });
}

/**
 * Allowed MIME types for image uploads.
 */
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Allowed file extensions for image uploads (lowercase, with leading dot).
 */
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/**
 * Validate that a file is a supported image format.
 * Checks both MIME type and file extension.
 * Only PNG, JPEG, GIF, and WebP are accepted.
 *
 * @param {File} file - File to validate
 * @throws {Error} If the file format is not supported
 */
export function validateImageFile(file) {
  const mimeOk = file.type && ALLOWED_MIME_TYPES.has(file.type);
  const name = (file.name || '').toLowerCase();
  const dotIndex = name.lastIndexOf('.');
  const ext = dotIndex >= 0 ? name.slice(dotIndex) : '';
  const extOk = ALLOWED_EXTENSIONS.has(ext);

  // Accept if MIME type matches OR extension matches (but at least one must)
  if (!mimeOk && !extOk) {
    throw new Error('Unsupported file format. Please use PNG, JPEG, GIF, or WebP.');
  }
}

/**
 * Load an image file, resize to 13×13, and convert to a quantized brightness grid.
 *
 * Handles:
 * - Any image size (resized to 13×13)
 * - Transparent PNGs (composited against black background)
 * - Animated GIFs (first frame only)
 * - Non-square images (stretched to fill 13×13)
 *
 * @param {File} file - Image file (PNG, JPEG, GIF, WebP)
 * @returns {Promise<number[]>} 169-element quantized brightness grid with mask
 * @throws {Error} If the file format is unsupported or cannot be processed
 */
export async function processImageFile(file) {
  validateImageFile(file);
  const canvasResult = await tryCanvasProcessing(file);
  if (canvasResult !== null) {
    return canvasResult;
  }

  throw new Error('Unable to process image in this browser environment.');
}

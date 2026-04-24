/**
 * Crop area utilities for CropModal.
 *
 * Pure math functions for zoom and pan constraint enforcement.
 * Used by CropArea for image pan/zoom interaction.
 */

import { GRID_SIZE } from './gridConstants.js';
import { processPixelDataWithBrightness } from './imageProcessing.js';

/** Size of the square crop container in pixels. The crop circle inscribes this square. */
export const CROP_SIZE = 300;
/** Minimum allowed zoom is 25% of the initial fit zoom. */
export const MIN_ZOOM_OUT_RATIO = 0.25;

/**
 * Calculate the "fit" zoom level such that the shorter dimension of the image
 * exactly fills the crop circle diameter.
 *
 * For a landscape image (width > height): height fills the circle → min zoom = circleDiameter / height
 * For a portrait image (height > width): width fills the circle → min zoom = circleDiameter / width
 * For a square image: either dimension fills the circle → min zoom = circleDiameter / side
 *
 * @param {number} imgWidth  - Natural image width in pixels (> 0)
 * @param {number} imgHeight - Natural image height in pixels (> 0)
 * @param {number} circleDiameter - Diameter of the crop circle in pixels
 * @returns {number} Fit zoom level (> 0)
 */
export function calcMinZoom(imgWidth, imgHeight, circleDiameter) {
  return circleDiameter / Math.min(imgWidth, imgHeight);
}

/**
 * Calculate the maximum zoom level.
 * Max zoom is 5× the minimum zoom (allows user to zoom in 5× from the minimum).
 *
 * @param {number} minZoom - Minimum zoom level
 * @returns {number} Maximum zoom level
 */
export function calcMaxZoom(minZoom) {
  return minZoom * 5;
}

/**
 * Clamp a zoom level to the valid [minZoom, maxZoom] range.
 *
 * @param {number} zoom    - Zoom level to clamp
 * @param {number} minZoom - Minimum allowed zoom
 * @param {number} maxZoom - Maximum allowed zoom
 * @returns {number} Clamped zoom level in [minZoom, maxZoom]
 */
export function clampZoom(zoom, minZoom, maxZoom) {
  return Math.max(minZoom, Math.min(maxZoom, zoom));
}

/**
 * Clamp pan offsets to keep panning within valid bounds for the current zoom.
 *
 * Pan (panX, panY) is the offset of the image center from the circle center.
 * Positive panX shifts the image right; positive panY shifts it down.
 *
 * When the scaled image is larger than the crop circle on an axis, panning
 * is limited so the image edge cannot move past the circle edge. For the
 * right edge:
 *   imageRight = circleCenter + panX + (imgWidth * zoom / 2) >= circleCenter + circleRadius
 *   → panX >= circleRadius - imgWidth * zoom / 2
 *
 * When the scaled image is smaller than the circle on an axis, max pan for
 * that axis is 0 (locked to center).
 *
 * @param {number} panX        - Desired X pan offset in pixels
 * @param {number} panY        - Desired Y pan offset in pixels
 * @param {number} zoom        - Current zoom level
 * @param {number} imgWidth    - Natural image width in pixels
 * @param {number} imgHeight   - Natural image height in pixels
 * @param {number} circleRadius - Radius of the crop circle in pixels
 * @returns {{ panX: number, panY: number }} Clamped pan offsets
 */
export function clampPan(panX, panY, zoom, imgWidth, imgHeight, circleRadius) {
  const halfScaledW = (imgWidth * zoom) / 2;
  const halfScaledH = (imgHeight * zoom) / 2;
  // Maximum pan range: how far the image center can move from the circle center
  // while still covering the circle edge.
  const maxPanX = Math.max(0, halfScaledW - circleRadius);
  const maxPanY = Math.max(0, halfScaledH - circleRadius);
  const clampedX = Math.max(-maxPanX, Math.min(maxPanX, panX));
  const clampedY = Math.max(-maxPanY, Math.min(maxPanY, panY));
  // Normalize -0 to 0 for clean equality comparisons (IEEE 754 edge case).
  return {
    panX: clampedX === 0 ? 0 : clampedX,
    panY: clampedY === 0 ? 0 : clampedY,
  };
}

/**
 * Calculate the initial crop state for an image:
 * centered at fit zoom, with a zoom-out floor at 25% of fit zoom.
 *
 * Used when the modal first opens with a new image, and when state resets.
 *
 * @param {number} imgWidth       - Natural image width in pixels
 * @param {number} imgHeight      - Natural image height in pixels
 * @param {number} circleDiameter - Diameter of the crop circle in pixels
 * @returns {{ zoom: number, panX: number, panY: number, minZoom: number, maxZoom: number }}
 */
export function calcInitialState(imgWidth, imgHeight, circleDiameter) {
  const fitZoom = calcMinZoom(imgWidth, imgHeight, circleDiameter);
  const minZoom = fitZoom * MIN_ZOOM_OUT_RATIO;
  const maxZoom = calcMaxZoom(fitZoom);
  return { zoom: fitZoom, panX: 0, panY: 0, minZoom, maxZoom };
}

/**
 * Convert a zoom level to a slider value in [0, 100].
 * minZoom → 0, maxZoom → 100, linear interpolation in between.
 *
 * @param {number} zoom    - Current zoom level
 * @param {number} minZoom - Minimum zoom (slider = 0)
 * @param {number} maxZoom - Maximum zoom (slider = 100)
 * @returns {number} Slider value in [0, 100]
 */
export function zoomToSlider(zoom, minZoom, maxZoom) {
  if (maxZoom <= minZoom) return 0;
  return ((zoom - minZoom) / (maxZoom - minZoom)) * 100;
}

/**
 * Convert a slider value (0–100) to a zoom level.
 * 0 → minZoom, 100 → maxZoom, linear interpolation in between.
 *
 * @param {number} sliderValue - Slider value in [0, 100]
 * @param {number} minZoom     - Minimum zoom (slider = 0)
 * @param {number} maxZoom     - Maximum zoom (slider = 100)
 * @returns {number} Zoom level in [minZoom, maxZoom]
 */
export function sliderToZoom(sliderValue, minZoom, maxZoom) {
  const t = Math.max(0, Math.min(100, sliderValue)) / 100;
  return minZoom + t * (maxZoom - minZoom);
}

/**
 * Flatten RGBA pixels against black.
 *
 * Converts partially/fully transparent pixels into opaque pixels whose RGB
 * channels are composited against black. Fully transparent pixels become
 * opaque black (0,0,0,255).
 *
 * @param {Uint8ClampedArray} pixelData - RGBA data, mutated in place
 * @returns {Uint8ClampedArray} The same array reference for chaining
 */
export function flattenTransparentPixelsToBlack(pixelData) {
  for (let i = 0; i < pixelData.length; i += 4) {
    const alpha = pixelData[i + 3] / 255;
    if (alpha >= 1) continue;
    pixelData[i] = Math.round(pixelData[i] * alpha);
    pixelData[i + 1] = Math.round(pixelData[i + 1] * alpha);
    pixelData[i + 2] = Math.round(pixelData[i + 2] * alpha);
    pixelData[i + 3] = 255;
  }
  return pixelData;
}

/**
 * Extract the visible crop region from an image element and compute a
 * 169-element brightness array.
 *
 * Draws the portion of the image that is visible within the crop circle
 * (the entire cropSize × cropSize area) onto a hidden 13×13 canvas, then
 * runs the full processing pipeline: transparent→black compositing
 * → rgbaToGrayscale → applyBrightnessToGray
 * → quantizeBrightness (or quantize2Levels if only2Colors is true)
 * → applyCircularMask.
 *
 * Returns null if the Canvas API is unavailable or if an error occurs,
 * allowing the caller to retain the last good preview value.
 *
 * @param {HTMLImageElement} img              - The loaded <img> element
 * @param {number}           zoom             - Current zoom level
 * @param {number}           panX             - Current X pan offset in pixels
 * @param {number}           panY             - Current Y pan offset in pixels
 * @param {number}           imgNaturalWidth  - Natural image width in pixels
 * @param {number}           imgNaturalHeight - Natural image height in pixels
 * @param {number}           cropSize         - Crop container size (CROP_SIZE)
 * @param {number}           [brightness=50]  - Brightness slider value (0–100); 50 = identity
 * @param {boolean}          [only2Colors=false] - Snap output to 2 levels (black/white)
 * @returns {number[]|null} 169-element brightness array, or null on failure
 */
export function computePreviewBrightness(
  img,
  zoom,
  panX,
  panY,
  imgNaturalWidth,
  imgNaturalHeight,
  cropSize,
  brightness = 50,
  only2Colors = false,
) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = GRID_SIZE;
    canvas.height = GRID_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Black background so transparent regions composite to black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);

    // Calculate the source rectangle in the image's natural pixel space.
    //
    // The image is positioned at (imgLeft, imgTop) within the crop container,
    // where (imgLeft, imgTop) = (center + panX - halfScaledWidth, center + panY - halfScaledHeight).
    // The crop area covers container coordinates (0, 0) to (cropSize, cropSize).
    // In image natural pixel coordinates:
    //   srcX = (0 - imgLeft) / zoom
    //   srcY = (0 - imgTop) / zoom
    //   srcW = cropSize / zoom
    //   srcH = cropSize / zoom
    const imgLeft = cropSize / 2 + panX - (imgNaturalWidth * zoom) / 2;
    const imgTop = cropSize / 2 + panY - (imgNaturalHeight * zoom) / 2;
    const srcX = -imgLeft / zoom;
    const srcY = -imgTop / zoom;
    const srcW = cropSize / zoom;
    const srcH = cropSize / zoom;

    // Draw the source region stretched to 13×13
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, GRID_SIZE, GRID_SIZE);

    const imageData = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
    flattenTransparentPixelsToBlack(imageData.data);

    return processPixelDataWithBrightness(imageData.data, brightness, only2Colors);
  } catch {
    return null;
  }
}

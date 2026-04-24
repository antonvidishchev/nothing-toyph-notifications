import { describe, it, expect } from 'vitest';
import {
  rgbaToGrayscale,
  quantizeBrightness,
  quantize2Levels,
  applyCircularMask,
  processPixelData,
  processPixelDataWithBrightness,
  applyBrightnessToGray,
  adjustContrast,
  validateImageFile,
} from '../imageProcessing.js';
import { CIRCULAR_MASK, TOTAL_CELLS, BRIGHTNESS_LEVELS } from '../gridConstants.js';

describe('rgbaToGrayscale', () => {
  it('converts pure white (255,255,255,255) to 255', () => {
    expect(rgbaToGrayscale(255, 255, 255, 255)).toBe(255);
  });

  it('converts pure black (0,0,0,255) to 0', () => {
    expect(rgbaToGrayscale(0, 0, 0, 255)).toBe(0);
  });

  it('converts pure red (255,0,0,255) to ~76', () => {
    // 0.299 * 255 = 76.245 → 76
    const result = rgbaToGrayscale(255, 0, 0, 255);
    expect(result).toBe(76);
  });

  it('converts pure green (0,255,0,255) to ~150', () => {
    // 0.587 * 255 = 149.685 → 150
    const result = rgbaToGrayscale(0, 255, 0, 255);
    expect(result).toBe(150);
  });

  it('converts pure blue (0,0,255,255) to ~29', () => {
    // 0.114 * 255 = 29.07 → 29
    const result = rgbaToGrayscale(0, 0, 255, 255);
    expect(result).toBe(29);
  });

  it('composites fully transparent pixels against black → 0', () => {
    expect(rgbaToGrayscale(255, 255, 255, 0)).toBe(0);
  });

  it('composites semi-transparent white against black', () => {
    // alpha=128 → alpha/255 ≈ 0.502
    // 0.299 * 255 * 0.502 + 0.587 * 255 * 0.502 + 0.114 * 255 * 0.502
    // = 255 * 0.502 ≈ 128
    const result = rgbaToGrayscale(255, 255, 255, 128);
    expect(result).toBeGreaterThanOrEqual(127);
    expect(result).toBeLessThanOrEqual(129);
  });

  it('returns a value between 0 and 255 for any valid input', () => {
    for (let i = 0; i < 50; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      const a = Math.floor(Math.random() * 256);
      const result = rgbaToGrayscale(r, g, b, a);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(255);
    }
  });

  it('mid-gray (128,128,128,255) produces ~128', () => {
    const result = rgbaToGrayscale(128, 128, 128, 255);
    expect(result).toBe(128);
  });
});

describe('quantizeBrightness', () => {
  it('quantizes 0 to 0', () => {
    expect(quantizeBrightness(0)).toBe(0);
  });

  it('quantizes 255 to 4095', () => {
    expect(quantizeBrightness(255)).toBe(4095);
  });

  it('quantizes 128 to 2048', () => {
    expect(quantizeBrightness(128)).toBe(2048);
  });

  it('output is always one of the 5 brightness levels', () => {
    const validLevels = new Set(BRIGHTNESS_LEVELS);
    for (let gray = 0; gray <= 255; gray++) {
      const result = quantizeBrightness(gray);
      expect(validLevels.has(result)).toBe(true);
    }
  });

  it('values near 0 quantize to 0 (< 32)', () => {
    expect(quantizeBrightness(0)).toBe(0);
    expect(quantizeBrightness(15)).toBe(0);
    expect(quantizeBrightness(31)).toBe(0);
  });

  it('values around 64 quantize to 1024 (32–95)', () => {
    expect(quantizeBrightness(32)).toBe(1024);
    expect(quantizeBrightness(64)).toBe(1024);
    expect(quantizeBrightness(95)).toBe(1024);
  });

  it('values around 128 quantize to 2048 (96–159)', () => {
    expect(quantizeBrightness(96)).toBe(2048);
    expect(quantizeBrightness(128)).toBe(2048);
    expect(quantizeBrightness(159)).toBe(2048);
  });

  it('values around 191 quantize to 3072 (160–222)', () => {
    expect(quantizeBrightness(160)).toBe(3072);
    expect(quantizeBrightness(191)).toBe(3072);
    expect(quantizeBrightness(222)).toBe(3072);
  });

  it('values near 255 quantize to 4095 (≥223)', () => {
    expect(quantizeBrightness(223)).toBe(4095);
    expect(quantizeBrightness(240)).toBe(4095);
    expect(quantizeBrightness(255)).toBe(4095);
  });

  it('threshold boundary: 31 → 0, 32 → 1024', () => {
    expect(quantizeBrightness(31)).toBe(0);
    expect(quantizeBrightness(32)).toBe(1024);
  });

  it('threshold boundary: 95 → 1024, 96 → 2048', () => {
    expect(quantizeBrightness(95)).toBe(1024);
    expect(quantizeBrightness(96)).toBe(2048);
  });

  it('threshold boundary: 159 → 2048, 160 → 3072', () => {
    expect(quantizeBrightness(159)).toBe(2048);
    expect(quantizeBrightness(160)).toBe(3072);
  });

  it('threshold boundary: 222 → 3072, 223 → 4095', () => {
    expect(quantizeBrightness(222)).toBe(3072);
    expect(quantizeBrightness(223)).toBe(4095);
  });
});

describe('applyCircularMask', () => {
  it('zeros out all 32 inactive positions', () => {
    // Fill all cells with 4095
    const grid = new Array(TOTAL_CELLS).fill(4095);
    const masked = applyCircularMask(grid);

    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!CIRCULAR_MASK[i]) {
        expect(masked[i]).toBe(0);
      }
    }
  });

  it('preserves values at all 137 active positions', () => {
    const grid = new Array(TOTAL_CELLS).fill(2048);
    const masked = applyCircularMask(grid);

    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(masked[i]).toBe(2048);
      }
    }
  });

  it('returns a new array (does not mutate input)', () => {
    const grid = new Array(TOTAL_CELLS).fill(1024);
    const masked = applyCircularMask(grid);
    expect(masked).not.toBe(grid);
    // Original should be unchanged
    expect(grid.every((v) => v === 1024)).toBe(true);
  });

  it('all-white input → 137 active at 4095, 32 inactive at 0', () => {
    const grid = new Array(TOTAL_CELLS).fill(4095);
    const masked = applyCircularMask(grid);

    const activeCount = masked.filter((v, i) => CIRCULAR_MASK[i] && v === 4095).length;
    const inactiveCount = masked.filter((v, i) => !CIRCULAR_MASK[i] && v === 0).length;

    expect(activeCount).toBe(137);
    expect(inactiveCount).toBe(32);
  });

  it('all-black input → all 169 at 0', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    const masked = applyCircularMask(grid);
    expect(masked.every((v) => v === 0)).toBe(true);
  });

  it('returns array of length 169', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    const masked = applyCircularMask(grid);
    expect(masked).toHaveLength(TOTAL_CELLS);
  });
});

describe('processPixelData', () => {
  it('processes all-white pixel data correctly', () => {
    // 169 pixels × 4 channels = 676 bytes, all 255
    const data = new Uint8ClampedArray(TOTAL_CELLS * 4).fill(255);
    const grid = processPixelData(data);

    expect(grid).toHaveLength(TOTAL_CELLS);

    // Active positions should be 4095 (white → 255 → 4095)
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(grid[i]).toBe(4095);
      } else {
        expect(grid[i]).toBe(0);
      }
    }
  });

  it('processes all-black pixel data correctly', () => {
    // All zeros (including alpha=0, which is fully transparent → composites to black)
    const data = new Uint8ClampedArray(TOTAL_CELLS * 4);
    // Set alpha to 255 so it's opaque black
    for (let i = 0; i < TOTAL_CELLS; i++) {
      data[i * 4 + 3] = 255; // alpha
    }
    const grid = processPixelData(data);

    expect(grid.every((v) => v === 0)).toBe(true);
  });

  it('all-transparent pixel data → all zeros (composited against black)', () => {
    const data = new Uint8ClampedArray(TOTAL_CELLS * 4).fill(0);
    const grid = processPixelData(data);
    expect(grid.every((v) => v === 0)).toBe(true);
  });

  it('output values are always integers in range 0–4095', () => {
    // Random pixel data — processPixelData now returns continuous (non-quantized) values
    const data = new Uint8ClampedArray(TOTAL_CELLS * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }
    const grid = processPixelData(data);

    grid.forEach((v) => {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(4095);
    });
  });

  it('circular mask is applied: 32 inactive positions are always 0', () => {
    const data = new Uint8ClampedArray(TOTAL_CELLS * 4).fill(255);
    const grid = processPixelData(data);

    let inactiveZeroCount = 0;
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!CIRCULAR_MASK[i]) {
        expect(grid[i]).toBe(0);
        inactiveZeroCount++;
      }
    }
    expect(inactiveZeroCount).toBe(32);
  });

  it('throws error for wrong data size', () => {
    const badData = new Uint8ClampedArray(100);
    expect(() => processPixelData(badData)).toThrow('Expected 676 bytes');
  });

  it('processes mid-gray (128,128,128,255) → ~2056 for active positions (linear mapping)', () => {
    // gray=128 → Math.round(128 * 4095 / 255) = Math.round(2056.47...) = 2056
    const data = new Uint8ClampedArray(TOTAL_CELLS * 4);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      data[i * 4] = 128; // R
      data[i * 4 + 1] = 128; // G
      data[i * 4 + 2] = 128; // B
      data[i * 4 + 3] = 255; // A
    }
    const grid = processPixelData(data);

    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(grid[i]).toBe(2056);
      }
    }
  });

  it('uniform color pixel data → all active cells have same value', () => {
    // Pure red: grayscale ≈ 76 → Math.round(76 * 4095 / 255) = Math.round(1220.7) = 1221
    const data = new Uint8ClampedArray(TOTAL_CELLS * 4);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      data[i * 4] = 255; // R
      data[i * 4 + 1] = 0; // G
      data[i * 4 + 2] = 0; // B
      data[i * 4 + 3] = 255; // A
    }
    const grid = processPixelData(data);

    const activeValues = grid.filter((_, i) => CIRCULAR_MASK[i]);
    const uniqueActiveValues = new Set(activeValues);
    // All active cells have the same continuous brightness value
    expect(uniqueActiveValues.size).toBe(1);
    // The value should be in range 0–4095 (no longer quantized to 5 levels)
    const val = [...uniqueActiveValues][0];
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(4095);
    expect(Number.isInteger(val)).toBe(true);
  });

  it('no color information in output (grayscale conversion)', () => {
    // Various colors should all map to brightness values in 0–4095
    const data = new Uint8ClampedArray(TOTAL_CELLS * 4);
    // Fill with a rainbow of colors
    const colors = [
      [255, 0, 0], // red
      [0, 255, 0], // green
      [0, 0, 255], // blue
      [255, 255, 0], // yellow
      [255, 0, 255], // magenta
    ];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      const c = colors[i % colors.length];
      data[i * 4] = c[0];
      data[i * 4 + 1] = c[1];
      data[i * 4 + 2] = c[2];
      data[i * 4 + 3] = 255;
    }
    const grid = processPixelData(data);

    // All output values should be integers in the valid range 0–4095
    grid.forEach((v) => {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(4095);
    });
  });
});

describe('validateImageFile', () => {
  it('accepts PNG files', () => {
    const file = new File(['dummy'], 'test.png', { type: 'image/png' });
    expect(() => validateImageFile(file)).not.toThrow();
  });

  it('accepts JPEG files', () => {
    const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
    expect(() => validateImageFile(file)).not.toThrow();
  });

  it('accepts GIF files', () => {
    const file = new File(['dummy'], 'test.gif', { type: 'image/gif' });
    expect(() => validateImageFile(file)).not.toThrow();
  });

  it('accepts WebP files', () => {
    const file = new File(['dummy'], 'test.webp', { type: 'image/webp' });
    expect(() => validateImageFile(file)).not.toThrow();
  });

  it('rejects BMP files', () => {
    const file = new File(['dummy'], 'test.bmp', { type: 'image/bmp' });
    expect(() => validateImageFile(file)).toThrow(
      'Unsupported file format. Please use PNG, JPEG, GIF, or WebP.',
    );
  });

  it('rejects SVG files', () => {
    const file = new File(['dummy'], 'test.svg', { type: 'image/svg+xml' });
    expect(() => validateImageFile(file)).toThrow(
      'Unsupported file format. Please use PNG, JPEG, GIF, or WebP.',
    );
  });

  it('rejects TIFF files', () => {
    const file = new File(['dummy'], 'test.tiff', { type: 'image/tiff' });
    expect(() => validateImageFile(file)).toThrow(
      'Unsupported file format. Please use PNG, JPEG, GIF, or WebP.',
    );
  });

  it('rejects files with no MIME type but unsupported extension', () => {
    const file = new File(['dummy'], 'test.bmp', { type: '' });
    expect(() => validateImageFile(file)).toThrow(
      'Unsupported file format. Please use PNG, JPEG, GIF, or WebP.',
    );
  });

  it('rejects PDF files', () => {
    const file = new File(['dummy'], 'test.pdf', { type: 'application/pdf' });
    expect(() => validateImageFile(file)).toThrow(
      'Unsupported file format. Please use PNG, JPEG, GIF, or WebP.',
    );
  });

  it('rejects TXT files', () => {
    const file = new File(['dummy'], 'test.txt', { type: 'text/plain' });
    expect(() => validateImageFile(file)).toThrow(
      'Unsupported file format. Please use PNG, JPEG, GIF, or WebP.',
    );
  });
});

// ─── applyBrightnessToGray ────────────────────────────────────────────────────

describe('applyBrightnessToGray', () => {
  it('brightness 50: returns gray unchanged (identity transform)', () => {
    expect(applyBrightnessToGray(0, 50)).toBeCloseTo(0);
    expect(applyBrightnessToGray(128, 50)).toBeCloseTo(128);
    expect(applyBrightnessToGray(255, 50)).toBeCloseTo(255);
  });

  it('brightness 0: returns 0 for all gray values', () => {
    expect(applyBrightnessToGray(0, 0)).toBeCloseTo(0);
    expect(applyBrightnessToGray(128, 0)).toBeCloseTo(0);
    expect(applyBrightnessToGray(255, 0)).toBeCloseTo(0);
  });

  it('brightness 100: returns 255 for all gray values', () => {
    expect(applyBrightnessToGray(0, 100)).toBeCloseTo(255);
    expect(applyBrightnessToGray(128, 100)).toBeCloseTo(255);
    expect(applyBrightnessToGray(255, 100)).toBeCloseTo(255);
  });

  it('brightness 25: returns gray * 0.5 (halfway to black)', () => {
    expect(applyBrightnessToGray(0, 25)).toBeCloseTo(0);
    expect(applyBrightnessToGray(128, 25)).toBeCloseTo(64);
    expect(applyBrightnessToGray(200, 25)).toBeCloseTo(100);
  });

  it('brightness 75: pushes toward 255 (halfway to white)', () => {
    // gray + (255 - gray) * 0.5
    expect(applyBrightnessToGray(0, 75)).toBeCloseTo(127.5);
    expect(applyBrightnessToGray(128, 75)).toBeCloseTo(191.5);
    expect(applyBrightnessToGray(255, 75)).toBeCloseTo(255);
  });

  it('uses darken formula for slider <= 50', () => {
    // slider=40: adjustedGray = gray * (40/50) = gray * 0.8
    expect(applyBrightnessToGray(100, 40)).toBeCloseTo(80);
    expect(applyBrightnessToGray(200, 40)).toBeCloseTo(160);
  });

  it('uses lighten formula for slider > 50', () => {
    // slider=80: adjustedGray = gray + (255-gray) * (30/50) = gray + (255-gray) * 0.6
    expect(applyBrightnessToGray(0, 80)).toBeCloseTo(153);
    expect(applyBrightnessToGray(255, 80)).toBeCloseTo(255);
  });
});

// ─── processPixelDataWithBrightness ──────────────────────────────────────────

describe('quantize2Levels', () => {
  it('quantizes values below 128 to 0', () => {
    expect(quantize2Levels(0)).toBe(0);
    expect(quantize2Levels(64)).toBe(0);
    expect(quantize2Levels(127)).toBe(0);
  });

  it('quantizes values at or above 128 to 4095', () => {
    expect(quantize2Levels(128)).toBe(4095);
    expect(quantize2Levels(191)).toBe(4095);
    expect(quantize2Levels(255)).toBe(4095);
  });

  it('output is always 0 or 4095 for all inputs', () => {
    for (let gray = 0; gray <= 255; gray++) {
      const result = quantize2Levels(gray);
      expect(result === 0 || result === 4095).toBe(true);
    }
  });
});

describe('processPixelDataWithBrightness', () => {
  /** Build a Uint8ClampedArray of 169 pixels all set to the given gray level. */
  function makeGrayPixelData(gray) {
    const data = new Uint8ClampedArray(TOTAL_CELLS * 4);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      data[i * 4] = gray;
      data[i * 4 + 1] = gray;
      data[i * 4 + 2] = gray;
      data[i * 4 + 3] = 255;
    }
    return data;
  }

  it('default (only2Colors=false) always quantizes to 5 levels', () => {
    const data = makeGrayPixelData(150);
    const grid = processPixelDataWithBrightness(data, 50, false);
    const validLevels = new Set([0, 1024, 2048, 3072, 4095]);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(validLevels.has(grid[i])).toBe(true);
      }
    }
  });

  it('brightness=0: all active cells are 0 (all black)', () => {
    const data = makeGrayPixelData(200);
    const grid = processPixelDataWithBrightness(data, 0, false);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(grid[i]).toBe(0);
      }
    }
  });

  it('brightness=100: all active cells are 4095 (all white)', () => {
    const data = makeGrayPixelData(100);
    const grid = processPixelDataWithBrightness(data, 100, false);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(grid[i]).toBe(4095);
      }
    }
  });

  it('only2Colors=true: all active values are 0 or 4095', () => {
    const data = makeGrayPixelData(150);
    const grid = processPixelDataWithBrightness(data, 50, true);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(grid[i] === 0 || grid[i] === 4095).toBe(true);
      }
    }
  });

  it('only2Colors=false: never produces continuous (non-5-level) values', () => {
    const data = makeGrayPixelData(100);
    const grid = processPixelDataWithBrightness(data, 50, false);
    const validLevels = new Set([0, 1024, 2048, 3072, 4095]);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(validLevels.has(grid[i])).toBe(true);
      }
    }
  });

  it('applies circular mask: inactive positions are 0', () => {
    const data = makeGrayPixelData(255);
    const grid = processPixelDataWithBrightness(data, 50, false);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!CIRCULAR_MASK[i]) {
        expect(grid[i]).toBe(0);
      }
    }
  });

  it('throws error for wrong data size', () => {
    const badData = new Uint8ClampedArray(100);
    expect(() => processPixelDataWithBrightness(badData, 50, false)).toThrow();
  });

  it('returns 169-element array', () => {
    const data = makeGrayPixelData(128);
    const grid = processPixelDataWithBrightness(data, 50, false);
    expect(grid).toHaveLength(TOTAL_CELLS);
  });

  it('defaults: brightness=50, only2Colors=false produces 5-level quantized output', () => {
    const data = makeGrayPixelData(128);
    const grid = processPixelDataWithBrightness(data);
    const validLevels = new Set([0, 1024, 2048, 3072, 4095]);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(validLevels.has(grid[i])).toBe(true);
      }
    }
  });
});

// ─── adjustContrast ───────────────────────────────────────────────────────────

describe('adjustContrast', () => {
  it('contrastSlider=50: returns gray unchanged (identity transform)', () => {
    expect(adjustContrast(0, 50)).toBe(0);
    expect(adjustContrast(128, 50)).toBe(128);
    expect(adjustContrast(255, 50)).toBe(255);
    expect(adjustContrast(64, 50)).toBe(64);
    expect(adjustContrast(191, 50)).toBe(191);
  });

  it('contrastSlider=0: all values collapse to midpoint (128)', () => {
    // midpoint = 127.5, factor = 0 → output = 127.5 → round = 128
    expect(adjustContrast(0, 0)).toBe(128);
    expect(adjustContrast(128, 0)).toBe(128);
    expect(adjustContrast(255, 0)).toBe(128);
    expect(adjustContrast(64, 0)).toBe(128);
  });

  it('contrastSlider=100: double contrast (factor=2)', () => {
    // base=0: 127.5 + (0 - 127.5)*2 = 127.5 - 255 = -127.5 → clamped to 0
    expect(adjustContrast(0, 100)).toBe(0);
    // base=255: 127.5 + (255 - 127.5)*2 = 127.5 + 255 = 382.5 → clamped to 255
    expect(adjustContrast(255, 100)).toBe(255);
    // base=128: 127.5 + (128 - 127.5)*2 = 127.5 + 1 = 128.5 → round = 129
    expect(adjustContrast(128, 100)).toBe(129);
    // base=64: 127.5 + (64 - 127.5)*2 = 127.5 - 127 = 0.5 → round = 1
    expect(adjustContrast(64, 100)).toBe(1);
  });

  it('output is clamped to [0, 255]', () => {
    // Extreme inputs at high contrast
    expect(adjustContrast(0, 100)).toBeGreaterThanOrEqual(0);
    expect(adjustContrast(255, 100)).toBeLessThanOrEqual(255);
    // Low contrast: stays in range
    expect(adjustContrast(0, 25)).toBeGreaterThanOrEqual(0);
    expect(adjustContrast(255, 25)).toBeLessThanOrEqual(255);
  });

  it('result is always an integer', () => {
    const testCases = [
      [0, 0],
      [64, 25],
      [128, 50],
      [191, 75],
      [255, 100],
      [100, 33],
    ];
    for (const [gray, slider] of testCases) {
      const result = adjustContrast(gray, slider);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it('contrastSlider=25: half contrast (factor=0.5, values move toward midpoint)', () => {
    // base=0: 127.5 + (0 - 127.5)*0.5 = 127.5 - 63.75 = 63.75 → 64
    expect(adjustContrast(0, 25)).toBe(64);
    // base=255: 127.5 + (255 - 127.5)*0.5 = 127.5 + 63.75 = 191.25 → 191
    expect(adjustContrast(255, 25)).toBe(191);
  });
});

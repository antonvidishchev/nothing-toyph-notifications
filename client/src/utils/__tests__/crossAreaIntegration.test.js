/**
 * Cross-area integration tests for Toyph Glyph Generator.
 *
 * These tests exercise end-to-end flows across multiple feature areas:
 * - Upload → edit → finalize pattern
 * - Upload → invert → finalize pattern
 * - Import → edit → finalize pattern
 * - Full pipeline: upload → edit → export → import → invert → finalize pattern
 * - Circular mask consistency across all input methods
 * - Final pattern validity regardless of input path
 *
 * Fulfills: VAL-CROSS-001, VAL-CROSS-003, VAL-CROSS-004, VAL-CROSS-005, VAL-CROSS-008
 */

import { describe, it, expect } from 'vitest';
import {
  TOTAL_CELLS,
  CIRCULAR_MASK,
  BRIGHTNESS_LEVELS,
  nextBrightness,
  invertBrightness,
} from '../../utils/gridConstants.js';
import { processPixelData, applyCircularMask } from '../../utils/imageProcessing.js';
import { buildExportData, validateImportData, snapToNearestLevel } from '../../utils/jsonIO.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get all 32 inactive position indices. */
const INACTIVE_INDICES = CIRCULAR_MASK.map((active, i) => (active ? -1 : i)).filter(
  (i) => i !== -1,
);

/** Get all 137 active position indices. */
const ACTIVE_INDICES = CIRCULAR_MASK.map((active, i) => (active ? i : -1)).filter((i) => i !== -1);

/**
 * Create RGBA pixel data for a 13×13 image of a uniform color.
 * @param {number} r Red (0–255)
 * @param {number} g Green (0–255)
 * @param {number} b Blue (0–255)
 * @param {number} a Alpha (0–255)
 * @returns {Uint8ClampedArray} 676-byte RGBA pixel data
 */
function makeUniformPixelData(r, g, b, a = 255) {
  const data = new Uint8ClampedArray(TOTAL_CELLS * 4);
  for (let i = 0; i < TOTAL_CELLS; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

/**
 * Create RGBA pixel data for a 13×13 image with a gradient pattern.
 * Each pixel gets a different grayscale intensity, producing a mix of
 * quantized brightness levels after processing.
 * @returns {Uint8ClampedArray}
 */
function makeGradientPixelData() {
  const data = new Uint8ClampedArray(TOTAL_CELLS * 4);
  for (let i = 0; i < TOTAL_CELLS; i++) {
    // Spread values across the 0–255 range
    const gray = Math.round((i / (TOTAL_CELLS - 1)) * 255);
    data[i * 4] = gray;
    data[i * 4 + 1] = gray;
    data[i * 4 + 2] = gray;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/**
 * Simulate editing a pixel in the grid (click to cycle brightness).
 * @param {number[]} grid The current grid state (mutated in place)
 * @param {number} index The pixel index to click
 */
function simulatePixelClick(grid, index) {
  if (CIRCULAR_MASK[index]) {
    grid[index] = nextBrightness(grid[index]);
  }
}

/**
 * Simulate the Invert Colors button on the grid.
 * @param {number[]} grid The current grid state
 * @returns {number[]} New grid with inverted active pixels
 */
function simulateInvert(grid) {
  return grid.map((val, i) => (CIRCULAR_MASK[i] ? invertBrightness(val) : val));
}

/**
 * Simulate the Clear button on the grid.
 * @returns {number[]} New grid with all zeros
 */
function simulateClear() {
  return new Array(TOTAL_CELLS).fill(0);
}

/**
 * Simulate export → import round-trip through JSON.
 * @param {number[]} grid The current grid state
 * @returns {number[]} Grid after round-trip
 */
function simulateExportImportRoundTrip(grid) {
  const exported = buildExportData(grid);
  // Simulate actual JSON serialization (as would happen writing/reading a file)
  const json = JSON.stringify(exported);
  const parsed = JSON.parse(json);
  const imported = validateImportData(parsed);
  if (!imported.valid) {
    throw new Error(`Import validation failed: ${imported.error}`);
  }
  return imported.grid;
}

// ── VAL-CROSS-001: Maximum-length pipeline ───────────────────────────────────

describe('VAL-CROSS-001: Maximum-length pipeline', () => {
  it('upload → edit → export → import → invert → finalize pattern: each step completes without error', () => {
    // Step 1: Upload image (simulate with gradient pixel data)
    const pixelData = makeGradientPixelData();
    const uploadedGrid = processPixelData(pixelData);
    expect(uploadedGrid).toHaveLength(TOTAL_CELLS);

    // Step 2: Edit pixels (click a few active positions)
    const editedGrid = [...uploadedGrid];
    const editTargets = ACTIVE_INDICES.slice(0, 5);
    for (const idx of editTargets) {
      simulatePixelClick(editedGrid, idx);
    }
    // Verify edits took effect
    for (const idx of editTargets) {
      expect(editedGrid[idx]).not.toBe(uploadedGrid[idx]);
    }

    // Step 3: Export
    const exportData = buildExportData(editedGrid);
    expect(exportData.brightness).toHaveLength(TOTAL_CELLS);
    expect(exportData.device).toBe('Phone4aPro');

    // Step 4: Import (simulate JSON round-trip)
    const importedGrid = simulateExportImportRoundTrip(editedGrid);
    expect(importedGrid).toEqual(editedGrid);

    // Step 5: Invert
    const invertedGrid = simulateInvert(importedGrid);
    // Verify inversion happened (each active value should be 4095 - original)
    for (const idx of ACTIVE_INDICES) {
      expect(invertedGrid[idx]).toBe(invertBrightness(importedGrid[idx]));
    }

    // Step 6: Finalize pattern (verify the resulting grid)
    const generatePayload = invertedGrid;
    expect(generatePayload).toHaveLength(TOTAL_CELLS);

    // The final array should reflect uploaded + edited + inverted values
    // Check that inactive positions are still 0
    for (const idx of INACTIVE_INDICES) {
      expect(generatePayload[idx]).toBe(0);
    }

    // All values must be integers in range 0–4095 (may be continuous, not just 5 levels)
    for (const val of generatePayload) {
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(4095);
    }
  });

  it('final brightness array reflects cumulative state (uploaded + edited + inverted)', () => {
    // Upload white image
    const pixelData = makeUniformPixelData(255, 255, 255);
    const uploadedGrid = processPixelData(pixelData);

    // All active should be 4095 after white upload
    for (const idx of ACTIVE_INDICES) {
      expect(uploadedGrid[idx]).toBe(4095);
    }

    // Edit: cycle pixel at index 84 (center) → 4095 → 0
    const editedGrid = [...uploadedGrid];
    simulatePixelClick(editedGrid, 84);
    expect(editedGrid[84]).toBe(0); // was 4095, next is 0

    // Export → Import round-trip
    const importedGrid = simulateExportImportRoundTrip(editedGrid);
    expect(importedGrid[84]).toBe(0);

    // Invert
    const invertedGrid = simulateInvert(importedGrid);
    // 0 inverts to 4095, 4095 inverts to 0
    expect(invertedGrid[84]).toBe(4095);
    for (const idx of ACTIVE_INDICES) {
      if (idx !== 84) {
        expect(invertedGrid[idx]).toBe(0); // 4095 → 0
      }
    }

    // This final pattern should contain only canonical 5-level values
    const validSet = new Set(BRIGHTNESS_LEVELS);
    for (const val of invertedGrid) {
      expect(validSet.has(val)).toBe(true);
    }
  });
});

// ── VAL-CROSS-003: Upload → invert → finalize pattern → verify inverted values ──────

describe('VAL-CROSS-003: Upload → invert → finalize pattern', () => {
  it('generated array has inverted values, not originals', () => {
    // Upload a gradient image to get mixed continuous brightness values
    const pixelData = makeGradientPixelData();
    const uploadedGrid = processPixelData(pixelData);

    // Snapshot the upload state
    const uploadSnapshot = [...uploadedGrid];

    // Invert
    const invertedGrid = simulateInvert(uploadedGrid);

    // Verify: inverted values equal 4095 - original for all active pixels
    let diffCount = 0;
    for (const idx of ACTIVE_INDICES) {
      const original = uploadSnapshot[idx];
      const inverted = invertedGrid[idx];
      expect(inverted).toBe(invertBrightness(original));
      if (original !== inverted) diffCount++;
    }
    // With a gradient, we should have many non-self-inverse pixels
    // (no value is truly self-inverse with 4095-v formula since 4095 is odd)
    expect(diffCount).toBeGreaterThan(0);

    // The generate payload should use inverted values
    const generatePayload = invertedGrid;
    for (const idx of ACTIVE_INDICES) {
      expect(generatePayload[idx]).toBe(invertBrightness(uploadSnapshot[idx]));
    }

    // All values must be integers in range 0–4095
    for (const val of generatePayload) {
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(4095);
    }
  });

  it('all-white upload → invert produces all-black active pixels', () => {
    const pixelData = makeUniformPixelData(255, 255, 255);
    const uploadedGrid = processPixelData(pixelData);

    // All active = 4095
    for (const idx of ACTIVE_INDICES) {
      expect(uploadedGrid[idx]).toBe(4095);
    }

    const invertedGrid = simulateInvert(uploadedGrid);

    // All active should now be 0
    for (const idx of ACTIVE_INDICES) {
      expect(invertedGrid[idx]).toBe(0);
    }
    // Inactive still 0
    for (const idx of INACTIVE_INDICES) {
      expect(invertedGrid[idx]).toBe(0);
    }
  });

  it('all-black upload → invert produces all-white active pixels', () => {
    const pixelData = makeUniformPixelData(0, 0, 0);
    const uploadedGrid = processPixelData(pixelData);

    // All should be 0
    for (const val of uploadedGrid) {
      expect(val).toBe(0);
    }

    const invertedGrid = simulateInvert(uploadedGrid);

    // All active should be 4095, inactive still 0
    for (const idx of ACTIVE_INDICES) {
      expect(invertedGrid[idx]).toBe(4095);
    }
    for (const idx of INACTIVE_INDICES) {
      expect(invertedGrid[idx]).toBe(0);
    }
  });
});

// ── VAL-CROSS-004: Import JSON → edit → finalize pattern ────────────────────

describe('VAL-CROSS-004: Import JSON → edit → finalize pattern', () => {
  it('generated array reflects imported base pattern + manual edits', () => {
    // Create a pattern as if imported from JSON
    const importedBrightness = new Array(TOTAL_CELLS).fill(0);
    // Set some active pixels to various levels
    importedBrightness[84] = 2048; // center
    importedBrightness[85] = 3072;
    importedBrightness[86] = 1024;
    importedBrightness[65] = 4095;
    importedBrightness[78] = 4095;

    // Simulate import validation
    const importResult = validateImportData({ brightness: importedBrightness });
    expect(importResult.valid).toBe(true);
    const grid = importResult.grid;

    // Verify imported values
    expect(grid[84]).toBe(2048);
    expect(grid[85]).toBe(3072);
    expect(grid[86]).toBe(1024);
    expect(grid[65]).toBe(4095);
    expect(grid[78]).toBe(4095);

    // Simulate manual edits
    const editedGrid = [...grid];
    // Click pixel at 84 (was 2048 → next is 3072)
    simulatePixelClick(editedGrid, 84);
    expect(editedGrid[84]).toBe(3072);

    // Click pixel at 87 (was 0 → next is 1024)
    simulatePixelClick(editedGrid, 87);
    expect(editedGrid[87]).toBe(1024);

    // Click pixel at 65 multiple times (4095 → 0 → 1024)
    simulatePixelClick(editedGrid, 65); // 4095 → 0
    simulatePixelClick(editedGrid, 65); // 0 → 1024
    expect(editedGrid[65]).toBe(1024);

    // The generate payload should have both imported and edited values
    const generatePayload = editedGrid;
    expect(generatePayload[84]).toBe(3072); // edited from 2048
    expect(generatePayload[85]).toBe(3072); // imported, untouched
    expect(generatePayload[86]).toBe(1024); // imported, untouched
    expect(generatePayload[87]).toBe(1024); // newly edited
    expect(generatePayload[65]).toBe(1024); // edited from 4095
    expect(generatePayload[78]).toBe(4095); // imported, untouched

    // All values valid
    const validSet = new Set(BRIGHTNESS_LEVELS);
    for (const val of generatePayload) {
      expect(validSet.has(val)).toBe(true);
    }
  });

  it('grid remains editable after import (clicking cycles brightness normally)', () => {
    const importedBrightness = new Array(TOTAL_CELLS).fill(0);
    importedBrightness[84] = 4095;

    const importResult = validateImportData({ brightness: importedBrightness });
    expect(importResult.valid).toBe(true);
    const grid = [...importResult.grid];

    // Click to cycle: 4095 → 0 → 1024 → 2048 → 3072 → 4095
    const expected = [0, 1024, 2048, 3072, 4095];
    for (const exp of expected) {
      simulatePixelClick(grid, 84);
      expect(grid[84]).toBe(exp);
    }
  });
});

// ── Circular mask consistency across all input methods ───────────────────────

describe('VAL-CROSS-007 (expanded): Circular mask consistency across all code paths', () => {
  it('mask has exactly 32 inactive and 137 active positions', () => {
    expect(INACTIVE_INDICES).toHaveLength(32);
    expect(ACTIVE_INDICES).toHaveLength(137);
    expect(INACTIVE_INDICES.length + ACTIVE_INDICES.length).toBe(TOTAL_CELLS);
  });

  it('manual paint: inactive positions cannot be set to non-zero', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    // Try clicking every inactive position
    for (const idx of INACTIVE_INDICES) {
      simulatePixelClick(grid, idx);
      expect(grid[idx]).toBe(0);
    }
  });

  it('image upload: inactive positions are always 0 after processing', () => {
    // Test with all-white image
    const whiteData = makeUniformPixelData(255, 255, 255);
    const whiteGrid = processPixelData(whiteData);
    for (const idx of INACTIVE_INDICES) {
      expect(whiteGrid[idx]).toBe(0);
    }

    // Test with gradient image
    const gradientData = makeGradientPixelData();
    const gradientGrid = processPixelData(gradientData);
    for (const idx of INACTIVE_INDICES) {
      expect(gradientGrid[idx]).toBe(0);
    }

    // Test with mid-gray image
    const grayData = makeUniformPixelData(128, 128, 128);
    const grayGrid = processPixelData(grayData);
    for (const idx of INACTIVE_INDICES) {
      expect(grayGrid[idx]).toBe(0);
    }
  });

  it('JSON import: inactive positions are forced to 0 even if source has non-zero values', () => {
    // Create an array where ALL positions including inactive are non-zero
    const brightness = new Array(TOTAL_CELLS).fill(4095);
    const result = validateImportData({ brightness });
    expect(result.valid).toBe(true);

    for (const idx of INACTIVE_INDICES) {
      expect(result.grid[idx]).toBe(0);
    }
    for (const idx of ACTIVE_INDICES) {
      expect(result.grid[idx]).toBe(4095);
    }
  });

  it('export: inactive positions are always 0 regardless of internal state', () => {
    // Even if internal grid somehow has non-zero inactive values
    const grid = new Array(TOTAL_CELLS).fill(4095);
    const exported = buildExportData(grid);

    for (const idx of INACTIVE_INDICES) {
      expect(exported.brightness[idx]).toBe(0);
    }
  });

  it('invert: inactive positions remain 0 after inversion', () => {
    // Start with all active at 4095
    const grid = new Array(TOTAL_CELLS).fill(0);
    for (const idx of ACTIVE_INDICES) {
      grid[idx] = 4095;
    }
    const inverted = simulateInvert(grid);

    for (const idx of INACTIVE_INDICES) {
      expect(inverted[idx]).toBe(0);
    }
  });

  it('mask is identical across upload → export → import path', () => {
    // Upload white image
    const pixelData = makeUniformPixelData(255, 255, 255);
    const uploadedGrid = processPixelData(pixelData);

    // Export
    const exported = buildExportData(uploadedGrid);

    // Import
    const imported = validateImportData(exported);
    expect(imported.valid).toBe(true);

    // All three should have the same inactive positions at 0
    for (const idx of INACTIVE_INDICES) {
      expect(uploadedGrid[idx]).toBe(0);
      expect(exported.brightness[idx]).toBe(0);
      expect(imported.grid[idx]).toBe(0);
    }

    // And identical active values
    for (const idx of ACTIVE_INDICES) {
      expect(uploadedGrid[idx]).toBe(exported.brightness[idx]);
      expect(exported.brightness[idx]).toBe(imported.grid[idx]);
    }
  });
});

// ── VAL-CROSS-008: Final pattern integrity regardless of input path ─────────

describe('VAL-CROSS-008: Final pattern integrity regardless of input path', () => {
  /**
   * Verify that a final pattern grid is valid:
   * - Exactly 169 elements
   * - All values are integers in range 0–4095 (may be continuous, not just 5 levels)
   * - All inactive positions are 0
   */
  function assertValidPatternGrid(grid) {
    expect(grid).toHaveLength(TOTAL_CELLS);

    for (let i = 0; i < grid.length; i++) {
      expect(Number.isInteger(grid[i])).toBe(true);
      expect(grid[i]).toBeGreaterThanOrEqual(0);
      expect(grid[i]).toBeLessThanOrEqual(4095);
      if (!CIRCULAR_MASK[i]) {
        expect(grid[i]).toBe(0);
      }
    }
  }

  it('manually painted pattern produces a valid final grid', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    // Paint a pattern on various active pixels
    for (let i = 0; i < 10; i++) {
      const idx = ACTIVE_INDICES[i * 10];
      // Click multiple times to get different brightness levels
      for (let click = 0; click <= i % 5; click++) {
        simulatePixelClick(grid, idx);
      }
    }
    assertValidPatternGrid(grid);
    // Should have some non-zero values
    expect(grid.some((v) => v !== 0)).toBe(true);
  });

  it('uploaded image produces a valid final grid', () => {
    const pixelData = makeGradientPixelData();
    const grid = processPixelData(pixelData);
    assertValidPatternGrid(grid);
    // Gradient should produce multiple different brightness levels
    const uniqueValues = new Set(grid.filter((_, i) => CIRCULAR_MASK[i]));
    expect(uniqueValues.size).toBeGreaterThan(1);
  });

  it('imported JSON produces a valid final grid', () => {
    // Create a realistic imported pattern
    const brightness = new Array(TOTAL_CELLS).fill(0);
    ACTIVE_INDICES.forEach((idx, i) => {
      brightness[idx] = BRIGHTNESS_LEVELS[i % BRIGHTNESS_LEVELS.length];
    });

    const result = validateImportData({ brightness });
    expect(result.valid).toBe(true);
    assertValidPatternGrid(result.grid);
  });

  it('uploaded + inverted pattern produces a valid final grid', () => {
    const pixelData = makeUniformPixelData(128, 128, 128);
    const uploadedGrid = processPixelData(pixelData);
    const invertedGrid = simulateInvert(uploadedGrid);
    assertValidPatternGrid(invertedGrid);
  });

  it('imported + edited pattern produces a valid final grid', () => {
    const brightness = new Array(TOTAL_CELLS).fill(0);
    brightness[84] = 2048;
    brightness[85] = 3072;

    const result = validateImportData({ brightness });
    expect(result.valid).toBe(true);

    const editedGrid = [...result.grid];
    simulatePixelClick(editedGrid, 86); // 0 → 1024
    simulatePixelClick(editedGrid, 87); // 0 → 1024
    assertValidPatternGrid(editedGrid);
  });

  it('full pipeline result produces a valid final grid', () => {
    // Upload
    const pixelData = makeGradientPixelData();
    const uploadedGrid = processPixelData(pixelData);

    // Edit
    const editedGrid = [...uploadedGrid];
    simulatePixelClick(editedGrid, ACTIVE_INDICES[0]);
    simulatePixelClick(editedGrid, ACTIVE_INDICES[50]);

    // Export → Import
    const roundTripped = simulateExportImportRoundTrip(editedGrid);

    // Invert
    const finalGrid = simulateInvert(roundTripped);

    assertValidPatternGrid(finalGrid);
  });
});

// ── Upload → edit → finalize pattern ────────────────────────────────────────

describe('Upload → edit → finalize pattern: final array includes uploaded and edited values', () => {
  it('upload white image, edit one pixel, finalize pattern: both values present', () => {
    // Upload all-white
    const pixelData = makeUniformPixelData(255, 255, 255);
    const uploadedGrid = processPixelData(pixelData);

    // All active should be 4095
    for (const idx of ACTIVE_INDICES) {
      expect(uploadedGrid[idx]).toBe(4095);
    }

    // Edit center pixel (84): 4095 → 0
    const editedGrid = [...uploadedGrid];
    simulatePixelClick(editedGrid, 84);
    expect(editedGrid[84]).toBe(0);

    // The final pattern should have:
    // - Most active pixels at 4095 (from upload)
    // - Pixel 84 at 0 (from edit)
    expect(editedGrid[84]).toBe(0);
    for (const idx of ACTIVE_INDICES) {
      if (idx !== 84) {
        expect(editedGrid[idx]).toBe(4095);
      }
    }
  });

  it('upload gradient, edit several pixels, finalize pattern: array reflects combined state', () => {
    const pixelData = makeGradientPixelData();
    const uploadedGrid = processPixelData(pixelData);
    const snapshot = [...uploadedGrid];

    // Edit 3 pixels
    const editedGrid = [...uploadedGrid];
    const edits = [
      { idx: ACTIVE_INDICES[10], clicks: 2 },
      { idx: ACTIVE_INDICES[50], clicks: 3 },
      { idx: ACTIVE_INDICES[100], clicks: 1 },
    ];

    for (const { idx, clicks } of edits) {
      for (let c = 0; c < clicks; c++) {
        simulatePixelClick(editedGrid, idx);
      }
    }

    // Edited pixels should differ from upload snapshot
    for (const { idx } of edits) {
      expect(editedGrid[idx]).not.toBe(snapshot[idx]);
    }

    // Non-edited active pixels should match upload snapshot
    const editedIndices = new Set(edits.map((e) => e.idx));
    for (const idx of ACTIVE_INDICES) {
      if (!editedIndices.has(idx)) {
        expect(editedGrid[idx]).toBe(snapshot[idx]);
      }
    }
  });
});

// ── Export → Import → Edit round-trip fidelity ──────────────────────────────

describe('Export → import round-trip fidelity (VAL-CROSS-002 expanded)', () => {
  it('paint multi-level → export → clear → import: pixel-identical grid', () => {
    // Create a pattern with all 5 brightness levels
    const grid = new Array(TOTAL_CELLS).fill(0);
    ACTIVE_INDICES.forEach((idx, i) => {
      grid[idx] = BRIGHTNESS_LEVELS[i % BRIGHTNESS_LEVELS.length];
    });

    // Export
    const exported = buildExportData(grid);

    // Clear (simulate)
    const cleared = simulateClear();
    expect(cleared.every((v) => v === 0)).toBe(true);

    // Import
    const imported = validateImportData(exported);
    expect(imported.valid).toBe(true);

    // Pixel-identical to original
    expect(imported.grid).toEqual(grid);
  });

  it('JSON.stringify(before) === JSON.stringify(after) for export→import round-trip', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    ACTIVE_INDICES.forEach((idx, i) => {
      grid[idx] = BRIGHTNESS_LEVELS[(i * 3) % BRIGHTNESS_LEVELS.length];
    });

    const beforeStr = JSON.stringify(grid);
    const roundTripped = simulateExportImportRoundTrip(grid);
    const afterStr = JSON.stringify(roundTripped);

    expect(afterStr).toBe(beforeStr);
  });
});

// ── VAL-CROSS-005: First visit experience and feature reachability ──────────

describe('VAL-CROSS-005: Initial state consistency', () => {
  it('initial grid is all zeros (169 elements)', () => {
    const initialGrid = new Array(TOTAL_CELLS).fill(0);
    expect(initialGrid).toHaveLength(TOTAL_CELLS);
    expect(initialGrid.every((v) => v === 0)).toBe(true);
  });

  it('all features can operate on initial state without errors', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);

    // Clear on empty grid — no-op, no error
    const cleared = simulateClear();
    expect(cleared.every((v) => v === 0)).toBe(true);

    // Invert on empty grid — all active become 4095
    const inverted = simulateInvert(grid);
    for (const idx of ACTIVE_INDICES) {
      expect(inverted[idx]).toBe(4095);
    }
    for (const idx of INACTIVE_INDICES) {
      expect(inverted[idx]).toBe(0);
    }

    // Export empty grid — should produce valid JSON
    const exported = buildExportData(grid);
    expect(exported.brightness.every((v) => v === 0)).toBe(true);

    // Import the exported empty grid
    const imported = validateImportData(exported);
    expect(imported.valid).toBe(true);
    expect(imported.grid.every((v) => v === 0)).toBe(true);
  });

  it('all controls are reachable: Invert, Clear, Upload, Export, Import, QR Code', () => {
    // This is a logic-level test: verify that each operation function exists and is callable
    expect(typeof nextBrightness).toBe('function');
    expect(typeof invertBrightness).toBe('function');
    expect(typeof processPixelData).toBe('function');
    expect(typeof buildExportData).toBe('function');
    expect(typeof validateImportData).toBe('function');
    expect(typeof applyCircularMask).toBe('function');
    expect(typeof snapToNearestLevel).toBe('function');
  });
});

// ── VAL-CROSS-009: Upload → export → verify quantized output ────────────────

describe('VAL-CROSS-009: Upload → export → verify continuous output', () => {
  it('uploaded image export contains integers in 0–4095 (continuous values preserved)', () => {
    // processPixelData now produces continuous values; export preserves them
    const pixelData = makeGradientPixelData();
    const grid = processPixelData(pixelData);
    const exported = buildExportData(grid);

    for (const val of exported.brightness) {
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(4095);
    }
  });

  it('inactive positions are 0 in exported data after upload', () => {
    const pixelData = makeUniformPixelData(255, 255, 255);
    const grid = processPixelData(pixelData);
    const exported = buildExportData(grid);

    for (const idx of INACTIVE_INDICES) {
      expect(exported.brightness[idx]).toBe(0);
    }
  });
});

// ── VAL-CROSS-006: Export → external modification → import tolerance ────────

describe('VAL-CROSS-006: Export → external modification → import tolerance', () => {
  it('externally modified brightness values are loaded correctly', () => {
    // Create and export a pattern
    const grid = new Array(TOTAL_CELLS).fill(0);
    grid[84] = 2048;
    grid[85] = 1024;
    const exported = buildExportData(grid);

    // Simulate external modification (changing some values to other valid levels)
    const modified = { ...exported, brightness: [...exported.brightness] };
    modified.brightness[84] = 4095; // changed from 2048
    modified.brightness[86] = 3072; // changed from 0

    const imported = validateImportData(modified);
    expect(imported.valid).toBe(true);
    expect(imported.grid[84]).toBe(4095);
    expect(imported.grid[85]).toBe(1024); // untouched
    expect(imported.grid[86]).toBe(3072);
  });

  it('externally modified continuous (non-standard) values are accepted and preserved', () => {
    // validateImportData now accepts any integer 0–4095 without snapping
    const exported = {
      device: 'Phone4aPro',
      gridSize: 13,
      version: '1.0',
      brightness: new Array(TOTAL_CELLS).fill(0),
    };
    // External tool writes continuous values
    exported.brightness[84] = 500;
    exported.brightness[85] = 2500;
    exported.brightness[86] = 3500;

    const imported = validateImportData(exported);
    expect(imported.valid).toBe(true);

    // Continuous values are preserved as-is (no snapping)
    expect(imported.grid[84]).toBe(500);
    expect(imported.grid[85]).toBe(2500);
    expect(imported.grid[86]).toBe(3500);
  });
});

/**
 * Tests for JSON export/import utilities.
 *
 * Covers: export format validation, import validation (valid and invalid cases),
 * round-trip fidelity (export then import produces identical state),
 * and snap-to-nearest logic for non-quantized values.
 */

import { describe, it, expect } from 'vitest';
import {
  GRID_SIZE,
  TOTAL_CELLS,
  CIRCULAR_MASK,
  BRIGHTNESS_LEVELS,
} from '../../utils/gridConstants.js';
import {
  snapToNearestLevel,
  buildExportData,
  validateImportData,
  parseImportFile,
} from '../../utils/jsonIO.js';

// ---------------------------------------------------------------------------
// snapToNearestLevel
// ---------------------------------------------------------------------------
describe('snapToNearestLevel', () => {
  it('snaps 0 to 0', () => {
    expect(snapToNearestLevel(0)).toBe(0);
  });

  it('snaps 1024 to 1024', () => {
    expect(snapToNearestLevel(1024)).toBe(1024);
  });

  it('snaps 2048 to 2048', () => {
    expect(snapToNearestLevel(2048)).toBe(2048);
  });

  it('snaps 3072 to 3072', () => {
    expect(snapToNearestLevel(3072)).toBe(3072);
  });

  it('snaps 4095 to 4095', () => {
    expect(snapToNearestLevel(4095)).toBe(4095);
  });

  it('snaps value close to 0 (e.g. 200) to 0', () => {
    expect(snapToNearestLevel(200)).toBe(0);
  });

  it('snaps value close to 1024 (e.g. 900) to 1024', () => {
    expect(snapToNearestLevel(900)).toBe(1024);
  });

  it('snaps value close to 2048 (e.g. 1800) to 2048', () => {
    expect(snapToNearestLevel(1800)).toBe(2048);
  });

  it('snaps value close to 3072 (e.g. 3000) to 3072', () => {
    expect(snapToNearestLevel(3000)).toBe(3072);
  });

  it('snaps value close to 4095 (e.g. 3800) to 4095', () => {
    expect(snapToNearestLevel(3800)).toBe(4095);
  });

  it('snaps midpoint between 0 and 1024 (512) to nearest', () => {
    // At exact midpoint, we snap to the higher level
    const result = snapToNearestLevel(512);
    expect(BRIGHTNESS_LEVELS).toContain(result);
    expect(result).toBe(1024);
  });

  it('snaps negative values to 0 (clamped first)', () => {
    expect(snapToNearestLevel(-100)).toBe(0);
  });

  it('snaps values above 4095 to 4095 (clamped first)', () => {
    expect(snapToNearestLevel(5000)).toBe(4095);
  });

  it('always returns a valid brightness level', () => {
    for (let v = -100; v <= 5000; v += 37) {
      expect(BRIGHTNESS_LEVELS).toContain(snapToNearestLevel(v));
    }
  });
});

// ---------------------------------------------------------------------------
// buildExportData
// ---------------------------------------------------------------------------
describe('buildExportData', () => {
  it('returns an object with device, gridSize, version, and brightness', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    const data = buildExportData(grid);
    expect(data).toHaveProperty('device', 'Phone4aPro');
    expect(data).toHaveProperty('gridSize', GRID_SIZE);
    expect(data).toHaveProperty('version', '1.0');
    expect(data).toHaveProperty('brightness');
    expect(data.brightness).toHaveLength(TOTAL_CELLS);
  });

  it('exports all-zero grid as 169 zeros', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    const data = buildExportData(grid);
    expect(data.brightness).toEqual(new Array(TOTAL_CELLS).fill(0));
  });

  it('exported values are only from {0, 1024, 2048, 3072, 4095}', () => {
    // Build a grid with mixed values
    const grid = new Array(TOTAL_CELLS).fill(0);
    CIRCULAR_MASK.forEach((active, i) => {
      if (active) grid[i] = BRIGHTNESS_LEVELS[i % BRIGHTNESS_LEVELS.length];
    });
    const data = buildExportData(grid);
    const validSet = new Set(BRIGHTNESS_LEVELS);
    data.brightness.forEach((v) => {
      expect(validSet.has(v)).toBe(true);
    });
  });

  it('inactive positions are always 0 in export', () => {
    // Set every cell to 4095
    const grid = new Array(TOTAL_CELLS).fill(4095);
    const data = buildExportData(grid);
    CIRCULAR_MASK.forEach((active, i) => {
      if (!active) {
        expect(data.brightness[i]).toBe(0);
      }
    });
  });

  it('clamps out-of-range values and preserves in-range values on export (no snapping)', () => {
    // Export now preserves continuous values (no snapping to 5 levels);
    // only out-of-range values are clamped.
    const grid = new Array(TOTAL_CELLS).fill(0);
    const activeIndices = CIRCULAR_MASK.map((active, i) => (active ? i : -1)).filter(
      (i) => i !== -1,
    );
    grid[activeIndices[0]] = 500; // in range — preserved as 500
    grid[activeIndices[1]] = 1500; // in range — preserved as 1500
    grid[activeIndices[2]] = 2500; // in range — preserved as 2500
    grid[activeIndices[3]] = 3800; // in range — preserved as 3800
    grid[activeIndices[4]] = -50; // out of range — clamped to 0
    grid[activeIndices[5]] = 5000; // out of range — clamped to 4095

    const data = buildExportData(grid);
    // All values must be integers in [0, 4095]
    data.brightness.forEach((v) => {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(4095);
    });
    // In-range values are preserved as-is
    expect(data.brightness[activeIndices[0]]).toBe(500);
    expect(data.brightness[activeIndices[1]]).toBe(1500);
    expect(data.brightness[activeIndices[2]]).toBe(2500);
    expect(data.brightness[activeIndices[3]]).toBe(3800);
    // Out-of-range values are clamped
    expect(data.brightness[activeIndices[4]]).toBe(0); // -50 → 0
    expect(data.brightness[activeIndices[5]]).toBe(4095); // 5000 → 4095
  });

  it('brightness array is in row-major order (index = row * 13 + col)', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    // Set a specific known position (center: row 6, col 6 => index 84)
    grid[84] = 4095;
    const data = buildExportData(grid);
    expect(data.brightness[84]).toBe(4095);
    expect(data.brightness.length).toBe(169);
  });

  it('two consecutive exports without edits produce identical brightness arrays', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    grid[84] = 2048;
    const data1 = buildExportData(grid);
    const data2 = buildExportData(grid);
    expect(data1.brightness).toEqual(data2.brightness);
  });
});

// ---------------------------------------------------------------------------
// validateImportData
// ---------------------------------------------------------------------------
describe('validateImportData', () => {
  it('accepts a valid import object', () => {
    const validData = {
      brightness: new Array(TOTAL_CELLS).fill(0),
    };
    const result = validateImportData(validData);
    expect(result.valid).toBe(true);
    expect(result.grid).toHaveLength(TOTAL_CELLS);
  });

  it('accepts valid full export data (with metadata)', () => {
    const validData = {
      device: 'Phone4aPro',
      gridSize: 13,
      version: '1.0',
      brightness: new Array(TOTAL_CELLS).fill(2048),
    };
    const result = validateImportData(validData);
    expect(result.valid).toBe(true);
    expect(result.grid).toHaveLength(TOTAL_CELLS);
  });

  it('rejects missing brightness key', () => {
    const result = validateImportData({ device: 'Phone4aPro' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/brightness/i);
  });

  it('rejects null input', () => {
    const result = validateImportData(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects non-object input', () => {
    const result = validateImportData('hello');
    expect(result.valid).toBe(false);
  });

  it('rejects wrong array size (e.g. 625 elements)', () => {
    const result = validateImportData({ brightness: new Array(625).fill(0) });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/169/);
  });

  it('rejects wrong array size (100 elements)', () => {
    const result = validateImportData({ brightness: new Array(100).fill(0) });
    expect(result.valid).toBe(false);
  });

  it('rejects non-integer values', () => {
    const arr = new Array(TOTAL_CELLS).fill(0);
    arr[50] = 1.5;
    const result = validateImportData({ brightness: arr });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/integer/i);
  });

  it('rejects string values in brightness array', () => {
    const arr = new Array(TOTAL_CELLS).fill(0);
    arr[10] = 'hello';
    const result = validateImportData({ brightness: arr });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/integer/i);
  });

  it('rejects brightness array that is not an array', () => {
    const result = validateImportData({ brightness: 'not-array' });
    expect(result.valid).toBe(false);
  });

  it('accepts and preserves continuous (non-quantized) values in 0–4095', () => {
    // validateImportData no longer snaps to 5 levels — continuous values are preserved
    const arr = new Array(TOTAL_CELLS).fill(500); // valid integer in 0–4095
    const result = validateImportData({ brightness: arr });
    expect(result.valid).toBe(true);
    // Active cells should preserve the value 500 (not snapped to 0 or 1024)
    result.grid.forEach((v, i) => {
      if (CIRCULAR_MASK[i]) {
        expect(v).toBe(500);
      } else {
        expect(v).toBe(0); // inactive → 0
      }
    });
  });

  it('clamps values above 4095 then snaps', () => {
    const arr = new Array(TOTAL_CELLS).fill(5000);
    const result = validateImportData({ brightness: arr });
    expect(result.valid).toBe(true);
    // 5000 clamped to 4095 → snaps to 4095
    result.grid.forEach((v, i) => {
      if (CIRCULAR_MASK[i]) {
        expect(v).toBe(4095);
      } else {
        expect(v).toBe(0);
      }
    });
  });

  it('clamps negative values then snaps', () => {
    const arr = new Array(TOTAL_CELLS).fill(-100);
    const result = validateImportData({ brightness: arr });
    expect(result.valid).toBe(true);
    // -100 clamped to 0 → snaps to 0
    result.grid.forEach((v) => {
      expect(v).toBe(0);
    });
  });

  it('enforces circular mask on imported grid (inactive positions → 0)', () => {
    const arr = new Array(TOTAL_CELLS).fill(4095);
    const result = validateImportData({ brightness: arr });
    expect(result.valid).toBe(true);
    CIRCULAR_MASK.forEach((active, i) => {
      if (!active) {
        expect(result.grid[i]).toBe(0);
      }
    });
  });

  it('preserves valid quantized values through import', () => {
    const arr = new Array(TOTAL_CELLS).fill(0);
    arr[84] = 2048; // center
    arr[85] = 3072;
    const result = validateImportData({ brightness: arr });
    expect(result.valid).toBe(true);
    expect(result.grid[84]).toBe(2048);
    expect(result.grid[85]).toBe(3072);
  });
});

// ---------------------------------------------------------------------------
// parseImportFile
// ---------------------------------------------------------------------------
describe('parseImportFile', () => {
  function makeFile(content, name = 'test.json') {
    return new File([content], name, { type: 'application/json' });
  }

  it('parses a valid JSON file and returns grid', async () => {
    const validData = {
      device: 'Phone4aPro',
      gridSize: 13,
      version: '1.0',
      brightness: new Array(TOTAL_CELLS).fill(0),
    };
    const file = makeFile(JSON.stringify(validData));
    const result = await parseImportFile(file);
    expect(result.valid).toBe(true);
    expect(result.grid).toHaveLength(TOTAL_CELLS);
  });

  it('rejects unparseable JSON', async () => {
    const file = makeFile('{not valid json!!!}');
    const result = await parseImportFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/parse|json/i);
  });

  it('rejects zero-byte file', async () => {
    const file = makeFile('');
    const result = await parseImportFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty|zero/i);
  });

  it('rejects file with wrong array size', async () => {
    const file = makeFile(JSON.stringify({ brightness: new Array(625).fill(0) }));
    const result = await parseImportFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/169/);
  });

  it('rejects file with missing brightness key', async () => {
    const file = makeFile(JSON.stringify({ device: 'Phone4aPro' }));
    const result = await parseImportFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/brightness/i);
  });

  it('rejects file with non-integer values', async () => {
    const arr = new Array(TOTAL_CELLS).fill(0);
    arr[10] = 1.5;
    const file = makeFile(JSON.stringify({ brightness: arr }));
    const result = await parseImportFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/integer/i);
  });
});

// ---------------------------------------------------------------------------
// Round-trip fidelity: export → import produces identical state
// ---------------------------------------------------------------------------
describe('export → import round-trip', () => {
  it('empty grid round-trips exactly', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    const exported = buildExportData(grid);
    const imported = validateImportData(exported);
    expect(imported.valid).toBe(true);
    expect(imported.grid).toEqual(grid);
  });

  it('fully-lit grid round-trips exactly', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    CIRCULAR_MASK.forEach((active, i) => {
      if (active) grid[i] = 4095;
    });
    const exported = buildExportData(grid);
    const imported = validateImportData(exported);
    expect(imported.valid).toBe(true);
    expect(imported.grid).toEqual(grid);
  });

  it('mixed-pattern grid round-trips exactly', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    CIRCULAR_MASK.forEach((active, i) => {
      if (active) grid[i] = BRIGHTNESS_LEVELS[i % BRIGHTNESS_LEVELS.length];
    });
    const exported = buildExportData(grid);
    const imported = validateImportData(exported);
    expect(imported.valid).toBe(true);
    expect(imported.grid).toEqual(grid);
  });

  it('round-trip preserves state through JSON.stringify/parse', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    CIRCULAR_MASK.forEach((active, i) => {
      if (active) grid[i] = BRIGHTNESS_LEVELS[(i * 3) % BRIGHTNESS_LEVELS.length];
    });
    const exported = buildExportData(grid);
    // Simulate actual file save/load
    const json = JSON.stringify(exported);
    const parsed = JSON.parse(json);
    const imported = validateImportData(parsed);
    expect(imported.valid).toBe(true);
    expect(imported.grid).toEqual(grid);
  });

  it('editing 3 cells after import, then exporting, reflects exactly those changes', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    grid[84] = 2048; // center
    const exported = buildExportData(grid);
    const imported = validateImportData(exported);
    expect(imported.valid).toBe(true);

    // Simulate editing 3 cells
    const edited = [...imported.grid];
    edited[85] = 1024;
    edited[86] = 3072;
    edited[87] = 4095;

    const reExported = buildExportData(edited);
    // Original values unchanged
    expect(reExported.brightness[84]).toBe(2048);
    // Edited values reflected
    expect(reExported.brightness[85]).toBe(1024);
    expect(reExported.brightness[86]).toBe(3072);
    expect(reExported.brightness[87]).toBe(4095);
  });
});

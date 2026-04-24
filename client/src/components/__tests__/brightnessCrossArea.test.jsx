/**
 * Cross-area integration tests for brightness controls.
 *
 * These tests exercise the integration between the crop modal brightness
 * slider, the 2/5 color mode switch, click cycling with continuous values,
 * invert, export/import, and pattern finalization.
 *
 * Fulfills:
 *   VAL-CROSS-001: Crop brightness 75 + Confirm → grid receives adjusted values
 *   VAL-CROSS-002: Crop quantized + Confirm → grid receives 5-level values
 *   VAL-CROSS-003: Crop continuous + Confirm → grid receives continuous values
 *   VAL-CROSS-006: Manual painting after image upload
 *   VAL-CROSS-007: Invert works with continuous values (4095 - value)
 *   VAL-CROSS-009: Export JSON captures base integer values
 *   VAL-CROSS-010: Import continuous JSON renders with continuous colors
 *   VAL-CROSS-024: All new UI elements match dark theme
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GlyphGrid from '../GlyphGrid.jsx';
import {
  CIRCULAR_MASK,
  TOTAL_CELLS,
  BRIGHTNESS_LEVELS,
  brightnessToColor,
} from '../../utils/gridConstants.js';

vi.mock('../../utils/jsonIO.js', () => ({
  downloadExportJSON: vi.fn(),
  parseImportFile: vi.fn(),
}));

vi.mock('../../utils/imageProcessing.js', () => ({
  validateImageFile: vi.fn(),
}));

// Partially mock cropUtils so computePreviewBrightness is controllable in tests
// while all other utilities (CROP_SIZE, clampZoom, etc.) stay real.
vi.mock('../../utils/cropUtils.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    computePreviewBrightness: vi.fn(),
  };
});

import { computePreviewBrightness } from '../../utils/cropUtils.js';
import { downloadExportJSON, parseImportFile } from '../../utils/jsonIO.js';
import { validateImageFile } from '../../utils/imageProcessing.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Indices of active cells in the circular mask. */
const ACTIVE_INDICES = CIRCULAR_MASK.map((active, i) => (active ? i : -1)).filter((i) => i !== -1);

/** The 5 canonical brightness levels as a Set for quick membership checks. */
const DISCRETE_LEVELS = new Set(BRIGHTNESS_LEVELS);

/**
 * Extract the gray channel value (0–255) from a CSS color string.
 * Handles both hex ('#rrggbb') and rgb() formats since jsdom normalizes
 * style attribute hex values to 'rgb(r, g, b)'.
 *
 * @param {string} colorStr - CSS color string
 * @returns {number} Gray channel value (0–255), or -1 if unparseable
 */
function colorToGray(colorStr) {
  if (!colorStr) return -1;
  if (colorStr.startsWith('#')) {
    return parseInt(colorStr.slice(1, 3), 16);
  }
  const match = colorStr.match(/rgb\s*\(\s*(\d+)/);
  return match ? parseInt(match[1], 10) : -1;
}

/**
 * Build a 169-element brightness array where all active cells share the same
 * value and inactive cells are 0.
 */
function makeUniformGrid(value) {
  return CIRCULAR_MASK.map((active) => (active ? value : 0));
}

/**
 * Open the crop modal, simulate image loading, and advance the debounce timer
 * so previewBrightness is computed. Returns the rendered container.
 */
async function openModalAndLoadImage() {
  const { container } = render(<GlyphGrid />);
  const fileInput = screen.getByTestId('image-upload-input');

  const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [file] } });
  });

  // Simulate image loading inside CropArea
  const img = screen.getByTestId('crop-image');
  Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
  await act(async () => {
    fireEvent.load(img);
  });

  // Advance debounce timer so computePreviewBrightness is called
  await act(async () => {
    vi.advanceTimersByTime(150);
  });

  return container;
}

// ── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  validateImageFile.mockImplementation(() => {});
  downloadExportJSON.mockImplementation(() => {});
  parseImportFile.mockImplementation(() => {});
  document.cookie = 'glyph_color_mode=; path=/; max-age=0';
});

afterEach(() => {
  vi.useRealTimers();
});

// ── VAL-CROSS-001: Crop brightness 75 → grid receives adjusted (brighter) values ──

describe('VAL-CROSS-001: Crop brightness 75 + Confirm → grid receives adjusted values', () => {
  it('grid receives brighter-than-natural values when crop brightness was 75', async () => {
    // Configure mock to RESPOND TO the brightness argument it receives:
    // at brightness=75 → return brighter grid (3500); at brightness=50 → return natural (2048).
    // This ensures the test drives the actual brightness slider, not a hardcoded return value.
    computePreviewBrightness.mockImplementation((...args) => {
      const brightnessArg = args[7]; // 8th param: brightness (0-100)
      if (brightnessArg === 75) {
        return makeUniformGrid(3500);
      }
      return makeUniformGrid(2048);
    });

    const container = await openModalAndLoadImage();
    // previewBrightness is now set (makeUniformGrid(2048)), Confirm button is enabled.

    // Drive the brightness slider to 75 — wrapped in act() to commit brightness state + re-run effects
    const brightnessSlider = screen.getByTestId('brightness-slider');
    await act(async () => {
      fireEvent.change(brightnessSlider, { target: { value: '75' } });
    });
    // brightness=75 is now committed; the debounce useEffect re-ran and set a new 100ms timer

    // Advance the debounce timer — computePreviewBrightness is called with brightness=75 → 3500
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    // previewBrightness is now makeUniformGrid(3500)

    // Confirm: onConfirm receives the 3500 grid (from previewBrightness or fresh recompute)
    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    // All active cells should have the brightness-adjusted value (3500)
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('3500');
    });
  });

  it('the grid value 3500 is brighter than the natural 2048 (sanity check)', () => {
    // Verify that the mock value (3500) represents a brighter value than natural (2048)
    expect(3500).toBeGreaterThan(2048);
    // And that the displayed color is accordingly brighter
    const naturalColor = brightnessToColor(2048);
    const brighterColor = brightnessToColor(3500);
    const naturalGray = parseInt(naturalColor.slice(1, 3), 16);
    const brighterGray = parseInt(brighterColor.slice(1, 3), 16);
    expect(brighterGray).toBeGreaterThan(naturalGray);
  });
});

// ── VAL-CROSS-002: Crop mode=2 Colors + Confirm → grid receives 2-level values ──

describe('VAL-CROSS-002: Crop 2 Colors mode + Confirm → grid receives 2-level values', () => {
  it('all grid data-brightness values are exactly 0 or 4095', async () => {
    // Configure mock to RESPOND TO the only2Colors argument it receives:
    // when only2Colors=true → return 2-level (black/white) values; otherwise → return 5-level.
    // This ensures the test drives the actual color mode switch, not a hardcoded mock.
    computePreviewBrightness.mockImplementation((...args) => {
      const only2ColorsArg = args[8]; // 9th param: only2Colors (boolean)
      if (only2ColorsArg) {
        // 2-level: only 0 and 4095
        return CIRCULAR_MASK.map((active, i) => {
          if (!active) return 0;
          return i % 2 === 0 ? 0 : 4095;
        });
      }
      // Default (unchecked): return 5-level quantized values.
      return CIRCULAR_MASK.map((active, i) => {
        if (!active) return 0;
        return BRIGHTNESS_LEVELS[i % BRIGHTNESS_LEVELS.length];
      });
    });

    const container = await openModalAndLoadImage();
    // previewBrightness is now set (5-level grid), Confirm button is enabled.

    // Select 2 Colors mode — wrapped in act() to commit state + re-run effects
    const twoColorButton = screen.getByTestId('color-mode-2-button');
    await act(async () => {
      fireEvent.click(twoColorButton);
    });
    // only2Colors=true is now committed; the debounce useEffect re-ran and set a new 100ms timer

    // Advance the debounce timer — computePreviewBrightness is called with only2Colors=true → 2-level
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    // previewBrightness is now the 2-level (black/white) grid

    // Confirm: onConfirm receives the 2-level grid (from previewBrightness or fresh recompute)
    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    // All data-brightness values must be 0 or 4095
    const TWO_LEVELS = new Set([0, 4095]);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      const val = Number(cell.getAttribute('data-brightness'));
      expect(TWO_LEVELS.has(val)).toBe(true);
    });
  });
});

// ── VAL-CROSS-003: Crop default (5-level) + Confirm → grid receives 5-level values ──

describe('VAL-CROSS-003: Crop default (5-level) + Confirm → grid receives 5-level values', () => {
  it('grid has 5-level quantized values after crop confirm with default settings', async () => {
    // Configure mock to RESPOND TO the brightness and only2Colors arguments it receives:
    // at default (brightness=50, only2Colors=false) → return 5-level quantized values.
    // This ensures the test reflects actual default control state, not a hardcoded mock.
    computePreviewBrightness.mockImplementation((...args) => {
      const brightnessArg = args[7]; // 8th param: brightness (0-100)
      const only2ColorsArg = args[8]; // 9th param: only2Colors (boolean)
      if (brightnessArg === 50 && !only2ColorsArg) {
        // 5-level quantized values
        return CIRCULAR_MASK.map((active, i) => {
          if (!active) return 0;
          return BRIGHTNESS_LEVELS[i % BRIGHTNESS_LEVELS.length];
        });
      }
      return makeUniformGrid(2048);
    });

    const container = await openModalAndLoadImage();
    // No UI interactions — controls remain at defaults (brightness=50, only2Colors=false).

    // Confirm: synchronously recomputes with brightness=50, only2Colors=false → 5-level values
    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    // All values should be from the 5-level set (default is now 5-level quantized)
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      const val = Number(cell.getAttribute('data-brightness'));
      expect(DISCRETE_LEVELS.has(val)).toBe(true);
    });
  });
});

// ── VAL-CROSS-006: Manual painting after image upload ──────────

describe('VAL-CROSS-006: Manual painting after image upload', () => {
  it('click on continuous-value cell snaps to nearest discrete level (VAL-CYCLE-005)', async () => {
    // After crop confirm, cell has continuous value 1500
    const continuousGrid = makeUniformGrid(1500);
    computePreviewBrightness.mockReturnValue(continuousGrid);

    const container = await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    const activeCell = container.querySelector('[data-active="true"]');
    expect(activeCell.getAttribute('data-brightness')).toBe('1500');

    // Click the cell: should snap 1500 to nearest (1024) and advance to 2048
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('2048');
    expect(DISCRETE_LEVELS.has(Number(activeCell.getAttribute('data-brightness')))).toBe(true);
  });

  it('click cycling works correctly after image upload for continuous values', async () => {
    const continuousGrid = makeUniformGrid(2500);
    computePreviewBrightness.mockReturnValue(continuousGrid);

    const container = await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    const activeCell = container.querySelector('[data-active="true"]');

    // Click: 2500 is closest to 2048 → advance to 3072
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('3072');
    expect(DISCRETE_LEVELS.has(3072)).toBe(true);
  });
});

// ── VAL-CROSS-007: Invert works with continuous values ───────────────────────

describe('VAL-CROSS-007: Invert button works with continuous values (4095 - value)', () => {
  it('inverting a continuous value 1500 produces 2595 (4095 - 1500)', async () => {
    const continuousGrid = makeUniformGrid(1500);
    computePreviewBrightness.mockReturnValue(continuousGrid);

    const container = await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    // Advance past fade-out animation
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Verify base value is 1500
    const activeCell = container.querySelector('[data-active="true"]');
    expect(activeCell.getAttribute('data-brightness')).toBe('1500');

    // Click Invert: 4095 - 1500 = 2595
    fireEvent.click(screen.getByRole('button', { name: /invert colors/i }));

    expect(activeCell.getAttribute('data-brightness')).toBe('2595');
  });

  it('inverting a mixed grid (continuous + discrete) inverts all correctly', async () => {
    // Mix of values: some continuous, some discrete
    const mixedGrid = CIRCULAR_MASK.map((active, i) => {
      if (!active) return 0;
      // Alternate between continuous (1500) and discrete (3072) values
      return i % 2 === 0 ? 1500 : 3072;
    });
    computePreviewBrightness.mockReturnValue(mixedGrid);

    const container = await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    // Advance past fade-out animation
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Click Invert
    fireEvent.click(screen.getByRole('button', { name: /invert colors/i }));

    // Verify: first active cell (even index) was 1500 → should be 2595
    const allCells = container.querySelectorAll('[data-testid^="cell-"]');
    let checkedContinuous = false;
    let checkedDiscrete = false;

    ACTIVE_INDICES.forEach((idx) => {
      const cell = allCells[idx];
      const val = Number(cell.getAttribute('data-brightness'));
      const originalVal = mixedGrid[idx];

      if (originalVal === 1500) {
        expect(val).toBe(2595); // 4095 - 1500
        checkedContinuous = true;
      } else if (originalVal === 3072) {
        expect(val).toBe(1023); // 4095 - 3072
        checkedDiscrete = true;
      }
    });

    expect(checkedContinuous).toBe(true);
    expect(checkedDiscrete).toBe(true);
  });

  it('double invert on continuous values restores original state', async () => {
    const continuousGrid = makeUniformGrid(1750);
    computePreviewBrightness.mockReturnValue(continuousGrid);

    const container = await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    const activeCell = container.querySelector('[data-active="true"]');
    expect(activeCell.getAttribute('data-brightness')).toBe('1750');

    const invertBtn = screen.getByRole('button', { name: /invert colors/i });
    // First invert: 1750 → 2345
    fireEvent.click(invertBtn);
    expect(activeCell.getAttribute('data-brightness')).toBe('2345');

    // Second invert: 2345 → 1750 (restored)
    fireEvent.click(invertBtn);
    expect(activeCell.getAttribute('data-brightness')).toBe('1750');
  });
});

// ── VAL-CROSS-009: Export captures base integer values ─

describe('VAL-CROSS-009: Export JSON captures base integer values', () => {
  it('export sends base values as integers', async () => {
    const baseValue = 3072;
    const cropGrid = makeUniformGrid(baseValue);
    computePreviewBrightness.mockReturnValue(cropGrid);

    await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Export JSON
    fireEvent.click(screen.getByTestId('export-json-button'));

    expect(downloadExportJSON).toHaveBeenCalledTimes(1);
    const exportedGrid = downloadExportJSON.mock.calls[0][0];

    // Verify the exported values are base integers
    const firstActiveIdx = CIRCULAR_MASK.indexOf(true);
    expect(exportedGrid[firstActiveIdx]).toBe(baseValue);

    // All values should be integers in [0, 4095]
    exportedGrid.forEach((val) => {
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(4095);
    });
  });

  it('inactive positions are 0 in the exported grid', async () => {
    const cropGrid = makeUniformGrid(2048);
    computePreviewBrightness.mockReturnValue(cropGrid);

    await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    fireEvent.click(screen.getByTestId('export-json-button'));

    const exportedGrid = downloadExportJSON.mock.calls[0][0];
    CIRCULAR_MASK.forEach((active, i) => {
      if (!active) {
        expect(exportedGrid[i]).toBe(0);
      }
    });
  });
});

// ── VAL-CROSS-010: Import continuous JSON renders with continuous colors ──────

describe('VAL-CROSS-010: Import continuous JSON renders with continuous colors', () => {
  it('importing a grid with continuous values displays them without snapping to 5 levels', async () => {
    // Simulate a JSON import that has continuous values
    const importedGrid = CIRCULAR_MASK.map((active, i) => {
      if (!active) return 0;
      // Use continuous values — not in the 5-level set
      return 100 + (i % 15) * 270; // 100, 370, 640, 910, 1180, 1450, 1720, 1990, 2260, ...
    });

    parseImportFile.mockResolvedValue({ valid: true, grid: importedGrid });

    const { container } = render(<GlyphGrid />);

    // Click Import JSON to open the import file input
    const importInput = screen.getByTestId('json-import-input');
    const importFile = new File(['{}'], 'pattern.json', { type: 'application/json' });

    await act(async () => {
      fireEvent.change(importInput, { target: { files: [importFile] } });
    });

    // Check that the grid shows continuous values
    const allCells = container.querySelectorAll('[data-testid^="cell-"]');
    let hasNonDiscreteValue = false;
    ACTIVE_INDICES.forEach((idx) => {
      const val = Number(allCells[idx].getAttribute('data-brightness'));
      if (!DISCRETE_LEVELS.has(val)) {
        hasNonDiscreteValue = true;
      }
    });
    expect(hasNonDiscreteValue).toBe(true);
  });

  it('importing continuous values renders them with interpolated (non-5-color) grayscale', async () => {
    // A single active cell at a specific continuous value
    const continuousValue = 750;
    const importedGrid = new Array(TOTAL_CELLS).fill(0);
    importedGrid[ACTIVE_INDICES[0]] = continuousValue;

    parseImportFile.mockResolvedValue({ valid: true, grid: importedGrid });

    const { container } = render(<GlyphGrid />);
    const importInput = screen.getByTestId('json-import-input');
    const importFile = new File(['{}'], 'pattern.json', { type: 'application/json' });

    await act(async () => {
      fireEvent.change(importInput, { target: { files: [importFile] } });
    });

    // The first active cell should display with the continuous value's color
    const allCells = container.querySelectorAll('[data-testid^="cell-"]');
    const firstActiveCell = allCells[ACTIVE_INDICES[0]];
    expect(firstActiveCell.getAttribute('data-brightness')).toBe(String(continuousValue));

    // The displayed color should be brightnessToColor(750) — interpolated
    // Compare using gray channel values (jsdom normalizes hex to rgb format)
    const expectedGray = colorToGray(brightnessToColor(continuousValue));
    const actualGray = colorToGray(firstActiveCell.style.backgroundColor);
    expect(actualGray).toBe(expectedGray);
  });
});

// ── VAL-CROSS-024: All new UI elements match dark theme ──────────────────────

describe('VAL-CROSS-024: All new UI elements match dark theme', () => {
  it('main screen does not render master brightness controls', () => {
    render(<GlyphGrid />);
    expect(screen.queryByTestId('master-brightness-slider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('master-brightness-text')).not.toBeInTheDocument();
    expect(screen.queryByText(/master brightness/i)).not.toBeInTheDocument();
  });

  it('crop modal brightness slider is styled with dark theme (accent color)', async () => {
    const anyGrid = makeUniformGrid(2048);
    computePreviewBrightness.mockReturnValue(anyGrid);

    await openModalAndLoadImage();

    const brightnessSlider = screen.getByTestId('brightness-slider');
    expect(brightnessSlider).toBeInTheDocument();
    // accentColor should be set (white or similar for dark theme)
    expect(brightnessSlider.style.accentColor).toBeTruthy();
  });

  it('crop modal brightness textbox has dark background and white text', async () => {
    const anyGrid = makeUniformGrid(2048);
    computePreviewBrightness.mockReturnValue(anyGrid);

    await openModalAndLoadImage();

    const brightnessText = screen.getByTestId('brightness-text');
    // jsdom normalizes hex colors to rgb() — check gray channel values
    const bgGray = colorToGray(brightnessText.style.backgroundColor);
    const fgGray = colorToGray(brightnessText.style.color);
    expect(bgGray).toBeLessThan(30); // dark background
    expect(fgGray).toBeGreaterThan(200); // light/white text
  });

  it('crop modal panel has dark background', async () => {
    const anyGrid = makeUniformGrid(2048);
    computePreviewBrightness.mockReturnValue(anyGrid);

    await openModalAndLoadImage();

    const panel = screen.getByTestId('crop-modal-panel');
    // jsdom normalizes hex colors to rgb() — check gray channel values
    const bgGray = colorToGray(panel.style.backgroundColor);
    const fgGray = colorToGray(panel.style.color);
    expect(bgGray).toBeLessThan(30); // dark background (#1a1a1a = rgb(26,26,26))
    expect(fgGray).toBeGreaterThan(200); // white/light text
  });
});

// ── VAL-CROSS-023: No console errors on full workflow ─────────────────────────

describe('VAL-CROSS-023: No console errors on full workflow', () => {
  it('completes the entire workflow with zero console.error and console.warn calls', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      // Configure mocks: computePreviewBrightness always returns a valid non-null grid
      const fullWorkflowGrid = CIRCULAR_MASK.map((active) => (active ? 2000 : 0));
      computePreviewBrightness.mockImplementation(() => fullWorkflowGrid);

      const importGrid = CIRCULAR_MASK.map((active) => (active ? 2048 : 0));
      parseImportFile.mockResolvedValue({ valid: true, grid: importGrid });

      // 1. Load page — render GlyphGrid
      const { container } = render(<GlyphGrid />);

      // 2. Upload image → opens crop modal
      const fileInput = screen.getByTestId('image-upload-input');
      const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      // Simulate image loading inside CropArea so controls become enabled
      const img = screen.getByTestId('crop-image');
      Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
      await act(async () => {
        fireEvent.load(img);
      });

      // Advance debounce so computePreviewBrightness is called → previewBrightness set
      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      // 3. Adjust brightness slider to 70
      const brightnessSlider = screen.getByTestId('brightness-slider');
      fireEvent.change(brightnessSlider, { target: { value: '70' } });

      // 4. Switch to "2 Colors"
      const twoColorButton = screen.getByTestId('color-mode-2-button');
      fireEvent.click(twoColorButton);

      // 5. Switch back to "5 Colors"
      const fiveColorButton = screen.getByTestId('color-mode-5-button');
      fireEvent.click(fiveColorButton);

      // 6. Confirm — closes modal and applies brightness to main grid
      await act(async () => {
        fireEvent.click(screen.getByTestId('crop-modal-confirm'));
      });

      // Advance past fade-out animation (150ms) so modal unmounts cleanly
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // 7. Click cells (cycle brightness on two active cells)
      const activeCells = container.querySelectorAll('[data-active="true"]');
      fireEvent.click(activeCells[0]);
      fireEvent.click(activeCells[1]);

      // 8. Invert
      fireEvent.click(screen.getByRole('button', { name: /invert colors/i }));

      // 9. Export JSON
      fireEvent.click(screen.getByTestId('export-json-button'));

      // 10. Import JSON — async: wait for parseImportFile to resolve and grid to update
      const importInput = screen.getByTestId('json-import-input');
      const importFile = new File(['{}'], 'pattern.json', { type: 'application/json' });
      await act(async () => {
        fireEvent.change(importInput, { target: { files: [importFile] } });
      });

      // Assert zero console errors and warnings throughout the entire workflow
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

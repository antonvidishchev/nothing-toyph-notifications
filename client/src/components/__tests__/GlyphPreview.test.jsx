import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import GlyphPreview from '../GlyphPreview.jsx';
import {
  CIRCULAR_MASK,
  TOTAL_CELLS,
  GRID_SIZE,
  BRIGHTNESS_LEVELS,
} from '../../utils/gridConstants.js';

describe('GlyphPreview — rendering', () => {
  it('renders glyph-preview container', () => {
    render(<GlyphPreview brightness={null} />);
    expect(screen.getByTestId('glyph-preview')).toBeInTheDocument();
  });

  it('renders exactly 169 preview cells (13×13 grid)', () => {
    const { container } = render(<GlyphPreview brightness={null} />);
    const cells = container.querySelectorAll('[data-testid^="preview-cell-"]');
    expect(cells).toHaveLength(TOTAL_CELLS);
  });

  it('renders 13 rows × 13 columns of cells', () => {
    render(<GlyphPreview brightness={null} />);
    // 13 rows × 13 cells = 169
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      expect(screen.getByTestId(`preview-cell-${i}`)).toBeInTheDocument();
    }
  });
});

describe('GlyphPreview — circular mask', () => {
  it('marks 137 cells as active', () => {
    const { container } = render(<GlyphPreview brightness={null} />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    expect(activeCells).toHaveLength(137);
  });

  it('marks 32 cells as inactive', () => {
    const { container } = render(<GlyphPreview brightness={null} />);
    const inactiveCells = container.querySelectorAll('[data-active="false"]');
    expect(inactiveCells).toHaveLength(32);
  });

  it('active/inactive positions match CIRCULAR_MASK', () => {
    const { container } = render(<GlyphPreview brightness={null} />);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      const cell = container.querySelector(`[data-testid="preview-cell-${i}"]`);
      expect(cell).not.toBeNull();
      const expectedActive = String(CIRCULAR_MASK[i]);
      expect(cell.getAttribute('data-active')).toBe(expectedActive);
    }
  });

  it('inactive cells have transparent background', () => {
    const { container } = render(<GlyphPreview brightness={null} />);
    const inactiveCells = container.querySelectorAll('[data-active="false"]');
    inactiveCells.forEach((cell) => {
      expect(cell.style.backgroundColor).toBe('transparent');
    });
  });
});

describe('GlyphPreview — brightness colors', () => {
  it('all active cells default to brightness 0 when brightness is null', () => {
    const { container } = render(<GlyphPreview brightness={null} />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('displays the correct brightness color for level 0 (black, #000000)', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    const { container } = render(<GlyphPreview brightness={grid} />);
    const firstActive = container.querySelector('[data-active="true"]');
    // brightnessToColor(0) = '#000000' → rgb(0, 0, 0)
    expect(firstActive.style.backgroundColor).toBe('rgb(0, 0, 0)');
  });

  it('displays the correct brightness color for level 4095 (#fff)', () => {
    const grid = new Array(TOTAL_CELLS).fill(4095);
    const { container } = render(<GlyphPreview brightness={grid} />);
    const firstActive = container.querySelector('[data-active="true"]');
    // BRIGHTNESS_COLORS[4095] = '#fff' → rgb(255,255,255)
    expect(firstActive.style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('shows all 5 distinct brightness colors when all levels are present', () => {
    // Build a brightness array that cycles through all 5 levels for active cells
    const levels = BRIGHTNESS_LEVELS;
    const grid = new Array(TOTAL_CELLS).fill(0);
    let levelIdx = 0;
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        grid[i] = levels[levelIdx % levels.length];
        levelIdx++;
      }
    }

    const { container } = render(<GlyphPreview brightness={grid} />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    const colors = new Set();
    activeCells.forEach((cell) => colors.add(cell.style.backgroundColor));
    // All 5 brightness levels should produce distinct colors
    expect(colors.size).toBe(5);
  });

  it('uses brightnessToColor interpolation (linear grayscale for 5 canonical levels)', () => {
    // Map each BRIGHTNESS_LEVEL to its expected CSS color using brightnessToColor
    // brightnessToColor(v) = '#' + hex(round(v*255/4095)) × 3
    const expectedColors = {
      0: 'rgb(0, 0, 0)', // #000000: 0 * 255/4095 = 0
      1024: 'rgb(64, 64, 64)', // #404040: round(1024*255/4095) = round(63.75) = 64
      2048: 'rgb(128, 128, 128)', // #808080: round(2048*255/4095) = round(127.5) = 128
      3072: 'rgb(191, 191, 191)', // #bfbfbf: round(3072*255/4095) = round(191.25) = 191
      4095: 'rgb(255, 255, 255)', // #ffffff: 255
    };

    BRIGHTNESS_LEVELS.forEach((level) => {
      // Create a grid where the first active cell has this brightness level
      const grid = new Array(TOTAL_CELLS).fill(0);
      const firstActiveIdx = CIRCULAR_MASK.indexOf(true);
      grid[firstActiveIdx] = level;

      const { container, unmount } = render(<GlyphPreview brightness={grid} />);
      const cell = container.querySelector(`[data-testid="preview-cell-${firstActiveIdx}"]`);
      expect(cell.style.backgroundColor).toBe(expectedColors[level]);
      unmount();
    });
  });
});

describe('GlyphPreview — data attributes', () => {
  it('each cell has data-brightness reflecting its brightness value', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    // Set a few active cells to specific values
    const activeIndices = CIRCULAR_MASK.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    grid[activeIndices[0]] = 4095;
    grid[activeIndices[1]] = 2048;
    grid[activeIndices[2]] = 1024;

    const { container } = render(<GlyphPreview brightness={grid} />);

    expect(
      container
        .querySelector(`[data-testid="preview-cell-${activeIndices[0]}"]`)
        .getAttribute('data-brightness'),
    ).toBe('4095');
    expect(
      container
        .querySelector(`[data-testid="preview-cell-${activeIndices[1]}"]`)
        .getAttribute('data-brightness'),
    ).toBe('2048');
    expect(
      container
        .querySelector(`[data-testid="preview-cell-${activeIndices[2]}"]`)
        .getAttribute('data-brightness'),
    ).toBe('1024');
  });
});

describe('GlyphPreview — brightness prop updates', () => {
  it('updates displayed colors when brightness prop changes', () => {
    const grid1 = new Array(TOTAL_CELLS).fill(0); // All dark
    const grid2 = new Array(TOTAL_CELLS).fill(0);
    // Set all active cells to max brightness in grid2
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) grid2[i] = 4095;
    }

    const { container, rerender } = render(<GlyphPreview brightness={grid1} />);
    const firstActive = container.querySelector('[data-active="true"]');
    expect(firstActive.getAttribute('data-brightness')).toBe('0');

    rerender(<GlyphPreview brightness={grid2} />);
    expect(firstActive.getAttribute('data-brightness')).toBe('4095');
  });

  it('renders correctly with all-zero brightness array', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    const { container } = render(<GlyphPreview brightness={grid} />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
    // 137 active + 32 inactive
    expect(activeCells).toHaveLength(137);
  });

  it('renders correctly with all-max brightness array', () => {
    const grid = new Array(TOTAL_CELLS).fill(4095);
    const { container } = render(<GlyphPreview brightness={grid} />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('4095');
    });
  });

  it('renders all-zero when brightness is wrong length', () => {
    // 169-element array is required; if wrong length, defaults to zeros
    const { container } = render(<GlyphPreview brightness={[1024, 2048]} />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });
});

describe('GlyphPreview — preview matches grid (consistency)', () => {
  it('preview cell at each position shows the same brightness as the input array', () => {
    // Build a recognizable pattern: brightness level = (index % 5) mapped to BRIGHTNESS_LEVELS
    const grid = CIRCULAR_MASK.map((isActive, i) =>
      isActive ? BRIGHTNESS_LEVELS[i % BRIGHTNESS_LEVELS.length] : 0,
    );

    const { container } = render(<GlyphPreview brightness={grid} />);

    for (let i = 0; i < TOTAL_CELLS; i++) {
      const cell = container.querySelector(`[data-testid="preview-cell-${i}"]`);
      expect(cell.getAttribute('data-brightness')).toBe(String(grid[i]));
    }
  });

  it('inactive cells always show brightness 0 regardless of input', () => {
    // Even if input sets inactive cells to non-zero (shouldn't happen, but guard)
    const grid = new Array(TOTAL_CELLS).fill(4095);
    const { container } = render(<GlyphPreview brightness={grid} />);

    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!CIRCULAR_MASK[i]) {
        const cell = container.querySelector(`[data-testid="preview-cell-${i}"]`);
        // Inactive cells render with backgroundColor: transparent (not the brightness color)
        expect(cell.style.backgroundColor).toBe('transparent');
      }
    }
  });
});

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import GlyphGrid from '../GlyphGrid.jsx';
import {
  CIRCULAR_MASK,
  GRID_SIZE,
  TOTAL_CELLS,
  BRIGHTNESS_LEVELS,
} from '../../utils/gridConstants.js';
import { validateImageFile } from '../../utils/imageProcessing.js';
import { downloadExportJSON } from '../../utils/jsonIO.js';

function clearColorModeCookie() {
  document.cookie = 'glyph_color_mode=; path=/; max-age=0';
}

beforeEach(() => {
  clearColorModeCookie();
  document.cookie = 'glyph_color_mode=5; path=/';
});

afterEach(() => {
  clearColorModeCookie();
});

vi.mock('../../utils/jsonIO.js', () => ({
  downloadExportJSON: vi.fn(),
  parseImportFile: vi.fn(),
}));

vi.mock('../../utils/imageProcessing.js', () => ({
  // validateImageFile default: no-op (file is valid). Tests that need invalid
  // behaviour can call validateImageFile.mockImplementation(() => { throw ... })
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

function mouseDownLeft(target) {
  fireEvent.mouseDown(target, { button: 0, buttons: 1 });
}

function mouseDownRight(target) {
  fireEvent.mouseDown(target, { button: 2, buttons: 2 });
}

function mouseUp(button = 0) {
  fireEvent.mouseUp(window, { button });
}

describe('Grid Constants', () => {
  it('grid is 13x13 with 169 total cells', () => {
    expect(GRID_SIZE).toBe(13);
    expect(TOTAL_CELLS).toBe(169);
  });

  it('circular mask has exactly 137 active and 32 inactive positions', () => {
    expect(CIRCULAR_MASK).toHaveLength(TOTAL_CELLS);
    const activeCount = CIRCULAR_MASK.filter((v) => v === true).length;
    const inactiveCount = CIRCULAR_MASK.filter((v) => v === false).length;
    expect(activeCount).toBe(137);
    expect(inactiveCount).toBe(32);
  });

  it('circular mask is symmetric across horizontal axis', () => {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const mirrorRow = GRID_SIZE - 1 - row;
        expect(CIRCULAR_MASK[row * GRID_SIZE + col]).toBe(
          CIRCULAR_MASK[mirrorRow * GRID_SIZE + col],
        );
      }
    }
  });

  it('circular mask is symmetric across vertical axis', () => {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const mirrorCol = GRID_SIZE - 1 - col;
        expect(CIRCULAR_MASK[row * GRID_SIZE + col]).toBe(
          CIRCULAR_MASK[row * GRID_SIZE + mirrorCol],
        );
      }
    }
  });

  it('has exactly 5 brightness levels: 0, 1024, 2048, 3072, 4095', () => {
    expect(BRIGHTNESS_LEVELS).toEqual([0, 1024, 2048, 3072, 4095]);
  });
});

describe('GlyphGrid Component', () => {
  it('renders 169 cells (13x13 grid)', () => {
    const { container } = render(<GlyphGrid />);
    const cells = container.querySelectorAll('[data-testid^="cell-"]');
    expect(cells).toHaveLength(TOTAL_CELLS);
  });

  it('renders exactly 137 active and 32 inactive cells', () => {
    const { container } = render(<GlyphGrid />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    const inactiveCells = container.querySelectorAll('[data-active="false"]');
    expect(activeCells).toHaveLength(137);
    expect(inactiveCells).toHaveLength(32);
  });

  it('all active pixels start at brightness 0', () => {
    const { container } = render(<GlyphGrid />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('clicking an active pixel cycles brightness: 0→1024→2048→3072→4095→0', () => {
    const { container } = render(<GlyphGrid />);
    // Find the first active cell
    const activeCell = container.querySelector('[data-active="true"]');
    expect(activeCell).not.toBeNull();

    // Initial state: brightness 0
    expect(activeCell.getAttribute('data-brightness')).toBe('0');

    // Click 1: 0 → 1024
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('1024');

    // Click 2: 1024 → 2048
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('2048');

    // Click 3: 2048 → 3072
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('3072');

    // Click 4: 3072 → 4095
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('4095');

    // Click 5: 4095 → 0 (wraps around)
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('0');
  });

  it('renders a main-screen color mode switch and defaults to 2 Colors when no cookie is present', () => {
    clearColorModeCookie();
    render(<GlyphGrid />);
    expect(screen.getByTestId('main-color-mode-switch')).toBeInTheDocument();
    expect(screen.getByTestId('main-color-mode-2-button')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('main-color-mode-5-button')).toHaveAttribute('aria-checked', 'false');
  });

  it('initializes main-screen color mode from cookie', () => {
    document.cookie = 'glyph_color_mode=2; path=/';
    render(<GlyphGrid />);
    expect(screen.getByTestId('main-color-mode-2-button')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('main-color-mode-5-button')).toHaveAttribute('aria-checked', 'false');
  });

  it('writes color mode cookie when main-screen mode changes', () => {
    render(<GlyphGrid />);
    fireEvent.click(screen.getByTestId('main-color-mode-2-button'));
    expect(document.cookie).toContain('glyph_color_mode=2');
  });

  it('in 2 Colors mode, clicking an active pixel toggles between 0 and 4095', () => {
    const { container } = render(<GlyphGrid />);
    const activeCell = container.querySelector('[data-active="true"]');

    fireEvent.click(screen.getByTestId('main-color-mode-2-button'));

    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('4095');

    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('0');
  });

  it('switching to 2 Colors immediately binarizes existing active pixels', () => {
    const firstActiveIndex = CIRCULAR_MASK.findIndex(Boolean);
    const secondActiveIndex = CIRCULAR_MASK.findIndex(
      (active, i) => active && i !== firstActiveIndex,
    );
    const initialGrid = new Array(TOTAL_CELLS).fill(0);
    initialGrid[firstActiveIndex] = 1500;
    initialGrid[secondActiveIndex] = 3500;

    function ControlledHarness() {
      const [grid, setGrid] = useState(initialGrid);
      return <GlyphGrid grid={grid} onGridChange={setGrid} />;
    }

    render(<ControlledHarness />);
    const firstCell = screen.getByTestId(`cell-${firstActiveIndex}`);
    const secondCell = screen.getByTestId(`cell-${secondActiveIndex}`);
    expect(firstCell.getAttribute('data-brightness')).toBe('1500');
    expect(secondCell.getAttribute('data-brightness')).toBe('3500');

    fireEvent.click(screen.getByTestId('main-color-mode-2-button'));

    expect(firstCell.getAttribute('data-brightness')).toBe('0');
    expect(secondCell.getAttribute('data-brightness')).toBe('4095');
  });

  it('in 2 Colors mode, click uses threshold toggle for non-binary values', () => {
    const firstActiveIndex = CIRCULAR_MASK.findIndex(Boolean);
    const initialGrid = new Array(TOTAL_CELLS).fill(0);
    initialGrid[firstActiveIndex] = 1500;

    function ControlledHarness() {
      const [grid, setGrid] = useState(initialGrid);
      return <GlyphGrid grid={grid} onGridChange={setGrid} />;
    }

    const { container } = render(<ControlledHarness />);
    const activeCell = container.querySelector('[data-active="true"]');
    expect(activeCell.getAttribute('data-brightness')).toBe('1500');

    fireEvent.click(screen.getByTestId('main-color-mode-2-button'));

    // 1500 < 2048, so first toggle goes to white (4095)
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('4095');

    // 4095 >= 2048, so next toggle goes to black (0)
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('0');
  });

  it('right-clicking an active pixel cycles brightness in reverse in 5 Colors mode', () => {
    const { container } = render(<GlyphGrid />);
    const activeCell = container.querySelector('[data-active="true"]');
    expect(activeCell.getAttribute('data-brightness')).toBe('0');

    mouseDownRight(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('4095');
    mouseUp(2);

    mouseDownRight(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('3072');
    mouseUp(2);

    mouseDownRight(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('2048');
    mouseUp(2);
  });

  it('in 2 Colors mode, right-click uses reverse threshold behavior', () => {
    document.cookie = 'glyph_color_mode=2; path=/';
    const firstActiveIndex = CIRCULAR_MASK.findIndex(Boolean);
    const secondActiveIndex = CIRCULAR_MASK.findIndex(
      (active, i) => active && i !== firstActiveIndex,
    );
    const initialGrid = new Array(TOTAL_CELLS).fill(0);
    initialGrid[firstActiveIndex] = 1500; // < 2048 -> right-click should become 0
    initialGrid[secondActiveIndex] = 3500; // >= 2048 -> right-click should become 4095

    function ControlledHarness() {
      const [grid, setGrid] = useState(initialGrid);
      return <GlyphGrid grid={grid} onGridChange={setGrid} />;
    }

    render(<ControlledHarness />);
    expect(screen.getByTestId('main-color-mode-2-button')).toHaveAttribute('aria-checked', 'true');

    const firstCell = screen.getByTestId(`cell-${firstActiveIndex}`);
    const secondCell = screen.getByTestId(`cell-${secondActiveIndex}`);

    expect(firstCell.getAttribute('data-brightness')).toBe('1500');
    expect(secondCell.getAttribute('data-brightness')).toBe('3500');

    mouseDownRight(firstCell);
    expect(firstCell.getAttribute('data-brightness')).toBe('0');
    mouseUp(2);

    mouseDownRight(secondCell);
    expect(secondCell.getAttribute('data-brightness')).toBe('4095');
    mouseUp(2);
  });

  it('clicking an inactive pixel does nothing (no state change, no error)', () => {
    const { container } = render(<GlyphGrid />);
    const inactiveCell = container.querySelector('[data-active="false"]');
    expect(inactiveCell).not.toBeNull();

    // Brightness should be 0 and stay 0
    expect(inactiveCell.getAttribute('data-brightness')).toBe('0');
    fireEvent.click(inactiveCell);
    expect(inactiveCell.getAttribute('data-brightness')).toBe('0');

    // Click multiple times — still 0
    fireEvent.click(inactiveCell);
    fireEvent.click(inactiveCell);
    expect(inactiveCell.getAttribute('data-brightness')).toBe('0');
  });

  it('active pixels show pointer cursor', () => {
    const { container } = render(<GlyphGrid />);
    const activeCell = container.querySelector('[data-active="true"]');
    const style = window.getComputedStyle(activeCell);
    expect(activeCell.style.cursor || style.cursor).toBe('pointer');
  });

  it('inactive pixels show default cursor', () => {
    const { container } = render(<GlyphGrid />);
    const inactiveCell = container.querySelector('[data-active="false"]');
    const cursorValue = inactiveCell.style.cursor;
    // Should be 'default' or empty (which defaults to default)
    expect(cursorValue === 'default' || cursorValue === '').toBe(true);
  });

  it('each brightness level renders at a visually distinct grayscale', () => {
    const { container } = render(<GlyphGrid />);
    const activeCell = container.querySelector('[data-active="true"]');

    // Collect background colors at each brightness level
    const colors = new Set();

    // Level 0
    colors.add(activeCell.style.backgroundColor);

    // Level 1024
    fireEvent.click(activeCell);
    colors.add(activeCell.style.backgroundColor);

    // Level 2048
    fireEvent.click(activeCell);
    colors.add(activeCell.style.backgroundColor);

    // Level 3072
    fireEvent.click(activeCell);
    colors.add(activeCell.style.backgroundColor);

    // Level 4095
    fireEvent.click(activeCell);
    colors.add(activeCell.style.backgroundColor);

    // All 5 levels should have distinct colors
    expect(colors.size).toBe(5);
  });

  it('clicking one pixel does not affect other pixels', () => {
    const { container } = render(<GlyphGrid />);
    const activeCells = container.querySelectorAll('[data-active="true"]');

    // Click the first active pixel
    fireEvent.click(activeCells[0]);
    expect(activeCells[0].getAttribute('data-brightness')).toBe('1024');

    // All other active pixels should still be at 0
    for (let i = 1; i < activeCells.length; i++) {
      expect(activeCells[i].getAttribute('data-brightness')).toBe('0');
    }
  });

  it('grid is rendered with 13 rows', () => {
    const { container } = render(<GlyphGrid />);
    const rows = container.querySelectorAll('[data-testid^="row-"]');
    expect(rows).toHaveLength(13);
  });

  it('blocks the browser context menu on active cells', () => {
    const { container } = render(<GlyphGrid />);
    const activeCell = container.querySelector('[data-active="true"]');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const dispatchResult = activeCell.dispatchEvent(event);

    expect(dispatchResult).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('left mouse drag paints the same value across entered active cells', () => {
    const { container } = render(<GlyphGrid />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    const [first, second, third] = activeCells;

    mouseDownLeft(first);
    fireEvent.mouseEnter(second, { buttons: 1 });
    fireEvent.mouseEnter(third, { buttons: 1 });
    mouseUp(0);

    expect(first.getAttribute('data-brightness')).toBe('1024');
    expect(second.getAttribute('data-brightness')).toBe('1024');
    expect(third.getAttribute('data-brightness')).toBe('1024');
  });

  it('right mouse drag paints the same reverse value across entered active cells', () => {
    const { container } = render(<GlyphGrid />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    const [first, second, third] = activeCells;

    mouseDownRight(first);
    fireEvent.mouseEnter(second, { buttons: 2 });
    fireEvent.mouseEnter(third, { buttons: 2 });
    mouseUp(2);

    expect(first.getAttribute('data-brightness')).toBe('4095');
    expect(second.getAttribute('data-brightness')).toBe('4095');
    expect(third.getAttribute('data-brightness')).toBe('4095');
  });

  it('stops drag painting after mouseup', () => {
    const { container } = render(<GlyphGrid />);
    const activeCells = container.querySelectorAll('[data-active="true"]');
    const [first, second, third] = activeCells;

    mouseDownLeft(first);
    fireEvent.mouseEnter(second, { buttons: 1 });
    mouseUp(0);
    fireEvent.mouseEnter(third, { buttons: 1 });

    expect(first.getAttribute('data-brightness')).toBe('1024');
    expect(second.getAttribute('data-brightness')).toBe('1024');
    expect(third.getAttribute('data-brightness')).toBe('0');
  });
});

describe('Invert Colors Button', () => {
  it('renders an Invert Colors button', () => {
    render(<GlyphGrid />);
    const button = screen.getByRole('button', { name: /invert colors/i });
    expect(button).toBeInTheDocument();
  });

  it('inverts 0 to 4095 for active pixels', () => {
    const { container } = render(<GlyphGrid />);
    // All active pixels start at 0
    const invertBtn = screen.getByRole('button', { name: /invert colors/i });
    fireEvent.click(invertBtn);

    // All active pixels should now be 4095
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('4095');
    });
  });

  it('inverts 4095 to 0 for active pixels', () => {
    const { container } = render(<GlyphGrid />);
    const invertBtn = screen.getByRole('button', { name: /invert colors/i });

    // First invert: 0 → 4095
    fireEvent.click(invertBtn);
    // Second invert: 4095 → 0
    fireEvent.click(invertBtn);

    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('inverts 1024 to 3071 (4095 - 1024 = 3071)', () => {
    const { container } = render(<GlyphGrid />);
    // Click first active pixel once: 0 → 1024
    const activeCell = container.querySelector('[data-active="true"]');
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('1024');

    // Invert
    const invertBtn = screen.getByRole('button', { name: /invert colors/i });
    fireEvent.click(invertBtn);

    // The clicked pixel should now be 3071
    expect(activeCell.getAttribute('data-brightness')).toBe('3071');
  });

  it('inverts 3072 to 1023 (4095 - 3072 = 1023)', () => {
    const { container } = render(<GlyphGrid />);
    // Click first active pixel 3 times: 0 → 1024 → 2048 → 3072
    const activeCell = container.querySelector('[data-active="true"]');
    fireEvent.click(activeCell);
    fireEvent.click(activeCell);
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('3072');

    // Invert
    const invertBtn = screen.getByRole('button', { name: /invert colors/i });
    fireEvent.click(invertBtn);

    expect(activeCell.getAttribute('data-brightness')).toBe('1023');
  });

  it('inverts 2048 to 2047 (4095 - 2048 = 2047)', () => {
    const { container } = render(<GlyphGrid />);
    // Click first active pixel twice: 0 → 1024 → 2048
    const activeCell = container.querySelector('[data-active="true"]');
    fireEvent.click(activeCell);
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('2048');

    // Invert
    const invertBtn = screen.getByRole('button', { name: /invert colors/i });
    fireEvent.click(invertBtn);

    // 2048 inverts to 2047 (4095 - 2048 = 2047)
    expect(activeCell.getAttribute('data-brightness')).toBe('2047');
  });

  it('does not affect inactive corner pixels', () => {
    const { container } = render(<GlyphGrid />);
    const invertBtn = screen.getByRole('button', { name: /invert colors/i });
    fireEvent.click(invertBtn);

    const inactiveCells = container.querySelectorAll('[data-active="false"]');
    inactiveCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('double invert restores exact original state for a mixed pattern', () => {
    const { container } = render(<GlyphGrid />);
    const activeCells = container.querySelectorAll('[data-active="true"]');

    // Set up a mixed pattern: click different pixels different numbers of times
    // Pixel 0: click 1 time → 1024
    fireEvent.click(activeCells[0]);
    // Pixel 1: click 2 times → 2048
    fireEvent.click(activeCells[1]);
    fireEvent.click(activeCells[1]);
    // Pixel 2: click 3 times → 3072
    fireEvent.click(activeCells[2]);
    fireEvent.click(activeCells[2]);
    fireEvent.click(activeCells[2]);
    // Pixel 3: click 4 times → 4095
    fireEvent.click(activeCells[3]);
    fireEvent.click(activeCells[3]);
    fireEvent.click(activeCells[3]);
    fireEvent.click(activeCells[3]);
    // Pixel 4: leave at 0

    // Snapshot the state
    const snapshot = [];
    activeCells.forEach((cell) => {
      snapshot.push(cell.getAttribute('data-brightness'));
    });

    // Double invert
    const invertBtn = screen.getByRole('button', { name: /invert colors/i });
    fireEvent.click(invertBtn);
    fireEvent.click(invertBtn);

    // State should be restored
    activeCells.forEach((cell, i) => {
      expect(cell.getAttribute('data-brightness')).toBe(snapshot[i]);
    });
  });

  it('correctly inverts all 5 brightness levels simultaneously (using 4095-value formula)', () => {
    const { container } = render(<GlyphGrid />);
    const activeCells = container.querySelectorAll('[data-active="true"]');

    // Set pixels to all 5 levels
    // Pixel 0: 0 (no clicks)
    // Pixel 1: 1024 (1 click)
    fireEvent.click(activeCells[1]);
    // Pixel 2: 2048 (2 clicks)
    fireEvent.click(activeCells[2]);
    fireEvent.click(activeCells[2]);
    // Pixel 3: 3072 (3 clicks)
    fireEvent.click(activeCells[3]);
    fireEvent.click(activeCells[3]);
    fireEvent.click(activeCells[3]);
    // Pixel 4: 4095 (4 clicks)
    fireEvent.click(activeCells[4]);
    fireEvent.click(activeCells[4]);
    fireEvent.click(activeCells[4]);
    fireEvent.click(activeCells[4]);

    // Invert
    const invertBtn = screen.getByRole('button', { name: /invert colors/i });
    fireEvent.click(invertBtn);

    // Verify each level inverted using 4095-value formula
    expect(activeCells[0].getAttribute('data-brightness')).toBe('4095'); // 4095-0=4095
    expect(activeCells[1].getAttribute('data-brightness')).toBe('3071'); // 4095-1024=3071
    expect(activeCells[2].getAttribute('data-brightness')).toBe('2047'); // 4095-2048=2047
    expect(activeCells[3].getAttribute('data-brightness')).toBe('1023'); // 4095-3072=1023
    expect(activeCells[4].getAttribute('data-brightness')).toBe('0'); // 4095-4095=0
  });

  it('has dark theme styling (dark background, white text)', () => {
    render(<GlyphGrid />);
    const button = screen.getByRole('button', { name: /invert colors/i });
    const style = button.style;
    // Check dark button background and light text
    expect(style.backgroundColor).toBeTruthy();
    expect(style.color).toBeTruthy();
  });
});

describe('Clear/Reset Button', () => {
  it('renders a Clear button', () => {
    render(<GlyphGrid />);
    const button = screen.getByRole('button', { name: /clear/i });
    expect(button).toBeInTheDocument();
  });

  it('sets all active pixels to brightness 0', () => {
    const { container } = render(<GlyphGrid />);
    const activeCells = container.querySelectorAll('[data-active="true"]');

    // Set some pixels to various brightness levels
    fireEvent.click(activeCells[0]); // 1024
    fireEvent.click(activeCells[1]); // 1024
    fireEvent.click(activeCells[1]); // 2048
    fireEvent.click(activeCells[2]); // 1024
    fireEvent.click(activeCells[2]); // 2048
    fireEvent.click(activeCells[2]); // 3072

    // Click Clear
    const clearBtn = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearBtn);

    // All active pixels should be 0
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('inactive pixels remain at 0 after clear', () => {
    const { container } = render(<GlyphGrid />);
    const clearBtn = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearBtn);

    const inactiveCells = container.querySelectorAll('[data-active="false"]');
    inactiveCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('clears a fully-lit grid (all active at 4095)', () => {
    const { container } = render(<GlyphGrid />);
    // Invert to set all active to 4095
    const invertBtn = screen.getByRole('button', { name: /invert colors/i });
    fireEvent.click(invertBtn);

    // Verify all active are 4095
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('4095');
    });

    // Clear
    const clearBtn = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearBtn);

    // All active should be 0
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('has dark theme styling (dark background, white text)', () => {
    render(<GlyphGrid />);
    const button = screen.getByRole('button', { name: /clear/i });
    const style = button.style;
    expect(style.backgroundColor).toBeTruthy();
    expect(style.color).toBeTruthy();
  });

  it('grid is editable after clear', () => {
    const { container } = render(<GlyphGrid />);

    // Set a pixel, clear, then set again
    const activeCell = container.querySelector('[data-active="true"]');
    fireEvent.click(activeCell); // 1024

    const clearBtn = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearBtn);
    expect(activeCell.getAttribute('data-brightness')).toBe('0');

    // Click again — should cycle from 0
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('1024');
  });
});

describe('Upload Image → crop modal integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: validateImageFile is a no-op (file is valid)
    validateImageFile.mockImplementation(() => {});
  });

  it('selecting a valid image file opens the crop modal', async () => {
    render(<GlyphGrid />);
    const fileInput = screen.getByTestId('image-upload-input');

    const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();
  });

  it('keeps main-screen and modal color mode switches synced', async () => {
    render(<GlyphGrid />);
    const fileInput = screen.getByTestId('image-upload-input');

    const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();

    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });

    fireEvent.click(screen.getByTestId('main-color-mode-2-button'));
    expect(screen.getByTestId('color-mode-2-button')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('main-color-mode-2-button')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('color-mode-5-button'));
    expect(screen.getByTestId('main-color-mode-5-button')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('color-mode-5-button')).toHaveAttribute('aria-checked', 'true');
  });

  it('selecting an invalid file shows upload error without opening the crop modal', async () => {
    validateImageFile.mockImplementation(() => {
      throw new Error('Unsupported file format. Please use PNG, JPEG, GIF, or WebP.');
    });

    render(<GlyphGrid />);
    const fileInput = screen.getByTestId('image-upload-input');

    const file = new File(['dummy'], 'document.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.getByTestId('upload-error')).toBeInTheDocument();
    expect(screen.queryByTestId('crop-modal-backdrop')).not.toBeInTheDocument();
  });

  it('clicking Cancel in the crop modal closes it without changing the grid', async () => {
    render(<GlyphGrid />);
    const fileInput = screen.getByTestId('image-upload-input');

    const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();

    // Click Cancel — modal starts fade-out animation (stays briefly in DOM)
    fireEvent.click(screen.getByTestId('crop-modal-cancel'));
    // Wait for the 150ms fade-out animation to complete before checking DOM
    await waitFor(
      () => expect(screen.queryByTestId('crop-modal-backdrop')).not.toBeInTheDocument(),
      { timeout: 500 },
    );
  });

  it('grid cells are not clickable while crop modal is open', async () => {
    render(<GlyphGrid />);
    const fileInput = screen.getByTestId('image-upload-input');

    // Open the modal
    const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();

    // Attempt to click an active grid cell — it is covered by the backdrop
    // The backdrop has pointer-events and z-index covering all background elements.
    // Verify the backdrop's z-index is above background content (>=1000).
    const backdrop = screen.getByTestId('crop-modal-backdrop');
    expect(parseInt(backdrop.style.zIndex, 10)).toBeGreaterThanOrEqual(1000);
    expect(backdrop.style.position).toBe('fixed');
  });
});

describe('Crop confirm — grid update and editability (VAL-PREVIEW-004, VAL-CROSS-009)', () => {
  // Build a known brightness pattern: all active cells at 4095
  const confirmedBrightness = CIRCULAR_MASK.map((isActive) => (isActive ? 4095 : 0));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    validateImageFile.mockImplementation(() => {});
    computePreviewBrightness.mockReturnValue(confirmedBrightness);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper: open the crop modal, load the image, and advance the debounce timer
   * so previewBrightness is set to confirmedBrightness.
   */
  async function openModalAndLoadImage() {
    const { container } = render(<GlyphGrid />);
    const fileInput = screen.getByTestId('image-upload-input');

    const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // Simulate image loading in CropArea
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

  it('clicking Confirm closes the modal', async () => {
    await openModalAndLoadImage();
    expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });
    // Advance past the 150ms fade-out animation timer
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId('crop-modal-backdrop')).not.toBeInTheDocument();
  });

  it('clicking Confirm applies the preview brightness to the main grid (VAL-PREVIEW-004)', async () => {
    const container = await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    // All active cells should now reflect confirmedBrightness (4095)
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('4095');
    });

    // Inactive cells remain 0
    const inactiveCells = container.querySelectorAll('[data-active="false"]');
    inactiveCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('grid is fully editable after crop confirm — clicking a cell cycles brightness (VAL-CROSS-009)', async () => {
    const container = await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    // Grid was set to all-4095 by confirm; verify that's the case
    const activeCell = container.querySelector('[data-active="true"]');
    expect(activeCell.getAttribute('data-brightness')).toBe('4095');

    // Click the cell: 4095 → 0 (wraps around)
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('0');

    // Click again: 0 → 1024
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('1024');
  });

  it('grid confirmed pattern survives Invert Colors (VAL-CROSS-004)', async () => {
    const container = await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });
    // Advance past fade-out so the modal (and its GlyphPreview) unmounts.
    // Without this, GlyphPreview cells also match [data-active="true"] and
    // won't reflect the Invert operation, causing false failures.
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // All active cells (main grid only, modal unmounted) should be at 4095
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('4095');
    });

    // Invert: 4095 → 0
    fireEvent.click(screen.getByRole('button', { name: /invert colors/i }));
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('Clear resets grid to all-zero after crop confirm (VAL-CROSS-010)', async () => {
    const container = await openModalAndLoadImage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });
    // Advance past fade-out so the modal (and its GlyphPreview) unmounts.
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // All active cells (main grid only, modal unmounted) should be at 4095
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('4095');
    });

    // Clear
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('Cancel does NOT apply the brightness — original grid is preserved (VAL-CROSS-005)', async () => {
    const { container } = render(<GlyphGrid />);

    // Paint a pattern first
    const activeCells = container.querySelectorAll('[data-active="true"]');
    fireEvent.click(activeCells[0]); // → 1024
    fireEvent.click(activeCells[1]); // → 1024
    fireEvent.click(activeCells[1]); // → 2048

    expect(activeCells[0].getAttribute('data-brightness')).toBe('1024');
    expect(activeCells[1].getAttribute('data-brightness')).toBe('2048');

    // Open modal
    const fileInput = screen.getByTestId('image-upload-input');
    const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // Cancel the modal — starts fade-out animation
    fireEvent.click(screen.getByTestId('crop-modal-cancel'));
    // Advance past the 150ms fade-out animation timer
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('crop-modal-backdrop')).not.toBeInTheDocument();

    // Original pattern preserved
    expect(activeCells[0].getAttribute('data-brightness')).toBe('1024');
    expect(activeCells[1].getAttribute('data-brightness')).toBe('2048');
  });

  it('second crop fully replaces first (VAL-CROSS-008)', async () => {
    // First crop: all 4095
    const container = await openModalAndLoadImage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('4095');
    });

    // Second crop: all 1024
    const secondBrightness = CIRCULAR_MASK.map((active) => (active ? 1024 : 0));
    computePreviewBrightness.mockReturnValue(secondBrightness);

    const fileInput = screen.getByTestId('image-upload-input');
    const file2 = new File(['b'], 'b.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file2] } });
    });

    const img2 = screen.getByTestId('crop-image');
    Object.defineProperty(img2, 'naturalWidth', { value: 300, configurable: true });
    Object.defineProperty(img2, 'naturalHeight', { value: 300, configurable: true });
    await act(async () => {
      fireEvent.load(img2);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    });

    // Grid should fully reflect second crop (1024), not first (4095)
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('1024');
    });
  });
});

describe('Main screen brightness controls', () => {
  it('does not render master brightness controls', () => {
    render(<GlyphGrid />);
    expect(screen.queryByTestId('master-brightness-slider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('master-brightness-text')).not.toBeInTheDocument();
    expect(screen.queryByText(/master brightness/i)).not.toBeInTheDocument();
  });

  it('Export JSON calls downloadExportJSON with base values', () => {
    const { container } = render(<GlyphGrid />);
    const activeCell = container.querySelector('[data-active="true"]');

    fireEvent.click(activeCell);
    fireEvent.click(activeCell);
    expect(activeCell.getAttribute('data-brightness')).toBe('2048');

    fireEvent.click(screen.getByTestId('export-json-button'));

    expect(downloadExportJSON).toHaveBeenCalledTimes(1);
    const calledGrid = downloadExportJSON.mock.calls[0][0];
    const firstActiveIdx = CIRCULAR_MASK.indexOf(true);
    expect(calledGrid[firstActiveIdx]).toBe(2048);
  });
});

describe('Pattern code copy button', () => {
  let writeTextMock;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  it('renders a Copy button next to a read-only pattern code display', () => {
    render(<GlyphGrid />);
    expect(screen.getByTestId('share-field').tagName).toBe('DIV');
    expect(screen.getByTestId('share-copy-button')).toBeInTheDocument();
  });

  it('disables Copy when there is no encoded pattern', () => {
    render(<GlyphGrid />);
    expect(screen.getByTestId('share-copy-button')).toBeDisabled();
  });

  it('copies the encoded pattern string to clipboard', async () => {
    const { container } = render(<GlyphGrid />);
    const activeCell = container.querySelector('[data-active="true"]');
    fireEvent.click(activeCell);

    const shareField = screen.getByTestId('share-field');
    const copyButton = screen.getByTestId('share-copy-button');
    const displayedPattern = shareField.textContent;
    expect(displayedPattern).toBeTruthy();
    expect(copyButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeTextMock).toHaveBeenCalledWith(displayedPattern);
    expect(screen.getByTestId('share-copy-success')).toBeInTheDocument();
  });

  it('does not render inline pattern import controls on the main screen', () => {
    render(<GlyphGrid />);
    expect(screen.queryByTestId('share-import-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('share-import-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('share-import-success')).not.toBeInTheDocument();
  });
});

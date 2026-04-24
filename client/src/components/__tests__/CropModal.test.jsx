import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CropModal from '../CropModal.jsx';
import { TOTAL_CELLS, CIRCULAR_MASK, BRIGHTNESS_LEVELS } from '../../utils/gridConstants.js';

// Partially mock cropUtils so computePreviewBrightness is controllable in tests
// while all other utilities (CROP_SIZE, clampZoom, etc.) stay real.
vi.mock('../../utils/cropUtils.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    computePreviewBrightness: vi.fn(),
  };
});

// Import the mocked function AFTER vi.mock so we get the spy reference
import { computePreviewBrightness } from '../../utils/cropUtils.js';

const mockFile = new File(['test-image-data'], 'photo.png', { type: 'image/png' });
const DEFAULT_FIT_ZOOM_SLIDER_VALUE = ((1 - 0.25) / (5 - 0.25)) * 100;

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

describe('CropModal — visibility', () => {
  it('does not render when isOpen is false', () => {
    render(<CropModal isOpen={false} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByTestId('crop-modal-backdrop')).not.toBeInTheDocument();
  });

  it('renders backdrop when isOpen is true', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();
  });

  it('renders modal panel when isOpen is true', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('crop-modal-panel')).toBeInTheDocument();
  });

  it('modal backdrop persists during fade-out when isOpen transitions to false', () => {
    // The modal should remain in the DOM while the fade-out animation plays.
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />,
      );
      expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();

      rerender(<CropModal isOpen={false} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
      // Still in the DOM — fade-out animation is in progress
      expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();
      // The backdrop should have data-closing="true" during animation
      expect(screen.getByTestId('crop-modal-backdrop').dataset.closing).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('modal unmounts after fade-out animation completes (~150ms)', async () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />,
      );
      expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();

      rerender(<CropModal isOpen={false} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
      // Still present at t=0
      expect(screen.getByTestId('crop-modal-backdrop')).toBeInTheDocument();

      // Advance past the 150ms fade-out timer
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Now unmounted
      expect(screen.queryByTestId('crop-modal-backdrop')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CropModal — layout structure', () => {
  beforeEach(() => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
  });

  it('renders crop area', () => {
    expect(screen.getByTestId('crop-area')).toBeInTheDocument();
  });

  it('renders zoom slider', () => {
    expect(screen.getByTestId('zoom-slider')).toBeInTheDocument();
    expect(screen.getByTestId('zoom-slider').type).toBe('range');
  });

  it('renders glyph preview (miniature 13x13 grid)', () => {
    expect(screen.getByTestId('glyph-preview')).toBeInTheDocument();
  });

  it('renders button bar', () => {
    expect(screen.getByTestId('crop-modal-button-bar')).toBeInTheDocument();
  });
});

describe('CropModal — button rendering and styling', () => {
  it('renders Confirm button', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('crop-modal-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('crop-modal-confirm').textContent).toBe('Confirm');
  });

  it('renders Cancel button', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('crop-modal-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('crop-modal-cancel').textContent).toBe('Cancel');
  });

  it('Confirm button has green primary styling when preview is ready', async () => {
    // Need non-null previewBrightness so the button is enabled (green)
    const mockBrightness = new Array(169).fill(0);
    computePreviewBrightness.mockReturnValue(mockBrightness);
    vi.useFakeTimers();
    try {
      render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
      const img = screen.getByTestId('crop-image');
      Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
      await act(async () => {
        fireEvent.load(img);
      });
      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      const confirmBtn = screen.getByTestId('crop-modal-confirm');
      // Green color matches existing Confirm & Generate button (#1a6b1a)
      expect(confirmBtn.style.backgroundColor).toBe('rgb(26, 107, 26)');
    } finally {
      vi.useRealTimers();
      vi.resetAllMocks();
    }
  });

  it('Cancel button has gray secondary styling', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const cancelBtn = screen.getByTestId('crop-modal-cancel');
    // Gray matches existing toolbar buttons (#333)
    expect(cancelBtn.style.backgroundColor).toBe('rgb(51, 51, 51)');
  });

  it('modal panel has dark theme background', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const panel = screen.getByTestId('crop-modal-panel');
    expect(panel.style.backgroundColor).toBe('rgb(26, 26, 26)');
    expect(panel.style.color).toBe('rgb(255, 255, 255)');
  });

  it('backdrop has semi-transparent dark overlay', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const backdrop = screen.getByTestId('crop-modal-backdrop');
    // rgba(0, 0, 0, 0.75) — dark semi-transparent
    expect(backdrop.style.backgroundColor).toContain('rgba(0, 0, 0');
  });
});

describe('CropModal — Cancel button behavior', () => {
  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={onClose} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByTestId('crop-modal-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onConfirm when Cancel is clicked', () => {
    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('crop-modal-cancel'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('CropModal — Confirm button behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  /** Helper: render modal, load image, advance debounce so previewBrightness is set. */
  async function renderWithPreview(onConfirm, onClose) {
    const mockBrightness = new Array(169).fill(1024);
    computePreviewBrightness.mockReturnValue(mockBrightness);
    render(
      <CropModal
        isOpen={true}
        file={mockFile}
        onClose={onClose || vi.fn()}
        onConfirm={onConfirm || vi.fn()}
      />,
    );
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    return mockBrightness;
  }

  it('Confirm button is disabled when previewBrightness is null (before image loads)', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('crop-modal-confirm')).toBeDisabled();
  });

  it('Confirm button is grayed-out (not green) when previewBrightness is null', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const btn = screen.getByTestId('crop-modal-confirm');
    // Disabled state uses gray (#333 = rgb(51,51,51)), not green
    expect(btn.style.backgroundColor).toBe('rgb(51, 51, 51)');
  });

  it('clicking disabled Confirm does not call onConfirm', () => {
    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);
    // Button is disabled — previewBrightness is null
    expect(screen.getByTestId('crop-modal-confirm')).toBeDisabled();
    fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm when Confirm is clicked with non-null previewBrightness', async () => {
    const onConfirm = vi.fn();
    const mockBrightness = await renderWithPreview(onConfirm);
    expect(screen.getByTestId('crop-modal-confirm')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(mockBrightness);
  });

  it('does not call onClose when Confirm is clicked', async () => {
    const onClose = vi.fn();
    await renderWithPreview(undefined, onClose);
    fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('CropModal — backdrop dismiss', () => {
  it('calls onClose when backdrop is clicked (mousedown + click on backdrop)', () => {
    const onClose = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={onClose} onConfirm={vi.fn()} />);
    const backdrop = screen.getByTestId('crop-modal-backdrop');
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal panel is clicked', () => {
    const onClose = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={onClose} onConfirm={vi.fn()} />);
    const panel = screen.getByTestId('crop-modal-panel');
    fireEvent.mouseDown(panel);
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not dismiss when mousedown starts inside panel but ends on backdrop', () => {
    const onClose = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={onClose} onConfirm={vi.fn()} />);
    const panel = screen.getByTestId('crop-modal-panel');
    const backdrop = screen.getByTestId('crop-modal-backdrop');
    // Simulate drag: mousedown on panel, then click/mouseup on backdrop
    fireEvent.mouseDown(panel);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onConfirm on backdrop click', () => {
    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);
    const backdrop = screen.getByTestId('crop-modal-backdrop');
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('CropModal — Escape key dismiss', () => {
  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={onClose} onConfirm={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose for other keys', () => {
    const onClose = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={onClose} onConfirm={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'Space' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not fire Escape handler when modal is not open', () => {
    const onClose = vi.fn();
    render(<CropModal isOpen={false} file={mockFile} onClose={onClose} onConfirm={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleans up Escape handler when modal is closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <CropModal isOpen={true} file={mockFile} onClose={onClose} onConfirm={vi.fn()} />,
    );
    // Close modal
    rerender(<CropModal isOpen={false} file={mockFile} onClose={onClose} onConfirm={vi.fn()} />);
    // Escape should no longer trigger onClose
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('CropModal — background interaction blocking', () => {
  it('backdrop has fixed position covering the entire viewport', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const backdrop = screen.getByTestId('crop-modal-backdrop');
    expect(backdrop.style.position).toBe('fixed');
    // inset: 0 means top/right/bottom/left all set to 0 (stored without unit in jsdom)
    expect(backdrop.style.inset).toBe('0');
  });

  it('backdrop has high z-index to sit above all background content', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const backdrop = screen.getByTestId('crop-modal-backdrop');
    expect(parseInt(backdrop.style.zIndex, 10)).toBeGreaterThanOrEqual(1000);
  });

  it('locks body scroll while modal is open (overflow: hidden)', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when modal unmounts', () => {
    const { unmount } = render(
      <CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores body scroll when isOpen changes to false', () => {
    const { rerender } = render(
      <CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<CropModal isOpen={false} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('does not lock body scroll when modal is not open', () => {
    render(<CropModal isOpen={false} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('CropModal — crop area rendering', () => {
  it('renders crop area with the circular mask overlay', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('crop-area')).toBeInTheDocument();
    expect(screen.getByTestId('crop-mask-overlay')).toBeInTheDocument();
  });

  it('shows error in crop area when image fails to load', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    // Simulate image load error on the hidden crop image element
    const img = screen.getByTestId('crop-image');
    fireEvent.error(img);
    expect(screen.getByTestId('crop-area-error')).toBeInTheDocument();
    expect(screen.getByTestId('crop-area-error').textContent).toMatch(
      /corrupt|unsupported|failed/i,
    );
  });

  it('crop area error does not crash the modal — modal still shows', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    fireEvent.error(img);
    // Modal still shows: buttons still accessible
    expect(screen.getByTestId('crop-modal-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('crop-modal-confirm')).toBeInTheDocument();
  });
});

describe('CropModal — zoom slider initial state', () => {
  it('zoom slider is at position 0 when modal opens (before image loads)', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const slider = screen.getByTestId('zoom-slider');
    expect(Number(slider.value)).toBe(0);
  });

  it('zoom slider is disabled before image loads', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('zoom-slider')).toBeDisabled();
  });

  it('zoom slider is enabled and starts at fit-zoom position after image loads', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    // Simulate successful load with a square 200×200 image
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    const slider = screen.getByTestId('zoom-slider');
    expect(slider).not.toBeDisabled();
    // After load, slider starts at fit zoom (25%-to-500% range baseline)
    expect(Number(slider.value)).toBeCloseTo(DEFAULT_FIT_ZOOM_SLIDER_VALUE, 1);
  });

  it('allows zooming out to 25% of fit zoom so the full image can fit', async () => {
    computePreviewBrightness.mockReturnValue(new Array(169).fill(0));
    vi.useFakeTimers();
    try {
      render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
      const img = screen.getByTestId('crop-image');
      Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });

      await act(async () => {
        fireEvent.load(img);
      });
      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      fireEvent.change(screen.getByTestId('zoom-slider'), { target: { value: '0' } });
      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      const lastCall =
        computePreviewBrightness.mock.calls[computePreviewBrightness.mock.calls.length - 1];
      // 200x200 in a 300px crop area: fit zoom = 1.5, floor = 1.5 * 0.25 = 0.375
      expect(lastCall[1]).toBeCloseTo(0.375, 5);
    } finally {
      vi.useRealTimers();
      vi.resetAllMocks();
    }
  });
});

describe('CropModal — crop state reset on new file', () => {
  it('resets zoom to fit level when a new file is loaded', () => {
    const file1 = new File(['a'], 'a.png', { type: 'image/png' });
    const file2 = new File(['b'], 'b.png', { type: 'image/png' });

    const { rerender } = render(
      <CropModal isOpen={true} file={file1} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );

    // Load file1 (200×200 square)
    const imgA = screen.getByTestId('crop-image');
    Object.defineProperty(imgA, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(imgA, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(imgA);

    // Zoom in via slider
    const slider = screen.getByTestId('zoom-slider');
    fireEvent.change(slider, { target: { value: '100' } });
    expect(Number(slider.value)).toBeGreaterThan(50); // Zoomed in

    // Switch to file2
    rerender(<CropModal isOpen={true} file={file2} onClose={vi.fn()} onConfirm={vi.fn()} />);

    // Load file2 (200×200 square)
    const imgB = screen.getByTestId('crop-image');
    Object.defineProperty(imgB, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(imgB, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(imgB);

    // Slider should be reset to the fit-zoom position for new file
    const sliderAfter = screen.getByTestId('zoom-slider');
    expect(Number(sliderAfter.value)).toBeCloseTo(DEFAULT_FIT_ZOOM_SLIDER_VALUE, 1);
  });

  it('slider reflects fit-zoom position after image load for landscape image', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);

    const img = screen.getByTestId('crop-image');
    // Landscape: fit zoom starts at the same normalized slider position
    Object.defineProperty(img, 'naturalWidth', { value: 600, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 300, configurable: true });
    fireEvent.load(img);

    expect(Number(screen.getByTestId('zoom-slider').value)).toBeCloseTo(
      DEFAULT_FIT_ZOOM_SLIDER_VALUE,
      1,
    );
  });

  it('slider reflects fit-zoom position after image load for portrait image', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);

    const img = screen.getByTestId('crop-image');
    // Portrait: fit zoom starts at the same normalized slider position
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 400, configurable: true });
    fireEvent.load(img);

    expect(Number(screen.getByTestId('zoom-slider').value)).toBeCloseTo(
      DEFAULT_FIT_ZOOM_SLIDER_VALUE,
      1,
    );
  });
});

describe('CropModal — glyph preview rendering', () => {
  it('renders GlyphPreview component (glyph-preview testid)', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('glyph-preview')).toBeInTheDocument();
  });

  it('preview renders 169 cells', () => {
    const { container } = render(
      <CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    const cells = container.querySelectorAll('[data-testid^="preview-cell-"]');
    expect(cells).toHaveLength(169);
  });

  it('preview renders 137 active cells and 32 inactive cells', () => {
    const { container } = render(
      <CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    const activeCells = container.querySelectorAll('[data-active="true"]');
    const inactiveCells = container.querySelectorAll('[data-active="false"]');
    expect(activeCells).toHaveLength(137);
    expect(inactiveCells).toHaveLength(32);
  });

  it('preview shows default (all-zero) brightness before image loads', () => {
    const { container } = render(
      <CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    const activeCells = container.querySelectorAll('[data-active="true"]');
    activeCells.forEach((cell) => {
      expect(cell.getAttribute('data-brightness')).toBe('0');
    });
  });

  it('preview updates to computed brightness after image loads and debounce fires', async () => {
    // Build a recognizable test brightness: all active cells at 4095
    const mockBrightness = CIRCULAR_MASK.map((active) => (active ? 4095 : 0));
    computePreviewBrightness.mockReturnValue(mockBrightness);

    vi.useFakeTimers();
    try {
      render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);

      // Load the image
      const img = screen.getByTestId('crop-image');
      Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
      await act(async () => {
        fireEvent.load(img);
      });

      // Advance debounce timer
      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      // Preview cells should now reflect the mock brightness — re-query after state update
      const activeCell = screen.getAllByTestId(/^preview-cell-/)[CIRCULAR_MASK.indexOf(true)];
      expect(activeCell.getAttribute('data-brightness')).toBe('4095');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CropModal — Confirm passes previewBrightness to onConfirm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('calls onConfirm with the current previewBrightness when Confirm is clicked', async () => {
    const mockBrightness = CIRCULAR_MASK.map((active) => (active ? 2048 : 0));
    computePreviewBrightness.mockReturnValue(mockBrightness);

    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);

    // Load the image so the preview effect can fire
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });

    // Advance the debounce timer so previewBrightness is set
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Click Confirm
    fireEvent.click(screen.getByTestId('crop-modal-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(mockBrightness);
  });

  it('does not call onConfirm when previewBrightness is null (button is disabled)', () => {
    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);

    // previewBrightness is null — button must be disabled
    const confirmBtn = screen.getByTestId('crop-modal-confirm');
    expect(confirmBtn).toBeDisabled();

    // Clicking a disabled button must NOT invoke onConfirm
    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('passed brightness array has 169 elements', async () => {
    const mockBrightness = new Array(TOTAL_CELLS)
      .fill(0)
      .map((_, i) => (CIRCULAR_MASK[i] ? BRIGHTNESS_LEVELS[i % BRIGHTNESS_LEVELS.length] : 0));
    computePreviewBrightness.mockReturnValue(mockBrightness);

    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);

    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 400, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    fireEvent.click(screen.getByTestId('crop-modal-confirm'));

    const received = onConfirm.mock.calls[0][0];
    expect(Array.isArray(received)).toBe(true);
    expect(received).toHaveLength(TOTAL_CELLS);
  });

  it('resets previewBrightness to null when a new file is loaded (Confirm is re-disabled)', async () => {
    const file1 = new File(['a'], 'a.png', { type: 'image/png' });
    const file2 = new File(['b'], 'b.png', { type: 'image/png' });

    const mockBrightness = CIRCULAR_MASK.map((a) => (a ? 4095 : 0));
    computePreviewBrightness.mockReturnValue(mockBrightness);

    const onConfirm = vi.fn();
    const { rerender } = render(
      <CropModal isOpen={true} file={file1} onClose={vi.fn()} onConfirm={onConfirm} />,
    );

    // Load file1 and advance debounce
    const imgA = screen.getByTestId('crop-image');
    Object.defineProperty(imgA, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(imgA, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(imgA);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Preview should be set — button is enabled
    expect(screen.getByTestId('crop-modal-confirm')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    expect(onConfirm.mock.calls[0][0]).toEqual(mockBrightness);
    onConfirm.mockClear();

    // Switch to file2 — previewBrightness resets to null, button becomes disabled
    rerender(<CropModal isOpen={true} file={file2} onClose={vi.fn()} onConfirm={onConfirm} />);

    // Button is disabled immediately after file switch (before debounce fires)
    expect(screen.getByTestId('crop-modal-confirm')).toBeDisabled();
    // Clicking the disabled button must NOT call onConfirm
    fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ─── Brightness slider ────────────────────────────────────────────────────────

describe('CropModal — brightness slider', () => {
  it('renders brightness slider', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('brightness-slider')).toBeInTheDocument();
  });

  it('brightness slider has type range', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('brightness-slider').type).toBe('range');
  });

  it('brightness slider has min=0 and max=100', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const slider = screen.getByTestId('brightness-slider');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('100');
  });

  it('brightness slider has default value 50', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(Number(screen.getByTestId('brightness-slider').value)).toBe(50);
  });

  it('brightness slider is disabled before image loads', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('brightness-slider')).toBeDisabled();
  });

  it('brightness slider is enabled after image loads', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);
    expect(screen.getByTestId('brightness-slider')).not.toBeDisabled();
  });

  it('brightness slider is independent of zoom slider (different testids)', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('brightness-slider')).not.toBe(screen.getByTestId('zoom-slider'));
  });
});

// ─── Brightness textbox ───────────────────────────────────────────────────────

describe('CropModal — brightness textbox', () => {
  it('renders brightness textbox', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('brightness-text')).toBeInTheDocument();
  });

  it('brightness textbox shows default value 50', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('brightness-text').value).toBe('50');
  });

  it('changing slider updates textbox value in real-time', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    fireEvent.change(screen.getByTestId('brightness-slider'), { target: { value: '75' } });
    expect(screen.getByTestId('brightness-text').value).toBe('75');
  });

  it('textbox input with valid number updates slider after blur', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    const textbox = screen.getByTestId('brightness-text');
    fireEvent.change(textbox, { target: { value: '30' } });
    fireEvent.blur(textbox);

    expect(Number(screen.getByTestId('brightness-slider').value)).toBe(30);
  });

  it('textbox clamps value > 100 to 100', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    const textbox = screen.getByTestId('brightness-text');
    fireEvent.change(textbox, { target: { value: '150' } });
    fireEvent.blur(textbox);

    expect(Number(screen.getByTestId('brightness-slider').value)).toBe(100);
    expect(textbox.value).toBe('100');
  });

  it('textbox clamps value < 0 to 0', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    const textbox = screen.getByTestId('brightness-text');
    fireEvent.change(textbox, { target: { value: '-10' } });
    fireEvent.blur(textbox);

    expect(Number(screen.getByTestId('brightness-slider').value)).toBe(0);
    expect(textbox.value).toBe('0');
  });

  it('textbox non-numeric input reverts to previous value without crash', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    const textbox = screen.getByTestId('brightness-text');
    fireEvent.change(textbox, { target: { value: 'abc' } });
    fireEvent.blur(textbox);

    // Reverts to previous value (50)
    expect(Number(screen.getByTestId('brightness-slider').value)).toBe(50);
    expect(textbox.value).toBe('50');
  });

  it('empty textbox reverts to previous value without crash', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    const textbox = screen.getByTestId('brightness-text');
    fireEvent.change(textbox, { target: { value: '' } });
    fireEvent.blur(textbox);

    // Reverts to previous value (50)
    expect(Number(screen.getByTestId('brightness-slider').value)).toBe(50);
    expect(textbox.value).toBe('50');
  });

  it('pressing Enter in textbox commits value (same as blur)', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    const textbox = screen.getByTestId('brightness-text');
    fireEvent.change(textbox, { target: { value: '42' } });
    fireEvent.keyDown(textbox, { key: 'Enter' });

    expect(Number(screen.getByTestId('brightness-slider').value)).toBe(42);
  });
});

// ─── Color mode switch (5 Colors | 2 Colors) ──────────────────────────────────

describe('CropModal — color mode switch', () => {
  async function loadImageForControls() {
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });
  }

  it('renders segmented color mode switch', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('color-mode-switch')).toBeInTheDocument();
    expect(screen.getByTestId('color-mode-5-button')).toBeInTheDocument();
    expect(screen.getByTestId('color-mode-2-button')).toBeInTheDocument();
  });

  it('defaults to 2 Colors mode when no cookie is present', () => {
    clearColorModeCookie();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('color-mode-2-button')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('color-mode-5-button')).toHaveAttribute('aria-checked', 'false');
  });

  it('switches to 2 Colors mode when 2 Colors button is clicked', async () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    await loadImageForControls();
    fireEvent.click(screen.getByTestId('color-mode-2-button'));
    expect(screen.getByTestId('color-mode-2-button')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('color-mode-5-button')).toHaveAttribute('aria-checked', 'false');
  });

  it('switches back to 5 Colors mode when 5 Colors button is clicked', async () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    await loadImageForControls();
    fireEvent.click(screen.getByTestId('color-mode-2-button'));
    expect(screen.getByTestId('color-mode-2-button')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('color-mode-5-button'));
    expect(screen.getByTestId('color-mode-2-button')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('color-mode-5-button')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders both labels', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText('2 Colors')).toBeInTheDocument();
    expect(screen.getByText('5 Colors')).toBeInTheDocument();
  });

  it('initializes from color mode cookie when present', () => {
    document.cookie = 'glyph_color_mode=2; path=/';
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId('color-mode-2-button')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('color-mode-5-button')).toHaveAttribute('aria-checked', 'false');
  });

  it('writes color mode cookie when mode changes', async () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    await loadImageForControls();
    fireEvent.click(screen.getByTestId('color-mode-2-button'));
    expect(document.cookie).toContain('glyph_color_mode=2');
  });
});

describe('CropModal — invert colors checkbox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  async function loadImageForInvertControls() {
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
  }

  it('renders invert checkbox and keeps it disabled before image load', () => {
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const invertCheckbox = screen.getByTestId('invert-colors-checkbox');
    expect(invertCheckbox).toBeInTheDocument();
    expect(invertCheckbox).toBeDisabled();
    expect(invertCheckbox).not.toBeChecked();
  });

  it('inverts preview and confirm output when toggled on', async () => {
    const baseGrid = CIRCULAR_MASK.map((active) => (active ? 1024 : 0));
    const invertedGrid = CIRCULAR_MASK.map((active) => (active ? 3071 : 0));
    computePreviewBrightness.mockReturnValue(baseGrid);

    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);
    await loadImageForInvertControls();

    const firstActiveIndex = CIRCULAR_MASK.indexOf(true);
    expect(
      screen.getByTestId(`preview-cell-${firstActiveIndex}`).getAttribute('data-brightness'),
    ).toBe('1024');

    const invertCheckbox = screen.getByTestId('invert-colors-checkbox');
    fireEvent.click(invertCheckbox);
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(invertCheckbox).toBeChecked();
    expect(
      screen.getByTestId(`preview-cell-${firstActiveIndex}`).getAttribute('data-brightness'),
    ).toBe('3071');

    fireEvent.click(screen.getByTestId('crop-modal-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(invertedGrid);
  });
});

// ─── computePreviewBrightness integration ────────────────────────────────────

describe('CropModal — brightness/only2Colors passed to computePreviewBrightness', () => {
  // Note: only2Colors is the 9th argument (index 8) to computePreviewBrightness.
  // Default is false (5-color mode). When checked, true (2-color black/white mode).
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  /** Load image in modal and advance timers so preview fires. */
  async function loadImage() {
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
  }

  it('calls computePreviewBrightness with default brightness=50, only2Colors=true when no cookie is present', async () => {
    clearColorModeCookie();
    computePreviewBrightness.mockReturnValue(new Array(169).fill(0));
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    await loadImage();

    expect(computePreviewBrightness).toHaveBeenCalled();
    const lastCall =
      computePreviewBrightness.mock.calls[computePreviewBrightness.mock.calls.length - 1];
    // brightness is 8th argument (index 7), only2Colors is 9th (index 8)
    expect(lastCall[7]).toBe(50);
    expect(lastCall[8]).toBe(true);
  });

  it('calls computePreviewBrightness with updated brightness after slider change', async () => {
    computePreviewBrightness.mockReturnValue(new Array(169).fill(0));
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    await loadImage();

    // Change brightness slider
    fireEvent.change(screen.getByTestId('brightness-slider'), { target: { value: '75' } });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    const lastCall =
      computePreviewBrightness.mock.calls[computePreviewBrightness.mock.calls.length - 1];
    expect(lastCall[7]).toBe(75);
  });

  it('calls computePreviewBrightness with only2Colors=true after selecting 2 Colors', async () => {
    computePreviewBrightness.mockReturnValue(new Array(169).fill(0));
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    await loadImage();

    // Select 2 Colors
    fireEvent.click(screen.getByTestId('color-mode-2-button'));
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    const lastCall =
      computePreviewBrightness.mock.calls[computePreviewBrightness.mock.calls.length - 1];
    expect(lastCall[8]).toBe(true);
  });

  it('calls computePreviewBrightness with only2Colors=false after switching back to 5 Colors', async () => {
    computePreviewBrightness.mockReturnValue(new Array(169).fill(0));
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={vi.fn()} />);
    await loadImage();

    // Select 2 Colors then switch back to 5 Colors
    fireEvent.click(screen.getByTestId('color-mode-2-button'));
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    fireEvent.click(screen.getByTestId('color-mode-5-button'));
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    const lastCall =
      computePreviewBrightness.mock.calls[computePreviewBrightness.mock.calls.length - 1];
    expect(lastCall[8]).toBe(false);
  });
});

// ─── State behavior on new file ────────────────────────────────────────────────

describe('CropModal — brightness reset + persisted color mode on new file', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('brightness resets to 50 when a new file is loaded', () => {
    const file1 = new File(['a'], 'a.png', { type: 'image/png' });
    const file2 = new File(['b'], 'b.png', { type: 'image/png' });

    const { rerender } = render(
      <CropModal isOpen={true} file={file1} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );

    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    // Change brightness
    fireEvent.change(screen.getByTestId('brightness-slider'), { target: { value: '20' } });
    expect(Number(screen.getByTestId('brightness-slider').value)).toBe(20);

    // Switch to file2
    rerender(<CropModal isOpen={true} file={file2} onClose={vi.fn()} onConfirm={vi.fn()} />);

    // Brightness should be reset to 50
    expect(Number(screen.getByTestId('brightness-slider').value)).toBe(50);
    expect(screen.getByTestId('brightness-text').value).toBe('50');
  });

  it('selected color mode persists when a new file is loaded', () => {
    const file1 = new File(['a'], 'a.png', { type: 'image/png' });
    const file2 = new File(['b'], 'b.png', { type: 'image/png' });

    const { rerender } = render(
      <CropModal isOpen={true} file={file1} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );

    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);

    // Select 2 Colors mode
    fireEvent.click(screen.getByTestId('color-mode-2-button'));
    expect(screen.getByTestId('color-mode-2-button')).toHaveAttribute('aria-checked', 'true');

    // Switch to file2
    rerender(<CropModal isOpen={true} file={file2} onClose={vi.fn()} onConfirm={vi.fn()} />);

    // Color mode should remain 2 Colors (persisted preference)
    expect(screen.getByTestId('color-mode-2-button')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('color-mode-5-button')).toHaveAttribute('aria-checked', 'false');
  });
});

// ─── Stale-confirm fix: synchronous recompute on Confirm ─────────────────────

describe('CropModal — Confirm uses fresh brightness (no stale debounce)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('Confirm after rapid brightness change sends new brightness value, not stale cached value', async () => {
    // oldBrightness: result of the initial debounced compute (brightness=50)
    const oldBrightness = new Array(169).fill(1024);
    // newBrightness: result of synchronous recompute at click time (brightness=75)
    const newBrightness = new Array(169).fill(2048);

    // First invocation (debounced preview): returns oldBrightness
    // Second invocation (synchronous on Confirm click): returns newBrightness
    computePreviewBrightness.mockReturnValueOnce(oldBrightness).mockReturnValueOnce(newBrightness);

    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);

    // Load image so the modal becomes interactive
    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });

    // Advance debounce to set previewBrightness to oldBrightness
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Confirm button should now be enabled (previewBrightness is set)
    expect(screen.getByTestId('crop-modal-confirm')).not.toBeDisabled();

    // Change brightness slider — this starts a new debounce but we do NOT advance timers
    fireEvent.change(screen.getByTestId('brightness-slider'), { target: { value: '75' } });

    // Click Confirm immediately within the debounce window (timers NOT advanced)
    fireEvent.click(screen.getByTestId('crop-modal-confirm'));

    // onConfirm must have been called with the freshly-recomputed newBrightness (brightness=75),
    // NOT with the stale oldBrightness that was cached before the slider change.
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(newBrightness);
    expect(onConfirm).not.toHaveBeenCalledWith(oldBrightness);
  });

  it('Confirm after rapid mode switch sends recomputed value with new color mode', async () => {
    const oldBrightness = new Array(169).fill(1500); // continuous (unchecked)
    const newBrightness = new Array(169).fill(1024); // quantized (checked)

    computePreviewBrightness.mockReturnValueOnce(oldBrightness).mockReturnValueOnce(newBrightness);

    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);

    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Switch to 2 Colors mode — starts a new debounce
    fireEvent.click(screen.getByTestId('color-mode-2-button'));

    // Click Confirm immediately (within debounce window)
    fireEvent.click(screen.getByTestId('crop-modal-confirm'));

    // Should send the freshly-recomputed newBrightness (only2Colors=true), not stale oldBrightness
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(newBrightness);
    expect(onConfirm).not.toHaveBeenCalledWith(oldBrightness);
  });

  it('Confirm still works normally when no debounce is pending (no recompute changes result)', async () => {
    const expectedBrightness = new Array(169).fill(2048);

    // Both the debounced call and the synchronous recompute on Confirm return the same value
    computePreviewBrightness.mockReturnValue(expectedBrightness);

    const onConfirm = vi.fn();
    render(<CropModal isOpen={true} file={mockFile} onClose={vi.fn()} onConfirm={onConfirm} />);

    const img = screen.getByTestId('crop-image');
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => {
      fireEvent.load(img);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // No slider change — debounce is settled, no pending recompute
    // Click Confirm after debounce window has fully elapsed
    fireEvent.click(screen.getByTestId('crop-modal-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(expectedBrightness);
  });
});

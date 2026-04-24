import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import QRCodeModal from '../QRCodeModal.jsx';

vi.mock('qrcode', () => ({
  default: {
    toCanvas: vi.fn((canvas, data, opts, cb) => {
      if (typeof opts === 'function') {
        cb = opts;
      }
      canvas.width = 200;
      canvas.height = 200;
      canvas.getContext = () => ({
        drawImage: vi.fn(),
        fillRect: vi.fn(),
      });
      if (cb) cb(null);
      return Promise.resolve();
    }),
  },
}));

function makeGrid(fill = 0) {
  return new Array(169).fill(fill);
}

describe('QRCodeModal', () => {
  let onClose;

  beforeEach(() => {
    onClose = vi.fn();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <QRCodeModal isOpen={false} brightness={makeGrid(1024)} onClose={onClose} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows "nothing to encode" for all-zero grid', async () => {
    render(<QRCodeModal isOpen={true} brightness={makeGrid(0)} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText(/nothing to encode/i)).toBeTruthy();
    });
    expect(screen.queryByTestId('qr-canvas')).toBeNull();
  });

  it('renders QR canvas for non-empty grid', async () => {
    render(<QRCodeModal isOpen={true} brightness={makeGrid(2048)} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('qr-canvas')).toBeTruthy();
    });
  });

  it('has a Copy button that copies base64url to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<QRCodeModal isOpen={true} brightness={makeGrid(1024)} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('copy-button')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-button'));
    });

    expect(writeText).toHaveBeenCalled();
    const copiedValue = writeText.mock.calls[0][0];
    expect(copiedValue).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('does not render import pattern controls', async () => {
    render(<QRCodeModal isOpen={true} brightness={makeGrid(1024)} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('copy-button')).toBeTruthy();
    });

    expect(screen.queryByText(/import pattern/i)).toBeNull();
    expect(screen.queryByTestId('qr-modal-import-input')).toBeNull();
    expect(screen.queryByTestId('qr-modal-import-button')).toBeNull();
  });

  it('calls onClose when close button is clicked', async () => {
    render(<QRCodeModal isOpen={true} brightness={makeGrid(1024)} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('qr-modal-close')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('qr-modal-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { encodePattern } from '../../utils/qrPayload.js';

function makeGrid(fill = 0) {
  return new Array(169).fill(fill);
}

describe('App URL parameter import', () => {
  let originalLocation;

  beforeEach(() => {
    originalLocation = window.location;
    delete window.location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('loads pattern from ?pattern= on mount', async () => {
    const grid = makeGrid(0);
    grid[0] = 4095;
    grid[1] = 2048;
    const encoded = encodePattern(grid);

    window.location = new URL(`http://localhost/?pattern=${encoded}`);

    const { default: App } = await import('../../App.jsx');
    render(<App />);

    const cell0 = screen.getByTestId('cell-0');
    expect(Number(cell0.dataset.brightness)).toBe(4095);
    const cell1 = screen.getByTestId('cell-1');
    expect(Number(cell1.dataset.brightness)).toBe(2048);
  });

  it('shows error for invalid ?pattern= value', async () => {
    window.location = new URL('http://localhost/?pattern=INVALIDDATA!!!');

    const { default: App } = await import('../../App.jsx');
    render(<App />);

    expect(screen.getByTestId('url-error')).toBeTruthy();
    expect(screen.getByTestId('url-error').textContent).toMatch(/invalid|corrupted/i);
  });

  it('renders default empty grid when no pattern param', async () => {
    window.location = new URL('http://localhost/');

    const { default: App } = await import('../../App.jsx');
    render(<App />);

    expect(screen.queryByTestId('url-error')).toBeNull();
    const cell0 = screen.getByTestId('cell-0');
    expect(Number(cell0.dataset.brightness)).toBe(0);
  });
});

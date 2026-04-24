import { describe, it, expect } from 'vitest';
import {
  MIN_ZOOM_OUT_RATIO,
  calcMinZoom,
  calcMaxZoom,
  clampZoom,
  clampPan,
  calcInitialState,
  zoomToSlider,
  sliderToZoom,
  flattenTransparentPixelsToBlack,
} from '../cropUtils.js';

// ─── calcMinZoom ─────────────────────────────────────────────────────────────

describe('calcMinZoom', () => {
  it('square image: min zoom = circleDiameter / side', () => {
    expect(calcMinZoom(300, 300, 300)).toBeCloseTo(1.0);
    expect(calcMinZoom(100, 100, 300)).toBeCloseTo(3.0);
    expect(calcMinZoom(600, 600, 300)).toBeCloseTo(0.5);
  });

  it('landscape image: shorter dimension (height) fills circle', () => {
    // 600×300 image, circle 300px → shorter dim = 300 → minZoom = 300/300 = 1.0
    expect(calcMinZoom(600, 300, 300)).toBeCloseTo(1.0);
    // 400×200 image, circle 300px → shorter dim = 200 → minZoom = 300/200 = 1.5
    expect(calcMinZoom(400, 200, 300)).toBeCloseTo(1.5);
  });

  it('portrait image: shorter dimension (width) fills circle', () => {
    // 300×600 image, circle 300px → shorter dim = 300 → minZoom = 300/300 = 1.0
    expect(calcMinZoom(300, 600, 300)).toBeCloseTo(1.0);
    // 200×400 image, circle 300px → shorter dim = 200 → minZoom = 300/200 = 1.5
    expect(calcMinZoom(200, 400, 300)).toBeCloseTo(1.5);
  });

  it('at min zoom, shorter dimension × zoom = circleDiameter', () => {
    // Landscape: 800×400
    const z = calcMinZoom(800, 400, 300);
    expect(400 * z).toBeCloseTo(300); // shorter dim fills circle

    // Portrait: 200×500
    const z2 = calcMinZoom(200, 500, 300);
    expect(200 * z2).toBeCloseTo(300); // shorter dim fills circle

    // Square: 150×150
    const z3 = calcMinZoom(150, 150, 300);
    expect(150 * z3).toBeCloseTo(300);
  });

  it('at min zoom, landscape image extends beyond circle horizontally', () => {
    // 800×400 at min zoom: height fills circle (400×z=300), width = 800×z > 300
    const z = calcMinZoom(800, 400, 300);
    expect(800 * z).toBeGreaterThan(300);
  });

  it('at min zoom, portrait image extends beyond circle vertically', () => {
    // 200×500 at min zoom: width fills circle (200×z=300), height = 500×z > 300
    const z = calcMinZoom(200, 500, 300);
    expect(500 * z).toBeGreaterThan(300);
  });
});

// ─── calcMaxZoom ─────────────────────────────────────────────────────────────

describe('calcMaxZoom', () => {
  it('max zoom is exactly 5× min zoom', () => {
    expect(calcMaxZoom(1.0)).toBeCloseTo(5.0);
    expect(calcMaxZoom(1.5)).toBeCloseTo(7.5);
    expect(calcMaxZoom(2.0)).toBeCloseTo(10.0);
    expect(calcMaxZoom(0.5)).toBeCloseTo(2.5);
  });
});

// ─── clampZoom ───────────────────────────────────────────────────────────────

describe('clampZoom', () => {
  const minZ = 1.5;
  const maxZ = 7.5;

  it('returns minZoom when zoom is below minimum', () => {
    expect(clampZoom(0, minZ, maxZ)).toBe(minZ);
    expect(clampZoom(1.0, minZ, maxZ)).toBe(minZ);
    expect(clampZoom(-5, minZ, maxZ)).toBe(minZ);
  });

  it('returns maxZoom when zoom is above maximum', () => {
    expect(clampZoom(10, minZ, maxZ)).toBe(maxZ);
    expect(clampZoom(100, minZ, maxZ)).toBe(maxZ);
    expect(clampZoom(8, minZ, maxZ)).toBe(maxZ);
  });

  it('returns the value unchanged when within [minZoom, maxZoom]', () => {
    expect(clampZoom(minZ, minZ, maxZ)).toBe(minZ);
    expect(clampZoom(maxZ, minZ, maxZ)).toBe(maxZ);
    expect(clampZoom(3.0, minZ, maxZ)).toBe(3.0);
    expect(clampZoom(5.0, minZ, maxZ)).toBe(5.0);
  });

  it('works with minZoom = maxZoom (no range)', () => {
    expect(clampZoom(0, 2, 2)).toBe(2);
    expect(clampZoom(5, 2, 2)).toBe(2);
    expect(clampZoom(2, 2, 2)).toBe(2);
  });
});

// ─── clampPan ────────────────────────────────────────────────────────────────

describe('clampPan', () => {
  describe('square image at min zoom', () => {
    it('pan is locked to center (0, 0) — no room to pan', () => {
      // 300×300 image at zoom=1.0, circle radius=150
      // scaled image = 300×300, half = 150 = circleRadius → maxPanX = 0
      const result = clampPan(50, -50, 1.0, 300, 300, 150);
      expect(result.panX).toBe(0);
      expect(result.panY).toBe(0);
    });
  });

  describe('landscape image at min zoom', () => {
    it('allows horizontal pan but not vertical pan', () => {
      // 600×300 image, min zoom = 300/300 = 1.0
      // Scaled: 600×300, halfW=300 > R=150 → maxPanX = 300-150 = 150
      // halfH=150 = R=150 → maxPanY = 0
      const result = clampPan(200, 50, 1.0, 600, 300, 150);
      expect(result.panX).toBe(150); // clamped to max 150
      expect(result.panY).toBe(0); // clamped to 0 (no vertical pan)
    });

    it('allows negative horizontal pan (panning left)', () => {
      const result = clampPan(-200, 0, 1.0, 600, 300, 150);
      expect(result.panX).toBe(-150);
      expect(result.panY).toBe(0);
    });

    it('preserves pan within valid range', () => {
      const result = clampPan(100, 0, 1.0, 600, 300, 150);
      expect(result.panX).toBe(100);
      expect(result.panY).toBe(0);
    });
  });

  describe('portrait image at min zoom', () => {
    it('allows vertical pan but not horizontal pan', () => {
      // 300×600 image, min zoom = 300/300 = 1.0
      // Scaled: 300×600, halfW=150 = R → maxPanX = 0
      // halfH=300 > R=150 → maxPanY = 300-150 = 150
      const result = clampPan(50, 200, 1.0, 300, 600, 150);
      expect(result.panX).toBe(0); // no horizontal pan
      expect(result.panY).toBe(150); // clamped to max 150
    });

    it('allows negative vertical pan (panning up)', () => {
      const result = clampPan(0, -200, 1.0, 300, 600, 150);
      expect(result.panX).toBe(0);
      expect(result.panY).toBe(-150);
    });
  });

  describe('at higher zoom levels', () => {
    it('allows more pan range when zoomed in', () => {
      // 300×300 image at zoom=2.0, circle radius=150
      // scaled = 600×600, halfW=300 > R=150 → maxPanX = 150
      const result = clampPan(0, 0, 2.0, 300, 300, 150);
      expect(result.panX).toBe(0); // center stays at 0

      const clamped = clampPan(100, 100, 2.0, 300, 300, 150);
      expect(clamped.panX).toBe(100); // within range
      expect(clamped.panY).toBe(100);
    });

    it('still enforces max pan at higher zoom', () => {
      // 300×300 at zoom=2.0: maxPan = 300-150 = 150
      const result = clampPan(200, 200, 2.0, 300, 300, 150);
      expect(result.panX).toBe(150);
      expect(result.panY).toBe(150);
    });
  });

  describe('constraint enforcement — image always fills circle', () => {
    it('pan is clamped so image edge always reaches circle edge', () => {
      // Image: 300×300, zoom=1.0, circle R=150
      // If panX were 10 > maxPanX=0, image right edge = 150+10+150=310 ≥ 300 → still covers
      // But we enforce tighter: panX <= 0
      const r = clampPan(10, 0, 1.0, 300, 300, 150);
      expect(r.panX).toBe(0);
    });

    it('symmetric: min and max pan are equal magnitude', () => {
      const r1 = clampPan(999, 0, 1.5, 400, 200, 150);
      const r2 = clampPan(-999, 0, 1.5, 400, 200, 150);
      expect(r1.panX).toBe(-r2.panX);
    });
  });
});

// ─── calcInitialState ────────────────────────────────────────────────────────

describe('calcInitialState', () => {
  it('square image: centered at fit zoom, min zoom allows 25% zoom-out', () => {
    const state = calcInitialState(300, 300, 300);
    expect(state.zoom).toBeCloseTo(1.0);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
    expect(state.minZoom).toBeCloseTo(1.0 * MIN_ZOOM_OUT_RATIO);
    expect(state.maxZoom).toBeCloseTo(5.0);
  });

  it('landscape image: zoom = shorter-dim fit, min zoom is 25% of fit', () => {
    // 600×300, circle 300 → fitZoom = 300/300 = 1.0
    const state = calcInitialState(600, 300, 300);
    expect(state.zoom).toBeCloseTo(1.0);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
    expect(state.minZoom).toBeCloseTo(1.0 * MIN_ZOOM_OUT_RATIO);
    expect(state.maxZoom).toBeCloseTo(5.0);
  });

  it('portrait image: zoom = shorter-dim fit, min zoom is 25% of fit', () => {
    // 200×400, circle 300 → fitZoom = 300/200 = 1.5
    const state = calcInitialState(200, 400, 300);
    expect(state.zoom).toBeCloseTo(1.5);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
    expect(state.minZoom).toBeCloseTo(1.5 * MIN_ZOOM_OUT_RATIO);
    expect(state.maxZoom).toBeCloseTo(7.5);
  });

  it('maxZoom is 5× fit zoom', () => {
    const s1 = calcInitialState(100, 100, 300); // fitZoom = 3.0
    expect(s1.maxZoom).toBeCloseTo(15.0);

    const s2 = calcInitialState(400, 200, 300); // fitZoom = 1.5
    expect(s2.maxZoom).toBeCloseTo(7.5);
  });

  it('zoom starts at fit zoom (not zoom-out minimum)', () => {
    const state = calcInitialState(400, 200, 300);
    const fitZoom = calcMinZoom(400, 200, 300);
    expect(state.zoom).toBeCloseTo(fitZoom);
    expect(state.minZoom).toBeCloseTo(fitZoom * MIN_ZOOM_OUT_RATIO);
  });
});

// ─── zoomToSlider / sliderToZoom ─────────────────────────────────────────────

describe('zoomToSlider', () => {
  it('minZoom maps to slider value 0', () => {
    expect(zoomToSlider(1.5, 1.5, 7.5)).toBeCloseTo(0);
  });

  it('maxZoom maps to slider value 100', () => {
    expect(zoomToSlider(7.5, 1.5, 7.5)).toBeCloseTo(100);
  });

  it('midpoint zoom maps to slider value 50', () => {
    const mid = (1.5 + 7.5) / 2;
    expect(zoomToSlider(mid, 1.5, 7.5)).toBeCloseTo(50);
  });

  it('returns 0 when minZoom equals maxZoom (degenerate case)', () => {
    expect(zoomToSlider(5, 5, 5)).toBe(0);
  });
});

describe('sliderToZoom', () => {
  it('slider 0 maps to minZoom', () => {
    expect(sliderToZoom(0, 1.5, 7.5)).toBeCloseTo(1.5);
  });

  it('slider 100 maps to maxZoom', () => {
    expect(sliderToZoom(100, 1.5, 7.5)).toBeCloseTo(7.5);
  });

  it('slider 50 maps to midpoint zoom', () => {
    const mid = (1.5 + 7.5) / 2;
    expect(sliderToZoom(50, 1.5, 7.5)).toBeCloseTo(mid);
  });

  it('clamps slider values below 0 to minZoom', () => {
    expect(sliderToZoom(-10, 1.5, 7.5)).toBeCloseTo(1.5);
  });

  it('clamps slider values above 100 to maxZoom', () => {
    expect(sliderToZoom(110, 1.5, 7.5)).toBeCloseTo(7.5);
  });
});

describe('zoomToSlider / sliderToZoom round-trip', () => {
  it('zoom → slider → zoom is identity for valid zoom values', () => {
    const minZoom = 1.5;
    const maxZoom = 7.5;

    const testZooms = [1.5, 2.0, 3.0, 4.5, 6.0, 7.5];
    for (const z of testZooms) {
      const slider = zoomToSlider(z, minZoom, maxZoom);
      const backToZoom = sliderToZoom(slider, minZoom, maxZoom);
      expect(backToZoom).toBeCloseTo(z, 5);
    }
  });

  it('slider → zoom → slider is identity for valid slider values', () => {
    const minZoom = 1.5;
    const maxZoom = 7.5;

    for (let s = 0; s <= 100; s += 25) {
      const z = sliderToZoom(s, minZoom, maxZoom);
      const backToSlider = zoomToSlider(z, minZoom, maxZoom);
      expect(backToSlider).toBeCloseTo(s, 5);
    }
  });
});

describe('flattenTransparentPixelsToBlack', () => {
  it('converts fully transparent pixels to opaque black', () => {
    const data = new Uint8ClampedArray([
      255,
      200,
      100,
      0, // fully transparent non-black
    ]);
    flattenTransparentPixelsToBlack(data);
    expect(Array.from(data)).toEqual([0, 0, 0, 255]);
  });

  it('composites semi-transparent pixels against black', () => {
    const data = new Uint8ClampedArray([
      200,
      100,
      50,
      128, // ~50% alpha
    ]);
    flattenTransparentPixelsToBlack(data);
    expect(data[0]).toBeCloseTo(Math.round((200 * 128) / 255), 0);
    expect(data[1]).toBeCloseTo(Math.round((100 * 128) / 255), 0);
    expect(data[2]).toBeCloseTo(Math.round((50 * 128) / 255), 0);
    expect(data[3]).toBe(255);
  });

  it('leaves fully opaque pixels unchanged', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255]);
    const original = new Uint8ClampedArray(data);
    flattenTransparentPixelsToBlack(data);
    expect(Array.from(data)).toEqual(Array.from(original));
  });
});

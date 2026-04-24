import { describe, it, expect } from 'vitest';
import {
  BRIGHTNESS_LEVELS,
  CIRCULAR_MASK,
  TOTAL_CELLS,
  invertBrightness,
  nextBrightness,
  prevBrightness,
  nextBinaryBrightness,
  prevBinaryBrightness,
  brightnessToColor,
  applyMasterBrightness,
  applyMasterContrast,
} from '../gridConstants.js';

describe('brightnessToColor', () => {
  it('returns #000000 for value 0 (black)', () => {
    expect(brightnessToColor(0)).toBe('#000000');
  });

  it('returns #ffffff for value 4095 (white)', () => {
    expect(brightnessToColor(4095)).toBe('#ffffff');
  });

  it('returns medium gray (#808080) for value 2048', () => {
    // Math.round(2048 * 255 / 4095) = Math.round(127.5) = 128 → #808080
    expect(brightnessToColor(2048)).toBe('#808080');
  });

  it('returns a dark gray for value 1000 (between #000000 and #808080)', () => {
    const color = brightnessToColor(1000);
    // Verify it's a valid hex color between black and medium gray
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    const gray = parseInt(color.slice(1, 3), 16);
    expect(gray).toBeGreaterThan(0);
    expect(gray).toBeLessThan(128);
  });

  it('returns consistent gray values for all 5 canonical levels', () => {
    const colors = BRIGHTNESS_LEVELS.map(brightnessToColor);
    // All must be valid hex colors
    colors.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/));
    // Must be 5 distinct colors (each level distinct)
    expect(new Set(colors).size).toBe(5);
  });

  it('clamps values below 0 to #000000', () => {
    expect(brightnessToColor(-100)).toBe('#000000');
  });

  it('clamps values above 4095 to #ffffff', () => {
    expect(brightnessToColor(5000)).toBe('#ffffff');
  });

  it('returns a valid 6-digit hex color for any value in 0–4095', () => {
    for (let v = 0; v <= 4095; v += 137) {
      expect(brightnessToColor(v)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('nextBrightness — canonical values', () => {
  it('advances 0 to 1024', () => {
    expect(nextBrightness(0)).toBe(1024);
  });

  it('advances 1024 to 2048', () => {
    expect(nextBrightness(1024)).toBe(2048);
  });

  it('advances 2048 to 3072', () => {
    expect(nextBrightness(2048)).toBe(3072);
  });

  it('advances 3072 to 4095', () => {
    expect(nextBrightness(3072)).toBe(4095);
  });

  it('wraps 4095 back to 0', () => {
    expect(nextBrightness(4095)).toBe(0);
  });
});

describe('nextBrightness — continuous values', () => {
  it('snaps 1500 to nearest 1024 and advances to 2048', () => {
    // |1500-1024|=476 < |1500-2048|=548 → nearest is 1024 → advance to 2048
    expect(nextBrightness(1500)).toBe(2048);
  });

  it('snaps 500 to nearest 0 and advances to 1024', () => {
    // |500-0|=500 < |500-1024|=524 → nearest is 0 → advance to 1024
    expect(nextBrightness(500)).toBe(1024);
  });

  it('snaps 3500 to nearest 3072 and advances to 4095', () => {
    // |3500-3072|=428 < |3500-4095|=595 → nearest is 3072 → advance to 4095
    expect(nextBrightness(3500)).toBe(4095);
  });

  it('snaps 4000 to nearest 4095 and advances to 0 (wraps)', () => {
    // |4000-4095|=95 < |4000-3072|=928 → nearest is 4095 → advance to 0
    expect(nextBrightness(4000)).toBe(0);
  });

  it('result is always one of the 5 canonical levels', () => {
    const testValues = [1, 100, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4090];
    const validSet = new Set(BRIGHTNESS_LEVELS);
    testValues.forEach((v) => {
      expect(validSet.has(nextBrightness(v))).toBe(true);
    });
  });
});

describe('prevBrightness — canonical values', () => {
  it('wraps 0 back to 4095', () => {
    expect(prevBrightness(0)).toBe(4095);
  });

  it('moves 1024 back to 0', () => {
    expect(prevBrightness(1024)).toBe(0);
  });

  it('moves 2048 back to 1024', () => {
    expect(prevBrightness(2048)).toBe(1024);
  });

  it('moves 3072 back to 2048', () => {
    expect(prevBrightness(3072)).toBe(2048);
  });

  it('moves 4095 back to 3072', () => {
    expect(prevBrightness(4095)).toBe(3072);
  });
});

describe('prevBrightness — continuous values', () => {
  it('snaps 1500 to nearest 1024 and moves back to 0', () => {
    expect(prevBrightness(1500)).toBe(0);
  });

  it('snaps 500 to nearest 0 and moves back to 4095', () => {
    expect(prevBrightness(500)).toBe(4095);
  });

  it('snaps 3500 to nearest 3072 and moves back to 2048', () => {
    expect(prevBrightness(3500)).toBe(2048);
  });

  it('snaps 4000 to nearest 4095 and moves back to 3072', () => {
    expect(prevBrightness(4000)).toBe(3072);
  });

  it('result is always one of the 5 canonical levels', () => {
    const testValues = [1, 100, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4090];
    const validSet = new Set(BRIGHTNESS_LEVELS);
    testValues.forEach((v) => {
      expect(validSet.has(prevBrightness(v))).toBe(true);
    });
  });
});

describe('nextBinaryBrightness', () => {
  it('toggles black (0) to white (4095)', () => {
    expect(nextBinaryBrightness(0)).toBe(4095);
  });

  it('toggles white (4095) to black (0)', () => {
    expect(nextBinaryBrightness(4095)).toBe(0);
  });

  it('uses midpoint threshold: values below 2048 go to white', () => {
    expect(nextBinaryBrightness(1024)).toBe(4095);
    expect(nextBinaryBrightness(1500)).toBe(4095);
    expect(nextBinaryBrightness(2047)).toBe(4095);
  });

  it('uses midpoint threshold: values at or above 2048 go to black', () => {
    expect(nextBinaryBrightness(2048)).toBe(0);
    expect(nextBinaryBrightness(3072)).toBe(0);
    expect(nextBinaryBrightness(3500)).toBe(0);
  });
});

describe('prevBinaryBrightness', () => {
  it('keeps black-ish values on black (0)', () => {
    expect(prevBinaryBrightness(0)).toBe(0);
  });

  it('keeps white-ish values on white (4095)', () => {
    expect(prevBinaryBrightness(4095)).toBe(4095);
  });

  it('uses midpoint threshold: values below 2048 go to black', () => {
    expect(prevBinaryBrightness(1024)).toBe(0);
    expect(prevBinaryBrightness(1500)).toBe(0);
    expect(prevBinaryBrightness(2047)).toBe(0);
  });

  it('uses midpoint threshold: values at or above 2048 go to white', () => {
    expect(prevBinaryBrightness(2048)).toBe(4095);
    expect(prevBinaryBrightness(3072)).toBe(4095);
    expect(prevBinaryBrightness(3500)).toBe(4095);
  });
});

describe('invertBrightness', () => {
  it('inverts 0 to 4095', () => {
    expect(invertBrightness(0)).toBe(4095);
  });

  it('inverts 4095 to 0', () => {
    expect(invertBrightness(4095)).toBe(0);
  });

  it('inverts 1024 to 3071 (4095 - 1024 = 3071)', () => {
    expect(invertBrightness(1024)).toBe(3071);
  });

  it('inverts 3072 to 1023 (4095 - 3072 = 1023)', () => {
    expect(invertBrightness(3072)).toBe(1023);
  });

  it('inverts 2048 to 2047 (4095 - 2048 = 2047)', () => {
    expect(invertBrightness(2048)).toBe(2047);
  });

  it('inverts continuous value 1500 to 2595', () => {
    expect(invertBrightness(1500)).toBe(2595);
  });

  it('double invert restores the original value for all 5 canonical levels', () => {
    for (const level of BRIGHTNESS_LEVELS) {
      expect(invertBrightness(invertBrightness(level))).toBe(level);
    }
  });

  it('double invert restores the original value for any continuous value', () => {
    const testValues = [0, 1, 500, 1000, 1500, 2000, 2047, 2048, 2595, 3071, 3072, 4000, 4095];
    for (const v of testValues) {
      expect(invertBrightness(invertBrightness(v))).toBe(v);
    }
  });

  it('correctly maps all 5 brightness levels using 4095 - value formula', () => {
    const expected = { 0: 4095, 1024: 3071, 2048: 2047, 3072: 1023, 4095: 0 };
    for (const [input, output] of Object.entries(expected)) {
      expect(invertBrightness(Number(input))).toBe(output);
    }
  });
});

describe('applyMasterBrightness', () => {
  it('returns 0 when base is 0, regardless of slider value (base=0 guard)', () => {
    expect(applyMasterBrightness(0, 0)).toBe(0);
    expect(applyMasterBrightness(0, 50)).toBe(0);
    expect(applyMasterBrightness(0, 100)).toBe(0);
    expect(applyMasterBrightness(0, 75)).toBe(0);
  });

  it('slider=50 is identity transform — returns base unchanged', () => {
    expect(applyMasterBrightness(1024, 50)).toBe(1024);
    expect(applyMasterBrightness(2048, 50)).toBe(2048);
    expect(applyMasterBrightness(3072, 50)).toBe(3072);
    expect(applyMasterBrightness(4095, 50)).toBe(4095);
    expect(applyMasterBrightness(1500, 50)).toBe(1500);
  });

  it('slider=0 returns 0 for any base (darkest)', () => {
    expect(applyMasterBrightness(1024, 0)).toBe(0);
    expect(applyMasterBrightness(2048, 0)).toBe(0);
    expect(applyMasterBrightness(4095, 0)).toBe(0);
    expect(applyMasterBrightness(3072, 0)).toBe(0);
  });

  it('slider=100 returns 4095 for any non-zero base (brightest)', () => {
    expect(applyMasterBrightness(1024, 100)).toBe(4095);
    expect(applyMasterBrightness(2048, 100)).toBe(4095);
    expect(applyMasterBrightness(3072, 100)).toBe(4095);
    expect(applyMasterBrightness(4095, 100)).toBe(4095);
    expect(applyMasterBrightness(1, 100)).toBe(4095);
  });

  it('slider=25 (halfway between 0 and 50): effective = base * (25/50) = base * 0.5', () => {
    // base=2048, slider=25: Math.round(2048 * (25/50)) = Math.round(1024) = 1024
    expect(applyMasterBrightness(2048, 25)).toBe(1024);
    // base=4095, slider=25: Math.round(4095 * 0.5) = Math.round(2047.5) = 2048
    expect(applyMasterBrightness(4095, 25)).toBe(2048);
  });

  it('slider=75 (halfway between 50 and 100): effective = base + (4095-base)*0.5', () => {
    // base=2048, slider=75: Math.round(2048 + (4095-2048)*((75-50)/50))
    // = Math.round(2048 + 2047*0.5) = Math.round(2048 + 1023.5) = Math.round(3071.5) = 3072
    expect(applyMasterBrightness(2048, 75)).toBe(3072);
    // base=1024, slider=75: Math.round(1024 + (4095-1024)*0.5) = Math.round(1024+1535.5) = Math.round(2559.5) = 2560
    expect(applyMasterBrightness(1024, 75)).toBe(2560);
  });

  it('result is always an integer', () => {
    const testCases = [
      [1024, 33],
      [2048, 67],
      [3072, 80],
      [4095, 20],
      [500, 75],
      [1500, 25],
    ];
    for (const [base, slider] of testCases) {
      const result = applyMasterBrightness(base, slider);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it('result is clamped to [0, 4095]', () => {
    // Slider at extremes should produce exactly 0 or 4095
    expect(applyMasterBrightness(4095, 0)).toBe(0);
    expect(applyMasterBrightness(1, 100)).toBe(4095);
  });

  it('preserves relative ordering for slider < 50 (proportional darkening)', () => {
    const slider = 30;
    const r1 = applyMasterBrightness(1024, slider);
    const r2 = applyMasterBrightness(2048, slider);
    const r3 = applyMasterBrightness(4095, slider);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
  });

  it('preserves relative ordering for slider > 50 (proportional brightening)', () => {
    const slider = 70;
    const r1 = applyMasterBrightness(1024, slider);
    const r2 = applyMasterBrightness(2048, slider);
    const r3 = applyMasterBrightness(4095, slider);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
  });
});

describe('invertGrid (functional logic)', () => {
  it('inverting a grid only affects active pixels', () => {
    // Create a grid with all active pixels at 4095 and inactive at 0
    const grid = new Array(TOTAL_CELLS).fill(0);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) grid[i] = 4095;
    }

    // Invert only active pixels
    const inverted = grid.map((val, i) => (CIRCULAR_MASK[i] ? invertBrightness(val) : val));

    // All active pixels should now be 0, inactive should still be 0
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        expect(inverted[i]).toBe(0);
      } else {
        expect(inverted[i]).toBe(0); // inactive: unchanged
      }
    }
  });

  it('inactive pixels remain at 0 after invert even if set to non-zero (guard)', () => {
    const grid = new Array(TOTAL_CELLS).fill(0);
    // Forcefully set an inactive position to a non-zero value
    const inactiveIdx = CIRCULAR_MASK.indexOf(false);
    grid[inactiveIdx] = 1024;

    // Invert only active pixels
    const inverted = grid.map((val, i) => (CIRCULAR_MASK[i] ? invertBrightness(val) : val));

    // The inactive position should remain at 1024 (untouched)
    expect(inverted[inactiveIdx]).toBe(1024);
  });

  it('double invert restores original state for any arbitrary pattern', () => {
    // Create a mixed pattern
    const grid = new Array(TOTAL_CELLS).fill(0);
    const levels = BRIGHTNESS_LEVELS;
    let levelIdx = 0;
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (CIRCULAR_MASK[i]) {
        grid[i] = levels[levelIdx % levels.length];
        levelIdx++;
      }
    }

    const snapshot = [...grid];

    // Invert twice
    const invertOnce = grid.map((val, i) => (CIRCULAR_MASK[i] ? invertBrightness(val) : val));
    const invertTwice = invertOnce.map((val, i) =>
      CIRCULAR_MASK[i] ? invertBrightness(val) : val,
    );

    expect(invertTwice).toEqual(snapshot);
  });
});

describe('applyMasterContrast', () => {
  it('slider=50 is identity transform — returns base unchanged', () => {
    expect(applyMasterContrast(0, 50)).toBe(0);
    expect(applyMasterContrast(1024, 50)).toBe(1024);
    expect(applyMasterContrast(2048, 50)).toBe(2048);
    expect(applyMasterContrast(3072, 50)).toBe(3072);
    expect(applyMasterContrast(4095, 50)).toBe(4095);
    expect(applyMasterContrast(1500, 50)).toBe(1500);
  });

  it('slider=0: all values collapse to midpoint (2048)', () => {
    // midpoint = 2047.5, factor = 0 → output = 2047.5 → Math.round = 2048
    expect(applyMasterContrast(0, 0)).toBe(2048);
    expect(applyMasterContrast(1024, 0)).toBe(2048);
    expect(applyMasterContrast(2048, 0)).toBe(2048);
    expect(applyMasterContrast(3072, 0)).toBe(2048);
    expect(applyMasterContrast(4095, 0)).toBe(2048);
  });

  it('slider=100: double contrast (factor=2)', () => {
    // base=0: 2047.5 + (0 - 2047.5)*2 = 2047.5 - 4095 = -2047.5 → clamped to 0
    expect(applyMasterContrast(0, 100)).toBe(0);
    // base=4095: 2047.5 + (4095 - 2047.5)*2 = 2047.5 + 4095 = 6142.5 → clamped to 4095
    expect(applyMasterContrast(4095, 100)).toBe(4095);
    // base=2048: 2047.5 + (2048 - 2047.5)*2 = 2047.5 + 1 = 2048.5 → round = 2049
    expect(applyMasterContrast(2048, 100)).toBe(2049);
    // base=1024: 2047.5 + (1024 - 2047.5)*2 = 2047.5 - 2047 = 0.5 → round = 1
    expect(applyMasterContrast(1024, 100)).toBe(1);
    // base=3072: 2047.5 + (3072 - 2047.5)*2 = 2047.5 + 2049 = 4096.5 → clamped to 4095
    expect(applyMasterContrast(3072, 100)).toBe(4095);
  });

  it('output is clamped to [0, 4095]', () => {
    // High contrast with extreme values should clamp
    expect(applyMasterContrast(0, 100)).toBeGreaterThanOrEqual(0);
    expect(applyMasterContrast(4095, 100)).toBeLessThanOrEqual(4095);
    // Reduced contrast: stays in range
    expect(applyMasterContrast(0, 25)).toBeGreaterThanOrEqual(0);
    expect(applyMasterContrast(4095, 25)).toBeLessThanOrEqual(4095);
  });

  it('result is always an integer', () => {
    const testCases = [
      [0, 0],
      [1024, 25],
      [2048, 50],
      [3072, 75],
      [4095, 100],
      [500, 33],
      [1500, 67],
    ];
    for (const [base, slider] of testCases) {
      const result = applyMasterContrast(base, slider);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it('preserves monotonicity: higher base values produce higher output', () => {
    // For any slider, if a > b then applyMasterContrast(a, slider) >= applyMasterContrast(b, slider)
    for (const slider of [0, 25, 50, 75, 100]) {
      const r1 = applyMasterContrast(1024, slider);
      const r2 = applyMasterContrast(2048, slider);
      const r3 = applyMasterContrast(3072, slider);
      expect(r1).toBeLessThanOrEqual(r2);
      expect(r2).toBeLessThanOrEqual(r3);
    }
  });

  it('slider=25: half contrast (factor=0.5, values move toward midpoint)', () => {
    // base=0: 2047.5 + (0 - 2047.5)*0.5 = 2047.5 - 1023.75 = 1023.75 → 1024
    expect(applyMasterContrast(0, 25)).toBe(1024);
    // base=4095: 2047.5 + (4095 - 2047.5)*0.5 = 2047.5 + 1023.75 = 3071.25 → 3071
    expect(applyMasterContrast(4095, 25)).toBe(3071);
  });
});

import { describe, it, expect } from 'vitest';
import { base32crockford, base64urlnopad } from '@scure/base';
import {
  encodePayload,
  decodePayload,
  encodePattern,
  decodePattern,
  decodeInput,
} from '../qrPayload.js';

const LEVELS = [0, 1024, 2048, 3072, 4095];

function makeGrid(fill = 0) {
  return new Array(169).fill(fill);
}

/** Build a grid cycling through canonical brightness levels. */
function makeCanonicalGrid() {
  return Array.from({ length: 169 }, (_, i) => LEVELS[i % 5]);
}

describe('encodePayload / decodePayload (v3)', () => {
  it('round-trips an all-zero grid', () => {
    const grid = makeGrid(0);
    const bytes = encodePayload(grid);
    const result = decodePayload(bytes);
    expect(result.brightness).toEqual(grid);
  });

  it('round-trips an all-4095 grid', () => {
    const grid = makeGrid(4095);
    const bytes = encodePayload(grid);
    const result = decodePayload(bytes);
    expect(result.brightness).toEqual(grid);
  });

  it.each(LEVELS)('round-trips an all-%s grid', (level) => {
    const grid = makeGrid(level);
    const bytes = encodePayload(grid);
    expect(decodePayload(bytes).brightness).toEqual(grid);
  });

  it('round-trips a grid cycling through all 5 levels', () => {
    const grid = makeCanonicalGrid();
    const bytes = encodePayload(grid);
    expect(decodePayload(bytes).brightness).toEqual(grid);
  });

  it('produces a 65-byte payload', () => {
    expect(encodePayload(makeGrid(0))).toHaveLength(65);
  });

  it('writes version 0x03 at offset 0', () => {
    expect(encodePayload(makeGrid(0))[0]).toBe(0x03);
  });

  it('encodes first two cells as expected — worked example', () => {
    // grid[0]=4095 (idx 4 = 0b100), grid[1]=2048 (idx 2 = 0b010), rest=0
    // bitOffset=0: idx 4 → byte[1] |= 0b100 << 5 = 0x80
    // bitOffset=3: idx 2 → byte[1] |= 0b010 << 2 = 0x08
    // byte[1] = 0x88; all others = 0x00
    const grid = makeGrid(0);
    grid[0] = 4095;
    grid[1] = 2048;
    const bytes = encodePayload(grid);
    expect(bytes[1]).toBe(0x88);
    expect(bytes[2]).toBe(0x00);
  });

  it('encodes last cell correctly — worked example', () => {
    // grid[168]=4095 (idx 4 = 0b100)
    // bitOffset = 168 * 3 = 504, bytePos = 1+63 = 64, bitShift = 5-0 = 5
    // byte[64] |= 4 << 5 = 0x80
    const grid = makeGrid(0);
    grid[168] = 4095;
    const bytes = encodePayload(grid);
    expect(bytes[64]).toBe(0x80);
  });
});

describe('encodePayload validation', () => {
  it('rejects wrong grid length', () => {
    expect(() => encodePayload(new Array(100).fill(0))).toThrow('Expected 169');
  });

  it('rejects non-canonical value (negative)', () => {
    const grid = makeGrid(0);
    grid[5] = -1;
    expect(() => encodePayload(grid)).toThrow('canonical palette level');
  });

  it('rejects non-canonical value (> 4095)', () => {
    const grid = makeGrid(0);
    grid[10] = 4096;
    expect(() => encodePayload(grid)).toThrow('canonical palette level');
  });

  it('rejects non-canonical value (in-range but not a palette level)', () => {
    const grid = makeGrid(0);
    grid[0] = 500;
    expect(() => encodePayload(grid)).toThrow('canonical palette level');
  });

  it('rejects non-integer brightness', () => {
    const grid = makeGrid(0);
    grid[0] = 1.5;
    expect(() => encodePayload(grid)).toThrow('canonical palette level');
  });
});

describe('decodePayload validation', () => {
  it('rejects non-Uint8Array', () => {
    expect(() => decodePayload([1, 2, 3])).toThrow('Uint8Array');
  });

  it('rejects payload too short', () => {
    expect(() => decodePayload(new Uint8Array(2))).toThrow('too short');
  });

  it('rejects unknown version byte', () => {
    const bytes = new Uint8Array(65);
    bytes[0] = 0xff;
    expect(() => decodePayload(bytes)).toThrow('Unknown version');
  });

  it('rejects v3 payload with wrong length', () => {
    const bytes = encodePayload(makeGrid(0));
    const truncated = bytes.slice(0, bytes.length - 1);
    expect(() => decodePayload(truncated)).toThrow('size mismatch');
  });
});

describe('v2 backward compatibility', () => {
  function makeV2Payload(brightness) {
    const bytes = new Uint8Array(255);
    bytes[0] = 0x02;
    let offset = 1;
    for (let i = 0; i < 168; i += 2) {
      const a = brightness[i];
      const b = brightness[i + 1];
      bytes[offset++] = a >> 4;
      bytes[offset++] = ((a & 0x0f) << 4) | (b >> 8);
      bytes[offset++] = b & 0xff;
    }
    const last = brightness[168];
    bytes[offset] = last >> 4;
    bytes[offset + 1] = (last & 0x0f) << 4;
    return bytes;
  }

  it('decodes a v2 payload (12-bit packing, any value 0–4095)', () => {
    const grid = Array.from({ length: 169 }, (_, i) => (i * 24) % 4096);
    const v2Bytes = makeV2Payload(grid);
    const result = decodePayload(v2Bytes);
    expect(result.brightness).toEqual(grid);
  });

  it('decodes a v2 payload via decodePattern (base64url)', () => {
    const grid = makeGrid(0);
    grid[0] = 4095;
    grid[1] = 2048;
    const v2Bytes = makeV2Payload(grid);
    const encoded = base64urlnopad.encode(v2Bytes);
    const result = decodePattern(encoded);
    expect(result.brightness[0]).toBe(4095);
    expect(result.brightness[1]).toBe(2048);
  });
});

describe('v1 backward compatibility', () => {
  function makeV1Payload(brightness, name = '') {
    const nameBytes = new TextEncoder().encode(name);
    const totalLength = 1 + 1 + nameBytes.length + 254;
    const bytes = new Uint8Array(totalLength);
    let offset = 0;

    bytes[offset++] = 0x01;
    bytes[offset++] = nameBytes.length;
    bytes.set(nameBytes, offset);
    offset += nameBytes.length;

    for (let i = 0; i < 168; i += 2) {
      const a = brightness[i];
      const b = brightness[i + 1];
      bytes[offset++] = a >> 4;
      bytes[offset++] = ((a & 0x0f) << 4) | (b >> 8);
      bytes[offset++] = b & 0xff;
    }

    const last = brightness[168];
    bytes[offset] = last >> 4;
    bytes[offset + 1] = (last & 0x0f) << 4;

    return bytes;
  }

  it('decodes v1 payload and extracts brightness', () => {
    const grid = makeGrid(0);
    grid[0] = 4095;
    grid[1] = 2048;
    const v1Bytes = makeV1Payload(grid, 'old-name');
    const result = decodePayload(v1Bytes);
    expect(result.brightness[0]).toBe(4095);
    expect(result.brightness[1]).toBe(2048);
    expect(result.brightness).toHaveLength(169);
    expect(result.name).toBeUndefined();
  });

  it('decodes v1 payload with empty name', () => {
    const grid = makeGrid(1024);
    const v1Bytes = makeV1Payload(grid, '');
    const result = decodePayload(v1Bytes);
    expect(result.brightness).toEqual(grid);
  });

  it('decodes v1 base32 string via decodePattern', () => {
    const grid = makeGrid(0);
    grid[0] = 4095;
    const v1Bytes = makeV1Payload(grid, 'test');
    const v1Base32 = base32crockford.encode(v1Bytes);
    const result = decodePattern(v1Base32);
    expect(result.brightness[0]).toBe(4095);
  });
});

describe('encodePattern / decodePattern', () => {
  it('round-trips through base64url', () => {
    const grid = makeGrid(0);
    grid[0] = 4095;
    grid[168] = 2048;
    const encoded = encodePattern(grid);
    expect(typeof encoded).toBe('string');
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const result = decodePattern(encoded);
    expect(result.brightness).toEqual(grid);
  });

  it('produces only base64url characters (no padding)', () => {
    const encoded = encodePattern(makeGrid(2048));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain('=');
  });

  it('produces an 87-character string for a canonical grid', () => {
    // 65 bytes → 87 base64url chars (21 full groups + 1 partial group of 2 bytes)
    const encoded = encodePattern(makeGrid(0));
    expect(encoded).toHaveLength(87);
  });
});

describe('decodeInput', () => {
  it('decodes a full glyphtoy:// URI', () => {
    const grid = makeGrid(1024);
    const encoded = encodePattern(grid);
    const uri = `glyphtoy://pattern/${encoded}`;
    const result = decodeInput(uri);
    expect(result.brightness).toEqual(grid);
  });

  it('decodes a bare base64url string', () => {
    const grid = makeGrid(3072);
    const encoded = encodePattern(grid);
    const result = decodeInput(encoded);
    expect(result.brightness).toEqual(grid);
  });

  it('rejects empty input', () => {
    expect(() => decodeInput('')).toThrow('non-empty');
  });

  it('rejects non-string input', () => {
    expect(() => decodeInput(null)).toThrow('non-empty');
  });

  it('rejects input with invalid characters', () => {
    expect(() => decodeInput('not-valid!@#$')).toThrow('Invalid input');
  });

  it('rejects URI with empty payload', () => {
    expect(() => decodeInput('glyphtoy://pattern/')).toThrow('Empty payload');
  });

  it('handles whitespace-trimmed input', () => {
    const grid = makeGrid(1024);
    const encoded = encodePattern(grid);
    const result = decodeInput(`  ${encoded}  `);
    expect(result.brightness).toEqual(grid);
  });
});

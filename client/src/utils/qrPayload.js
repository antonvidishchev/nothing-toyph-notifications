import { base32crockford, base64urlnopad } from '@scure/base';

const VERSION_1 = 0x01;
const VERSION_2 = 0x02;
const VERSION_3 = 0x03;
const GRID_SIZE = 169;
const BRIGHTNESS_BYTES = 254; // v1/v2 only
const URI_PREFIX = 'glyphtoy://pattern/';

// Maps the 5 canonical brightness levels to compact 3-bit indices (and back).
const LEVEL_TO_INDEX = new Map([
  [0, 0],
  [1024, 1],
  [2048, 2],
  [3072, 3],
  [4095, 4],
]);
const INDEX_TO_LEVEL = [0, 1024, 2048, 3072, 4095];

export function encodePayload(brightness) {
  if (brightness.length !== GRID_SIZE) {
    throw new Error(`Expected ${GRID_SIZE} brightness values, got ${brightness.length}`);
  }

  // Map each brightness value to a 3-bit index (0–4).
  const indices = new Array(GRID_SIZE);
  for (let i = 0; i < GRID_SIZE; i++) {
    const idx = LEVEL_TO_INDEX.get(brightness[i]);
    if (idx === undefined) {
      throw new Error(
        `Brightness value at index ${i} is not a canonical palette level: ${brightness[i]}`,
      );
    }
    indices[i] = idx;
  }

  // Pack 169 x 3-bit indices into 64 bytes (507 bits, 5 zero-pad bits at end).
  const DATA_BYTES = 64;
  const bytes = new Uint8Array(1 + DATA_BYTES);
  bytes[0] = VERSION_3;

  let bitOffset = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    const bytePos = 1 + (bitOffset >> 3);
    const bitShift = 5 - (bitOffset & 7); // high bits first within each byte
    if (bitShift >= 0) {
      bytes[bytePos] |= indices[i] << bitShift;
    } else {
      bytes[bytePos] |= indices[i] >> -bitShift;
      bytes[bytePos + 1] |= (indices[i] << (8 + bitShift)) & 0xff;
    }
    bitOffset += 3;
  }

  return bytes;
}

function decodeBrightness(bytes, offset) {
  const brightness = new Array(GRID_SIZE);

  for (let i = 0; i < GRID_SIZE - 1; i += 2) {
    const b0 = bytes[offset++];
    const b1 = bytes[offset++];
    const b2 = bytes[offset++];
    brightness[i] = (b0 << 4) | (b1 >> 4);
    brightness[i + 1] = ((b1 & 0x0f) << 8) | b2;
  }

  brightness[GRID_SIZE - 1] = (bytes[offset] << 4) | (bytes[offset + 1] >> 4);

  for (let i = 0; i < GRID_SIZE; i++) {
    if (brightness[i] < 0 || brightness[i] > 4095) {
      throw new Error(`Decoded brightness value at index ${i} out of range: ${brightness[i]}`);
    }
  }

  return brightness;
}

export function decodePayload(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('Expected Uint8Array');
  }

  if (bytes.length < 3) {
    throw new Error(`Payload too short: ${bytes.length} bytes`);
  }

  const version = bytes[0];

  if (version === VERSION_3) {
    const expectedLength = 65;
    if (bytes.length !== expectedLength) {
      throw new Error(`Payload size mismatch: expected ${expectedLength}, got ${bytes.length}`);
    }

    // Unpack 169 x 3-bit indices from bytes[1..64].
    const brightness = new Array(GRID_SIZE);
    let bitOffset = 0;
    for (let i = 0; i < GRID_SIZE; i++) {
      const bytePos = 1 + (bitOffset >> 3);
      const bitShift = 5 - (bitOffset & 7);
      let idx;
      if (bitShift >= 0) {
        idx = (bytes[bytePos] >> bitShift) & 0x07;
      } else {
        idx = ((bytes[bytePos] << -bitShift) | (bytes[bytePos + 1] >> (8 + bitShift))) & 0x07;
      }
      if (idx > 4) {
        throw new Error(`Decoded index at position ${i} out of range: ${idx}`);
      }
      brightness[i] = INDEX_TO_LEVEL[idx];
      bitOffset += 3;
    }
    return { brightness };
  }

  if (version === VERSION_1) {
    const nameLength = bytes[1];
    const expectedLength = 1 + 1 + nameLength + BRIGHTNESS_BYTES;
    if (bytes.length !== expectedLength) {
      throw new Error(`Payload size mismatch: expected ${expectedLength}, got ${bytes.length}`);
    }
    const offset = 2 + nameLength;
    const brightness = decodeBrightness(bytes, offset);
    return { brightness };
  }

  if (version === VERSION_2) {
    const expectedLength = 1 + BRIGHTNESS_BYTES;
    if (bytes.length !== expectedLength) {
      throw new Error(`Payload size mismatch: expected ${expectedLength}, got ${bytes.length}`);
    }
    const brightness = decodeBrightness(bytes, 1);
    return { brightness };
  }

  throw new Error(`Unknown version: ${version}`);
}

export function encodePattern(brightness) {
  const bytes = encodePayload(brightness);
  return base64urlnopad.encode(bytes);
}

export function decodePattern(str) {
  try {
    const bytes = base64urlnopad.decode(str);
    return decodePayload(bytes);
  } catch {
    const bytes = base32crockford.decode(str);
    return decodePayload(bytes);
  }
}

export function decodeInput(input) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error('Input must be a non-empty string');
  }

  const trimmed = input.trim();

  if (trimmed.startsWith(URI_PREFIX)) {
    const payload = trimmed.slice(URI_PREFIX.length);
    if (payload.length === 0) {
      throw new Error('Empty payload after URI prefix');
    }
    return decodePattern(payload);
  }

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return decodePattern(trimmed);
  }

  throw new Error('Invalid input: expected glyphtoy:// URI or encoded pattern string');
}

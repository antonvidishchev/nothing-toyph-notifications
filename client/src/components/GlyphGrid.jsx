import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  GRID_SIZE,
  TOTAL_CELLS,
  CIRCULAR_MASK,
  brightnessToColor,
  nextBrightness,
  prevBrightness,
  nextBinaryBrightness,
  prevBinaryBrightness,
  invertBrightness,
} from '../utils/gridConstants.js';
import { validateImageFile } from '../utils/imageProcessing.js';
import { downloadExportJSON, parseImportFile } from '../utils/jsonIO.js';
import { encodePattern } from '../utils/qrPayload.js';
import CropModal from './CropModal.jsx';
import QRCodeModal from './QRCodeModal.jsx';

const CELL_SIZE = 32;
const GAP = 3;
const COLOR_MODE_COOKIE_NAME = 'glyph_color_mode';
const COLOR_MODE_FIVE = '5';
const COLOR_MODE_TWO = '2';
const COLOR_MODE_MAX_AGE_SECONDS = 31536000;
const LEFT_MOUSE_BUTTON = 0;
const RIGHT_MOUSE_BUTTON = 2;
const LEFT_MOUSE_BUTTON_MASK = 1;
const RIGHT_MOUSE_BUTTON_MASK = 2;

function readColorModeCookie() {
  if (typeof document === 'undefined') return COLOR_MODE_TWO;

  const prefix = `${COLOR_MODE_COOKIE_NAME}=`;
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!entry) return COLOR_MODE_TWO;
  const value = decodeURIComponent(entry.slice(prefix.length));
  if (value === COLOR_MODE_TWO || value === COLOR_MODE_FIVE) return value;
  return COLOR_MODE_TWO;
}

function writeColorModeCookie(mode) {
  if (typeof document === 'undefined') return;
  const normalizedMode = mode === COLOR_MODE_TWO ? COLOR_MODE_TWO : COLOR_MODE_FIVE;
  document.cookie = `${COLOR_MODE_COOKIE_NAME}=${normalizedMode}; path=/; max-age=${COLOR_MODE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function isValidBrightnessGrid(brightness) {
  return brightness && Array.isArray(brightness) && brightness.length === TOTAL_CELLS;
}

function isExpectedMouseButtonPressed(buttons, button) {
  const expectedMask =
    button === RIGHT_MOUSE_BUTTON ? RIGHT_MOUSE_BUTTON_MASK : LEFT_MOUSE_BUTTON_MASK;
  return (buttons & expectedMask) !== 0;
}

/**
 * GlyphGrid — renders the 13×13 LED matrix with circular mask.
 *
 * Active pixels are interactive circles that cycle through 5 brightness levels
 * on click. Inactive corner pixels are visually distinct and non-interactive.
 *
 * Supports optional controlled mode via `grid` and `onGridChange` props.
 * When props are not provided, manages its own state (uncontrolled).
 *
 * @param {Object} props
 * @param {number[]} [props.grid] - External grid state (169-element array)
 * @param {function} [props.onGridChange] - Callback when grid changes
 */
export default function GlyphGrid({ grid: externalGrid, onGridChange } = {}) {
  const [internalGrid, setInternalGrid] = useState(() => new Array(TOTAL_CELLS).fill(0));

  // Use external state if provided, otherwise internal
  const grid = externalGrid !== undefined ? externalGrid : internalGrid;
  const setGrid = onGridChange !== undefined ? onGridChange : setInternalGrid;

  const [colorMode, setColorMode] = useState(() => readColorModeCookie());
  const only2Colors = colorMode === COLOR_MODE_TWO;

  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [importError, setImportError] = useState(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const isDrawingRef = useRef(false);
  const drawingButtonRef = useRef(null);
  const drawValueRef = useRef(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    writeColorModeCookie(colorMode);
  }, [colorMode]);

  const handleColorModeChange = useCallback(
    (mode) => {
      const normalizedMode = mode === COLOR_MODE_TWO ? COLOR_MODE_TWO : COLOR_MODE_FIVE;
      setColorMode(normalizedMode);

      if (normalizedMode === COLOR_MODE_TWO && colorMode !== COLOR_MODE_TWO) {
        setGrid((prev) => {
          let changed = false;
          const next = prev.map((value, index) => {
            if (!CIRCULAR_MASK[index]) return value;
            const binaryValue = value >= 2048 ? 4095 : 0;
            if (binaryValue !== value) changed = true;
            return binaryValue;
          });
          return changed ? next : prev;
        });
      }
    },
    [colorMode, setGrid],
  );

  const stopDrawing = useCallback(() => {
    isDrawingRef.current = false;
    drawingButtonRef.current = null;
    drawValueRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('mouseup', stopDrawing);
    window.addEventListener('blur', stopDrawing);
    return () => {
      window.removeEventListener('mouseup', stopDrawing);
      window.removeEventListener('blur', stopDrawing);
    };
  }, [stopDrawing]);

  const setCellBrightness = useCallback(
    (index, value) => {
      if (!CIRCULAR_MASK[index]) return;
      setGrid((prev) => {
        if (prev[index] === value) return prev;
        const next = [...prev];
        next[index] = value;
        return next;
      });
    },
    [setGrid],
  );

  const getDrawValue = useCallback(
    (currentValue, button) => {
      const isRightClick = button === RIGHT_MOUSE_BUTTON;
      if (only2Colors) {
        return isRightClick
          ? prevBinaryBrightness(currentValue)
          : nextBinaryBrightness(currentValue);
      }
      return isRightClick ? prevBrightness(currentValue) : nextBrightness(currentValue);
    },
    [only2Colors],
  );

  const handleCellMouseDown = useCallback(
    (index, event) => {
      if (!CIRCULAR_MASK[index]) return;
      if (event.button !== LEFT_MOUSE_BUTTON && event.button !== RIGHT_MOUSE_BUTTON) return;

      event.preventDefault();
      const nextValue = getDrawValue(grid[index], event.button);
      suppressNextClickRef.current = event.button === LEFT_MOUSE_BUTTON;
      isDrawingRef.current = true;
      drawingButtonRef.current = event.button;
      drawValueRef.current = nextValue;
      setCellBrightness(index, nextValue);
    },
    [grid, getDrawValue, setCellBrightness],
  );

  const handleCellMouseEnter = useCallback(
    (index, event) => {
      if (!isDrawingRef.current || !CIRCULAR_MASK[index]) return;

      const drawingButton = drawingButtonRef.current;
      const drawValue = drawValueRef.current;
      if (drawingButton === null || drawValue === null) return;

      if (!isExpectedMouseButtonPressed(event.buttons, drawingButton)) {
        stopDrawing();
        return;
      }

      setCellBrightness(index, drawValue);
    },
    [setCellBrightness, stopDrawing],
  );

  const handleCellClick = useCallback(
    (index) => {
      if (!CIRCULAR_MASK[index]) return;

      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

      const nextValue = getDrawValue(grid[index], LEFT_MOUSE_BUTTON);
      setCellBrightness(index, nextValue);
    },
    [grid, getDrawValue, setCellBrightness],
  );

  const handleCellContextMenu = useCallback((event) => {
    event.preventDefault();
  }, []);

  const handleInvert = useCallback(() => {
    setGrid((prev) => prev.map((val, i) => (CIRCULAR_MASK[i] ? invertBrightness(val) : val)));
  }, [setGrid]);

  const handleClear = useCallback(() => {
    setGrid(new Array(TOTAL_CELLS).fill(0));
  }, [setGrid]);

  const handleUploadClick = useCallback(() => {
    setUploadError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return; // Cancel — no-op

    setUploadError(null);

    try {
      // Validate format before opening the crop modal
      validateImageFile(file);
      // Valid file — open crop modal with the selected file
      setCropFile(file);
      setCropModalOpen(true);
    } catch (err) {
      // Invalid file format — show error in toolbar, do not open modal
      setUploadError(err.message || 'Failed to process image.');
    }
  }, []);

  const handleCropClose = useCallback(() => {
    setCropModalOpen(false);
    setCropFile(null);
  }, []);

  const handleCropConfirm = useCallback(
    (brightness) => {
      if (isValidBrightnessGrid(brightness)) {
        setGrid([...brightness]);
      }
      setCropModalOpen(false);
      setCropFile(null);
    },
    [setGrid],
  );

  const handleExport = useCallback(() => {
    const exportGrid = grid.map((val, i) => (CIRCULAR_MASK[i] ? val : 0));
    downloadExportJSON(exportGrid);
  }, [grid]);

  const handleImportClick = useCallback(() => {
    setImportError(null);
    importInputRef.current?.click();
  }, []);

  const handleImportChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      // Reset the input so the same file can be re-selected
      if (importInputRef.current) importInputRef.current.value = '';
      if (!file) return; // Cancel — no-op

      setImportError(null);

      const result = await parseImportFile(file);
      if (result.valid) {
        setGrid(result.grid);
      } else {
        setImportError(result.error);
      }
    },
    [setGrid],
  );

  const handleQrCodeClick = useCallback(() => {
    setQrModalOpen(true);
  }, []);

  const handleQrModalClose = useCallback(() => {
    setQrModalOpen(false);
  }, []);

  const isGridEmpty = useMemo(() => grid.every((v) => v === 0), [grid]);
  const liveEncoded = useMemo(() => {
    if (isGridEmpty) return '';
    try {
      return encodePattern(grid);
    } catch {
      return '';
    }
  }, [grid, isGridEmpty]);

  const [shareCopyError, setShareCopyError] = useState('');
  const [shareCopySuccess, setShareCopySuccess] = useState(false);

  useEffect(() => {
    setShareCopyError('');
    setShareCopySuccess(false);
  }, [liveEncoded]);

  const handleShareCopy = useCallback(async () => {
    setShareCopyError('');
    setShareCopySuccess(false);

    if (!liveEncoded) return;

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setShareCopyError('Clipboard is unavailable in this browser context.');
      return;
    }

    try {
      await navigator.clipboard.writeText(liveEncoded);
      setShareCopySuccess(true);
    } catch {
      setShareCopyError('Failed to copy pattern code.');
    }
  }, [liveEncoded]);

  const rows = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const cells = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const index = row * GRID_SIZE + col;
      const isActive = CIRCULAR_MASK[index];
      const baseBrightness = grid[index];

      cells.push(
        <div
          key={index}
          data-testid={`cell-${index}`}
          data-active={String(isActive)}
          data-brightness={String(baseBrightness)}
          onContextMenu={handleCellContextMenu}
          onMouseDown={(event) => handleCellMouseDown(index, event)}
          onMouseEnter={(event) => handleCellMouseEnter(index, event)}
          onMouseUp={stopDrawing}
          onClick={() => handleCellClick(index)}
          style={{
            width: CELL_SIZE,
            height: CELL_SIZE,
            borderRadius: '50%',
            backgroundColor: isActive ? brightnessToColor(baseBrightness) : 'transparent',
            border: isActive ? '1px solid #333' : 'none',
            cursor: isActive ? 'pointer' : 'default',
            transition: 'background-color 0.1s ease',
            userSelect: 'none',
          }}
        />,
      );
    }
    rows.push(
      <div
        key={row}
        data-testid={`row-${row}`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
          gap: `${GAP}px`,
        }}
      >
        {cells}
      </div>,
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${GAP}px`,
        padding: '16px',
      }}
    >
      {rows}
      <div
        style={{
          marginTop: '10px',
          width: '100%',
          maxWidth: `${GRID_SIZE * (CELL_SIZE + GAP)}px`,
        }}
      >
        <div
          data-testid="main-color-mode-switch"
          role="radiogroup"
          aria-label="Main color mode"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            border: '1px solid #333',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={colorMode === COLOR_MODE_FIVE}
            data-testid="main-color-mode-5-button"
            onClick={() => handleColorModeChange(COLOR_MODE_FIVE)}
            style={{
              backgroundColor: colorMode === COLOR_MODE_FIVE ? '#fff' : '#111',
              color: colorMode === COLOR_MODE_FIVE ? '#111' : '#fff',
              border: 'none',
              borderRight: '1px solid #333',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: colorMode === COLOR_MODE_FIVE ? 'bold' : 'normal',
              cursor: 'pointer',
            }}
          >
            5 Colors
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={colorMode === COLOR_MODE_TWO}
            data-testid="main-color-mode-2-button"
            onClick={() => handleColorModeChange(COLOR_MODE_TWO)}
            style={{
              backgroundColor: colorMode === COLOR_MODE_TWO ? '#fff' : '#111',
              color: colorMode === COLOR_MODE_TWO ? '#111' : '#fff',
              border: 'none',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: colorMode === COLOR_MODE_TWO ? 'bold' : 'normal',
              cursor: 'pointer',
            }}
          >
            2 Colors
          </button>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginTop: '16px',
        }}
      >
        <button
          onClick={handleInvert}
          style={{
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '10px 20px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, transform 0.1s ease',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.backgroundColor = '#666';
            e.currentTarget.style.transform = 'scale(0.96)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Invert Colors
        </button>
        <button
          onClick={handleClear}
          style={{
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '10px 20px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, transform 0.1s ease',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.backgroundColor = '#666';
            e.currentTarget.style.transform = 'scale(0.96)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Clear
        </button>
        <button
          onClick={handleUploadClick}
          style={{
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '10px 20px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, transform 0.1s ease',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.backgroundColor = '#666';
            e.currentTarget.style.transform = 'scale(0.96)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Upload Image
        </button>
        <button
          onClick={handleExport}
          data-testid="export-json-button"
          style={{
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '10px 20px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, transform 0.1s ease',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.backgroundColor = '#666';
            e.currentTarget.style.transform = 'scale(0.96)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Export JSON
        </button>
        <button
          onClick={handleImportClick}
          data-testid="import-json-button"
          style={{
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '10px 20px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, transform 0.1s ease',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.backgroundColor = '#666';
            e.currentTarget.style.transform = 'scale(0.96)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Import JSON
        </button>
        <button
          onClick={handleQrCodeClick}
          data-testid="qr-code-button"
          style={{
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '10px 20px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, transform 0.1s ease',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.backgroundColor = '#666';
            e.currentTarget.style.transform = 'scale(0.96)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          QR Code
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          data-testid="image-upload-input"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          data-testid="json-import-input"
          onChange={handleImportChange}
          style={{ display: 'none' }}
        />
      </div>
      {uploadError && (
        <div
          data-testid="upload-error"
          style={{
            color: '#ff6b6b',
            backgroundColor: '#331111',
            border: '1px solid #552222',
            borderRadius: '6px',
            padding: '8px 16px',
            marginTop: '8px',
            fontSize: '13px',
            maxWidth: '400px',
            textAlign: 'center',
          }}
        >
          {uploadError}
        </div>
      )}
      {importError && (
        <div
          data-testid="import-error"
          style={{
            color: '#ff6b6b',
            backgroundColor: '#331111',
            border: '1px solid #552222',
            borderRadius: '6px',
            padding: '8px 16px',
            marginTop: '8px',
            fontSize: '13px',
            maxWidth: '400px',
            textAlign: 'center',
          }}
        >
          {importError}
        </div>
      )}

      <div
        style={{
          marginTop: '16px',
          width: '100%',
          maxWidth: `${GRID_SIZE * (CELL_SIZE + GAP)}px`,
        }}
      >
        <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '4px' }}>
          Pattern code
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            data-testid="share-field"
            style={{
              flex: 1,
              background: '#111',
              border: '1px solid #333',
              borderRadius: '6px',
              color: liveEncoded ? '#fff' : '#888',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
              minHeight: '32px',
              userSelect: 'text',
              overflowWrap: 'anywhere',
            }}
          >
            {liveEncoded || 'No pattern yet'}
          </div>
          <button
            data-testid="share-copy-button"
            onClick={handleShareCopy}
            disabled={!liveEncoded}
            style={{
              backgroundColor: '#333',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '12px',
              cursor: liveEncoded ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
              opacity: liveEncoded ? 1 : 0.6,
            }}
          >
            Copy
          </button>
        </div>
        {shareCopyError && (
          <div
            data-testid="share-copy-error"
            style={{ color: '#ff6b6b', fontSize: '12px', marginTop: '4px' }}
          >
            {shareCopyError}
          </div>
        )}
        {shareCopySuccess && (
          <div
            data-testid="share-copy-success"
            style={{ color: '#2a8b2a', fontSize: '12px', marginTop: '4px' }}
          >
            Pattern copied!
          </div>
        )}
      </div>

      {/* Crop modal — rendered as a portal-like overlay inside GlyphGrid */}
      <CropModal
        isOpen={cropModalOpen}
        file={cropFile}
        onConfirm={handleCropConfirm}
        onClose={handleCropClose}
        colorMode={colorMode}
        onColorModeChange={handleColorModeChange}
      />
      <QRCodeModal isOpen={qrModalOpen} brightness={grid} onClose={handleQrModalClose} />
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import CropArea from './CropArea.jsx';
import GlyphPreview from './GlyphPreview.jsx';
import {
  CROP_SIZE,
  calcInitialState,
  clampZoom,
  clampPan,
  zoomToSlider,
  sliderToZoom,
  computePreviewBrightness,
} from '../utils/cropUtils.js';
import { CIRCULAR_MASK, invertBrightness } from '../utils/gridConstants.js';

/** Duration (ms) of the fade-out animation — must match the CSS animation below. */
const FADE_OUT_DURATION = 150;

const CIRCLE_R = CROP_SIZE / 2;
const COLOR_MODE_COOKIE_NAME = 'glyph_color_mode';
const COLOR_MODE_FIVE = '5';
const COLOR_MODE_TWO = '2';
const COLOR_MODE_MAX_AGE_SECONDS = 31536000;

function readColorModeCookie() {
  if (typeof document === 'undefined') return COLOR_MODE_FIVE;

  const prefix = `${COLOR_MODE_COOKIE_NAME}=`;
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!entry) return COLOR_MODE_FIVE;
  const value = decodeURIComponent(entry.slice(prefix.length));
  return value === COLOR_MODE_TWO ? COLOR_MODE_TWO : COLOR_MODE_FIVE;
}

function writeColorModeCookie(mode) {
  if (typeof document === 'undefined') return;
  const normalizedMode = mode === COLOR_MODE_TWO ? COLOR_MODE_TWO : COLOR_MODE_FIVE;
  document.cookie = `${COLOR_MODE_COOKIE_NAME}=${normalizedMode}; path=/; max-age=${COLOR_MODE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function applyInvertIfNeeded(brightnessGrid, isInverted) {
  if (!isInverted || !Array.isArray(brightnessGrid)) return brightnessGrid;
  return brightnessGrid.map((value, index) =>
    CIRCULAR_MASK[index] ? invertBrightness(value) : value,
  );
}

/**
 * CropModal — modal for the image crop workflow.
 *
 * Manages all crop state: image loading, zoom, pan, slider binding.
 * Delegates rendering and interaction to CropArea.
 *
 * Dismisses on: Cancel button, backdrop click (mousedown+mouseup on backdrop),
 * Escape key. Blocks background interaction via the fixed-position backdrop.
 * Locks body scroll while open.
 *
 * State resets when a new file is provided (new Object URL → new image → new
 * initial state calculated from natural dimensions).
 *
 * @param {Object}      props
 * @param {boolean}     props.isOpen    - Whether the modal is visible
 * @param {File|null}   props.file      - The image file selected for cropping
 * @param {function}    props.onConfirm - Called when user clicks Confirm
 * @param {function}    props.onClose   - Called when user dismisses the modal
 * @param {'5'|'2'}     [props.colorMode] - Optional controlled color mode
 * @param {function}    [props.onColorModeChange] - Controlled mode change callback
 */
export default function CropModal({
  isOpen,
  file,
  onConfirm,
  onClose,
  colorMode: controlledColorMode,
  onColorModeChange,
}) {
  // ─── Fade-out animation state ────────────────────────────────────────────────
  // Keep the modal in the DOM during the close animation instead of unmounting
  // immediately.  isMounted controls DOM presence; isAnimatingOut applies the
  // reverse (fade-out) CSS animation.
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  // Ref mirrors isMounted so the isOpen effect can read current value without
  // adding isMounted to its dependency array (which would re-run on every mount).
  const isMountedRef = useRef(isOpen);

  useEffect(() => {
    if (isOpen) {
      // Opening: ensure mounted and not animating out
      isMountedRef.current = true;
      setIsMounted(true);
      setIsAnimatingOut(false);
    } else if (isMountedRef.current) {
      // Closing: start fade-out, then unmount after animation completes
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        isMountedRef.current = false;
        setIsMounted(false);
        setIsAnimatingOut(false);
      }, FADE_OUT_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // ─── Modal dismiss tracking ──────────────────────────────────────────────────
  // Track whether the pointer-down started on the backdrop (not inside the panel).
  // Only a complete backdrop click (mousedown + mouseup on backdrop) should dismiss.
  const mouseDownOnBackdrop = useRef(false);

  // ─── Image loading state ─────────────────────────────────────────────────────
  const [imgSrc, setImgSrc] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(null);
  const [imgNaturalWidth, setImgNaturalWidth] = useState(0);
  const [imgNaturalHeight, setImgNaturalHeight] = useState(0);

  // ─── Ref to the <img> element inside CropArea (for canvas pixel extraction) ──
  const imgRef = useRef(null);

  // ─── Crop interaction state ──────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);

  // ─── Brightness + color mode state ───────────────────────────────────────────
  // brightness: 0–100 slider value, 50 = identity (natural image)
  // brightnessText: current text in the synced textbox (may differ during editing)
  // colorMode: '5' (five-level quantization) or '2' (black/white quantization)
  const [brightness, setBrightness] = useState(50);
  const [brightnessText, setBrightnessText] = useState('50');
  const [localColorMode, setLocalColorMode] = useState(() => readColorModeCookie());
  const hasControlledColorMode =
    controlledColorMode === COLOR_MODE_FIVE || controlledColorMode === COLOR_MODE_TWO;
  const colorMode = hasControlledColorMode ? controlledColorMode : localColorMode;
  const only2Colors = colorMode === COLOR_MODE_TWO;
  const [isInverted, setIsInverted] = useState(false);

  // ─── Preview brightness state ─────────────────────────────────────────────────
  // null until the first successful canvas extraction after image loads.
  // Passed to GlyphPreview for rendering and to onConfirm when Confirm is clicked.
  const [previewBrightness, setPreviewBrightness] = useState(null);

  // ─── Load image from file when modal opens or file changes ──────────────────
  useEffect(() => {
    if (!isOpen || !file) {
      // Modal closed or no file — clear image state
      setImgSrc(null);
      setImgLoaded(false);
      setImgError(null);
      return;
    }

    // New file: reset to loading state before creating new URL
    setImgLoaded(false);
    setImgError(null);
    setImgNaturalWidth(0);
    setImgNaturalHeight(0);
    // Reset crop state to defaults until onImageLoad sets correct initial state
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setMinZoom(1);
    setMaxZoom(5);
    // Reset brightness to defaults for new image (mode is persisted via cookie)
    setBrightness(50);
    setBrightnessText('50');
    // Invert toggle is per-image edit state
    setIsInverted(false);
    // Reset preview — will be recomputed once image loads
    setPreviewBrightness(null);

    const url = URL.createObjectURL(file);
    setImgSrc(url);

    // Revoke the object URL when the file changes or the modal closes
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, isOpen]);

  // Persist selected color mode across modal reopen/reload in uncontrolled mode.
  useEffect(() => {
    if (!hasControlledColorMode) {
      writeColorModeCookie(localColorMode);
    }
  }, [hasControlledColorMode, localColorMode]);

  // ─── Callbacks from CropArea ─────────────────────────────────────────────────

  /**
   * Called by CropArea when the <img> element has decoded successfully.
   * Sets the initial crop state (centered, min zoom) based on natural dimensions.
   */
  const handleImageLoad = useCallback((naturalWidth, naturalHeight) => {
    const initial = calcInitialState(naturalWidth, naturalHeight, CROP_SIZE);
    setImgNaturalWidth(naturalWidth);
    setImgNaturalHeight(naturalHeight);
    setZoom(initial.zoom);
    setPanX(initial.panX);
    setPanY(initial.panY);
    setMinZoom(initial.minZoom);
    setMaxZoom(initial.maxZoom);
    setImgLoaded(true);
  }, []);

  /**
   * Called by CropArea when the <img> element fails to decode.
   * Shows an error message in the crop area.
   */
  const handleImageError = useCallback(() => {
    setImgError('Failed to load image. The file may be corrupt or unsupported.');
    setImgLoaded(false);
  }, []);

  /**
   * Called by CropArea when the user drags to pan.
   * Accepts already-clamped values from CropArea.
   */
  const handlePan = useCallback((newPanX, newPanY) => {
    setPanX(newPanX);
    setPanY(newPanY);
  }, []);

  /**
   * Called by CropArea when the user zooms (wheel or pinch).
   * Accepts already-clamped zoom from CropArea; also updates pan to re-clamp.
   */
  const handleZoom = useCallback((newZoom) => {
    setZoom(newZoom);
  }, []);

  // ─── Live preview calculation (debounced ~100ms) ──────────────────────────────
  // Fires whenever the image is loaded or the crop state changes
  // (zoom/pan/brightness/only2Colors/isInverted).
  // Extracts the visible crop region via canvas, applies brightness adjustment and optional
  // quantization, then optionally inverts and stores a 169-element brightness array
  // for display in GlyphPreview.
  useEffect(() => {
    if (!imgLoaded || !imgNaturalWidth || !imgNaturalHeight) return;

    const timer = setTimeout(() => {
      if (!imgRef.current) return;
      const result = computePreviewBrightness(
        imgRef.current,
        zoom,
        panX,
        panY,
        imgNaturalWidth,
        imgNaturalHeight,
        CROP_SIZE,
        brightness,
        only2Colors,
      );
      if (result != null) setPreviewBrightness(applyInvertIfNeeded(result, isInverted));
    }, 100);

    return () => clearTimeout(timer);
  }, [
    imgLoaded,
    zoom,
    panX,
    panY,
    imgNaturalWidth,
    imgNaturalHeight,
    brightness,
    only2Colors,
    isInverted,
  ]);

  // ─── Keyboard dismiss ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ─── Body scroll lock ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isMounted) return null;

  // ─── Backdrop dismiss helpers ─────────────────────────────────────────────────
  const handleBackdropMouseDown = (e) => {
    mouseDownOnBackdrop.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && mouseDownOnBackdrop.current) {
      mouseDownOnBackdrop.current = false;
      onClose();
    }
  };

  // Prevent panel mouse events from reaching the backdrop
  const stopPropagation = (e) => e.stopPropagation();

  // ─── Zoom slider handlers ─────────────────────────────────────────────────────
  const sliderValue = imgLoaded ? zoomToSlider(zoom, minZoom, maxZoom) : 0;

  const handleSliderChange = (e) => {
    if (!imgLoaded) return;
    // sliderToZoom already returns values in [minZoom, maxZoom]; clampZoom for safety
    const newZoom = clampZoom(
      sliderToZoom(Number(e.target.value), minZoom, maxZoom),
      minZoom,
      maxZoom,
    );
    const clamped = clampPan(panX, panY, newZoom, imgNaturalWidth, imgNaturalHeight, CIRCLE_R);
    setZoom(newZoom);
    setPanX(clamped.panX);
    setPanY(clamped.panY);
  };

  // ─── Brightness slider/textbox handlers ──────────────────────────────────────

  const handleBrightnessSliderChange = (e) => {
    if (!imgLoaded) return;
    const val = Number(e.target.value);
    setBrightness(val);
    setBrightnessText(String(val));
  };

  const handleBrightnessTextChange = (e) => {
    // Update the displayed text immediately; defer applying to slider until blur/Enter
    setBrightnessText(e.target.value);
  };

  const commitBrightnessText = () => {
    const raw = brightnessText.trim();
    if (raw === '') {
      // Empty: revert to current brightness
      setBrightnessText(String(brightness));
      return;
    }
    const num = parseFloat(raw);
    if (isNaN(num)) {
      // Non-numeric: revert
      setBrightnessText(String(brightness));
      return;
    }
    // Clamp and round to integer
    const clamped = Math.round(Math.max(0, Math.min(100, num)));
    setBrightness(clamped);
    setBrightnessText(String(clamped));
  };

  const handleBrightnessTextBlur = () => {
    commitBrightnessText();
  };

  const handleBrightnessTextKeyDown = (e) => {
    if (e.key === 'Enter') {
      commitBrightnessText();
    }
  };

  const handleColorModeSelect = (mode) => {
    if (!imgLoaded) return;
    if (hasControlledColorMode) {
      onColorModeChange?.(mode);
      return;
    }
    setLocalColorMode(mode);
  };

  return (
    <>
      {/* Keyframe animations injected inline — no external CSS file needed */}
      <style>{`
        @keyframes cropModalFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cropModalFadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {/* Backdrop — fixed overlay covering the entire viewport */}
      <div
        data-testid="crop-modal-backdrop"
        data-closing={isAnimatingOut ? 'true' : undefined}
        onMouseDown={handleBackdropMouseDown}
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: isAnimatingOut
            ? `cropModalFadeOut ${FADE_OUT_DURATION}ms ease forwards`
            : 'cropModalFadeIn 0.15s ease',
          // Disable pointer events during fade-out so the closing modal
          // cannot receive additional dismiss clicks.
          pointerEvents: isAnimatingOut ? 'none' : undefined,
        }}
      >
        {/* Modal panel — centered, dark theme */}
        <div
          data-testid="crop-modal-panel"
          onClick={stopPropagation}
          onMouseDown={stopPropagation}
          style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            width: '360px',
            maxWidth: '90vw',
            color: '#fff',
          }}
        >
          {/* Crop area — image with circular mask, pan/zoom interaction */}
          <CropArea
            imgSrc={imgSrc}
            imgNaturalWidth={imgNaturalWidth}
            imgNaturalHeight={imgNaturalHeight}
            zoom={zoom}
            panX={panX}
            panY={panY}
            minZoom={minZoom}
            maxZoom={maxZoom}
            imgLoaded={imgLoaded}
            imgError={imgError}
            onPan={handlePan}
            onZoom={handleZoom}
            onImageLoad={handleImageLoad}
            onImageError={handleImageError}
            imgRef={imgRef}
          />

          {/* Zoom slider — two-way bound with crop area zoom */}
          <input
            data-testid="zoom-slider"
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={sliderValue}
            disabled={!imgLoaded}
            onChange={handleSliderChange}
            style={{
              width: '100%',
              accentColor: '#fff',
              cursor: imgLoaded ? 'pointer' : 'not-allowed',
              backgroundColor: 'transparent',
              opacity: imgLoaded ? 1 : 0.4,
            }}
          />

          {/* Brightness slider + synced textbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label
              htmlFor="brightness-slider-input"
              style={{ fontSize: '12px', color: '#aaa', minWidth: '60px', flexShrink: 0 }}
            >
              Brightness
            </label>
            <input
              id="brightness-slider-input"
              data-testid="brightness-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={brightness}
              disabled={!imgLoaded}
              onChange={handleBrightnessSliderChange}
              style={{
                flex: 1,
                accentColor: '#fff',
                cursor: imgLoaded ? 'pointer' : 'not-allowed',
                backgroundColor: 'transparent',
                opacity: imgLoaded ? 1 : 0.4,
              }}
            />
            <input
              data-testid="brightness-text"
              type="text"
              value={brightnessText}
              disabled={!imgLoaded}
              onChange={handleBrightnessTextChange}
              onBlur={handleBrightnessTextBlur}
              onKeyDown={handleBrightnessTextKeyDown}
              style={{
                width: '40px',
                textAlign: 'center',
                backgroundColor: '#111',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '2px 4px',
                fontSize: '12px',
                opacity: imgLoaded ? 1 : 0.4,
                flexShrink: 0,
              }}
            />
          </div>

          {/* Color mode segmented switch (5 Colors | 2 Colors) */}
          <div
            data-testid="color-mode-switch"
            role="radiogroup"
            aria-label="Color mode"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              border: '1px solid #333',
              borderRadius: '6px',
              overflow: 'hidden',
              opacity: imgLoaded ? 1 : 0.4,
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={colorMode === COLOR_MODE_FIVE}
              data-testid="color-mode-5-button"
              disabled={!imgLoaded}
              onClick={() => handleColorModeSelect(COLOR_MODE_FIVE)}
              style={{
                backgroundColor: colorMode === COLOR_MODE_FIVE ? '#fff' : '#111',
                color: colorMode === COLOR_MODE_FIVE ? '#111' : '#fff',
                border: 'none',
                borderRight: '1px solid #333',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: colorMode === COLOR_MODE_FIVE ? 'bold' : 'normal',
                cursor: imgLoaded ? 'pointer' : 'not-allowed',
              }}
            >
              5 Colors
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={colorMode === COLOR_MODE_TWO}
              data-testid="color-mode-2-button"
              disabled={!imgLoaded}
              onClick={() => handleColorModeSelect(COLOR_MODE_TWO)}
              style={{
                backgroundColor: colorMode === COLOR_MODE_TWO ? '#fff' : '#111',
                color: colorMode === COLOR_MODE_TWO ? '#111' : '#fff',
                border: 'none',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: colorMode === COLOR_MODE_TWO ? 'bold' : 'normal',
                cursor: imgLoaded ? 'pointer' : 'not-allowed',
              }}
            >
              2 Colors
            </button>
          </div>

          <label
            data-testid="invert-colors-toggle"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: '1px solid #333',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: imgLoaded ? 'pointer' : 'not-allowed',
              opacity: imgLoaded ? 1 : 0.4,
              userSelect: 'none',
            }}
          >
            <input
              data-testid="invert-colors-checkbox"
              type="checkbox"
              checked={isInverted}
              disabled={!imgLoaded}
              onChange={(e) => setIsInverted(e.target.checked)}
              style={{
                accentColor: '#fff',
                cursor: imgLoaded ? 'pointer' : 'not-allowed',
              }}
            />
            <span style={{ color: '#fff', fontWeight: isInverted ? 'bold' : 'normal' }}>
              Invert Colors
            </span>
          </label>

          {/* Live glyph preview — miniature 13x13 grid showing crop result */}
          <GlyphPreview brightness={previewBrightness} />

          {/* Button bar */}
          <div
            data-testid="crop-modal-button-bar"
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}
          >
            {/* Cancel — gray, secondary */}
            <button
              data-testid="crop-modal-cancel"
              onClick={onClose}
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
              Cancel
            </button>

            {/* Confirm — green when preview is ready, grayed-out and disabled otherwise.
                Synchronously recomputes brightness from current UI state on click to avoid
                sending stale cached values when brightness/only2Colors changed within the
                100ms debounce window. Falls back to cached previewBrightness if canvas
                extraction fails (e.g. headless environment). */}
            <button
              data-testid="crop-modal-confirm"
              disabled={previewBrightness === null}
              onClick={() => {
                if (previewBrightness === null) return;
                // Bypass debounce: synchronously recompute from current UI state
                const fresh = imgRef.current
                  ? computePreviewBrightness(
                      imgRef.current,
                      zoom,
                      panX,
                      panY,
                      imgNaturalWidth,
                      imgNaturalHeight,
                      CROP_SIZE,
                      brightness,
                      only2Colors,
                    )
                  : null;
                onConfirm(applyInvertIfNeeded(fresh, isInverted) ?? previewBrightness);
              }}
              style={{
                backgroundColor: previewBrightness !== null ? '#1a6b1a' : '#333',
                color: previewBrightness !== null ? '#fff' : '#888',
                border: `1px solid ${previewBrightness !== null ? '#2a8b2a' : '#444'}`,
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: previewBrightness !== null ? 'pointer' : 'not-allowed',
                opacity: previewBrightness !== null ? 1 : 0.6,
                transition: 'background-color 0.15s ease, transform 0.1s ease',
              }}
              onMouseDown={(e) => {
                if (previewBrightness === null) return;
                e.currentTarget.style.backgroundColor = '#2a8b2a';
                e.currentTarget.style.transform = 'scale(0.96)';
              }}
              onMouseUp={(e) => {
                if (previewBrightness === null) return;
                e.currentTarget.style.backgroundColor = '#1a6b1a';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseLeave={(e) => {
                if (previewBrightness === null) return;
                e.currentTarget.style.backgroundColor = '#1a6b1a';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

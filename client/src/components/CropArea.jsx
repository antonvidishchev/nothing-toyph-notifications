import { useRef, useState, useEffect, useCallback } from 'react';
import { CROP_SIZE, clampZoom, clampPan } from '../utils/cropUtils.js';

/** Radius of the circular crop area. */
const CIRCLE_R = CROP_SIZE / 2;

/**
 * CropArea — the interactive image cropping area within CropModal.
 *
 * Renders the uploaded image inside a fixed circular crop area.
 * The area outside the circle is dimmed with a semi-transparent overlay.
 * Supports image pan (mouse drag, single-touch drag) and zoom (mouse wheel,
 * two-finger pinch). All interactions enforce the constraint that the image
 * always fills the circle — no empty space is ever visible inside the circle.
 *
 * Uses `touchAction: none` CSS to prevent browser scroll on touch interactions.
 * Uses a non-passive wheel listener to prevent page scroll when wheeling over
 * the crop area.
 *
 * State for the interaction (zoom, panX, panY) is owned by the parent (CropModal)
 * and passed as props. Changes are reported via onPan/onZoom callbacks.
 *
 * @param {Object}   props
 * @param {string|null} props.imgSrc             - Object URL for the image (or null)
 * @param {number}   props.imgNaturalWidth        - Natural image width in pixels
 * @param {number}   props.imgNaturalHeight       - Natural image height in pixels
 * @param {number}   props.zoom                   - Current zoom level
 * @param {number}   props.panX                   - Current X pan offset in pixels
 * @param {number}   props.panY                   - Current Y pan offset in pixels
 * @param {number}   props.minZoom                - Minimum zoom (image fills circle)
 * @param {number}   props.maxZoom                - Maximum zoom (~5× minZoom)
 * @param {boolean}  props.imgLoaded              - Whether the image has successfully loaded
 * @param {string|null} props.imgError            - Error message if image failed to load
 * @param {function} props.onPan                  - (newPanX, newPanY) → void
 * @param {function} props.onZoom                 - (newZoom) → void
 * @param {function} props.onImageLoad            - (naturalWidth, naturalHeight) → void
 * @param {function} props.onImageError           - () → void
 */
export default function CropArea({
  imgSrc,
  imgNaturalWidth,
  imgNaturalHeight,
  zoom,
  panX,
  panY,
  minZoom,
  maxZoom,
  imgLoaded,
  imgError,
  onPan,
  onZoom,
  onImageLoad,
  onImageError,
  imgRef,
}) {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  // Always-fresh state ref — updated synchronously each render so that
  // event handlers (which may fire between renders) always see current values.
  const stateRef = useRef(null);
  stateRef.current = {
    zoom,
    panX,
    panY,
    minZoom,
    maxZoom,
    imgNaturalWidth,
    imgNaturalHeight,
  };

  // Callback refs — updated each render so useEffect handlers stay fresh
  // without needing to re-attach event listeners on every state change.
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const onPanRef = useRef(onPan);
  onPanRef.current = onPan;

  // Active pointer tracking (ref, not state — no re-render needed on update)
  const pointersRef = useRef(new Map()); // pointerId → { x, y }
  // Drag state for single-pointer pan
  const dragStartRef = useRef(null); // { startX, startY, startPanX, startPanY }
  // Drag state for two-pointer pinch zoom
  const pinchStartRef = useRef(null); // { startDist, startZoom, startPanX, startPanY }

  // ─── Pointer events — handles mouse drag and touch (pan + pinch) ────────────

  const handlePointerDown = useCallback((e) => {
    // Capture pointer so we receive move/up even if pointer leaves the element
    e.currentTarget.setPointerCapture(e.pointerId);

    const pointers = pointersRef.current;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const { panX: px, panY: py, zoom: z } = stateRef.current;

    if (pointers.size === 1) {
      // Start single-pointer drag (mouse or single-touch)
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: px,
        startPanY: py,
      };
      pinchStartRef.current = null;
      setIsDragging(true);
    } else if (pointers.size === 2) {
      // Two pointers: switch to pinch-zoom mode
      const pts = [...pointers.values()];
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      pinchStartRef.current = {
        startDist: dist,
        startZoom: z,
        startPanX: px,
        startPanY: py,
      };
      dragStartRef.current = null;
    }
    // 3+ simultaneous pointers: ignore
  }, []);

  const handlePointerMove = useCallback((e) => {
    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const {
      zoom: z,
      minZoom: minZ,
      maxZoom: maxZ,
      imgNaturalWidth: iw,
      imgNaturalHeight: ih,
    } = stateRef.current;

    if (pointers.size === 1 && dragStartRef.current) {
      // Pan: move image by the drag delta
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const clamped = clampPan(
        dragStartRef.current.startPanX + dx,
        dragStartRef.current.startPanY + dy,
        z,
        iw,
        ih,
        CIRCLE_R,
      );
      onPanRef.current(clamped.panX, clamped.panY);
    } else if (pointers.size === 2 && pinchStartRef.current) {
      // Pinch zoom: scale zoom by ratio of current to start distance
      const pts = [...pointers.values()];
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / pinchStartRef.current.startDist;
      const newZoom = clampZoom(pinchStartRef.current.startZoom * scale, minZ, maxZ);
      const clamped = clampPan(
        pinchStartRef.current.startPanX,
        pinchStartRef.current.startPanY,
        newZoom,
        iw,
        ih,
        CIRCLE_R,
      );
      onZoomRef.current(newZoom);
      onPanRef.current(clamped.panX, clamped.panY);
    }
  }, []);

  const handlePointerUp = useCallback((e) => {
    const pointers = pointersRef.current;
    pointers.delete(e.pointerId);

    const { panX: px, panY: py } = stateRef.current;
    const count = pointers.size;

    if (count === 1) {
      // Transition from pinch back to single-pointer drag
      const [[, pos]] = [...pointers.entries()];
      dragStartRef.current = {
        startX: pos.x,
        startY: pos.y,
        startPanX: px,
        startPanY: py,
      };
      pinchStartRef.current = null;
    } else if (count === 0) {
      dragStartRef.current = null;
      pinchStartRef.current = null;
      setIsDragging(false);
    }
  }, []);

  // ─── Wheel zoom (non-passive — must prevent page scroll) ────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      e.preventDefault(); // Prevent page scroll when wheeling over crop area
      const {
        zoom: z,
        minZoom: minZ,
        maxZoom: maxZ,
        panX: px,
        panY: py,
        imgNaturalWidth: iw,
        imgNaturalHeight: ih,
      } = stateRef.current;

      if (!iw || !ih) return; // Image not yet loaded

      // deltaY < 0 = scroll up = zoom in; deltaY > 0 = scroll down = zoom out
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = clampZoom(z * factor, minZ, maxZ);
      const clamped = clampPan(px, py, newZoom, iw, ih, CIRCLE_R);
      onZoomRef.current(newZoom);
      onPanRef.current(clamped.panX, clamped.panY);
    };

    // Non-passive so we can call preventDefault() to block page scroll
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
    // Empty deps array is intentional: all values accessed via refs (stateRef, onZoomRef, onPanRef)
    // which are always kept current without re-triggering the effect.
  }, []);

  // ─── Computed image geometry ─────────────────────────────────────────────────

  // Image is positioned so its center aligns with the circle center + pan offset.
  // Circle center = (CROP_SIZE/2, CROP_SIZE/2) in container coordinates.
  const imgLeft = CROP_SIZE / 2 + panX - (imgNaturalWidth * zoom) / 2;
  const imgTop = CROP_SIZE / 2 + panY - (imgNaturalHeight * zoom) / 2;
  const imgDisplayWidth = imgNaturalWidth * zoom;
  const imgDisplayHeight = imgNaturalHeight * zoom;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      data-testid="crop-area"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'relative',
        width: CROP_SIZE,
        height: CROP_SIZE,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderRadius: '8px',
        // grab/grabbing cursor for mouse drag
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        // Prevents browser-default touch scroll/zoom on this element — equivalent
        // to calling e.preventDefault() on touchstart/touchmove but without
        // cancelling the pointer events that handle our interaction logic.
        touchAction: 'none',
        margin: '0 auto',
      }}
    >
      {/* Image — always rendered when imgSrc is set; positioned only when loaded */}
      {imgSrc && !imgError && (
        <img
          ref={imgRef}
          data-testid="crop-image"
          src={imgSrc}
          onLoad={(e) => onImageLoad(e.target.naturalWidth, e.target.naturalHeight)}
          onError={() => onImageError()}
          draggable={false}
          alt=""
          style={{
            position: 'absolute',
            left: imgLoaded ? imgLeft : 0,
            top: imgLoaded ? imgTop : 0,
            width: imgLoaded ? imgDisplayWidth : 0,
            height: imgLoaded ? imgDisplayHeight : 0,
            visibility: imgLoaded ? 'visible' : 'hidden',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      )}

      {/* Loading indicator — shown while image is decoding */}
      {imgSrc && !imgLoaded && !imgError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            fontSize: '13px',
            pointerEvents: 'none',
          }}
        >
          Loading…
        </div>
      )}

      {/* Error state — shown when image fails to decode/load */}
      {imgError && (
        <div
          data-testid="crop-area-error"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            color: '#ff6b6b',
            fontSize: '13px',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {imgError}
        </div>
      )}

      {/* Circular mask overlay — transparent inside circle, dimmed outside.
          Always visible so the crop boundary is always clear. */}
      <div
        data-testid="crop-mask-overlay"
        style={{
          position: 'absolute',
          inset: 0,
          // Sharp boundary at the circle radius: transparent inside, dark outside
          background: `radial-gradient(circle at center, transparent ${CIRCLE_R}px, rgba(0,0,0,0.75) ${CIRCLE_R}px)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

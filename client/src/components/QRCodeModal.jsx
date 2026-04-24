import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { encodePattern } from '../utils/qrPayload.js';

const FADE_OUT_DURATION = 150;
const URI_PREFIX = 'glyphtoy://pattern/';

let cachedLogo = null;
function getLogo() {
  if (!cachedLogo) {
    cachedLogo = new Image();
    cachedLogo.src = '/logo.png';
  }
  return cachedLogo;
}

function isEmptyGrid(brightness) {
  return brightness.every((v) => v === 0);
}

export default function QRCodeModal({ isOpen, brightness, onClose }) {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const isMountedRef = useRef(isOpen);

  const [encodedString, setEncodedString] = useState('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);
  const mouseDownOnBackdrop = useRef(false);
  const copiedTimerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      isMountedRef.current = true;
      setIsMounted(true);
      setIsAnimatingOut(false);
      setCopied(false);
    } else if (isMountedRef.current) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        isMountedRef.current = false;
        setIsMounted(false);
        setIsAnimatingOut(false);
      }, FADE_OUT_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const renderQR = useCallback(async () => {
    if (!canvasRef.current || isEmptyGrid(brightness)) return;

    const encoded = encodePattern(brightness);
    setEncodedString(encoded);

    const uri = `${URI_PREFIX}${encoded}`;
    const canvas = canvasRef.current;

    await QRCode.toCanvas(canvas, uri, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300,
      color: { dark: '#000000', light: '#ffffff' },
    });

    const ctx = canvas.getContext('2d');
    const logo = getLogo();
    const drawLogo = () => {
      const logoSize = canvas.width * 0.18;
      const x = (canvas.width - logoSize) / 2;
      const y = (canvas.height - logoSize) / 2;
      const padding = 4;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - padding, y - padding, logoSize + padding * 2, logoSize + padding * 2);
      ctx.drawImage(logo, x, y, logoSize, logoSize);
    };
    if (logo.complete && logo.naturalWidth > 0) {
      drawLogo();
    } else {
      logo.onload = drawLogo;
    }
  }, [brightness]);

  useEffect(() => {
    if (isOpen && isMounted && !isEmptyGrid(brightness)) {
      renderQR();
    }
  }, [isOpen, isMounted, brightness, renderQR]);

  const handleCopy = useCallback(async () => {
    if (!encodedString) return;
    await navigator.clipboard.writeText(encodedString);
    setCopied(true);
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [encodedString]);

  if (!isMounted) return null;

  const empty = isEmptyGrid(brightness);
  const animStyle =
    isOpen && !isAnimatingOut
      ? { opacity: 1, transition: `opacity ${FADE_OUT_DURATION}ms ease` }
      : { opacity: 0, transition: `opacity ${FADE_OUT_DURATION}ms ease` };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        ...animStyle,
      }}
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose();
        mouseDownOnBackdrop.current = false;
      }}
    >
      <div
        style={{
          background: '#1a1a1a',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <button
          data-testid="qr-modal-close"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          X
        </button>

        <h2 style={{ margin: '0 0 16px', fontSize: '1.2rem', color: '#fff' }}>QR Code</h2>

        {empty ? (
          <div
            style={{
              color: '#888',
              textAlign: 'center',
              padding: '40px 20px',
              fontSize: '14px',
            }}
          >
            Nothing to encode — draw a pattern on the grid first.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <canvas ref={canvasRef} data-testid="qr-canvas" style={{ borderRadius: '8px' }} />
            </div>

            <button
              data-testid="copy-button"
              onClick={handleCopy}
              style={{
                width: '100%',
                backgroundColor: copied ? '#2a8b2a' : '#333',
                color: '#fff',
                border: '1px solid ' + (copied ? '#3a9b3a' : '#555'),
                borderRadius: '6px',
                padding: '10px',
                fontSize: '14px',
                cursor: 'pointer',
                marginBottom: '16px',
              }}
            >
              {copied ? 'Copied!' : 'Copy Pattern Code'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

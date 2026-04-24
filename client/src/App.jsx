import { useState, useEffect } from 'react';
import GlyphGrid from './components/GlyphGrid.jsx';
import { TOTAL_CELLS } from './utils/gridConstants.js';
import { decodeInput } from './utils/qrPayload.js';

export default function App() {
  const [grid, setGrid] = useState(() => new Array(TOTAL_CELLS).fill(0));
  const [urlError, setUrlError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pattern = params.get('pattern');
    if (!pattern) return;

    try {
      const result = decodeInput(pattern);
      setGrid([...result.brightness]);
    } catch {
      setUrlError('The pattern data in the URL is invalid or corrupted.');
    }
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: '#111',
        color: '#fff',
        padding: '24px 16px',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Toyph Glyph Generator</h1>
      <p style={{ color: '#888', marginBottom: '24px' }}>
        Toyph for Nothing Phone 4a Pro — 13×13 LED Matrix Designer
      </p>
      {urlError && (
        <div
          data-testid="url-error"
          style={{
            color: '#ff6b6b',
            backgroundColor: '#331111',
            border: '1px solid #552222',
            borderRadius: '6px',
            padding: '8px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            maxWidth: '400px',
            textAlign: 'center',
          }}
        >
          Failed to load pattern from URL: {urlError}
        </div>
      )}
      <GlyphGrid grid={grid} onGridChange={setGrid} />
    </div>
  );
}

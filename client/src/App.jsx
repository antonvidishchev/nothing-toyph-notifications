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
        Created for Nothing Phone 4a Pro — 13×13 LED Matrix Designer
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
      <p
        style={{
          maxWidth: '540px',
          marginTop: '32px',
          color: '#aaa',
          fontSize: '13px',
          lineHeight: '1.8',
          textAlign: 'center',
        }}
      >
        An app for designing and sharing Toyph glyph patterns ffor Nothing Phone (4a) Pro. Download
        JSON and use it in{' '}
        <a
          href="https://github.com/antonvidishchev/toyph"
          style={{
            color: '#4da6ff',
            textDecoration: 'none',
            borderBottom: '1px solid #4da6ff',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={(e) => (e.target.style.color = '#66b3ff')}
          onMouseLeave={(e) => (e.target.style.color = '#4da6ff')}
        >
          Toyph applicationpplicatio
        </a>{' '}
        to deploy patterns with effects on your phone.
        <br />
        <br />
        Paint manually, convert images with crop/zoom controls, and share patterns.
        <br />
        <br />
        Please let{' '}
        <a
          href="https://nothing.tech/"
          style={{
            color: '#4da6ff',
            textDecoration: 'none',
            borderBottom: '1px solid #4da6ff',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={(e) => (e.target.style.color = '#66b3ff')}
          onMouseLeave={(e) => (e.target.style.color = '#4da6ff')}
        >
          Nothing.tech
        </a>{' '}
        know about this project — they could add QR support to add patterns with just a QR code
        scan!
        <br />
        View the source on{' '}
        <a
          href="https://github.com/antonvidishchev/nothing-toyph-glyph-generator"
          style={{
            color: '#4da6ff',
            textDecoration: 'none',
            borderBottom: '1px solid #4da6ff',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={(e) => (e.target.style.color = '#66b3ff')}
          onMouseLeave={(e) => (e.target.style.color = '#4da6ff')}
        >
          GitHub
        </a>
        .
      </p>
    </div>
  );
}

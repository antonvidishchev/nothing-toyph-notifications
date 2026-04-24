import {
  CIRCULAR_MASK,
  brightnessToColor,
  TOTAL_CELLS,
  GRID_SIZE,
} from '../utils/gridConstants.js';

const CELL_SIZE = 20;
const GAP = 2;

/**
 * GlyphPreview — miniature 13x13 glyph grid for the CropModal live preview.
 *
 * Renders the same circular mask as the main grid:
 *   - 137 active cells shown as filled colored circles using BRIGHTNESS_COLORS
 *   - 32 inactive corner positions shown as transparent (not rendered)
 *
 * @param {Object}       props
 * @param {number[]|null} props.brightness - 169-element brightness array, or null for all-zero
 */
export default function GlyphPreview({ brightness }) {
  // Default to all-zero array if brightness is null, undefined, or wrong length
  const grid =
    brightness && brightness.length === TOTAL_CELLS ? brightness : new Array(TOTAL_CELLS).fill(0);

  const rows = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const cells = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const index = row * GRID_SIZE + col;
      const isActive = CIRCULAR_MASK[index];
      const level = grid[index];
      cells.push(
        <div
          key={index}
          data-testid={`preview-cell-${index}`}
          data-active={String(isActive)}
          data-brightness={String(level)}
          style={{
            width: CELL_SIZE,
            height: CELL_SIZE,
            borderRadius: '50%',
            backgroundColor: isActive ? brightnessToColor(level) : 'transparent',
            flexShrink: 0,
          }}
        />,
      );
    }
    rows.push(
      <div
        key={row}
        style={{
          display: 'flex',
          gap: `${GAP}px`,
        }}
      >
        {cells}
      </div>,
    );
  }

  return (
    <div
      data-testid="glyph-preview"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${GAP}px`,
        padding: '8px',
        backgroundColor: '#111',
        border: '1px solid #333',
        borderRadius: '8px',
        alignItems: 'center',
      }}
    >
      {rows}
    </div>
  );
}

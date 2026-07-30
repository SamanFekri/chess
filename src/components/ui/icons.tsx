/**
 * Inline SVG icons.
 *
 * Drawn rather than taken from an icon font or emoji: emoji render differently
 * on every platform — and as full-colour glyphs on Apple devices — so they
 * cannot be made to match the surrounding text. These inherit `currentColor`
 * and the button's own colour transitions, and add nothing to the bundle beyond
 * their own path data.
 *
 * Geometry follows the familiar Feather shapes so the icons read instantly.
 */

/** Shared attributes: stroked outline, no fill, sized by the `className`. */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

/** Counter-clockwise arrow: undo. */
export function UndoIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

/** Clockwise arrow: redo. */
export function RedoIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

/** Waste bin: remove a piece from the board. */
export function TrashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

/** Two vertical arrows: flip the board / swap sides. */
export function FlipIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <polyline points="17 3 21 7 17 11" />
      <path d="M21 7H8a4 4 0 0 0-4 4" />
      <polyline points="7 21 3 17 7 13" />
      <path d="M3 17h13a4 4 0 0 0 4-4" />
    </svg>
  );
}

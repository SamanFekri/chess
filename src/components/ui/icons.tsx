import { useId } from 'react';

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

/**
 * The app mark: a robot head on a pawn's body.
 *
 * The same geometry as the installed-app icons in `scripts/generate-icons.mjs`,
 * expressed as SVG so the header and the home-screen icon are the one mark. The
 * eyes are masked out rather than filled, so whatever sits behind the mark —
 * here, the gradient tile — shows through them exactly as it does in the PNGs.
 */
export function BrandMark({ className = 'h-5 w-5' }: { className?: string }) {
  // Scoped so a second instance cannot collide with this one's mask.
  const maskId = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <mask id={maskId}>
        <rect width="100" height="100" fill="#000" />
        <g fill="#fff">
          {/* Antenna. */}
          <circle cx="50" cy="6" r="4" />
          <rect x="47.5" y="8" width="5" height="8" rx="1" />
          {/* Head. */}
          <rect x="25" y="14" width="50" height="33" rx="11" />
          {/* Neck, collar, body, base. */}
          <rect x="43" y="46" width="14" height="5" rx="1" />
          <rect x="31" y="50" width="38" height="8" rx="4" />
          <path d="M38 58 H62 L71 79 H29 Z" />
          <rect x="21" y="78" width="58" height="12" rx="5" />
        </g>
        {/* Eyes punched back out. */}
        <circle cx="39" cy="30" r="6" fill="#000" />
        <circle cx="61" cy="30" r="6" fill="#000" />
      </mask>

      <rect width="100" height="100" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

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

/** Two upright bars: halt play. */
export function PauseIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  );
}

/** Filled triangle: resume play. */
export function PlayIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className} fill="currentColor">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

/** Circular arrow: start a fresh game. */
export function NewGameIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
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

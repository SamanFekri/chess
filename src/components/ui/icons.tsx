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
 * The app mark: a pawn whose head is a speech bubble, with the AI spark inside.
 *
 * Drawn as the whole tile, so the header and the installed-app icon are
 * visibly the one mark. The geometry is the same as
 * `scripts/generate-icons.mjs`; change them together. The shadow and rim of the
 * full-size icon are left out: at 32px they are invisible.
 */
export function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  // Scoped so a second instance cannot collide with this one's gradients.
  const id = useId();
  const ref = (name: string) => `url(#${id}-${name})`;

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
        <radialGradient id={`${id}-sheen`} cx="0.15" cy="0" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-spark`} gradientUnits="userSpaceOnUse" x1="39.5" y1="19.5" x2="60.5" y2="40.5">
          <stop offset="0" stopColor="#3b6cf6" />
          <stop offset="1" stopColor="#0fb583" />
        </linearGradient>
      </defs>

      <rect width="100" height="100" rx="22.5" fill={ref('bg')} />
      <rect width="100" height="100" rx="22.5" fill={ref('sheen')} />

      {/* The 100-unit mark at 80% of the tile, centred, nudged up a hair. */}
      <g transform="translate(10 9) scale(0.8)">
        <g fill="#ffffff">
          <path d="M40.25 43.93 A17 17 0 1 0 35.28 38.5 Q33 44 27 47 Q35 47.5 40.25 43.93 Z" />
          <rect x="33" y="52" width="34" height="7" rx="3.5" />
          <path d="M40 59 H60 Q61 71 69 80 H31 Q39 71 40 59 Z" />
          <rect x="23" y="79" width="54" height="12" rx="6" />
        </g>
        <path
          d="M50 19.5 Q51.8 28.2 60.5 30 Q51.8 31.8 50 40.5 Q48.2 31.8 39.5 30 Q48.2 28.2 50 19.5 Z"
          fill={ref('spark')}
        />
      </g>
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

/** Speaker with sound waves: audio is on. */
export function SoundOnIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <polygon points="4 9 8 9 13 5 13 19 8 15 4 15" fill="currentColor" stroke="none" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

/** Speaker with a cross: muted. */
export function SoundOffIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <polygon points="4 9 8 9 13 5 13 19 8 15 4 15" fill="currentColor" stroke="none" />
      <line x1="17" y1="9" x2="22" y2="15" />
      <line x1="22" y1="9" x2="17" y2="15" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * Interface symbols that replace the emoji and dingbats the app used to print.
 * Same 24-unit grid and 2-unit stroke as the icons above, so a lightbulb beside
 * an undo arrow reads as one family.
 * ------------------------------------------------------------------------- */

type IconProps = { className?: string };

/** Lightbulb: ask for a hint. */
export function LightbulbIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
    </svg>
  );
}

/** Pencil: draw on the board, edit a position. */
export function PencilIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

/** Tray with a downward arrow: save a file. */
export function DownloadIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** Flag on a pole: resign. */
export function FlagIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

/** Mortarboard: the coach is teaching. */
export function GraduationCapIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c3 2 9 2 12 0v-5" />
      <line x1="22" y1="10" x2="22" y2="15" />
    </svg>
  );
}

/** Diagonal cross: close or dismiss. */
export function CloseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/** Tick: something went right. */
export function CheckIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Warning triangle: something needs attention. */
export function AlertTriangleIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/** Filled star: an opportunity, or the best move. */
export function StarIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className} fill="currentColor">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/** Right arrow: a pointer in a list of advice. */
export function ArrowRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function ChevronRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function ChevronDownIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Single clockwise loop: play the explanation again. */
export function ReplayIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

/** Stopwatch: thinking time. */
export function ClockIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 14.5 15" />
      <line x1="10" y1="2" x2="14" y2="2" />
    </svg>
  );
}

/** Open book: an opening-theory move. */
export function BookIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

/**
 * Solid pawn silhouette, for the rating chip.
 *
 * Drawn rather than typed: U+265F is an emoji code point, so on Apple devices
 * the bare character renders as a glossy black emoji pawn.
 */
export function PawnIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden focusable="false">
      <circle cx="12" cy="6" r="3.5" />
      <path d="M9.5 10.5h5l-.6 1.5c1.7 1.6 2.6 4.3 2.6 6.5h-9c0-2.2.9-4.9 2.6-6.5z" />
      <rect x="5.5" y="19" width="13" height="2.5" rx="1.25" />
    </svg>
  );
}

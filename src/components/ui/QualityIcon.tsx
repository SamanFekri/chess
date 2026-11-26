import type { MoveQuality } from '../../types';

/**
 * The mark for each move grade, drawn as SVG.
 *
 * These used to be characters (‼ ❗ 📖 ⚠ ✖), and most of those are emoji code
 * points: on Apple devices they render as full-colour pictures that ignore the
 * grade's colour and sit off the text baseline. Drawing them gives one family
 * that takes `currentColor`, and lets the set follow chess annotation — !!, !,
 * ?!, ?, ?? — which players already read without a legend.
 *
 * Every glyph sits on the same 24-unit grid with the stem from y 5 to 14 and the
 * dot at y 19, so a "?" and a "!" side by side line up like typeset text.
 */

/** Exclamation mark centred on `x`. */
function Bang({ x }: { x: number }) {
  return (
    <>
      <path d={`M${x} 5v9`} />
      <circle cx={x} cy={19} r={1.4} fill="currentColor" stroke="none" />
    </>
  );
}

/** Question mark centred on `x`, 7 units wide. */
function Query({ x }: { x: number }) {
  return (
    <>
      <path d={`M${x - 3.5} 8.5a3.5 3.5 0 0 1 7 0c0 2.5-3.5 2.8-3.5 5.5`} />
      <circle cx={x} cy={19} r={1.4} fill="currentColor" stroke="none" />
    </>
  );
}

/**
 * The glyph strokes alone, for embedding inside another SVG — the board badge
 * draws its own coloured disc and puts this on top.
 */
export function QualityGlyph({ quality }: { quality: MoveQuality }) {
  switch (quality) {
    case 'brilliant':
      return (
        <>
          <Bang x={9} />
          <Bang x={15} />
        </>
      );
    case 'great':
      return <Bang x={12} />;
    case 'best':
      return (
        <polygon
          points="12 3.5 14.6 8.8 20.4 9.6 16.2 13.7 17.2 19.5 12 16.8 6.8 19.5 7.8 13.7 3.6 9.6 9.4 8.8"
          fill="currentColor"
        />
      );
    case 'excellent':
    case 'good':
      return <polyline points="19 7 10 16.5 5 11.5" />;
    case 'book':
      return (
        <>
          <path d="M3 6h5.5A3.5 3.5 0 0 1 12 9.5V19a2.5 2.5 0 0 0-2.5-2.5H3z" />
          <path d="M21 6h-5.5A3.5 3.5 0 0 0 12 9.5V19a2.5 2.5 0 0 1 2.5-2.5H21z" />
        </>
      );
    case 'inaccuracy':
      return (
        <>
          <Query x={9} />
          <Bang x={17} />
        </>
      );
    case 'mistake':
      return <Query x={12} />;
    case 'blunder':
      return (
        <>
          <Query x={7.5} />
          <Query x={16.5} />
        </>
      );
  }
}

/** A grade's mark as a standalone icon that inherits the text colour. */
export function QualityIcon({
  quality,
  className = 'h-3.5 w-3.5',
  strokeWidth = 2.5,
}: {
  quality: MoveQuality;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
      focusable="false"
    >
      <QualityGlyph quality={quality} />
    </svg>
  );
}

import { memo, useCallback, useRef, useState } from 'react';
import type { PlayerColor } from '../../types';
import { useGameStore } from '../../store/gameStore';
import { DRAW_COLORS } from './drawColors';

/**
 * The board as a sheet of paper.
 *
 * While draw mode is on this sits over the board and takes every pointer: drag
 * from one square to another to draw an arrow, tap a square to ring it, and
 * repeat either gesture to remove it. Built on pointer events rather than the
 * board library's own arrow drawing, which is bound to the right mouse button
 * and therefore does not exist on a phone — and this app is used on phones.
 *
 * Geometry is derived from the overlay's own bounding box, so it needs to know
 * nothing about how the board underneath is laid out beyond its orientation.
 */

/** Board is always 8×8; the SVG works in a 0–8 coordinate space. */
const FILES = 8;

/** Square name for a point inside the overlay, or null when outside it. */
function squareAt(
  x: number,
  y: number,
  rect: DOMRect,
  orientation: PlayerColor,
): string | null {
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;

  const column = Math.min(FILES - 1, Math.max(0, Math.floor(((x - rect.left) / rect.width) * FILES)));
  const row = Math.min(FILES - 1, Math.max(0, Math.floor(((y - rect.top) / rect.height) * FILES)));

  // Row 0 is rank 8 for White at the bottom, and rank 1 when the board is flipped.
  const file = orientation === 'white' ? column : FILES - 1 - column;
  const rank = orientation === 'white' ? FILES - row : row + 1;
  return `${'abcdefgh'[file]}${rank}`;
}

/** Centre of a square in the SVG's 0–8 space. */
function centreOf(square: string, orientation: PlayerColor): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const column = orientation === 'white' ? file : FILES - 1 - file;
  const row = orientation === 'white' ? FILES - rank : rank - 1;
  return { x: column + 0.5, y: row + 0.5 };
}

/** One arrow, drawn short of the target square's centre so the head sits on it. */
function Arrow({
  from,
  to,
  color,
  orientation,
  opacity = 0.85,
}: {
  from: string;
  to: string;
  color: string;
  orientation: PlayerColor;
  opacity?: number;
}) {
  const start = centreOf(from, orientation);
  const end = centreOf(to, orientation);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;

  const ux = dx / length;
  const uy = dy / length;

  // Pull the shaft back so the arrowhead ends at the square's centre rather
  // than overshooting it, and start it clear of the piece it comes from.
  const headLength = 0.34;
  const tailGap = 0.3;
  const tail = { x: start.x + ux * tailGap, y: start.y + uy * tailGap };
  const neck = { x: end.x - ux * headLength, y: end.y - uy * headLength };
  const half = 0.19;

  return (
    <g opacity={opacity}>
      <line
        x1={tail.x}
        y1={tail.y}
        x2={neck.x}
        y2={neck.y}
        stroke={color}
        strokeWidth={0.17}
        strokeLinecap="round"
      />
      <polygon
        points={[
          `${end.x},${end.y}`,
          `${neck.x - uy * half},${neck.y + ux * half}`,
          `${neck.x + uy * half},${neck.y - ux * half}`,
        ].join(' ')}
        fill={color}
      />
    </g>
  );
}

/** The colour swatches and the eraser, docked under the board. */
function DrawToolbar() {
  const drawColor = useGameStore((state) => state.drawColor);
  const setDrawColor = useGameStore((state) => state.setDrawColor);
  const clearDrawings = useGameStore((state) => state.clearDrawings);
  const drawings = useGameStore((state) => state.drawings);

  const empty = drawings.arrows.length === 0 && drawings.circles.length === 0;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-2 z-30 flex justify-center px-2">
      <div className="flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-950/90 px-2.5 py-1.5 shadow-lg backdrop-blur-sm">
        {DRAW_COLORS.map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            onClick={() => setDrawColor(swatch.id)}
            aria-label={`Draw in ${swatch.name}`}
            aria-pressed={drawColor === swatch.id}
            title={swatch.name}
            className={`h-5 w-5 rounded-full transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              drawColor === swatch.id ? 'scale-125 ring-2 ring-white/80' : 'hover:scale-110'
            }`}
            style={{ backgroundColor: swatch.value }}
          />
        ))}

        <span aria-hidden className="mx-0.5 h-4 w-px bg-slate-700" />

        <button
          type="button"
          onClick={clearDrawings}
          disabled={empty}
          className="rounded-full px-2 py-0.5 text-[0.7rem] font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
        >
          Erase
        </button>
      </div>
    </div>
  );
}

/** Captures drawing gestures and renders what has been drawn. */
export const DrawingLayer = memo(function DrawingLayer() {
  const drawMode = useGameStore((state) => state.drawMode);
  const drawings = useGameStore((state) => state.drawings);
  const drawColor = useGameStore((state) => state.drawColor);
  const orientation = useGameStore((state) => state.boardOrientation);
  const toggleArrow = useGameStore((state) => state.toggleDrawnArrow);
  const toggleCircle = useGameStore((state) => state.toggleDrawnCircle);

  const surfaceRef = useRef<HTMLDivElement>(null);
  /** The square the current gesture started on, while it is in progress. */
  const [origin, setOrigin] = useState<string | null>(null);
  /** Where the pointer is now, for the arrow that follows your finger. */
  const [cursor, setCursor] = useState<string | null>(null);

  const squareFromEvent = useCallback(
    (event: React.PointerEvent) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return squareAt(event.clientX, event.clientY, rect, orientation);
    },
    [orientation],
  );

  if (!drawMode) return null;

  const activeColor = DRAW_COLORS.find((swatch) => swatch.id === drawColor)!.value;

  return (
    <>
      <div
        ref={surfaceRef}
        className="absolute inset-0 z-20 touch-none"
        role="application"
        aria-label="Drawing board — drag between squares to draw an arrow, tap a square to ring it"
        onPointerDown={(event) => {
          // Captured so the gesture keeps reporting even if it leaves the board.
          event.currentTarget.setPointerCapture(event.pointerId);
          const square = squareFromEvent(event);
          setOrigin(square);
          setCursor(square);
        }}
        onPointerMove={(event) => {
          if (!origin) return;
          setCursor(squareFromEvent(event));
        }}
        onPointerUp={(event) => {
          const end = squareFromEvent(event);
          if (origin && end) {
            // A drag that ends where it started is a tap, and a tap rings the
            // square — the same distinction every annotation tool makes.
            if (end === origin) toggleCircle(origin);
            else toggleArrow(origin, end);
          }
          setOrigin(null);
          setCursor(null);
        }}
        onPointerCancel={() => {
          setOrigin(null);
          setCursor(null);
        }}
      >
        <svg viewBox={`0 0 ${FILES} ${FILES}`} className="h-full w-full" aria-hidden>
          {drawings.circles.map((circle) => {
            const centre = centreOf(circle.square, orientation);
            const colour = DRAW_COLORS.find((swatch) => swatch.id === circle.color)!.value;
            return (
              <circle
                key={`c-${circle.square}`}
                cx={centre.x}
                cy={centre.y}
                r={0.42}
                fill="none"
                stroke={colour}
                strokeWidth={0.09}
                opacity={0.9}
              />
            );
          })}

          {drawings.arrows.map((arrow) => (
            <Arrow
              key={`a-${arrow.from}${arrow.to}`}
              from={arrow.from}
              to={arrow.to}
              color={DRAW_COLORS.find((swatch) => swatch.id === arrow.color)!.value}
              orientation={orientation}
            />
          ))}

          {/* The arrow in progress, following the pointer. */}
          {origin && cursor && origin !== cursor && (
            <Arrow from={origin} to={cursor} color={activeColor} orientation={orientation} opacity={0.55} />
          )}
          {origin && cursor === origin && (
            <circle
              cx={centreOf(origin, orientation).x}
              cy={centreOf(origin, orientation).y}
              r={0.42}
              fill="none"
              stroke={activeColor}
              strokeWidth={0.09}
              opacity={0.5}
            />
          )}
        </svg>
      </div>

      <DrawToolbar />
    </>
  );
});

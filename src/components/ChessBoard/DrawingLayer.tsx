import { memo, useCallback, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { BoardArrow } from './BoardArrow';
import { centreOf, FILES, squareAt } from './boardGeometry';
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
 * Nothing here cares whose turn it is, or whether a move is legal, or whether the
 * game has finished. It is a pen and a board.
 */

/** The colour swatches and the eraser, docked under the board. */
function DrawToolbar() {
  const drawColor = useGameStore((state) => state.drawColor);
  const setDrawColor = useGameStore((state) => state.setDrawColor);
  const clearDrawings = useGameStore((state) => state.clearDrawings);
  const drawings = useGameStore((state) => state.drawings);

  const empty = drawings.arrows.length === 0 && drawings.circles.length === 0;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-2 z-30 flex justify-center px-2">
      <div className="flex items-center gap-2 rounded-full border-2 border-slate-600/80 bg-slate-950/98 px-2.5 py-1.5 shadow-[0_10px_30px_-6px_rgba(2,6,23,0.95)] backdrop-blur-md">
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
            <BoardArrow
              key={`a-${arrow.from}${arrow.to}`}
              from={arrow.from}
              to={arrow.to}
              color={DRAW_COLORS.find((swatch) => swatch.id === arrow.color)!.value}
              orientation={orientation}
            />
          ))}

          {/* The arrow in progress, following the pointer. */}
          {origin && cursor && origin !== cursor && (
            <BoardArrow
              from={origin}
              to={cursor}
              color={activeColor}
              orientation={orientation}
              opacity={0.55}
            />
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

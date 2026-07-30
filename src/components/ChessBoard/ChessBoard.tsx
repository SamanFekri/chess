import { memo, useMemo } from 'react';
import type { Square } from 'chess.js';
import { Chessboard, defaultArrowOptions } from 'react-chessboard';
import { useBoardInteraction } from '../../hooks/useBoardInteraction';
import { useGameStore } from '../../store/gameStore';
import { CoachBubble } from '../CoachBubble/CoachBubble';
import { MoveQualityAnnouncement, MoveQualityBadge } from './MoveQualityBadge';

/** Board colours, chosen for contrast against the slate UI in dark mode. */
const LIGHT_SQUARE = '#dfe6ee';
const DARK_SQUARE = '#4e6f8c';

/** Colour of the hint arrow — the same emerald the coach uses for advice. */
const HINT_ARROW_COLOR = 'rgba(16, 185, 129, 0.92)';

/**
 * Hint arrows are drawn thicker and more opaque than the library default, since
 * this arrow is the answer to an explicit question rather than a user annotation.
 */
const ARROW_OPTIONS = {
  ...defaultArrowOptions,
  arrowWidthDenominator: 3.4,
  opacity: 0.95,
};

/**
 * The chessboard.
 *
 * Fills the width its container gives it, so the same component works in a
 * desktop two-column layout and full-bleed on a phone — the container caps the
 * size, not this component. While the player browses earlier moves the board
 * shows that position and stops accepting input, which is what makes the move
 * list safe to click during a game.
 */
export const ChessBoard = memo(function ChessBoard() {
  const fen = useGameStore((state) => state.fen);
  const moves = useGameStore((state) => state.moves);
  const viewingPly = useGameStore((state) => state.viewingPly);
  const orientation = useGameStore((state) => state.boardOrientation);
  const playerColor = useGameStore((state) => state.playerColor);
  const result = useGameStore((state) => state.result);
  const isOpponentThinking = useGameStore((state) => state.isOpponentThinking);
  const hint = useGameStore((state) => state.hint);
  const editMode = useGameStore((state) => state.editMode);
  const editFen = useGameStore((state) => state.editFen);
  const editSquare = useGameStore((state) => state.editSquare);

  const isBrowsing = viewingPly !== null;
  const displayFen = useMemo(() => {
    if (editMode) return editFen;
    if (viewingPly === null) return fen;
    return moves.find((move) => move.ply === viewingPly)?.fenAfter ?? fen;
  }, [editMode, editFen, viewingPly, moves, fen]);

  const turn = displayFen.split(' ')[1] === 'b' ? 'black' : 'white';
  const interactive =
    !editMode &&
    !isBrowsing &&
    result.status === 'in-progress' &&
    !isOpponentThinking &&
    turn === playerColor;

  const { onSquareClick, onPieceDrop, onPieceDrag, squareStyles } =
    useBoardInteraction(interactive);

  /** Arrow pointing out the best move whenever a hint is active. */
  const arrows = useMemo(() => {
    if (!hint || isBrowsing) return [];
    return [
      {
        startSquare: hint.suggestion.uci.slice(0, 2),
        endSquare: hint.suggestion.uci.slice(2, 4),
        color: HINT_ARROW_COLOR,
      },
    ];
  }, [hint, isBrowsing]);

  return (
    <div className="relative w-full" aria-label="Chess board">
      <Chessboard
        options={{
          position: displayFen,
          boardOrientation: orientation,
          // In edit mode a tap places or erases a piece instead of moving one.
          onSquareClick: editMode
            ? ({ square }) => editSquare(square as Square)
            : onSquareClick,
          onPieceDrop,
          onPieceDrag,
          // Highlights only describe the live position.
          squareStyles: isBrowsing || editMode ? {} : squareStyles,
          arrows,
          arrowOptions: ARROW_OPTIONS,
          allowDragging: interactive,
          animationDurationInMs: 180,
          showNotation: true,
          lightSquareStyle: { backgroundColor: LIGHT_SQUARE },
          darkSquareStyle: { backgroundColor: DARK_SQUARE },
          darkSquareNotationStyle: { color: 'rgba(255,255,255,0.62)' },
          lightSquareNotationStyle: { color: 'rgba(15,23,42,0.55)' },
          boardStyle: {
            borderRadius: '0.75rem',
            overflow: 'hidden',
            boxShadow: '0 18px 45px -20px rgba(2, 6, 23, 0.9)',
          },
          // Arrow drawing would fight with tap-to-move on touch screens.
          allowDrawingArrows: false,
        }}
      />

      {/* Verdict badge on the piece that moved, and the cloud in the corner.
          Neither has anything to say about a position being built by hand. */}
      {!editMode && (
        <>
          <MoveQualityBadge />
          <MoveQualityAnnouncement />
          <CoachBubble />
        </>
      )}

      {editMode && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-2">
          <span className="rounded-full bg-slate-950/85 px-3 py-1 text-center text-xs font-medium text-blue-200 ring-1 ring-blue-400/40">
            Edit mode — tap a square to place a piece
          </span>
        </div>
      )}

      {/* Sits at the top so it never collides with the verdict cloud below. */}
      {!editMode && isBrowsing && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-2">
          <span className="rounded-full bg-slate-950/85 px-3 py-1 text-center text-xs font-medium text-amber-200 ring-1 ring-amber-400/40">
            Reviewing an earlier move — board is read-only
          </span>
        </div>
      )}
    </div>
  );
});

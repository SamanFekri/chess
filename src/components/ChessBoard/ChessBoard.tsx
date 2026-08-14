import { memo, useMemo } from 'react';
import type { Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useBoardInteraction } from '../../hooks/useBoardInteraction';
import { useGameStore } from '../../store/gameStore';
import { CoachBubble } from '../CoachBubble/CoachBubble';
import { CoachArrows } from './CoachArrows';
import { DrawingLayer } from './DrawingLayer';
import { ROLE_STYLES } from './explainStyles';
import { MoveQualityAnnouncement, MoveQualityBadge } from './MoveQualityBadge';
import { PromotionChooser } from './PromotionChooser';

/** Board colours, chosen for contrast against the slate UI in dark mode. */
const LIGHT_SQUARE = '#dfe6ee';
const DARK_SQUARE = '#4e6f8c';

/** Colour of the hint arrow — the same emerald the coach uses for advice. */
const HINT_ARROW_COLOR = 'rgba(16, 185, 129, 0.92)';

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
  const isPaused = useGameStore((state) => state.isPaused);
  const editMode = useGameStore((state) => state.editMode);
  const editFen = useGameStore((state) => state.editFen);
  const editSquare = useGameStore((state) => state.editSquare);
  const moveEditPiece = useGameStore((state) => state.moveEditPiece);
  const editPlayerColor = useGameStore((state) => state.editPlayerColor);
  const explanation = useGameStore((state) => state.explanation);
  const explainStep = useGameStore((state) => state.explainStep);

  /**
   * While editing, the board follows the side being set up rather than the
   * orientation of the game underneath, so the position is built from the same
   * point of view it will be played from.
   *
   * Derived rather than written into `boardOrientation`, so cancelling the editor
   * leaves the running game's orientation exactly as it was.
   */
  const displayOrientation = editMode ? editPlayerColor : orientation;

  const isBrowsing = viewingPly !== null;
  const displayFen = useMemo(() => {
    if (editMode) return editFen;
    if (viewingPly === null) return fen;
    return moves.find((move) => move.ply === viewingPly)?.fenAfter ?? fen;
  }, [editMode, editFen, viewingPly, moves, fen]);

  const turn = displayFen.split(' ')[1] === 'b' ? 'black' : 'white';

  // Explain Mode halts the game through `isPaused`, so nothing extra is needed
  // here to keep the pieces still while the coach is talking.
  const interactive =
    !editMode &&
    !isBrowsing &&
    !isPaused &&
    result.status === 'in-progress' &&
    !isOpponentThinking &&
    turn === playerColor;

  const { onSquareClick, onPieceDrop, onPieceDrag, squareStyles, dangerNote } =
    useBoardInteraction(interactive);

  /**
   * The step of the explanation currently being drawn.
   *
   * Guarded on the FEN as well as the index: an explanation is written for one
   * position, and drawing a stale one would point at pieces that have moved.
   */
  const explainNow = useMemo(() => {
    if (!explanation || isBrowsing || editMode) return null;
    if (explanation.fen !== displayFen) return null;
    return explanation.steps[explainStep] ?? null;
  }, [explanation, explainStep, isBrowsing, editMode, displayFen]);

  /**
   * Arrows on the board: the coach's drawings, or the hint arrow.
   *
   * Explain Mode wins when both are live — it already includes the recommended
   * move as its own arrow, and drawing it twice in two greens is just muddier.
   */
  const arrows = useMemo(() => {
    if (explainNow) {
      return explainNow.arrows.map((arrow) => ({
        from: arrow.from,
        to: arrow.to,
        color: ROLE_STYLES[arrow.role].arrow,
      }));
    }

    if (!hint || isBrowsing) return [];
    return [
      {
        from: hint.suggestion.uci.slice(0, 2),
        to: hint.suggestion.uci.slice(2, 4),
        color: HINT_ARROW_COLOR,
      },
    ];
  }, [explainNow, hint, isBrowsing]);

  /** Board highlights, with the explanation's marks layered on top. */
  const highlights = useMemo(() => {
    if (isBrowsing || editMode) return {};
    if (!explainNow) return squareStyles;

    const merged = { ...squareStyles };
    for (const mark of explainNow.marks) {
      const style = ROLE_STYLES[mark.role];
      merged[mark.square] = {
        ...merged[mark.square],
        backgroundColor: style.wash,
        boxShadow: style.ring,
      };
    }
    return merged;
  }, [explainNow, squareStyles, isBrowsing, editMode]);

  return (
    <div className="relative w-full" aria-label="Chess board">
      <Chessboard
        options={{
          position: displayFen,
          boardOrientation: displayOrientation,
          // In edit mode a tap places or erases a piece instead of moving one,
          // and a drag moves a piece anywhere with no legality checks at all.
          onSquareClick: editMode
            ? ({ square }) => editSquare(square as Square)
            : onSquareClick,
          onPieceDrop: editMode
            ? ({ sourceSquare, targetSquare }) => {
                moveEditPiece(sourceSquare as Square, targetSquare as Square | null);
                return true;
              }
            : onPieceDrop,
          onPieceDrag: editMode ? undefined : onPieceDrag,
          // Highlights only describe the live position.
          squareStyles: highlights,
          allowDragging: editMode || interactive,
          // Dragging a piece off the board is how you delete it while editing.
          allowDragOffBoard: editMode,
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
          // Arrow drawing would fight with tap-to-move on touch screens; the
          // arrows on this board are the coach's.
          allowDrawingArrows: false,
        }}
      />

      {/* Verdict badge on the piece that moved, and the cloud in the corner.
          Neither has anything to say about a position being built by hand. */}
      {!editMode && (
        <>
          <MoveQualityBadge />
          <MoveQualityAnnouncement />
          <CoachArrows arrows={arrows} />
          <CoachBubble />
          {/* Above the badges and the cloud: while you are drawing, the board is
              a sheet of paper and everything else is underneath it. */}
          <DrawingLayer />
        </>
      )}

      {/* Held promotions block the board, so the chooser sits above everything. */}
      <PromotionChooser />

      {editMode && (
        <div className={`pointer-events-none absolute inset-x-0 top-3 flex justify-center px-2`}>
          <span className="rounded-full bg-slate-950/85 px-3 py-1 text-center text-xs font-medium text-blue-200 ring-1 ring-blue-400/40">
            Edit mode — tap to place, drag to move, drag off the board to remove
          </span>
        </div>
      )}

      {/* The second kind of danger needs a sentence: a crosshair on the far side
          of the board cannot say "because that is your only defender". Shares the
          top strip with the pills below, which are never up at the same time —
          both require the board to be non-interactive. */}
      {dangerNote && (
        <div className={`pointer-events-none absolute inset-x-0 top-3 flex justify-center px-2`}>
          <span
            className="rounded-full bg-slate-950/85 px-3 py-1 text-center text-xs font-medium text-violet-200 ring-1 ring-violet-400/50"
            aria-live="polite"
          >
            {dangerNote}
          </span>
        </div>
      )}

      {/* Sits at the top so it never collides with the verdict cloud below. */}
      {!editMode && isBrowsing && (
        <div className={`pointer-events-none absolute inset-x-0 top-3 flex justify-center px-2`}>
          <span className="rounded-full bg-slate-950/85 px-3 py-1 text-center text-xs font-medium text-amber-200 ring-1 ring-amber-400/40">
            Reviewing an earlier move — board is read-only
          </span>
        </div>
      )}
    </div>
  );
});

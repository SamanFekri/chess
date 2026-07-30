import { useCallback, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { useGameStore } from '../store/gameStore';

/** Squares highlighted on the board, keyed by square name. */
export type SquareStyles = Record<string, React.CSSProperties>;

const SELECTED_STYLE: React.CSSProperties = {
  boxShadow: 'inset 0 0 0 3px rgba(56, 189, 248, 0.9)',
};

const MOVE_TARGET_STYLE: React.CSSProperties = {
  background:
    'radial-gradient(circle at center, rgba(56, 189, 248, 0.55) 20%, transparent 24%)',
};

const CAPTURE_TARGET_STYLE: React.CSSProperties = {
  background:
    'radial-gradient(circle at center, transparent 54%, rgba(248, 113, 113, 0.55) 56%)',
};

const LAST_MOVE_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(250, 204, 21, 0.22)',
};

const CHECK_STYLE: React.CSSProperties = {
  background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.75) 8%, transparent 72%)',
};

const HINT_STYLE: React.CSSProperties = {
  boxShadow: 'inset 0 0 0 3px rgba(52, 211, 153, 0.95)',
};

/**
 * Board interaction: click-to-move, drag-to-move, promotion, and highlighting.
 *
 * Both input styles are supported deliberately. Dragging is natural with a
 * mouse; tapping a piece and then its destination is far more reliable on a
 * phone, where a drag can be mistaken for a scroll.
 */
export function useBoardInteraction(interactive: boolean) {
  const fen = useGameStore((state) => state.fen);
  const moves = useGameStore((state) => state.moves);
  const hint = useGameStore((state) => state.hint);
  const playerMove = useGameStore((state) => state.playerMove);
  const requestPromotion = useGameStore((state) => state.requestPromotion);

  const [selected, setSelected] = useState<Square | null>(null);

  /** Legal moves from the selected square, in the live position. */
  const legalTargets = useMemo(() => {
    if (!selected) return new Map<string, boolean>();
    const board = new Chess(fen);
    const targets = new Map<string, boolean>();
    for (const move of board.moves({ square: selected, verbose: true })) {
      targets.set(move.to, Boolean(move.captured));
    }
    return targets;
  }, [selected, fen]);

  /**
   * Attempts a move, handing promotions to the chooser first.
   *
   * The move is not played until a piece is picked — under-promotion to a rook
   * or knight is occasionally the only move that wins, and silently queening
   * would take that away.
   */
  const attemptMove = useCallback(
    (from: string, to: string): boolean => {
      const board = new Chess(fen);
      const candidate = board
        .moves({ square: from as Square, verbose: true })
        .find((move) => move.to === to);
      if (!candidate) return false;

      if (candidate.isPromotion()) {
        requestPromotion(from as Square, to as Square);
        // Reported as handled so the board does not snap the piece back; the
        // chooser plays the move once a piece is picked.
        return true;
      }

      return playerMove(from, to);
    },
    [fen, playerMove, requestPromotion],
  );

  const onSquareClick = useCallback(
    ({ square }: { square: string }) => {
      if (!interactive) return;

      if (selected && square !== selected) {
        if (attemptMove(selected, square)) {
          setSelected(null);
          return;
        }
      }

      const board = new Chess(fen);
      const piece = board.get(square as Square);
      // Selecting only own pieces avoids a dead "selected" state on empty squares.
      setSelected(piece && piece.color === board.turn() ? (square as Square) : null);
    },
    [interactive, selected, attemptMove, fen],
  );

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      setSelected(null);
      if (!interactive || !targetSquare) return false;
      return attemptMove(sourceSquare, targetSquare);
    },
    [interactive, attemptMove],
  );

  const onPieceDrag = useCallback(
    ({ square }: { square: string | null }) => {
      if (interactive && square) setSelected(square as Square);
    },
    [interactive],
  );

  /** Highlights: last move, check, selection, legal targets and any hint. */
  const squareStyles = useMemo<SquareStyles>(() => {
    const styles: SquareStyles = {};
    const board = new Chess(fen);

    const lastMove = moves[moves.length - 1];
    if (lastMove) {
      styles[lastMove.uci.slice(0, 2)] = { ...LAST_MOVE_STYLE };
      styles[lastMove.uci.slice(2, 4)] = { ...LAST_MOVE_STYLE };
    }

    if (board.inCheck()) {
      const king = board.findPiece({ type: 'k', color: board.turn() })[0];
      if (king) styles[king] = { ...styles[king], ...CHECK_STYLE };
    }

    if (hint) {
      const from = hint.suggestion.uci.slice(0, 2);
      const to = hint.suggestion.uci.slice(2, 4);
      styles[from] = { ...styles[from], ...HINT_STYLE };
      styles[to] = { ...styles[to], ...HINT_STYLE };
    }

    if (selected) {
      styles[selected] = { ...styles[selected], ...SELECTED_STYLE };
      for (const [target, isCapture] of legalTargets) {
        styles[target] = {
          ...styles[target],
          ...(isCapture ? CAPTURE_TARGET_STYLE : MOVE_TARGET_STYLE),
        };
      }
    }

    return styles;
  }, [fen, moves, hint, selected, legalTargets]);

  return { onSquareClick, onPieceDrop, onPieceDrag, squareStyles, clearSelection: () => setSelected(null) };
}

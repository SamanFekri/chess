import { memo } from 'react';
import { useGameStore } from '../../store/gameStore';
import { modifierKeyLabel } from '../../utils/platform';
import { Button } from '../ui/Button';
import { FlipIcon, RedoIcon, UndoIcon } from '../ui/icons';

/**
 * The three controls used mid-game, docked directly beneath the board.
 *
 * Undo, Hint and Flip live here rather than in the settings panel because they
 * are reached constantly while playing — on a phone this row sits in the thumb
 * zone right under the board, instead of below the move list where it would need
 * a scroll. Anything you only touch between games stays in the Game panel.
 */
export const QuickActions = memo(function QuickActions() {
  const newGame = useGameStore((state) => state.newGame);
  const sanHistory = useGameStore((state) => state.sanHistory);
  const undoMove = useGameStore((state) => state.undoMove);
  const redoMove = useGameStore((state) => state.redoMove);
  const redoCount = useGameStore((state) => state.redoStack.length);
  const flipBoard = useGameStore((state) => state.flipBoard);
  const requestHint = useGameStore((state) => state.requestHint);
  const dismissHint = useGameStore((state) => state.dismissHint);
  const hint = useGameStore((state) => state.hint);
  const isHintLoading = useGameStore((state) => state.isHintLoading);
  const moves = useGameStore((state) => state.moves);
  const result = useGameStore((state) => state.result);
  const isOpponentThinking = useGameStore((state) => state.isOpponentThinking);
  const fen = useGameStore((state) => state.fen);
  const playerColor = useGameStore((state) => state.playerColor);
  const coachEnabled = useGameStore((state) => state.coachEnabled);

  const isPlayerTurn =
    result.status === 'in-progress' &&
    (fen.split(' ')[1] === 'b' ? 'black' : 'white') === playerColor;

  const hasMoves = sanHistory.length > 0;

  return (
    <div className="space-y-2">
      <div
        className={`grid gap-2 ${coachEnabled ? 'grid-cols-4' : 'grid-cols-3'}`}
        role="group"
        aria-label="Quick actions"
      >
        <Button
          variant="secondary"
          onClick={() => void undoMove()}
          disabled={moves.length === 0 || isOpponentThinking}
          title={`Take back your last move (${modifierKeyLabel()}+Z). Press repeatedly to go further back.`}
          className="min-h-12"
        >
          <UndoIcon /> Undo
        </Button>

        <Button
          variant="secondary"
          onClick={() => void redoMove()}
          disabled={redoCount === 0 || isOpponentThinking}
          title={`Replay a taken-back move (${modifierKeyLabel()}+Shift+Z)`}
          className="min-h-12"
        >
          <RedoIcon /> Redo
          {redoCount > 0 && (
            <span className="text-xs font-normal text-slate-400">{redoCount}</span>
          )}
        </Button>

        {/* A hint is coaching, so it goes away with the coach. The button toggles:
            press once to reveal the arrow and explanation, again to hide them. */}
        {coachEnabled && (
          <Button
            variant={hint ? 'ghost' : 'success'}
            onClick={() => (hint ? dismissHint() : void requestHint())}
            disabled={!isPlayerTurn || isHintLoading}
            aria-pressed={hint !== null}
            className="min-h-12"
          >
            <span aria-hidden>💡</span>{' '}
            {isHintLoading ? 'Thinking…' : hint ? 'Hide hint' : 'Hint'}
          </Button>
        )}

        {/* Flipping swaps sides — see `flipBoard` in the store. */}
        <Button
          variant="secondary"
          onClick={() => void flipBoard()}
          disabled={isOpponentThinking}
          title="Swap sides — you play the colour at the bottom of the board"
          className="min-h-12"
        >
          <FlipIcon /> Flip
        </Button>
      </div>

      {/* Reads "Start game" on an untouched board and "New game" once there is a
          game to replace, so the label never offers to restart what has not begun. */}
      <Button variant="primary" onClick={() => void newGame()} className="min-h-12 w-full">
        <span aria-hidden>{hasMoves ? '↻' : '▶'}</span> {hasMoves ? 'New game' : 'Start game'}
      </Button>
    </div>
  );
});

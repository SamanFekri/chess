import { memo } from 'react';
import { useGameStore } from '../../store/gameStore';
import { modifierKeyLabel } from '../../utils/platform';
import { Button } from '../ui/Button';
import {
  FlipIcon,
  NewGameIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  UndoIcon,
} from '../ui/icons';

/**
 * The controls used constantly while playing, docked directly beneath the board.
 *
 * Two rows, split by what they act on. The top row is the board — Undo, Redo,
 * Hint and Explain — and the bottom row is the game: New game, Flip and Pause.
 * They live here rather than in the settings panel because they are reached on
 * almost every move; on a phone this sits in the thumb zone right under the
 * board, instead of below the move list where it would need a scroll. Anything
 * you only touch between games stays in the Game panel.
 */
export const QuickActions = memo(function QuickActions() {
  const requestNewGame = useGameStore((state) => state.requestNewGame);
  const isPaused = useGameStore((state) => state.isPaused);
  const setPaused = useGameStore((state) => state.setPaused);
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
  const drawMode = useGameStore((state) => state.drawMode);
  const setDrawMode = useGameStore((state) => state.setDrawMode);

  const isPlayerTurn =
    result.status === 'in-progress' &&
    (fen.split(' ')[1] === 'b' ? 'black' : 'white') === playerColor;

  const inProgress = result.status === 'in-progress';

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

        {/* Top row with Undo, Redo and Hint because it is a board action, not a
            game one — and because this is the row people look at. Highlighted
            rather than grey so it does not disappear into the pair beside it. */}
        <Button
          variant={drawMode ? 'success' : 'primary'}
          onClick={() => setDrawMode(!drawMode)}
          aria-pressed={drawMode}
          title={
            drawMode
              ? 'Put the pen down and play on — your drawings are cleared'
              : 'Stop the game and draw on the board: drag between squares for an arrow, tap a square to ring it'
          }
          className="min-h-12"
        >
          <span aria-hidden>✏️</span> {drawMode ? 'Done' : 'Explain'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={() => void requestNewGame()} className="min-h-12">
          <NewGameIcon /> New game
        </Button>

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

        {/* A toggle, not a one-shot: flipping the board pauses the game, and this
            button has to show that it is already down when it does. */}
        <Button
          variant={isPaused ? 'success' : 'secondary'}
          onClick={() => void setPaused(!isPaused)}
          aria-pressed={isPaused}
          disabled={!inProgress}
          title={
            isPaused ? 'Resume play' : 'Pause the game — neither side moves until you resume'
          }
          className="min-h-12"
        >
          {isPaused ? (
            <>
              <PlayIcon /> Resume
            </>
          ) : (
            <>
              <PauseIcon /> Pause
            </>
          )}
        </Button>
      </div>
    </div>
  );
});

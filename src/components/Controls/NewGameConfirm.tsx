import { memo } from 'react';
import { useGameStore } from '../../store/gameStore';
import { ConfirmDialog } from '../ui/ConfirmDialog';

/**
 * Guards "New game" against throwing away a game in progress.
 *
 * Rendered once at the app root rather than beside each button, because three
 * places can start a game — the button under the board, the colour picker, and
 * the review — and they should all get the same prompt.
 *
 * The decision about *whether* to ask lives in the store's `requestNewGame`, so
 * every caller inherits it: no prompt until you have actually played a move, and
 * none once the game is over.
 */
export const NewGameConfirm = memo(function NewGameConfirm() {
  const pending = useGameStore((state) => state.pendingNewGame);
  const confirmNewGame = useGameStore((state) => state.confirmNewGame);
  const cancelNewGame = useGameStore((state) => state.cancelNewGame);
  const moves = useGameStore((state) => state.moves);
  const playerColor = useGameStore((state) => state.playerColor);

  const yourMoves = moves.filter(
    (move) => move.color === (playerColor === 'white' ? 'w' : 'b'),
  ).length;

  // A colour change is also a new game, and worth naming so the prompt matches
  // the button that was actually pressed.
  const switchingTo = pending?.playerColor;

  return (
    <ConfirmDialog
      open={pending !== null}
      title={switchingTo ? `Start a new game as ${switchingTo}?` : 'Start a new game?'}
      message={
        <>
          Your current game will be lost — {yourMoves} move{yourMoves === 1 ? '' : 's'} played.
          This cannot be undone.
        </>
      }
      confirmLabel="New game"
      cancelLabel="Keep playing"
      onConfirm={() => void confirmNewGame()}
      onCancel={cancelNewGame}
    />
  );
});

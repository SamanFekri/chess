import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * How often the running clock banks its progress into the store.
 *
 * Not the display refresh — the readout ticks on its own. This only has to be
 * frequent enough that a crash or a closed tab loses very little, and rare
 * enough not to churn the store.
 */
const SYNC_INTERVAL_MS = 5000;

/**
 * Runs the game clock.
 *
 * The clock measures time spent thinking about the position, so it stops for
 * everything that means the player is not doing that: a pause, the position
 * editor, Explain Mode, a finished game, and — the one that actually catches
 * people out — a tab switched away from or a phone put to sleep. `visibilitychange` fires the
 * moment the page is hidden, which banks the time up to that instant; nothing
 * accrues until it comes back.
 *
 * Kept as a hook rather than a timer inside the store because "is the page
 * visible" is a browser fact, and the store deliberately has no DOM access.
 */
export function useGameClock() {
  const syncClock = useGameStore((state) => state.syncClock);
  const status = useGameStore((state) => state.result.status);
  const isPaused = useGameStore((state) => state.isPaused);
  const editMode = useGameStore((state) => state.editMode);
  // Explain Mode takes the board away, so it stops the clock for the same reason
  // pausing does: you cannot be on the move if you cannot move.
  const explainMode = useGameStore((state) => state.explainMode);
  // Move count rather than the FEN: this exists to re-sync exactly when the turn
  // changes, so each side is billed for its own time and not its opponent's.
  const plies = useGameStore((state) => state.sanHistory.length);

  const [onScreen, setOnScreen] = useState(() => !document.hidden && document.hasFocus());

  useEffect(() => {
    // Focus as well as visibility: a tab you can technically still see behind
    // another window is not a tab you are playing chess in.
    const update = () => setOnScreen(!document.hidden && document.hasFocus());
    // `pagehide` covers what `visibilitychange` misses on mobile Safari, where a
    // page can be frozen on navigation without ever reporting itself hidden.
    const hide = () => setOnScreen(false);

    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    window.addEventListener('pagehide', hide);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      window.removeEventListener('pagehide', hide);
    };
  }, []);

  const running = status === 'in-progress' && !isPaused && !editMode && !explainMode && onScreen;

  useEffect(() => {
    // Banks the previous segment and starts one for whoever is to move now. Also
    // the reason `plies` is a dependency: this is the turn-change flush.
    syncClock(running);
    if (!running) return;

    const id = setInterval(() => syncClock(true), SYNC_INTERVAL_MS);
    return () => {
      clearInterval(id);
      // Bank on the way out, so a pause or a hidden tab keeps the seconds it
      // earned rather than discarding the part-finished segment.
      syncClock(false);
    };
  }, [running, plies, syncClock]);
}

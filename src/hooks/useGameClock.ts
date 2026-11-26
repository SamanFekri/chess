import { useEffect, useState } from 'react';
import { remainingMs, useGameStore } from '../store/gameStore';

/**
 * How often the running clock banks its progress into the store.
 *
 * Not the display refresh — the readout ticks on its own. This only has to be
 * frequent enough that a crash or a closed tab loses very little, and rare
 * enough not to churn the store.
 */
const SYNC_INTERVAL_MS = 5000;

/**
 * Whether the clock should be ticking.
 *
 * Extracted and exported because this rule is easy to break from a distance —
 * it once picked up the coach's display switch during a rename and froze the
 * clock for anyone who turned the coach's arrows on. As a pure function it can
 * be checked directly.
 *
 * Drawing is not listed: it halts the game through `isPaused`, which is the one
 * authority on whether play is stopped.
 */
export function shouldClockRun(state: {
  status: string;
  isPaused: boolean;
  editMode: boolean;
  onScreen: boolean;
  /**
   * True while a count-down game is waiting for White's first move. As on most
   * chess servers, nobody's time runs until the game has actually begun, so
   * settling in at the board does not cost White seconds.
   */
  awaitingFirstMove?: boolean;
}): boolean {
  return (
    state.status === 'in-progress' &&
    !state.isPaused &&
    !state.editMode &&
    state.onScreen &&
    !state.awaitingFirstMove
  );
}

/**
 * Runs the game clock.
 *
 * The clock measures time spent thinking about the position, so it stops for
 * everything that means the player is not doing that: a pause (which is also
 * what drawing on the board uses), the position editor, a finished game, and —
 * the one that actually catches people out — a tab switched away from or a phone
 * put to sleep. `visibilitychange` fires the
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

  const timeControl = useGameStore((state) => state.timeControl);
  const checkFlag = useGameStore((state) => state.checkFlag);
  // Re-read so the flag timer is rescheduled whenever time is banked or credited.
  const since = useGameStore((state) => state.clock.since);
  const bonus = useGameStore((state) => state.clockBonus);

  const running = shouldClockRun({
    status,
    isPaused,
    editMode,
    onScreen,
    awaitingFirstMove: timeControl !== null && plies === 0,
  });

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

  /**
   * The flag: one timer set for the instant the running side reaches zero.
   *
   * Rescheduled on every turn change and every bank, so it always measures from
   * the latest numbers; `checkFlag` re-verifies before ending anything.
   */
  useEffect(() => {
    if (!running || !timeControl || since === null) return;
    const { clock, clockBonus } = useGameStore.getState();
    const side = clock.side;
    if (!side) return;
    const left = remainingMs(clock, clockBonus, timeControl, side);
    const id = setTimeout(checkFlag, left + 15);
    return () => clearTimeout(id);
  }, [running, timeControl, since, bonus, plies, checkFlag]);
}

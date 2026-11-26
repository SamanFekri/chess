import { memo, useEffect, useMemo, useState } from 'react';
import { Chess, type Color } from 'chess.js';
import { remainingMs, usedMs, useGameStore } from '../../store/gameStore';
import { materialPointDiff } from '../../utils/chess';
import { describeDuration, formatCountdown, formatDuration } from '../../utils/time';
import { ClockIcon } from '../ui/icons';

/** Below this, a count-down clock turns red. */
const LOW_TIME_MS = 20_000;

/**
 * One player's bar in a friend game: colour, material and clock.
 *
 * Two of these frame the board — the side at the top above it, the side at the
 * bottom below — so each player reads their own clock on their own edge, the
 * way a physical chess clock sits between two players. The side to move is lit;
 * the other is dimmed.
 *
 * Counts down under a time control and counts up otherwise.
 */
export const PlayerStrip = memo(function PlayerStrip({ color }: { color: Color }) {
  const fen = useGameStore((state) => state.fen);
  const result = useGameStore((state) => state.result);
  const clock = useGameStore((state) => state.clock);
  const bonus = useGameStore((state) => state.clockBonus);
  const timeControl = useGameStore((state) => state.timeControl);
  const isPaused = useGameStore((state) => state.isPaused);
  const plies = useGameStore((state) => state.sanHistory.length);

  const running = clock.since !== null && clock.side === color;
  const [, forceTick] = useState(0);

  // Only the running clock redraws, and faster under a time control, where the
  // tenths in the last ten seconds have to move smoothly.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => forceTick((n) => n + 1), timeControl ? 100 : 500);
    return () => clearInterval(id);
  }, [running, timeControl]);

  const points = useMemo(() => materialPointDiff(new Chess(fen), color), [fen, color]);

  const name = color === 'w' ? 'White' : 'Black';
  const inProgress = result.status === 'in-progress';
  const toMove = inProgress && fen.split(' ')[1] === color;
  const won = !inProgress && result.winner === color;
  const lost = !inProgress && result.winner !== null && result.winner !== color;
  const drawn = !inProgress && result.winner === null;

  const left = timeControl ? remainingMs(clock, bonus, timeControl, color) : null;
  const low = left !== null && left < LOW_TIME_MS;
  const readout = left !== null ? formatCountdown(left) : formatDuration(usedMs(clock, color));
  const flagged = left === 0 && result.status === 'timeout' && lost;

  const status = won
    ? 'Winner'
    : drawn
      ? 'Draw'
      : flagged
        ? 'Out of time'
        : lost
          ? null
          : toMove && isPaused
            ? 'Paused'
            : toMove
              ? timeControl && plies === 0
                ? 'Moves first'
                : 'To move'
              : null;

  return (
    <div
      // No card: a single slim line, so the board keeps the room. The lit
      // clock pill is what says whose turn it is.
      className={`flex h-7 items-center justify-between gap-2 px-1 transition-opacity duration-200 ${
        !toMove && inProgress ? 'opacity-60' : ''
      }`}
      aria-label={`${name}${status ? `, ${status}` : ''}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ${
            color === 'w' ? 'bg-slate-100 ring-white/50' : 'bg-slate-900 ring-white/30'
          }`}
        />
        <span className="text-xs font-bold text-slate-100">{name}</span>
        {points > 0 && (
          <span
            className="text-xs font-semibold tabular-nums text-emerald-300"
            title={`${name} is ${points} point${points === 1 ? '' : 's'} of material ahead`}
          >
            +{points}
          </span>
        )}
        {status && (
          <span
            className={`truncate text-[0.7rem] font-semibold ${
              won
                ? 'text-emerald-300'
                : flagged
                  ? 'text-red-300'
                  : isPaused && toMove
                    ? 'text-amber-200'
                    : toMove
                      ? 'text-emerald-300'
                      : 'text-slate-300'
            }`}
            aria-live="polite"
          >
            {status}
          </span>
        )}
      </div>

      {/* The clock face: its own pane, so it reads as the thing to watch. */}
      <span
        className={`flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 font-mono text-[0.85rem] font-bold tabular-nums leading-none ${
          low && inProgress
            ? 'bg-red-500/90 text-white'
            : running
              ? 'bg-white text-slate-950'
              : 'bg-white/[0.07] text-slate-300'
        }`}
        title={
          timeControl
            ? `${name} has ${describeDuration(left ?? 0)} left`
            : `${name} has used ${describeDuration(usedMs(clock, color))}`
        }
        role="timer"
        aria-label={
          timeControl
            ? `${name}: ${describeDuration(left ?? 0)} left`
            : `${name}: ${describeDuration(usedMs(clock, color))} used`
        }
      >
        {!timeControl && <ClockIcon className="h-3 w-3 opacity-60" />}
        {readout}
      </span>
    </div>
  );
});

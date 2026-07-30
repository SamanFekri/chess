import { memo, useMemo } from 'react';
import { Chess } from 'chess.js';
import { useGameStore } from '../../store/gameStore';
import { materialPointDiff } from '../../utils/chess';
import { describeRating, PROVISIONAL_GAMES } from '../../store/rating';
import type { EngineStatus } from '../../types';
import { Switch } from '../ui/Switch';

/**
 * Dot colour and label for each engine state.
 *
 * Labels are kept to one short word so they fit beside the dot at small text
 * sizes; `description` carries the full wording for screen readers.
 */
const STATUS_META: Record<EngineStatus, { dot: string; label: string; description: string }> = {
  idle: { dot: 'bg-slate-500', label: 'Starting', description: 'Engine starting' },
  loading: {
    dot: 'bg-amber-400 animate-pulse',
    label: 'Loading',
    description: 'Loading the chess engine',
  },
  ready: { dot: 'bg-emerald-400', label: 'Ready', description: 'Engine ready' },
  thinking: { dot: 'bg-blue-400 animate-pulse', label: 'Thinking', description: 'Engine thinking' },
  error: { dot: 'bg-red-500', label: 'Error', description: 'Engine error' },
};

/**
 * The player's estimated Elo, read from the persisted rating record.
 *
 * Shown next to the app identity because it is a fact about the player rather
 * than about the current position.
 */
function RatingChip() {
  const rating = useGameStore((state) => state.rating);
  const provisional = rating.gamesPlayed < PROVISIONAL_GAMES;

  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full bg-slate-900/70 px-2 py-1 text-[0.7rem] ring-1 ring-slate-800 sm:gap-1.5 sm:px-2.5 sm:text-xs"
      title={describeRating(rating)}
    >
      <span aria-hidden className="text-slate-500">
        ♟
      </span>
      <span className="font-semibold text-slate-200" aria-label="Your estimated rating">
        {rating.gamesPlayed === 0 ? 'Unrated' : rating.elo}
      </span>
      {rating.gamesPlayed > 0 && provisional && (
        <span className="text-[0.65rem] font-medium text-amber-300/80">?</span>
      )}
      {rating.lastChange !== null && rating.gamesPlayed > 0 && (
        <span
          className={`text-[0.65rem] font-semibold tabular-nums ${
            rating.lastChange > 0
              ? 'text-emerald-400'
              : rating.lastChange < 0
                ? 'text-red-400'
                : 'text-slate-500'
          }`}
        >
          {rating.lastChange > 0 ? '+' : ''}
          {rating.lastChange}
        </span>
      )}
    </span>
  );
}

/** The coach on/off switch — turns the app into a plain chess game. */
function CoachSwitch() {
  const coachEnabled = useGameStore((state) => state.coachEnabled);
  const setCoachEnabled = useGameStore((state) => state.setCoachEnabled);

  return (
    <Switch
      checked={coachEnabled}
      onChange={(enabled) => void setCoachEnabled(enabled)}
      label="Coach"
      description="Turn off for a plain game with no coaching, hints or evaluation"
      labelClassName="text-[0.7rem] sm:text-sm"
    />
  );
}

/** Engine state, search depth and speed — the telemetry strip. */
function EngineStatusChip() {
  const status = useGameStore((state) => state.engineStatus);
  const analysis = useGameStore((state) => state.analysis);
  const coachEnabled = useGameStore((state) => state.coachEnabled);
  const meta = STATUS_META[status];

  return (
    <div
      className="flex items-center gap-2 rounded-full bg-slate-900/70 px-2.5 py-1.5 ring-1 ring-slate-800 sm:px-3"
      aria-label={meta.description}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
      <span className="text-[0.7rem] font-medium text-slate-300 sm:text-xs">{meta.label}</span>
      {/* Search telemetry is coaching detail — hidden in plain-game mode. */}
      {coachEnabled && analysis && analysis.depth > 0 && (
        <span className="hidden font-mono text-xs text-slate-500 sm:inline" aria-label="Search depth">
          d{analysis.depth}
          {analysis.nps ? ` · ${Math.round(analysis.nps / 1000)}kn/s` : ''}
        </span>
      )}
    </div>
  );
}

/**
 * Whose turn it is and which colour you are, in a slim bar above the board.
 *
 * Deliberately not in the header: on a phone the header cannot fit this and stay
 * on one line, and directly above the board is where you are already looking.
 */
export function TurnBar() {
  const fen = useGameStore((state) => state.fen);
  const result = useGameStore((state) => state.result);
  const playerColor = useGameStore((state) => state.playerColor);
  const isPaused = useGameStore((state) => state.isPaused);
  const setPaused = useGameStore((state) => state.setPaused);

  /**
   * Material difference in conventional points, from your side.
   *
   * Counted off the board rather than from a capture history, so it is still
   * right for a game imported from a FEN.
   */
  const points = useMemo(
    () => materialPointDiff(new Chess(fen), playerColor === 'white' ? 'w' : 'b'),
    [fen, playerColor],
  );

  const material =
    points === 0 ? (
      <span className="shrink-0 text-slate-500">Material even</span>
    ) : (
      <span
        className={`shrink-0 font-semibold tabular-nums ${
          points > 0 ? 'text-emerald-300' : 'text-red-300'
        }`}
        title={
          points > 0
            ? `You are ${points} point${points === 1 ? '' : 's'} of material ahead`
            : `You are ${-points} point${points === -1 ? '' : 's'} of material behind`
        }
      >
        {points > 0 ? `+${points}` : points}
      </span>
    );

  /** Which colour you are — the one at the bottom of the board after a flip. */
  const youAre = (
    <span className="flex shrink-0 items-center gap-1 text-slate-400">
      <span aria-hidden className="text-base leading-none">
        {playerColor === 'white' ? '♔' : '♚'}
      </span>
      <span className="hidden sm:inline">You play </span>
      {playerColor}
    </span>
  );

  if (result.status !== 'in-progress') {
    const won = result.winner === (playerColor === 'white' ? 'w' : 'b');
    const tone =
      result.winner === null
        ? 'text-slate-300'
        : won
          ? 'text-emerald-300'
          : 'text-red-300';

    return (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-900/60 px-3 py-2 text-xs font-semibold ring-1 ring-slate-800">
        <span className={tone}>{result.reason}</span>
        <span className="flex items-center gap-3">
          {material}
          {youAre}
        </span>
      </div>
    );
  }

  const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const isPlayer = turn === playerColor;

  // Paused is the loudest thing the bar can say: nothing moves until it is
  // cleared, so the way out has to be right there.
  if (isPaused) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold ring-1 ring-amber-400/40">
        <span className="flex items-center gap-2 text-amber-200" aria-live="polite">
          <span aria-hidden>⏸</span>
          Paused — {isPlayer ? 'your move' : "opponent's move"} when you resume
        </span>
        <button
          type="button"
          onClick={() => void setPaused(false)}
          className="shrink-0 rounded-lg bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        >
          ▶ Resume
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-900/60 px-3 py-2 text-xs font-semibold ring-1 ring-slate-800">
      <button
        type="button"
        onClick={() => void setPaused(true)}
        title="Pause the game"
        className="flex items-center gap-2 rounded-lg text-slate-200 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
        aria-live="polite"
      >
        <span aria-hidden className={turn === 'white' ? 'text-slate-100' : 'text-slate-500'}>
          ●
        </span>
        {isPlayer ? 'Your move' : "Opponent's move"}
        <span aria-hidden className="text-slate-600">
          ⏸
        </span>
      </button>
      <span className="flex items-center gap-3">
        {material}
        {youAre}
      </span>
    </div>
  );
}

/** App header: identity and rating on the left, live status on the right. */
export const Header = memo(function Header() {
  const engineError = useGameStore((state) => state.engineError);

  return (
    <header className="border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
      {/* `flex-nowrap` with a `min-w-0` truncating title is what keeps this on a
          single line down to the narrowest phones. */}
      <div className="mx-auto flex max-w-[100rem] flex-nowrap items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-base text-slate-950 sm:h-9 sm:w-9 sm:text-lg"
          >
            ♞
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight text-slate-100 sm:text-base">
              AI Chess Coach
            </h1>
            <p className="hidden text-xs text-slate-500 lg:block">
              Play Stockfish. Learn from every move.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <RatingChip />
          <EngineStatusChip />
          <CoachSwitch />
        </div>
      </div>

      {engineError && (
        <p
          role="alert"
          className="border-t border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200 sm:px-6"
        >
          {engineError} Try reloading the page — the engine needs WebAssembly support.
        </p>
      )}
    </header>
  );
});

import { memo, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useGameStore } from '../../store/gameStore';
import { materialPointDiff } from '../../utils/chess';
import { describeDuration, formatDuration } from '../../utils/time';
import { GLYPH_TINT, PIECE_GLYPH } from '../../utils/pieceGlyphs';
import type { EngineStatus } from '../../types';
import {
  BrandMark,
  ClockIcon,
  MenuIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SoundOffIcon,
  SoundOnIcon,
} from '../ui/icons';

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
 * Mute toggle.
 *
 * An icon button rather than a labelled switch: the header has to stay on one
 * line on a phone, and a speaker with a line through it needs no caption.
 */
function SoundToggle() {
  const soundEnabled = useGameStore((state) => state.soundEnabled);
  const setSoundEnabled = useGameStore((state) => state.setSoundEnabled);

  return (
    <button
      type="button"
      onClick={() => setSoundEnabled(!soundEnabled)}
      aria-pressed={soundEnabled}
      aria-label={soundEnabled ? 'Mute sound effects' : 'Turn sound effects on'}
      title={
        soundEnabled
          ? 'Sound is on — moves, captures, promotions and the result'
          : 'Sound is off'
      }
      className={`glass-control grid h-10 w-10 shrink-0 place-items-center rounded-full transition-[color,transform] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 active:scale-[0.94] ${
        soundEnabled ? 'text-slate-200 hover:text-white' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}
    </button>
  );
}

/**
 * Time spent on the move by each side, yours first.
 *
 * Ticks locally rather than from the store: the store banks the elapsed time
 * every few seconds and on every event that stops the clock, and a readout that
 * re-rendered the whole app once a second to show it would be a poor trade. Only
 * your own time is shown on a phone, where the bar has no room for both.
 */
function GameClockReadout() {
  const clock = useGameStore((state) => state.clock);
  const playerColor = useGameStore((state) => state.playerColor);
  const [, forceTick] = useState(0);

  // A running clock has to redraw; a stopped one is already correct.
  useEffect(() => {
    if (clock.since === null) return;
    const id = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [clock.since]);

  const elapsed = (side: 'w' | 'b') => {
    const banked = side === 'w' ? clock.w : clock.b;
    const live = clock.since !== null && clock.side === side ? Date.now() - clock.since : 0;
    return banked + live;
  };

  const you = playerColor === 'white' ? 'w' : 'b';
  const them = you === 'w' ? 'b' : 'w';
  const running = clock.since !== null;

  return (
    <span
      className="flex shrink-0 items-center gap-1 tabular-nums"
      title={`Thinking time — you ${describeDuration(elapsed(you))}, opponent ${describeDuration(
        elapsed(them),
      )}. The clock stops when the game is paused or the tab is in the background.`}
    >
      <ClockIcon
        className={`h-3.5 w-3.5 ${running && clock.side === you ? 'text-blue-300' : 'text-slate-500'}`}
      />
      <span
        className={running && clock.side === you ? 'text-slate-200' : 'text-slate-400'}
        aria-label={`Your thinking time: ${describeDuration(elapsed(you))}`}
      >
        {formatDuration(elapsed(you))}
      </span>
      <span aria-hidden className="hidden text-slate-600 sm:inline">
        /
      </span>
      <span
        aria-hidden
        className={`hidden sm:inline ${
          running && clock.side === them ? 'text-slate-200' : 'text-slate-500'
        }`}
      >
        {formatDuration(elapsed(them))}
      </span>
    </span>
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
  const drawMode = useGameStore((state) => state.drawMode);
  const setDrawMode = useGameStore((state) => state.setDrawMode);

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
      <span aria-hidden className={`text-base leading-none ${GLYPH_TINT[playerColor === 'white' ? 'w' : 'b']}`}>
        {PIECE_GLYPH.k}
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
      <div className="glass flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs font-semibold">
        <span className={tone}>{result.reason}</span>
        <span className="flex items-center gap-3">
          <GameClockReadout />
          {material}
          {youAre}
        </span>
      </div>
    );
  }

  const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const isPlayer = turn === playerColor;

  /**
   * Drawing is a halt like pausing, and takes precedence over the paused bar:
   * "you are drawing" is the more useful thing to read, and it carries the same
   * one-tap way back to the game.
   */
  if (drawMode) {
    return (
      <div className="glass glass-emerald flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs font-semibold">
        <span className="flex min-w-0 items-center gap-2 text-emerald-200" aria-live="polite">
          <PencilIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            Your board — drag to draw an arrow, tap to ring a square
          </span>
        </span>
        <button
          type="button"
          onClick={() => setDrawMode(false)}
          className="glass-prominent flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1 text-xs font-bold text-slate-950 [--prominent-glow:rgb(16_185_129/0.5)] transition-[background-color,transform] duration-150 ease-out hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:scale-[0.97]"
        >
          <PlayIcon className="h-3 w-3" /> Play on
        </button>
      </div>
    );
  }

  // Paused is the loudest thing the bar can say: nothing moves until it is
  // cleared, so the way out has to be right there.
  if (isPaused) {
    return (
      <div className="glass glass-amber flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs font-semibold">
        <span className="flex items-center gap-2 text-amber-200" aria-live="polite">
          <PauseIcon className="h-3.5 w-3.5 shrink-0" />
          Paused — {isPlayer ? 'your move' : "opponent's move"} when you resume
        </span>
        <span className="flex items-center gap-3 text-amber-200/70">
          <GameClockReadout />
        </span>
        <button
          type="button"
          onClick={() => void setPaused(false)}
          className="glass-prominent flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950 [--prominent-glow:rgb(245_158_11/0.5)] transition-[background-color,transform] duration-150 ease-out hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 active:scale-[0.97]"
        >
          <PlayIcon className="h-3 w-3" /> Resume
        </button>
      </div>
    );
  }

  return (
    <div className="glass flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs font-semibold">
      <button
        type="button"
        onClick={() => void setPaused(true)}
        title="Pause the game"
        className="flex items-center gap-2 rounded-lg text-slate-200 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
        aria-live="polite"
      >
        {/* Which side is to move, as a disc in that side's colour. */}
        <span
          aria-hidden
          className={`h-2.5 w-2.5 rounded-full ring-1 ${
            turn === 'white' ? 'bg-slate-100 ring-white/40' : 'bg-slate-800 ring-white/25'
          }`}
        />
        {isPlayer ? 'Your move' : "Opponent's move"}
        <PauseIcon className="h-3 w-3 text-slate-500" />
      </button>
      <span className="flex items-center gap-3">
        <GameClockReadout />
        {material}
        {youAre}
      </span>
    </div>
  );
}

/**
 * App header: the menu, the app's name, and sound.
 *
 * Deliberately sparse. Everything you set rather than use — who you play, the
 * clock, the coach, your rating — lives in the side menu behind the button on
 * the left, so the bar fits a 320px phone without anything fighting for room.
 */
export const Header = memo(function Header() {
  const engineError = useGameStore((state) => state.engineError);
  const engineStatus = useGameStore((state) => state.engineStatus);
  const friend = useGameStore((state) => state.mode === 'friend');
  const setMenuOpen = useGameStore((state) => state.setMenuOpen);
  const menuOpen = useGameStore((state) => state.menuOpen);

  /**
   * The engine's state, as a dot on the logo — only while it is starting or has
   * failed, the two states worth a glance. "Ready" is normal and says nothing.
   */
  const status =
    !friend && (engineStatus === 'loading' || engineStatus === 'idle' || engineStatus === 'error')
      ? STATUS_META[engineStatus]
      : null;

  return (
    <header
      // Sticky glass: the page scrolls beneath it, so the material has the board
      // and panels to blur. It carries the top safe area itself: were that
      // padding on <html>, a sticky bar would scroll up into the notch.
      className="glass sticky top-0 z-40 rounded-none pt-[env(safe-area-inset-top)] shadow-none before:hidden [box-shadow:inset_0_-1px_0_rgb(255_255_255/0.06)]"
    >
      <div className="mx-auto flex h-14 max-w-[100rem] items-center justify-between gap-3 px-3 sm:h-16 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            className="glass-control grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-200 transition-[color,transform] duration-150 ease-out hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 active:scale-[0.94]"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <span className="relative shrink-0">
            <BrandMark className="h-9 w-9 sm:h-10 sm:w-10" />
            {status && (
              <span
                role="status"
                title={status.description}
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-950 ${status.dot}`}
              >
                <span className="sr-only">{status.description}</span>
              </span>
            )}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[0.95rem] font-bold leading-tight tracking-tight text-slate-50 sm:text-base">
              Shatranj AI
            </h1>
            <p className="hidden truncate text-xs text-slate-400 sm:block">
              {friend ? 'Two players, one board.' : 'Play Stockfish. Learn from every move.'}
            </p>
          </div>
        </div>

        <SoundToggle />
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

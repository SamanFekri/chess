import { memo, useState, type ReactNode } from 'react';
import {
  coachDepthForElo,
  MAX_COACH_ELO,
  MAX_OPPONENT_ELO,
  MIN_COACH_ELO,
  MIN_OPPONENT_ELO,
  UNLIMITED_ELO,
} from '../../engine/stockfish';
import { useGameStore } from '../../store/gameStore';
import { MAX_MANUAL_ELO, MIN_MANUAL_ELO } from '../../store/rating';
import type { PlayerColor } from '../../types';
import { buildPgn, copyToClipboard, downloadText } from '../../utils/pgn';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

/** Plain-English description of an opponent strength setting. */
function opponentDescription(elo: number): string {
  if (elo >= UNLIMITED_ELO) return 'Full strength, no handicap. Unbeatable for almost anyone.';
  if (elo < 1500) return 'Beginner. Makes real mistakes you can punish.';
  if (elo < 1800) return 'Casual club player. Takes any piece you leave loose.';
  if (elo < 2100) return 'Solid club player. Punishes weak moves consistently.';
  if (elo < 2500) return 'Strong club player. You will need a plan.';
  return 'Expert. Expect very few errors.';
}

/** Plain-English description of a coach strength setting. */
function coachDescription(elo: number): string {
  const depth = coachDepthForElo(elo);
  if (elo <= 2200) {
    return `Looks ${depth} moves ahead. Fast feedback, but it will miss deeper tactics.`;
  }
  if (elo <= 2800) return `Looks ${depth} moves ahead. A good balance of speed and accuracy.`;
  return `Looks ${depth} moves ahead. Most reliable verdicts, with a longer pause after each move.`;
}

/**
 * A labelled Elo slider.
 *
 * Shared by both settings so they read and behave identically — the only
 * differences are the range and the wording underneath.
 */
function EloSlider({
  id,
  label,
  value,
  min,
  max,
  step = 10,
  display,
  description,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** What to show as the current value, e.g. `2100` or `Max`. */
  display: ReactNode;
  description: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500"
        >
          {label}
        </label>
        <span className="font-mono text-sm font-semibold text-blue-300">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-6 w-full cursor-pointer accent-blue-500"
        aria-describedby={`${id}-description`}
        aria-valuetext={typeof display === 'string' ? display : String(value)}
      />
      <p id={`${id}-description`} className="mt-1 text-xs leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  );
}

/** The two strength sliders: who you play, and how hard the coach thinks. */
function StrengthSettings() {
  const opponentElo = useGameStore((state) => state.opponentElo);
  const coachElo = useGameStore((state) => state.coachElo);
  const coachEnabled = useGameStore((state) => state.coachEnabled);
  const setOpponentElo = useGameStore((state) => state.setOpponentElo);
  const setCoachElo = useGameStore((state) => state.setCoachElo);

  return (
    <div className="space-y-3">
      <EloSlider
        id="opponent-elo"
        label="Opponent Elo"
        value={opponentElo}
        min={MIN_OPPONENT_ELO}
        max={UNLIMITED_ELO}
        display={opponentElo >= UNLIMITED_ELO ? 'Max' : opponentElo}
        description={`${opponentDescription(opponentElo)} Takes effect on the engine's next move.`}
        onChange={setOpponentElo}
      />

      {/* Pointless while the coach is switched off — it only sets analysis depth. */}
      {coachEnabled && (
        <EloSlider
          id="coach-elo"
          label="Coach strength"
          value={coachElo}
          min={MIN_COACH_ELO}
          max={MAX_COACH_ELO}
          step={100}
          display={coachElo >= MAX_COACH_ELO ? 'Max' : coachElo}
          description={coachDescription(coachElo)}
          onChange={setCoachElo}
        />
      )}

      {opponentElo >= MAX_OPPONENT_ELO && opponentElo < UNLIMITED_ELO && (
        <p className="text-xs text-amber-300/80">
          {MAX_OPPONENT_ELO} is the highest Elo Stockfish accepts. Drag to Max for no handicap.
        </p>
      )}
    </div>
  );
}

/** Colour picker for the next game. */
function ColorChoice() {
  const playerColor = useGameStore((state) => state.playerColor);
  const newGame = useGameStore((state) => state.newGame);

  const options: Array<{ value: PlayerColor; label: string; icon: string }> = [
    { value: 'white', label: 'White', icon: '♔' },
    { value: 'black', label: 'Black', icon: '♚' },
  ];

  return (
    <div role="group" aria-label="Play as" className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => void newGame({ playerColor: option.value })}
          aria-pressed={playerColor === option.value}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
            playerColor === option.value
              ? 'bg-blue-500 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <span aria-hidden className="text-lg leading-none">
            {option.icon}
          </span>
          Play {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Manual override for the rating estimate.
 *
 * Grinding up from 1200 is slow if you already know roughly how strong you are,
 * and the figure is only useful if it is believable. Whatever is entered becomes
 * the new anchor and then moves normally with each finished game.
 */
function RatingSetting() {
  const rating = useGameStore((state) => state.rating);
  const setRatingManually = useGameStore((state) => state.setRatingManually);
  const resetRating = useGameStore((state) => state.resetRating);

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(rating.elo));

  const save = () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setRatingManually(parsed);
    setOpen(false);
  };

  return (
    <div className="border-t border-slate-800/70 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Your rating
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-200">
            {rating.gamesPlayed === 0 && !rating.manuallySet ? 'Unrated' : rating.elo}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {rating.wins}W / {rating.draws}D / {rating.losses}L
            </span>
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setValue(String(rating.elo));
            setOpen((current) => !current);
          }}
          aria-expanded={open}
          className="min-h-10 shrink-0 px-3 text-xs"
        >
          {open ? 'Cancel' : 'Set manually'}
        </Button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <label htmlFor="manual-elo" className="sr-only">
            Your rating, between {MIN_MANUAL_ELO} and {MAX_MANUAL_ELO}
          </label>
          <div className="flex gap-2">
            <input
              id="manual-elo"
              type="number"
              inputMode="numeric"
              min={MIN_MANUAL_ELO}
              max={MAX_MANUAL_ELO}
              step={10}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && save()}
              className="min-h-11 w-24 rounded-xl border border-slate-700 bg-slate-950/70 px-3 font-mono text-sm text-slate-200 focus:border-blue-400 focus:outline-none"
            />
            <Button variant="primary" onClick={save} className="flex-1">
              Save
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            Between {MIN_MANUAL_ELO} and {MAX_MANUAL_ELO}. This becomes the starting point and
            still moves up or down after every finished game.
          </p>
          <button
            type="button"
            onClick={() => {
              resetRating();
              setOpen(false);
            }}
            className="text-xs font-semibold text-red-300 transition-colors hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
          >
            Reset rating and game history
          </button>
        </div>
      )}
    </div>
  );
}

/** Import/export drawer for PGN and FEN. */
function TransferPanel() {
  const sanHistory = useGameStore((state) => state.sanHistory);
  const fen = useGameStore((state) => state.fen);
  const playerColor = useGameStore((state) => state.playerColor);
  const opponentElo = useGameStore((state) => state.opponentElo);
  const startFen = useGameStore((state) => state.startFen);
  const result = useGameStore((state) => state.result);
  const importPgn = useGameStore((state) => state.importPgn);
  const importFen = useGameStore((state) => state.importFen);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);

  const pgn = () => buildPgn(sanHistory, { playerColor, opponentElo, result, startFen });

  /** Guesses whether the pasted text is a FEN or a PGN and imports accordingly. */
  const handleImport = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus({ tone: 'error', message: 'Paste a PGN or FEN first.' });
      return;
    }

    // A FEN is a single line with exactly six space-separated fields; anything
    // else — headers, move numbers, newlines — is PGN.
    const looksLikeFen = !trimmed.includes('\n') && trimmed.split(/\s+/).length === 6;
    const error = looksLikeFen ? await importFen(trimmed) : await importPgn(trimmed);

    if (error) setStatus({ tone: 'error', message: error });
    else {
      setStatus({ tone: 'ok', message: looksLikeFen ? 'Position loaded.' : 'Game loaded.' });
      setText('');
    }
  };

  const copy = async (value: string, label: string) => {
    const ok = await copyToClipboard(value);
    setStatus({
      tone: ok ? 'ok' : 'error',
      message: ok ? `${label} copied to clipboard.` : `Could not copy the ${label}.`,
    });
  };

  return (
    <div className="border-t border-slate-800/70 pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-sm font-semibold text-slate-300 transition-colors hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
      >
        Import / export
        <span aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => void copy(pgn(), 'PGN')}>
              Copy PGN
            </Button>
            <Button variant="ghost" onClick={() => void copy(fen, 'FEN')}>
              Copy FEN
            </Button>
            <Button
              variant="ghost"
              onClick={() => downloadText('ai-chess-coach.pgn', pgn())}
              className="col-span-2"
            >
              ⬇ Download PGN
            </Button>
          </div>

          <div>
            <label
              htmlFor="import-text"
              className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500"
            >
              Paste a PGN or FEN
            </label>
            <textarea
              id="import-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="1. e4 e5 2. Nf3 …   or   rnbqkbnr/pppppppp/8/8/…"
              className="mt-1 w-full resize-y rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-400 focus:outline-none"
            />
            <Button variant="primary" onClick={() => void handleImport()} className="mt-2 w-full">
              Load position
            </Button>
          </div>

          {status && (
            <p
              role="status"
              className={`text-xs ${status.tone === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}
            >
              {status.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Between-games settings: side, difficulty, resign, import/export. */
export const Controls = memo(function Controls() {
  const resign = useGameStore((state) => state.resign);
  const enterEditMode = useGameStore((state) => state.enterEditMode);
  const moves = useGameStore((state) => state.moves);
  const result = useGameStore((state) => state.result);

  const inProgress = result.status === 'in-progress';

  return (
    <Panel title="Game" bodyClassName="space-y-3 px-4 py-3">
      <ColorChoice />

      <StrengthSettings />

      {/* Undo, Hint and Flip live in QuickActions under the board, and New game
          lives in the header — all reachable without scrolling to this panel. */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={enterEditMode}>
          ✎ Set up board
        </Button>
        <Button variant="danger" onClick={resign} disabled={!inProgress || moves.length === 0}>
          🏳 Resign
        </Button>
      </div>

      <RatingSetting />
      <TransferPanel />
    </Panel>
  );
});

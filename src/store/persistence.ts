import { Chess, DEFAULT_POSITION, validateFen } from 'chess.js';
import {
  DEFAULT_COACH_ELO,
  MAX_COACH_ELO,
  MAX_OPPONENT_ELO,
  MIN_COACH_ELO,
  MIN_OPPONENT_ELO,
  UNLIMITED_ELO,
} from '../engine/stockfish';
import type { CoachFeedback, GameResult, PlayedMove, PlayerColor } from '../types';
import type { RedoEntry } from './gameStore';

/**
 * Saving and restoring the game in `localStorage`, so closing the tab does not
 * throw away a game in progress.
 *
 * Only the move list is authoritative: the board is rebuilt by replaying SAN
 * moves through chess.js rather than trusting a stored FEN, so a corrupted or
 * hand-edited entry cannot put an illegal position on the board. Everything else
 * (verdicts, coaching text) is presentation that hangs off that move list.
 */

const GAME_KEY = 'ai-chess-coach:game';

/** Bumped when the shape changes, so old entries are discarded, not misread. */
const GAME_VERSION = 1;

/** The persisted game. */
export interface GameSnapshot {
  version: number;
  savedAt: number;
  /** Position the game began from — not always the standard opening. */
  startFen: string;
  sanMoves: string[];
  playerColor: PlayerColor;
  boardOrientation: PlayerColor;
  /** Opponent strength in Elo. */
  opponentElo: number;
  /** Coach analysis strength in Elo. */
  coachElo: number;
  coachEnabled: boolean;
  moves: PlayedMove[];
  feedback: CoachFeedback[];
  result: GameResult;
  /** Moves taken back but still available to redo, in replay order. */
  redoStack: RedoEntry[];
  /** Whether play was halted when the game was saved. */
  isPaused: boolean;
  /** Whether this game's result has already been counted towards the rating. */
  ratingApplied: boolean;
}

/** A restored game: the rebuilt board plus the trimmed-to-fit metadata. */
export interface RestoredGame {
  game: Chess;
  snapshot: GameSnapshot;
}

/**
 * Reads and validates the stored game.
 *
 * Returns null for anything it cannot fully trust — a missing entry, a version
 * mismatch, malformed JSON, or a move list that does not replay cleanly. A bad
 * snapshot is always better discarded than partially applied.
 */
export function loadGame(): RestoredGame | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(GAME_KEY);
  } catch {
    // Storage can be unavailable entirely (private browsing, blocked cookies).
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<GameSnapshot>;
    if (parsed.version !== GAME_VERSION) return null;
    if (!Array.isArray(parsed.sanMoves) || parsed.sanMoves.some((m) => typeof m !== 'string')) {
      return null;
    }

    // The starting position must be trustworthy before anything is replayed onto
    // it. A game set up by hand or imported from a FEN does not begin at move 1,
    // and replaying its moves from the standard opening would silently rebuild a
    // different game.
    const startFen =
      typeof parsed.startFen === 'string' && validateFen(parsed.startFen).ok
        ? parsed.startFen
        : DEFAULT_POSITION;

    // A game with no moves is still worth restoring when it started from a
    // custom position — that setup is the thing the user built.
    if (parsed.sanMoves.length === 0 && startFen === DEFAULT_POSITION) return null;

    const game = new Chess(startFen);
    for (const san of parsed.sanMoves) {
      game.move(san);
    }
    // A partial replay means the data disagrees with the rules; distrust all of it.
    if (game.history().length !== parsed.sanMoves.length) return null;

    const plies = parsed.sanMoves.length;
    const snapshot: GameSnapshot = {
      version: GAME_VERSION,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
      startFen,
      sanMoves: parsed.sanMoves,
      playerColor: parsed.playerColor === 'black' ? 'black' : 'white',
      boardOrientation: parsed.boardOrientation === 'black' ? 'black' : 'white',
      opponentElo: clampOpponentElo(parsed),
      coachElo: clampCoachElo(parsed.coachElo),
      coachEnabled: parsed.coachEnabled !== false,
      // Metadata is indexed by ply; anything beyond the replayed moves is stale.
      moves: (Array.isArray(parsed.moves) ? parsed.moves : []).filter(
        (move) => move && typeof move.ply === 'number' && move.ply < plies,
      ),
      feedback: (Array.isArray(parsed.feedback) ? parsed.feedback : []).filter(
        (entry) => entry && typeof entry.ply === 'number' && entry.ply < plies,
      ),
      result:
        parsed.result && typeof parsed.result === 'object'
          ? (parsed.result as GameResult)
          : { status: 'in-progress' },
      // The redo stack is only usable if every SAN in it is a string; a partly
      // valid stack would desync from the board on the first redo.
      redoStack:
        Array.isArray(parsed.redoStack) &&
        parsed.redoStack.every((entry) => entry && typeof entry.san === 'string')
          ? parsed.redoStack
          : [],
      isPaused: parsed.isPaused === true,
      ratingApplied: parsed.ratingApplied === true,
    };

    return { game, snapshot };
  } catch {
    return null;
  }
}

/**
 * Reads the opponent strength, migrating snapshots written before the setting
 * became a direct Elo value.
 *
 * Older entries stored a 1–20 `level`; converting it here means an in-progress
 * game survives the change instead of being thrown away.
 */
function clampOpponentElo(parsed: Partial<GameSnapshot> & { level?: unknown }): number {
  if (typeof parsed.opponentElo === 'number' && Number.isFinite(parsed.opponentElo)) {
    return Math.min(UNLIMITED_ELO, Math.max(MIN_OPPONENT_ELO, Math.round(parsed.opponentElo)));
  }

  if (typeof parsed.level === 'number' && Number.isFinite(parsed.level)) {
    const level = Math.min(20, Math.max(1, Math.round(parsed.level)));
    if (level >= 20) return UNLIMITED_ELO;
    const t = (level - 1) / 18;
    return Math.round(MIN_OPPONENT_ELO + t * (MAX_OPPONENT_ELO - MIN_OPPONENT_ELO));
  }

  return 1800;
}

/** Clamps a stored coach strength into the supported range. */
function clampCoachElo(elo: unknown): number {
  const numeric = typeof elo === 'number' && Number.isFinite(elo) ? elo : DEFAULT_COACH_ELO;
  return Math.min(MAX_COACH_ELO, Math.max(MIN_COACH_ELO, Math.round(numeric)));
}

/**
 * Writes the game to storage. Failures are ignored: a full or unavailable quota
 * must never break the game in progress.
 */
export function saveGame(snapshot: Omit<GameSnapshot, 'version' | 'savedAt'>): void {
  try {
    const payload: GameSnapshot = {
      ...snapshot,
      version: GAME_VERSION,
      savedAt: Date.now(),
    };
    localStorage.setItem(GAME_KEY, JSON.stringify(payload));
  } catch {
    /* Storage unavailable or full — the game continues either way. */
  }
}

/** Removes the stored game. */
export function clearGame(): void {
  try {
    localStorage.removeItem(GAME_KEY);
  } catch {
    /* Nothing to do. */
  }
}

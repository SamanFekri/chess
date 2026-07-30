import type { GameResult, PlayerColor } from '../types';
import { strengthForElo } from '../engine/stockfish';

/**
 * A persistent Elo estimate for the player, built from finished games.
 *
 * The estimate uses the standard Elo update against the opponent's known rating,
 * which is the whole reason the difficulty slider maps to `UCI_Elo`: Stockfish's
 * strength at a given level is a real number we can rate against, so beating
 * level 12 means something specific rather than being a made-up score.
 */

const RATING_KEY = 'ai-chess-coach:rating';
const RATING_VERSION = 1;

/** Where a new player starts, in the absence of any evidence. */
export const DEFAULT_ELO = 1200;

/** Games needed before the estimate stops being labelled provisional. */
export const PROVISIONAL_GAMES = 5;

/**
 * Effective rating for the unlimited setting, which runs unhandicapped and
 * therefore reports no `UCI_Elo`. Full-strength Stockfish is far above any human.
 */
const UNLIMITED_ELO = 3200;

/** Lowest and highest rating accepted from manual entry. */
export const MIN_MANUAL_ELO = 400;
export const MAX_MANUAL_ELO = 3000;

/** The stored rating record. */
export interface RatingRecord {
  version: number;
  elo: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  /** Highest rating reached. */
  peak: number;
  /** Change from the most recently completed game, for display. */
  lastChange: number | null;
  /** True when the player typed the rating in rather than earning it. */
  manuallySet: boolean;
}

/** A fresh record for a player with no completed games. */
export function emptyRating(): RatingRecord {
  return {
    version: RATING_VERSION,
    elo: DEFAULT_ELO,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    peak: DEFAULT_ELO,
    lastChange: null,
    manuallySet: false,
  };
}

/**
 * Anchors the estimate to a rating the player supplies.
 *
 * Useful when you already know roughly how strong you are — starting everyone at
 * 1200 and grinding towards the truth is slow, and the whole point of the figure
 * is to be believable. Game counters are kept so the K-factor does not jump back
 * to its provisional value and swing the next result wildly.
 */
export function withManualElo(record: RatingRecord, elo: number): RatingRecord {
  const clamped = Math.min(MAX_MANUAL_ELO, Math.max(MIN_MANUAL_ELO, Math.round(elo)));
  return {
    ...record,
    elo: clamped,
    peak: Math.max(record.peak, clamped),
    lastChange: null,
    manuallySet: true,
  };
}

/** Reads the stored rating, falling back to a fresh record. */
export function loadRating(): RatingRecord {
  try {
    const raw = localStorage.getItem(RATING_KEY);
    if (!raw) return emptyRating();

    const parsed = JSON.parse(raw) as Partial<RatingRecord>;
    if (parsed.version !== RATING_VERSION) return emptyRating();
    if (typeof parsed.elo !== 'number' || !Number.isFinite(parsed.elo)) return emptyRating();

    const record = emptyRating();
    return {
      ...record,
      elo: Math.round(parsed.elo),
      gamesPlayed: numberOr(parsed.gamesPlayed, 0),
      wins: numberOr(parsed.wins, 0),
      draws: numberOr(parsed.draws, 0),
      losses: numberOr(parsed.losses, 0),
      peak: numberOr(parsed.peak, Math.round(parsed.elo)),
      lastChange:
        typeof parsed.lastChange === 'number' && Number.isFinite(parsed.lastChange)
          ? parsed.lastChange
          : null,
      manuallySet: parsed.manuallySet === true,
    };
  } catch {
    return emptyRating();
  }
}

/** Coerces a stored value into a non-negative integer. */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;
}

/** Writes the rating record, ignoring storage failures. */
export function saveRating(record: RatingRecord): void {
  try {
    localStorage.setItem(RATING_KEY, JSON.stringify(record));
  } catch {
    /* Storage unavailable — the in-memory rating still shows this session. */
  }
}

/** Clears the rating history. */
export function clearRating(): void {
  try {
    localStorage.removeItem(RATING_KEY);
  } catch {
    /* Nothing to do. */
  }
}

/**
 * K-factor: how much a single game moves the rating.
 *
 * Large while the estimate is new so it converges quickly from the default 1200,
 * then smaller so an established rating is stable.
 */
function kFactor(gamesPlayed: number): number {
  if (gamesPlayed < PROVISIONAL_GAMES) return 60;
  if (gamesPlayed < 20) return 32;
  return 20;
}

/** The player's score in a finished game: 1 win, 0.5 draw, 0 loss. */
function scoreFor(result: GameResult, playerColor: PlayerColor): number | null {
  if (result.status === 'in-progress') return null;
  if (result.winner === null) return 0.5;
  return result.winner === (playerColor === 'white' ? 'w' : 'b') ? 1 : 0;
}

/**
 * Rating to score a game against, for a given opponent-strength setting.
 *
 * Passes through `strengthForElo` rather than using the setting directly so the
 * "unlimited" position on the slider resolves to a concrete number.
 */
export function opponentEloFor(setting: number): number {
  return strengthForElo(setting).elo ?? UNLIMITED_ELO;
}

/**
 * Applies one finished game to the rating.
 *
 * @param record      Current rating record.
 * @param result      How the game ended.
 * @param playerColor Which side the human played.
 * @param level       Difficulty the opponent was set to.
 * @returns The updated record, or the original when the game is not finished.
 */
export function applyGame(
  record: RatingRecord,
  result: GameResult,
  playerColor: PlayerColor,
  level: number,
): RatingRecord {
  const score = scoreFor(result, playerColor);
  if (score === null) return record;

  const opponentElo = opponentEloFor(level);
  const expected = 1 / (1 + 10 ** ((opponentElo - record.elo) / 400));
  const change = Math.round(kFactor(record.gamesPlayed) * (score - expected));

  // A floor keeps the number meaningful rather than letting a run of losses to a
  // 3200-rated engine drive it towards zero.
  const elo = Math.max(400, record.elo + change);

  return {
    version: RATING_VERSION,
    elo,
    gamesPlayed: record.gamesPlayed + 1,
    wins: record.wins + (score === 1 ? 1 : 0),
    draws: record.draws + (score === 0.5 ? 1 : 0),
    losses: record.losses + (score === 0 ? 1 : 0),
    peak: Math.max(record.peak, elo),
    lastChange: change,
    // A manually entered figure is only an anchor: once a result has adjusted it,
    // the number is earned and is described as such.
    manuallySet: false,
  };
}

/** Plain-English strength band for a rating, for the tooltip and review. */
export function describeRating(record: RatingRecord): string {
  if (record.manuallySet) {
    return `Set by you. It will adjust up or down after each finished game${
      record.gamesPlayed > 0 ? `, on top of ${record.gamesPlayed} already played` : ''
    }.`;
  }

  if (record.gamesPlayed === 0) {
    return 'Play a game to the finish and an estimate will appear here.';
  }

  // Under Elo, losing to a far stronger opponent is expected and so costs almost
  // nothing — a beginner who only plays level 15 can lose twenty games and sit at
  // exactly 1200 forever. Say that plainly instead of presenting the starting
  // value as a measurement.
  if (record.elo === DEFAULT_ELO && record.wins === 0 && record.draws === 0) {
    return `Still the starting estimate after ${record.gamesPlayed} game${
      record.gamesPlayed === 1 ? '' : 's'
    } — losing to a much stronger engine barely moves a rating. Lower the level until you win sometimes and this figure will start to mean something.`;
  }

  const provisional =
    record.gamesPlayed < PROVISIONAL_GAMES
      ? ` Provisional — ${PROVISIONAL_GAMES - record.gamesPlayed} more game${
          PROVISIONAL_GAMES - record.gamesPlayed === 1 ? '' : 's'
        } to settle.`
      : '';

  const band =
    record.elo < 800
      ? 'Just starting out'
      : record.elo < 1200
        ? 'Beginner'
        : record.elo < 1500
          ? 'Casual club player'
          : record.elo < 1800
            ? 'Solid club player'
            : record.elo < 2100
              ? 'Strong club player'
              : 'Expert';

  return `${band}, estimated from ${record.gamesPlayed} finished game${
    record.gamesPlayed === 1 ? '' : 's'
  }.${provisional}`;
}

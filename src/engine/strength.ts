/**
 * Playing-strength maths, shared by every engine.
 *
 * Kept apart from any particular engine: the Elo → search-settings mapping is
 * how the app talks about difficulty, and the adapters translate it into their
 * own options. Nothing here touches a worker, so it is testable in isolation.
 */

/** Engine settings derived from a target playing strength. */
export interface StrengthSettings {
  /** Stockfish `Skill Level` (0–20). */
  skill: number;
  /** `UCI_Elo` target, or null when the strength limiter is not used. */
  elo: number | null;
  /** Search depth cap for the engine's own move. */
  depth: number;
  /** Wall-clock cap in milliseconds, so weak settings also feel snappy. */
  moveTimeMs: number;
  /**
   * Probability of ignoring the engine and playing a random legal move.
   *
   * The only way to reach below Stockfish's own rating floor. At the very bottom
   * of the slider this is 1, which is a purely random mover — about 400 Elo, and
   * genuinely beatable by a complete beginner.
   */
  randomChance: number;
  /** Strength this setting represents, for rating games against it. */
  effectiveElo: number;
}

/**
 * Bounds of Stockfish's own `UCI_Elo` option, verified against the engine build
 * we ship. Values outside this range are rejected by the engine, not clamped.
 */
export const ENGINE_MIN_ELO = 1320;
export const MAX_OPPONENT_ELO = 3190;

/**
 * Bottom of the opponent slider.
 *
 * Below {@link ENGINE_MIN_ELO} Stockfish cannot be asked to play weaker, so this
 * range is served by mixing in random legal moves instead — see
 * {@link StrengthSettings.randomChance}.
 */
export const MIN_OPPONENT_ELO = 400;

/**
 * Slider position meaning "no handicap at all".
 *
 * One past `MAX_OPPONENT_ELO`, because full-strength play is not an Elo setting —
 * it switches `UCI_LimitStrength` off entirely — but it belongs at the top of the
 * same slider.
 */
export const UNLIMITED_ELO = MAX_OPPONENT_ELO + 10;

/**
 * Translates a target Elo into engine settings.
 *
 * Two knobs are used together on purpose. `UCI_Elo` gives a calibrated playing
 * strength, which `Skill Level` alone does not; the depth and time caps stop weak
 * settings from burning CPU on a position they are going to play badly anyway.
 */
export function strengthForElo(elo: number): StrengthSettings {
  if (elo >= UNLIMITED_ELO) {
    return {
      skill: 20,
      elo: null,
      depth: 18,
      moveTimeMs: 2000,
      randomChance: 0,
      effectiveElo: UNLIMITED_ELO,
    };
  }

  const clamped = Math.min(MAX_OPPONENT_ELO, Math.max(MIN_OPPONENT_ELO, Math.round(elo)));

  // Below the engine's floor: weakest possible search, with random moves mixed
  // in to bring the strength down the rest of the way.
  if (clamped < ENGINE_MIN_ELO) {
    const t = (clamped - MIN_OPPONENT_ELO) / (ENGINE_MIN_ELO - MIN_OPPONENT_ELO);
    return {
      skill: 0,
      // The limiter cannot express this range, so it is switched off entirely.
      elo: null,
      depth: Math.max(1, Math.round(1 + t * 3)),
      moveTimeMs: 100,
      randomChance: Math.min(1, Math.max(0, 1 - t)),
      effectiveElo: clamped,
    };
  }

  const t = (clamped - ENGINE_MIN_ELO) / (MAX_OPPONENT_ELO - ENGINE_MIN_ELO);
  return {
    skill: Math.round(t * 20),
    elo: clamped,
    depth: Math.round(4 + t * 12),
    moveTimeMs: Math.round(150 + t * 1350),
    randomChance: 0,
    effectiveElo: clamped,
  };
}

/** Bounds of the coach-strength slider. */
export const MIN_COACH_ELO = 1000;
export const MAX_COACH_ELO = 3200;

/** Default coach strength — trustworthy analysis that still feels immediate. */
export const DEFAULT_COACH_ELO = 2900;

/**
 * Search depth the coach analyses at, for a given coach-strength setting.
 *
 * The coach always plays at full skill; what this varies is how deep it looks,
 * which is the only thing that actually trades accuracy against speed. Deeper
 * analysis catches tactics a shallow search misses, at the cost of a longer pause
 * before feedback appears — which matters on a phone.
 */
export function coachDepthForElo(elo: number): number {
  const clamped = Math.min(MAX_COACH_ELO, Math.max(MIN_COACH_ELO, Math.round(elo)));
  const t = (clamped - MIN_COACH_ELO) / (MAX_COACH_ELO - MIN_COACH_ELO);
  return Math.round(4 + t * 16);
}

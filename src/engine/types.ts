import type { PositionAnalysis, Score } from '../types';

/**
 * The contract every chess engine in the app implements.
 *
 * Everything above this line — coaching, grading, hints, the game review — talks
 * to a `ChessEngine` and never to a particular engine. Adding an engine means
 * writing an adapter and a catalogue entry; it does not mean touching any of the
 * analysis code.
 */

/** Identifier of an engine in the catalogue. */
export type EngineId = string;

/** Options for a position analysis. */
export interface AnalyseOptions {
  /** Plies to search. Falls back to the engine settings when omitted. */
  depth?: number;
  /** How many alternative lines to return. */
  multiPv?: number;
  /** Called with partial results as the search deepens, for live readouts. */
  onProgress?: (partial: PositionAnalysis) => void;
}

/**
 * A running engine.
 *
 * Implementations must serialise their own work: callers fire analysis from
 * React effects and cannot coordinate with each other, so two overlapping
 * requests have to queue rather than interleave.
 */
export interface ChessEngine {
  /** Catalogue entry this instance was created from. */
  readonly definition: EngineDefinition;

  /**
   * Starts the engine and resolves once it can accept work.
   *
   * Safe to call repeatedly — later calls return the same promise. A rejection
   * is final for this instance: the manager falls back to another engine rather
   * than retrying in place.
   */
  initialize(): Promise<void>;

  /** Analyses a position at full strength, whatever the opponent level is. */
  analysePosition(fen: string, options?: AnalyseOptions): Promise<PositionAnalysis>;

  /**
   * Picks a move at a target playing strength.
   *
   * @param elo Target Elo. Engines that cannot limit their strength should play
   *            their best move and report the difference through
   *            {@link EngineCapabilities.strengthLimit}.
   */
  getBestMove(fen: string, elo: number): Promise<string | null>;

  /** Evaluation of a position from the side to move's point of view. */
  getEvaluation(fen: string, options?: AnalyseOptions): Promise<Score | null>;

  /** Abandons the current search. The engine stays usable. */
  stop(): void;

  /** Shuts the engine down and frees its worker. The instance is spent. */
  destroy(): void;
}

/** Which settings an engine actually honours. */
export interface EngineCapabilities {
  /** Search depth can be set explicitly. */
  depth: boolean;
  /** A wall-clock cap per move is honoured. */
  moveTime: boolean;
  /** More than one candidate line can be requested. */
  multiPv: boolean;
  /** Search threads are configurable — false for single-threaded builds. */
  threads: boolean;
  /** Transposition table size is configurable. */
  hash: boolean;
  /** The engine can deliberately play below its best (`UCI_Elo`, skill levels). */
  strengthLimit: boolean;
}

/** Bounds for a numeric setting, used to build and clamp the UI controls. */
export interface SettingRange {
  min: number;
  max: number;
  step: number;
  /** Value used when the user has not chosen one. */
  fallback: number;
}

/** Bounds for each configurable setting an engine exposes. */
export interface EngineLimits {
  depth: SettingRange;
  moveTimeMs: SettingRange;
  multiPv: SettingRange;
  threads: SettingRange;
  hashMb: SettingRange;
}

/** Whether an engine can run in this browser, and why not when it cannot. */
export type EngineAvailability = { ok: true } | { ok: false; reason: string };

/**
 * A catalogue entry: everything the UI needs to describe an engine, plus the
 * factory that builds one.
 *
 * Deliberately data rather than a class hierarchy — a new engine is a new object
 * in the catalogue, and the selector renders whatever it finds there.
 */
export interface EngineDefinition {
  id: EngineId;
  /** Shown in the selector, e.g. "Stockfish 18 Lite". */
  name: string;
  /** One line a beginner can act on: what is this for? */
  description: string;
  /** Approximate playing strength at full power, or null when unknown. */
  strengthElo: number | null;
  /**
   * Where the engine runs.
   *
   * `local` means in this browser, with nothing sent anywhere. `remote` means it
   * needs a server — no such engine ships today, but the selector is built to
   * label one honestly if it ever does.
   */
  location: 'local' | 'remote';
  /** Rough download size in megabytes, so a phone user can judge the cost. */
  downloadMb: number | null;
  /** What the engine is technically, e.g. "WebAssembly, single-threaded". */
  technology: string;
  capabilities: EngineCapabilities;
  limits: EngineLimits;
  /** Checked before selection; a failing engine is shown but not selectable. */
  isAvailable(): EngineAvailability;
  /** Builds an instance. Does not start it — that is `initialize()`. */
  create(settings: EngineSettings): ChessEngine;
}

/**
 * User-tunable engine settings.
 *
 * `null` means "decide for me": search depth normally follows the coach-strength
 * slider, and move time follows the opponent level, which is the right default
 * for almost everyone. A number here overrides that.
 */
export interface EngineSettings {
  depth: number | null;
  moveTimeMs: number | null;
  multiPv: number;
  threads: number;
  hashMb: number;
}

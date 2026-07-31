import type { Color, PositionAnalysis, PvLine, Score } from '../types';
import { pvToSan } from '../utils/chess';
import { createEngineTransport, type EngineTransport } from './worker';

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

/** Number of alternative lines requested when analysing. */
const ANALYSIS_MULTI_PV = 3;

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

/** Options for {@link StockfishEngine.analyse}. */
export interface AnalyseOptions {
  depth?: number;
  multiPv?: number;
  /** Called with partial results as the search deepens, for live readouts. */
  onProgress?: (partial: PositionAnalysis) => void;
}

/** One queued engine job. Jobs run strictly one at a time. */
interface Job {
  run: () => Promise<void>;
  reject: (error: Error) => void;
}

/**
 * A single long-lived Stockfish instance driven over UCI.
 *
 * All work is serialised through an internal queue: UCI is a stateful,
 * single-conversation protocol, so overlapping searches would interleave
 * `info` lines and corrupt both results. Callers just await; the queue makes
 * concurrent calls from React effects safe.
 */
export class StockfishEngine {
  private transport: EngineTransport | null = null;
  private readonly queue: Job[] = [];
  private running = false;
  private disposed = false;
  private readyPromise: Promise<void> | null = null;

  /** Last option values sent, so redundant `setoption` traffic is skipped. */
  private appliedOptions = new Map<string, string>();

  /** Resolves once the engine has answered `uciok` and `readyok`. */
  init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = (async () => {
      const transport = createEngineTransport();
      this.transport = transport;

      const failure = new Promise<never>((_, reject) => {
        transport.onError((message) => reject(new Error(message)));
      });

      await Promise.race([this.handshake(transport), failure]);
    })();

    return this.readyPromise;
  }

  /** Performs the `uci` / `isready` handshake and applies fixed options. */
  private async handshake(transport: EngineTransport): Promise<void> {
    await this.expect(transport, 'uci', (line) => line === 'uciok');

    // Single-threaded build; one thread and a small hash keep memory sane on
    // phones, where this app has to work as well as on a desktop.
    transport.send('setoption name Threads value 1');
    transport.send('setoption name Hash value 32');
    transport.send('setoption name Ponder value false');

    await this.expect(transport, 'isready', (line) => line === 'readyok');
  }

  /** Sends a command and resolves when a line satisfies `predicate`. */
  private expect(
    transport: EngineTransport,
    command: string,
    predicate: (line: string) => boolean,
    onLine?: (line: string) => void,
  ): Promise<void> {
    return new Promise((resolve) => {
      const unsubscribe = transport.onLine((line) => {
        onLine?.(line);
        if (predicate(line)) {
          unsubscribe();
          resolve();
        }
      });
      transport.send(command);
    });
  }

  /** Sends a `setoption`, skipping it when the value is already in force. */
  private setOption(name: string, value: string | number): void {
    const stringValue = String(value);
    if (this.appliedOptions.get(name) === stringValue) return;
    this.appliedOptions.set(name, stringValue);
    this.transport?.send(`setoption name ${name} value ${stringValue}`);
  }

  /** Adds a job to the queue and returns its result. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Engine has been disposed.'));

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: async () => {
          try {
            resolve(await task());
          } catch (error) {
            reject(error as Error);
          }
        },
        reject,
      });
      void this.drain();
    });
  }

  /** Runs queued jobs sequentially until the queue empties. */
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        await job.run();
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Analyses a position at full strength.
   *
   * @param fen  Position to analyse.
   * @param opts Depth, MultiPV and a progress callback.
   * @returns The best lines found, scored from the side to move's point of view.
   */
  analyse(fen: string, opts: AnalyseOptions = {}): Promise<PositionAnalysis> {
    const depth = opts.depth ?? coachDepthForElo(DEFAULT_COACH_ELO);
    const multiPv = opts.multiPv ?? ANALYSIS_MULTI_PV;

    return this.enqueue(async () => {
      await this.init();
      const transport = this.transport!;
      const turn = (fen.split(' ')[1] ?? 'w') as Color;

      // Analysis must never be handicapped, whatever the opponent's level is.
      this.setOption('UCI_LimitStrength', 'false');
      this.setOption('Skill Level', 20);
      this.setOption('MultiPV', multiPv);

      const lines = new Map<number, PvLine>();
      let nps: number | undefined;
      let bestMove: string | null = null;

      const snapshot = (): PositionAnalysis => {
        const ordered = [...lines.values()].sort((a, b) => a.rank - b.rank);
        return {
          fen,
          turn,
          depth: ordered.length > 0 ? Math.max(...ordered.map((l) => l.depth)) : 0,
          lines: ordered,
          bestMove: bestMove ?? ordered[0]?.moves[0] ?? null,
          nps,
        };
      };

      transport.send(`position fen ${fen}`);
      await this.expect(
        transport,
        `go depth ${depth}`,
        (line) => line.startsWith('bestmove'),
        (line) => {
          if (line.startsWith('bestmove')) {
            const move = line.split(/\s+/)[1];
            bestMove = move && move !== '(none)' ? move : null;
            return;
          }

          const info = parseInfoLine(line, fen);
          if (!info) return;
          nps = info.nps ?? nps;
          lines.set(info.line.rank, info.line);
          opts.onProgress?.(snapshot());
        },
      );

      return snapshot();
    });
  }

  /**
   * Picks a move at the given playing strength.
   *
   * @param fen Position to move in.
   * @param elo Target Elo, or {@link UNLIMITED_ELO} for full strength.
   * @returns The chosen move in UCI notation, or null in a terminal position.
   */
  chooseMove(fen: string, elo: number): Promise<string | null> {
    const settings = strengthForElo(elo);

    return this.enqueue(async () => {
      await this.init();
      const transport = this.transport!;

      this.setOption('MultiPV', 1);
      if (settings.elo === null) {
        // Either full strength, or below the limiter's floor — where Skill Level
        // and a shallow search are all the engine itself can offer.
        this.setOption('UCI_LimitStrength', 'false');
        this.setOption('Skill Level', settings.skill);
      } else {
        this.setOption('Skill Level', settings.skill);
        this.setOption('UCI_LimitStrength', 'true');
        this.setOption('UCI_Elo', settings.elo);
      }

      let bestMove: string | null = null;

      transport.send(`position fen ${fen}`);
      await this.expect(
        transport,
        `go depth ${settings.depth} movetime ${settings.moveTimeMs}`,
        (line) => line.startsWith('bestmove'),
        (line) => {
          if (!line.startsWith('bestmove')) return;
          const move = line.split(/\s+/)[1];
          bestMove = move && move !== '(none)' ? move : null;
        },
      );

      return bestMove;
    });
  }

  /** Asks the engine to abandon the current search. */
  stop(): void {
    this.transport?.send('stop');
  }

  /** Terminates the worker and rejects anything still queued. */
  dispose(): void {
    this.disposed = true;
    this.queue.splice(0).forEach((job) => job.reject(new Error('Engine disposed.')));
    this.transport?.terminate();
    this.transport = null;
    this.readyPromise = null;
    this.appliedOptions.clear();
  }
}

/**
 * Parses one UCI `info` line into a principal variation.
 *
 * Returns null for lines without a usable score or PV — `info string …`,
 * currmove progress reports, and bounded scores from an aborted aspiration
 * window, which would otherwise show wildly wrong evaluations mid-search.
 *
 * Exported so the wire-format parsing can be checked against real engine output
 * without a browser.
 */
export function parseInfoLine(
  line: string,
  fen: string,
): { line: PvLine; nps?: number } | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  if (line.includes('lowerbound') || line.includes('upperbound')) return null;

  const tokens = line.split(/\s+/);
  const read = (key: string): string | undefined => {
    const index = tokens.indexOf(key);
    return index >= 0 ? tokens[index + 1] : undefined;
  };

  const depth = Number(read('depth'));
  if (!Number.isFinite(depth)) return null;

  const scoreIndex = tokens.indexOf('score');
  if (scoreIndex < 0) return null;
  const scoreType = tokens[scoreIndex + 1];
  const scoreValue = Number(tokens[scoreIndex + 2]);
  if ((scoreType !== 'cp' && scoreType !== 'mate') || !Number.isFinite(scoreValue)) {
    return null;
  }
  const score: Score = { type: scoreType, value: scoreValue } as Score;

  const pvIndex = tokens.indexOf('pv');
  const moves = tokens.slice(pvIndex + 1).filter((token) => /^[a-h][1-8][a-h][1-8]/.test(token));
  if (moves.length === 0) return null;

  const rank = Number(read('multipv') ?? 1);
  const nps = Number(read('nps'));

  return {
    line: {
      rank: Number.isFinite(rank) ? rank : 1,
      score,
      moves,
      san: pvToSan(fen, moves),
      depth,
    },
    nps: Number.isFinite(nps) ? nps : undefined,
  };
}

/** Process-wide engine instance, created lazily on first use. */
let sharedEngine: StockfishEngine | null = null;

/**
 * Returns the shared engine, creating it on first call.
 *
 * One instance lives for the whole session: starting Stockfish means fetching
 * and compiling ~7 MB of WASM, so it is never restarted between games.
 */
export function getEngine(): StockfishEngine {
  sharedEngine ??= new StockfishEngine();
  return sharedEngine;
}

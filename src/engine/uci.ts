import type { Color, PositionAnalysis, PvLine, Score } from '../types';
import { pvToSan } from '../utils/chess';
import { strengthForElo } from './strength';
import type {
  AnalyseOptions,
  ChessEngine,
  EngineDefinition,
  EngineSettings,
} from './types';
import type { EngineTransport, TransportFactory } from './worker';

/**
 * A generic adapter for any engine that speaks UCI over a worker.
 *
 * Every engine in the catalogue is one of these with a different script and a
 * different capability set — there is no Stockfish-specific code here beyond the
 * standard option names, which is exactly what makes adding an engine cheap.
 *
 * All work is serialised through an internal queue: UCI is a stateful,
 * single-conversation protocol, so overlapping searches would interleave `info`
 * lines and corrupt both results. Callers just await; the queue makes concurrent
 * calls from React effects safe.
 */

/** How long an engine gets to load and answer the handshake. */
const INIT_TIMEOUT_MS = 90_000;

/**
 * How long a single search may run before it is abandoned.
 *
 * Generous, because a deep search on a slow phone is legitimately slow. It
 * exists so a wedged engine surfaces as an error the UI can show, rather than a
 * spinner that never stops.
 */
const SEARCH_TIMEOUT_MS = 60_000;

/** One queued engine job. Jobs run strictly one at a time. */
interface Job {
  run: () => Promise<void>;
  reject: (error: Error) => void;
}

/**
 * Rejects if `promise` has not settled within `ms`.
 *
 * Exported so the timeout behaviour can be checked without waiting a minute for
 * a real one.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}

export class UciEngine implements ChessEngine {
  private transport: EngineTransport | null = null;
  private readonly queue: Job[] = [];
  private running = false;
  private disposed = false;
  private readyPromise: Promise<void> | null = null;

  /** Last option values sent, so redundant `setoption` traffic is skipped. */
  private appliedOptions = new Map<string, string>();

  constructor(
    readonly definition: EngineDefinition,
    private settings: EngineSettings,
    private readonly createTransport: TransportFactory,
  ) {}

  /** Applies changed settings to the running engine. */
  updateSettings(settings: EngineSettings): void {
    this.settings = settings;
    // Threads and hash are cheap to re-apply and take effect on the next search;
    // depth and MultiPV are read per search, so they need nothing here.
    if (this.transport) this.applyResourceOptions();
  }

  /** Resolves once the engine has answered `uciok` and `readyok`. */
  initialize(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = withTimeout(
      (async () => {
        const transport = this.createTransport();
        this.transport = transport;

        const failure = new Promise<never>((_, reject) => {
          transport.onError((message) => reject(new Error(message)));
        });

        await Promise.race([this.handshake(transport), failure]);
      })(),
      INIT_TIMEOUT_MS,
      `${this.definition.name} did not start in time.`,
    );

    // A failed start must not be retried in place: the manager falls back to
    // another engine, and a rejected promise cached here would poison it.
    this.readyPromise.catch(() => {
      this.readyPromise = null;
      this.transport?.terminate();
      this.transport = null;
    });

    return this.readyPromise;
  }

  /** Performs the `uci` / `isready` handshake and applies fixed options. */
  private async handshake(transport: EngineTransport): Promise<void> {
    await this.expect(transport, 'uci', (line) => line === 'uciok');
    this.applyResourceOptions();
    transport.send('setoption name Ponder value false');
    await this.expect(transport, 'isready', (line) => line === 'readyok');
  }

  /** Sends the thread and memory settings the engine supports. */
  private applyResourceOptions(): void {
    const { capabilities, limits } = this.definition;

    // Single-threaded builds reject anything but 1; asking for more is not
    // harmless, it is a protocol error the engine may or may not survive.
    const threads = capabilities.threads
      ? clamp(this.settings.threads, limits.threads)
      : limits.threads.fallback;
    this.setOption('Threads', threads);

    if (capabilities.hash) {
      this.setOption('Hash', clamp(this.settings.hashMb, limits.hashMb));
    }
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
    if (this.disposed) {
      return Promise.reject(new Error(`${this.definition.name} has been shut down.`));
    }

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
  analysePosition(fen: string, opts: AnalyseOptions = {}): Promise<PositionAnalysis> {
    const { capabilities, limits } = this.definition;
    const depth = clamp(opts.depth ?? this.settings.depth ?? limits.depth.fallback, limits.depth);
    const multiPv = capabilities.multiPv
      ? clamp(opts.multiPv ?? this.settings.multiPv, limits.multiPv)
      : 1;

    return this.enqueue(async () => {
      await this.initialize();
      const transport = this.transport!;
      const turn = (fen.split(' ')[1] ?? 'w') as Color;

      // Analysis must never be handicapped, whatever the opponent's level is.
      if (capabilities.strengthLimit) {
        this.setOption('UCI_LimitStrength', 'false');
        this.setOption('Skill Level', 20);
      }
      if (capabilities.multiPv) this.setOption('MultiPV', multiPv);

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
      await this.search(
        transport,
        `go depth ${depth}`,
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
   * @param elo Target Elo, or `UNLIMITED_ELO` for full strength.
   * @returns The chosen move in UCI notation, or null in a terminal position.
   */
  getBestMove(fen: string, elo: number): Promise<string | null> {
    const settings = strengthForElo(elo);
    const { capabilities, limits } = this.definition;
    const moveTimeMs = this.settings.moveTimeMs ?? settings.moveTimeMs;

    return this.enqueue(async () => {
      await this.initialize();
      const transport = this.transport!;

      if (capabilities.multiPv) this.setOption('MultiPV', 1);

      if (capabilities.strengthLimit) {
        if (settings.elo === null) {
          // Either full strength, or below the limiter's floor — where Skill
          // Level and a shallow search are all the engine itself can offer.
          this.setOption('UCI_LimitStrength', 'false');
          this.setOption('Skill Level', settings.skill);
        } else {
          this.setOption('Skill Level', settings.skill);
          this.setOption('UCI_LimitStrength', 'true');
          this.setOption('UCI_Elo', settings.elo);
        }
      }

      let bestMove: string | null = null;

      const command = capabilities.moveTime
        ? `go depth ${settings.depth} movetime ${clamp(moveTimeMs, limits.moveTimeMs)}`
        : `go depth ${settings.depth}`;

      transport.send(`position fen ${fen}`);
      await this.search(transport, command, (line) => {
        if (!line.startsWith('bestmove')) return;
        const move = line.split(/\s+/)[1];
        bestMove = move && move !== '(none)' ? move : null;
      });

      return bestMove;
    });
  }

  /** The evaluation of a position, from the side to move's point of view. */
  async getEvaluation(fen: string, options: AnalyseOptions = {}): Promise<Score | null> {
    const analysis = await this.analysePosition(fen, { ...options, multiPv: 1 });
    return analysis.lines[0]?.score ?? null;
  }

  /**
   * Runs one `go` command to completion.
   *
   * The timeout is the difference between an engine that has crashed and a UI
   * that waits forever: on expiry the search is abandoned and the caller gets an
   * error it can show.
   */
  private search(
    transport: EngineTransport,
    command: string,
    onLine: (line: string) => void,
  ): Promise<void> {
    return withTimeout(
      this.expect(transport, command, (line) => line.startsWith('bestmove'), onLine),
      SEARCH_TIMEOUT_MS,
      `${this.definition.name} stopped responding during the search.`,
    ).catch((error: Error) => {
      transport.send('stop');
      throw error;
    });
  }

  /** Asks the engine to abandon the current search. */
  stop(): void {
    this.transport?.send('stop');
  }

  /** Terminates the worker and rejects anything still queued. */
  destroy(): void {
    this.disposed = true;
    this.queue
      .splice(0)
      .forEach((job) => job.reject(new Error(`${this.definition.name} was shut down.`)));
    this.transport?.terminate();
    this.transport = null;
    this.readyPromise = null;
    this.appliedOptions.clear();
  }
}

/** Keeps a setting inside the range its engine accepts. */
export function clamp(value: number, range: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
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
export function parseInfoLine(line: string, fen: string): { line: PvLine; nps?: number } | null {
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

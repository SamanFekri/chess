/**
 * Owns the Web Worker that Stockfish runs in.
 *
 * The Stockfish WASM build we ship *is* a worker script: instantiating it with
 * `new Worker(url)` gives a UCI engine that speaks plain text over
 * `postMessage`. Keeping that detail behind this module means the rest of the
 * app only ever deals in UCI lines, and the analysis code never touches the
 * DOM or worker APIs — which is also what keeps the UI thread free while the
 * engine searches.
 */

/** Path to the engine script, relative to the deployed site root. */
const ENGINE_SCRIPT = 'stockfish/stockfish-18-lite-single.js';

/**
 * Resolves the engine URL against the document base.
 *
 * Vite is configured with `base: './'`, so a build works from any subpath. The
 * engine locates its own `.wasm` sibling by rewriting its script URL, so this
 * has to be a real absolute URL rather than a relative one.
 */
export function resolveEngineUrl(): string {
  const base = typeof document !== 'undefined' ? document.baseURI : '/';
  return new URL(ENGINE_SCRIPT, base).href;
}

/** A line-oriented, bidirectional channel to a UCI engine. */
export interface EngineTransport {
  /** Sends one UCI command. A trailing newline is not required. */
  send(command: string): void;
  /** Subscribes to engine output. Returns an unsubscribe function. */
  onLine(listener: (line: string) => void): () => void;
  /** Subscribes to fatal worker errors. Returns an unsubscribe function. */
  onError(listener: (error: string) => void): () => void;
  /** Kills the worker. The transport is unusable afterwards. */
  terminate(): void;
}

/**
 * Spawns the engine worker and wraps it in an {@link EngineTransport}.
 *
 * @throws If the environment has no Worker support.
 */
export function createEngineTransport(): EngineTransport {
  if (typeof Worker === 'undefined') {
    throw new Error('This browser does not support Web Workers.');
  }

  const worker = new Worker(resolveEngineUrl());
  const lineListeners = new Set<(line: string) => void>();
  const errorListeners = new Set<(error: string) => void>();

  worker.onmessage = (event: MessageEvent) => {
    // The engine emits strings; some builds also post progress objects, which
    // are not part of the UCI conversation and are ignored here.
    if (typeof event.data !== 'string') return;
    for (const line of event.data.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) lineListeners.forEach((listener) => listener(trimmed));
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    const message = event.message || 'The chess engine failed to load.';
    errorListeners.forEach((listener) => listener(message));
  };

  return {
    send(command: string) {
      worker.postMessage(command);
    },
    onLine(listener) {
      lineListeners.add(listener);
      return () => lineListeners.delete(listener);
    },
    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    terminate() {
      lineListeners.clear();
      errorListeners.clear();
      worker.terminate();
    },
  };
}

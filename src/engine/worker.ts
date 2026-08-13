/**
 * Owns the Web Worker a UCI engine runs in.
 *
 * The Stockfish WASM builds we ship *are* worker scripts: instantiating one with
 * `new Worker(url)` gives a UCI engine that speaks plain text over
 * `postMessage`. Keeping that detail behind this module means the rest of the
 * app only ever deals in UCI lines, and the analysis code never touches the DOM
 * or worker APIs — which is also what keeps the UI thread free while the engine
 * searches.
 */

/** The engine script shipped as the default, relative to the site root. */
export const DEFAULT_ENGINE_SCRIPT = 'stockfish/stockfish-18-lite-single.js';

/**
 * Resolves an engine script URL against the document base.
 *
 * Vite is configured with `base: './'`, so a build works from any subpath. The
 * WASM builds locate their own `.wasm` sibling by rewriting this script URL, so
 * it has to be a real absolute URL rather than a relative one.
 */
export function resolveEngineUrl(script: string = DEFAULT_ENGINE_SCRIPT): string {
  const base = typeof document !== 'undefined' ? document.baseURI : '/';
  return new URL(script, base).href;
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

/** Builds a transport. Engines are defined in terms of this, not of Workers. */
export type TransportFactory = () => EngineTransport;

/**
 * Spawns an engine worker and wraps it in an {@link EngineTransport}.
 *
 * @param script Path to the engine script, relative to the site root.
 * @throws If the environment has no Worker support.
 */
export function createEngineTransport(script: string = DEFAULT_ENGINE_SCRIPT): EngineTransport {
  if (typeof Worker === 'undefined') {
    throw new Error('This browser does not support Web Workers.');
  }

  const worker = new Worker(resolveEngineUrl(script));
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

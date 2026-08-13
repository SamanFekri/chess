import { UciEngine } from './uci';
import type {
  EngineAvailability,
  EngineCapabilities,
  EngineDefinition,
  EngineId,
  EngineLimits,
  EngineSettings,
} from './types';
import { createEngineTransport } from './worker';

/**
 * The engines the app can run.
 *
 * All three are free, open source, and run entirely in the browser — nothing
 * about a position ever leaves the device, which is the point of a coach that
 * costs nothing to host. They are the same Stockfish 18 in three builds, because
 * that is what a browser can actually offer: a compatibility build, a default,
 * and a faster one for browsers that allow it.
 *
 * Adding an engine means adding an entry here. Nothing else in the app knows
 * which engine it is talking to.
 */

/** The engine used when there is no saved choice, and the fallback on failure. */
export const DEFAULT_ENGINE_ID: EngineId = 'stockfish-18-lite-single';

/** Stockfish's own defaults, and the bounds it accepts. */
const STOCKFISH_LIMITS: EngineLimits = {
  depth: { min: 1, max: 30, step: 1, fallback: 16 },
  moveTimeMs: { min: 50, max: 10_000, step: 50, fallback: 1000 },
  multiPv: { min: 1, max: 5, step: 1, fallback: 3 },
  threads: { min: 1, max: 1, step: 1, fallback: 1 },
  // Small by default: this has to work on a phone as well as a desktop.
  hashMb: { min: 8, max: 256, step: 8, fallback: 32 },
};

/** Everything Stockfish supports, before build-specific restrictions. */
const STOCKFISH_CAPABILITIES: EngineCapabilities = {
  depth: true,
  moveTime: true,
  multiPv: true,
  threads: false,
  hash: true,
  strengthLimit: true,
};

/** Whether this browser can run WebAssembly at all. */
function webAssemblyAvailable(): EngineAvailability {
  return typeof WebAssembly === 'object'
    ? { ok: true }
    : { ok: false, reason: 'This browser has WebAssembly turned off or unavailable.' };
}

/**
 * Whether the page can use shared memory, which multi-threaded builds require.
 *
 * `crossOriginIsolated` is only true when the server sends COOP and COEP
 * headers. Static hosts like GitHub Pages cannot set headers at all, so this is
 * normally false there — hence the single-threaded default.
 */
function sharedMemoryAvailable(): EngineAvailability {
  if (typeof SharedArrayBuffer === 'undefined') {
    return { ok: false, reason: 'This browser does not allow shared memory (SharedArrayBuffer).' };
  }
  if (typeof globalThis.crossOriginIsolated === 'boolean' && !globalThis.crossOriginIsolated) {
    return {
      ok: false,
      reason:
        'Needs a server that sends cross-origin isolation headers. GitHub Pages cannot, so this build only runs on a self-hosted copy.',
    };
  }
  return { ok: true };
}

/** Builds a UCI engine definition around one worker script. */
function stockfishBuild(config: {
  id: EngineId;
  name: string;
  description: string;
  script: string;
  technology: string;
  downloadMb: number;
  strengthElo: number;
  threads?: { max: number };
  isAvailable: () => EngineAvailability;
}): EngineDefinition {
  const limits: EngineLimits = {
    ...STOCKFISH_LIMITS,
    threads: config.threads
      ? { min: 1, max: config.threads.max, step: 1, fallback: 2 }
      : STOCKFISH_LIMITS.threads,
  };

  const definition: EngineDefinition = {
    id: config.id,
    name: config.name,
    description: config.description,
    strengthElo: config.strengthElo,
    location: 'local',
    downloadMb: config.downloadMb,
    technology: config.technology,
    capabilities: { ...STOCKFISH_CAPABILITIES, threads: config.threads !== undefined },
    limits,
    isAvailable: config.isAvailable,
    create: (settings: EngineSettings) =>
      new UciEngine(definition, settings, () => createEngineTransport(config.script)),
  };

  return definition;
}

/** Every engine the app knows about, in the order the selector shows them. */
export const ENGINES: EngineDefinition[] = [
  stockfishBuild({
    id: DEFAULT_ENGINE_ID,
    name: 'Stockfish 18 Lite',
    description: 'Strong open-source engine. The best choice for accurate analysis on any device.',
    script: 'stockfish/stockfish-18-lite-single.js',
    technology: 'WebAssembly, single-threaded',
    downloadMb: 7,
    strengthElo: 3200,
    isAvailable: webAssemblyAvailable,
  }),

  stockfishBuild({
    id: 'stockfish-18-lite-mt',
    name: 'Stockfish 18 Lite (multi-core)',
    description: 'The same engine using several CPU cores — deeper analysis in the same time.',
    script: 'stockfish/stockfish-18-lite.js',
    technology: 'WebAssembly, multi-threaded',
    downloadMb: 7,
    strengthElo: 3200,
    // Capped rather than taken from the machine: every extra thread is another
    // worker holding its own memory, and this runs on phones too.
    threads: { max: 8 },
    isAvailable: () => {
      const wasm = webAssemblyAvailable();
      return wasm.ok ? sharedMemoryAvailable() : wasm;
    },
  }),

  stockfishBuild({
    id: 'stockfish-18-asm',
    name: 'Stockfish 18 (compatibility)',
    description:
      'Plain JavaScript build. Much slower, but it runs where WebAssembly is blocked — some locked-down browsers and corporate networks.',
    script: 'stockfish/stockfish-18-asm.js',
    technology: 'JavaScript (asm.js), single-threaded',
    downloadMb: 10,
    // The same engine, but slow enough at a fixed depth that it is not the same
    // opponent in practice.
    strengthElo: 2800,
    isAvailable: () => ({ ok: true }),
  }),
];

/** Looks up an engine, falling back to the default for an unknown id. */
export function engineById(id: EngineId): EngineDefinition {
  return ENGINES.find((engine) => engine.id === id) ?? defaultEngine();
}

/** The default engine definition. */
export function defaultEngine(): EngineDefinition {
  const found = ENGINES.find((engine) => engine.id === DEFAULT_ENGINE_ID);
  if (!found) throw new Error('The default engine is missing from the catalogue.');
  return found;
}

/** Settings an engine starts with, from its own declared defaults. */
export function defaultSettingsFor(definition: EngineDefinition): EngineSettings {
  return {
    // Null means "follow the coach-strength slider", which is what almost
    // everyone wants; the advanced panel is where that gets overridden.
    depth: null,
    moveTimeMs: null,
    multiPv: definition.limits.multiPv.fallback,
    threads: definition.limits.threads.fallback,
    hashMb: definition.limits.hashMb.fallback,
  };
}

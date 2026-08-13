import { DEFAULT_ENGINE_ID, defaultSettingsFor, engineById } from './catalogue';
import type { ChessEngine, EngineDefinition, EngineId, EngineSettings } from './types';
import { UciEngine } from './uci';

/**
 * Owns which engine is running.
 *
 * Exactly one engine instance is alive at a time. Starting one means fetching
 * and compiling several megabytes of WebAssembly, so the instance lives for the
 * whole session and is only torn down when the player picks a different engine —
 * at which point the old one is destroyed before the new one starts, rather than
 * leaving two engines resident on a phone.
 *
 * The rest of the app calls {@link activeEngine} and never constructs an engine
 * itself, which is what makes "the selected engine is used everywhere" a
 * property of the architecture rather than a thing to remember.
 */

/** What happened when a selection was applied. */
export interface EngineSwitchResult {
  /** The engine now in use — not always the one asked for. */
  definition: EngineDefinition;
  /** Set when the requested engine could not be used and this is a fallback. */
  fallbackReason: string | null;
}

let definition: EngineDefinition = engineById(DEFAULT_ENGINE_ID);
let settings: EngineSettings = defaultSettingsFor(definition);
let instance: ChessEngine | null = null;

/** Engines whose start-up failed this session, with the reason. */
const failed = new Map<EngineId, string>();

/** The engine currently selected. */
export function activeDefinition(): EngineDefinition {
  return definition;
}

/** The settings currently applied. */
export function activeSettings(): EngineSettings {
  return settings;
}

/** Why an engine refused to start earlier this session, if it did. */
export function failureFor(id: EngineId): string | null {
  return failed.get(id) ?? null;
}

/**
 * The live engine, created on first use.
 *
 * Never returns a half-configured engine: the instance is built with the current
 * settings, and settings changed later are pushed into it.
 */
export function activeEngine(): ChessEngine {
  instance ??= definition.create(settings);
  return instance;
}

/**
 * Selects an engine, replacing any running one.
 *
 * The switch happens whether or not the new engine has started: the old
 * instance is destroyed first, so a slow or broken engine cannot leave two
 * resident. Callers that want to know it works should `initialize()` afterwards
 * and use {@link fallBackToDefault} when that rejects.
 *
 * @returns The engine actually selected, and why, when it is not the one asked for.
 */
export function selectEngine(id: EngineId, next: EngineSettings = settings): EngineSwitchResult {
  const requested = engineById(id);
  const availability = requested.isAvailable();

  const chosen = availability.ok ? requested : engineById(DEFAULT_ENGINE_ID);
  const fallbackReason = availability.ok ? null : availability.reason;

  if (chosen.id === definition.id && instance) {
    // Same engine: keep it running and just apply the settings.
    applySettings(next);
    return { definition, fallbackReason };
  }

  destroyActive();
  definition = chosen;
  settings = clampSettings(next, chosen);
  return { definition, fallbackReason };
}

/**
 * Records that the current engine failed to start and switches to the default.
 *
 * @returns The engine now in use, or null when the default is the one that
 *          failed — in which case there is nothing left to fall back to and the
 *          caller has to surface the error.
 */
export function fallBackToDefault(error: string): EngineDefinition | null {
  failed.set(definition.id, error);
  if (definition.id === DEFAULT_ENGINE_ID) return null;

  destroyActive();
  definition = engineById(DEFAULT_ENGINE_ID);
  settings = clampSettings(settings, definition);
  return definition;
}

/** Applies new settings to the selection and to the running engine. */
export function applySettings(next: EngineSettings): EngineSettings {
  settings = clampSettings(next, definition);
  if (instance instanceof UciEngine) instance.updateSettings(settings);
  return settings;
}

/** Stops and frees the running engine, if any. */
export function destroyActive(): void {
  instance?.destroy();
  instance = null;
}

/**
 * Trims settings to what an engine actually accepts.
 *
 * Carried across a switch rather than reset, so a chosen depth survives moving
 * between engines — but a four-thread setting cannot follow you to a
 * single-threaded build, where it would be a protocol error.
 */
export function clampSettings(next: EngineSettings, target: EngineDefinition): EngineSettings {
  const { limits, capabilities } = target;
  const bound = (value: number, range: { min: number; max: number }) =>
    Math.min(range.max, Math.max(range.min, Math.round(value)));

  return {
    depth: next.depth === null ? null : bound(next.depth, limits.depth),
    moveTimeMs: next.moveTimeMs === null ? null : bound(next.moveTimeMs, limits.moveTimeMs),
    multiPv: capabilities.multiPv ? bound(next.multiPv, limits.multiPv) : 1,
    threads: capabilities.threads ? bound(next.threads, limits.threads) : limits.threads.fallback,
    hashMb: capabilities.hash ? bound(next.hashMb, limits.hashMb) : limits.hashMb.fallback,
  };
}

/**
 * Resets the module to a fresh state.
 *
 * For tests: the singleton is deliberately process-wide in the app.
 */
export function resetEngineManager(): void {
  destroyActive();
  failed.clear();
  definition = engineById(DEFAULT_ENGINE_ID);
  settings = defaultSettingsFor(definition);
}

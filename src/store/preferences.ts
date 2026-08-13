/**
 * Preferences that outlive a single game.
 *
 * The saved game is cleared whenever a fresh one starts from the standard
 * opening, so anything that must survive that — like having muted the app — is
 * stored separately rather than in the game snapshot.
 */

import type { TipLevel } from '../types';
import type { EngineSettings } from '../engine/types';

/** Same prefix as the rest of the app's storage, kept through the rename. */
const SOUND_KEY = 'ai-chess-coach:sound';
const TIP_LEVEL_KEY = 'ai-chess-coach:tips';
const ENGINE_KEY = 'ai-chess-coach:engine';
const EXPLAIN_KEY = 'ai-chess-coach:explain';

/** Whether sound is on. Defaults to on: the effects are the feature. */
export function loadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    // Storage unavailable (private browsing, blocked cookies) — sound still works.
    return true;
  }
}

/** Remembers the mute setting. Failures are ignored; sound is not worth breaking. */
export function saveSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
  } catch {
    /* Nothing to do. */
  }
}

/** Valid settings, so a hand-edited or stale entry cannot get into the store. */
const TIP_LEVELS: TipLevel[] = ['off', 'key', 'balanced', 'all'];

/**
 * How much unprompted advice the coach gives.
 *
 * Defaults to `balanced`: silent about plans, but it will still tell you when a
 * piece is about to fall off the board.
 */
export function loadTipLevel(): TipLevel {
  try {
    const stored = localStorage.getItem(TIP_LEVEL_KEY);
    return TIP_LEVELS.find((level) => level === stored) ?? 'balanced';
  } catch {
    return 'balanced';
  }
}

/** Remembers the advice setting. */
export function saveTipLevel(level: TipLevel): void {
  try {
    localStorage.setItem(TIP_LEVEL_KEY, level);
  } catch {
    /* Nothing to do. */
  }
}

/**
 * Whether the coach draws its reasoning on the board.
 *
 * Off by default: arrows over the pieces are a deliberate choice, not something
 * a first-time player should have to turn off before they can see the board.
 */
export function loadExplainMode(): boolean {
  try {
    return localStorage.getItem(EXPLAIN_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Remembers whether the board explanation is on. */
export function saveExplainMode(enabled: boolean): void {
  try {
    localStorage.setItem(EXPLAIN_KEY, enabled ? 'on' : 'off');
  } catch {
    /* Nothing to do. */
  }
}

/** The engine choice as it is stored: an id plus its settings. */
export interface StoredEngineChoice {
  id: string;
  settings: Partial<EngineSettings>;
}

/**
 * The engine the player last chose, or null for a first-time visitor.
 *
 * Nothing here is trusted: the id is looked up in the catalogue (an engine that
 * has since been removed falls back to the default) and every setting is
 * clamped to the chosen engine's limits before use.
 */
export function loadEngineChoice(): StoredEngineChoice | null {
  try {
    const raw = localStorage.getItem(ENGINE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredEngineChoice>;
    if (typeof parsed.id !== 'string' || !parsed.id) return null;

    const stored = (parsed.settings ?? {}) as Record<string, unknown>;
    const numeric = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;

    const settings: Partial<EngineSettings> = {};
    // `null` is meaningful for these two — it means "follow the sliders" — so it
    // has to survive the round trip as distinct from "not set".
    if (stored.depth === null) settings.depth = null;
    else if (numeric(stored.depth) !== undefined) settings.depth = numeric(stored.depth)!;
    if (stored.moveTimeMs === null) settings.moveTimeMs = null;
    else if (numeric(stored.moveTimeMs) !== undefined) settings.moveTimeMs = numeric(stored.moveTimeMs)!;
    if (numeric(stored.multiPv) !== undefined) settings.multiPv = numeric(stored.multiPv)!;
    if (numeric(stored.threads) !== undefined) settings.threads = numeric(stored.threads)!;
    if (numeric(stored.hashMb) !== undefined) settings.hashMb = numeric(stored.hashMb)!;

    return { id: parsed.id, settings };
  } catch {
    return null;
  }
}

/** Remembers the engine and its settings for the next visit. */
export function saveEngineChoice(id: string, settings: EngineSettings): void {
  try {
    localStorage.setItem(ENGINE_KEY, JSON.stringify({ id, settings }));
  } catch {
    /* Nothing to do. */
  }
}

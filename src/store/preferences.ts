/**
 * Preferences that outlive a single game.
 *
 * The saved game is cleared whenever a fresh one starts from the standard
 * opening, so anything that must survive that — like having muted the app — is
 * stored separately rather than in the game snapshot.
 */

import type { TipLevel } from '../types';

/** Same prefix as the rest of the app's storage, kept through the rename. */
const SOUND_KEY = 'ai-chess-coach:sound';
const TIP_LEVEL_KEY = 'ai-chess-coach:tips';

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

/**
 * Preferences that outlive a single game.
 *
 * The saved game is cleared whenever a fresh one starts from the standard
 * opening, so anything that must survive that — like having muted the app — is
 * stored separately rather than in the game snapshot.
 */

/** Same prefix as the rest of the app's storage, kept through the rename. */
const SOUND_KEY = 'ai-chess-coach:sound';

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

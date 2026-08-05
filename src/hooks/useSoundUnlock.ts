import { useEffect } from 'react';
import { primeAudio } from '../utils/sound';

/**
 * Starts the audio context on the first interaction with the page.
 *
 * Browsers refuse to let a page make noise before the user has touched it, and
 * Safari is strictest: a context created inside the handler that also plays the
 * sound can still miss. Opening it on the first `pointerdown` — before the drop
 * that plays the first move — means the sound is ready by the time it is needed.
 * One-shot: after the first gesture the context stays open for the session.
 */
export function useSoundUnlock() {
  useEffect(() => {
    const unlock = () => primeAudio();
    const options = { once: true, passive: true } as const;

    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, options);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
}

import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * True when the keystroke belongs to a text field.
 *
 * Inside the PGN box or the rating input, ⌘Z means "undo my typing" — taking it
 * back a chess move instead would be both wrong and destructive.
 */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Binds the takeback shortcuts: ⌘Z / Ctrl+Z to undo, ⇧⌘Z / Ctrl+Y to redo.
 *
 * These are the bindings every other application uses, so they need no
 * explaining. The eligibility rules live in the store's `undoMove` and
 * `redoMove`, so the shortcuts and the buttons cannot drift apart.
 */
export function useUndoShortcut(): void {
  const undoMove = useGameStore((state) => state.undoMove);
  const redoMove = useGameStore((state) => state.redoMove);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isTextEntry(event.target)) return;

      const key = event.key.toLowerCase();

      // ⇧⌘Z is the Apple convention for redo; Ctrl+Y is the Windows one. Both
      // are accepted everywhere rather than sniffing the platform.
      if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) {
        event.preventDefault();
        void redoMove();
        return;
      }

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        void undoMove();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoMove, redoMove]);
}

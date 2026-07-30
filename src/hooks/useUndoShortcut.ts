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
 * Binds ⌘Z / Ctrl+Z to taking back a move.
 *
 * Shift is excluded because ⇧⌘Z is redo by convention everywhere else, and
 * claiming it for a second undo would be surprising. The eligibility rules
 * themselves live in the store's `undoMove`, so the shortcut and the button
 * cannot drift apart.
 */
export function useUndoShortcut(): void {
  const undoMove = useGameStore((state) => state.undoMove);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'z') return;
      if (isTextEntry(event.target)) return;

      event.preventDefault();
      void undoMove();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoMove]);
}

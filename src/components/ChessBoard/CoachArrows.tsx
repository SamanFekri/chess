import { memo } from 'react';
import { useGameStore } from '../../store/gameStore';
import { BoardArrow } from './BoardArrow';
import { FILES } from './boardGeometry';
import { ROLE_STYLES } from './explainStyles';

/**
 * The arrows the app draws for you: the hint, and the coach's explanation.
 *
 * Drawn here rather than through the board library's own arrow support so that
 * every arrow in the app goes through one renderer — which is what lets a
 * knight's arrow bend the way the knight moves. Purely decorative, so it never
 * takes a pointer event.
 */
export const CoachArrows = memo(function CoachArrows({
  arrows,
}: {
  arrows: Array<{ from: string; to: string; color: string }>;
}) {
  const orientation = useGameStore((state) => state.boardOrientation);
  if (arrows.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${FILES} ${FILES}`}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      aria-hidden
    >
      {arrows.map((arrow) => (
        <BoardArrow
          key={`${arrow.from}${arrow.to}${arrow.color}`}
          from={arrow.from}
          to={arrow.to}
          color={arrow.color}
          orientation={orientation}
          opacity={0.95}
        />
      ))}
    </svg>
  );
});

/** The colour a role is drawn in, for callers assembling the list. */
export function roleColor(role: keyof typeof ROLE_STYLES): string {
  return ROLE_STYLES[role].arrow;
}

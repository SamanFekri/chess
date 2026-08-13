import type { PlayerColor } from '../../types';
import { centreOf, isKnightMove, knightCorner } from './boardGeometry';

/**
 * One arrow on the board.
 *
 * A knight's arrow bends: it runs two squares along the long axis and then turns
 * one square, because that is the move. A straight line from b1 to c3 draws a
 * path no knight can take, and to anyone still learning how the pieces move that
 * is not a stylistic choice — it is the arrow teaching the wrong thing.
 *
 * Everything else is a straight shaft with the head landing on the centre of the
 * target square.
 */

/** How far the head extends back down the shaft. */
const HEAD_LENGTH = 0.34;
/** Half the width of the head. */
const HEAD_HALF = 0.19;
/** Gap left at the tail so the arrow does not start on top of its own piece. */
const TAIL_GAP = 0.3;

export function BoardArrow({
  from,
  to,
  color,
  orientation,
  opacity = 0.85,
  width = 0.17,
}: {
  from: string;
  to: string;
  color: string;
  orientation: PlayerColor;
  opacity?: number;
  width?: number;
}) {
  const start = centreOf(from, orientation);
  const end = centreOf(to, orientation);
  if (start.x === end.x && start.y === end.y) return null;

  // The last leg decides where the head points; for a straight arrow that is the
  // whole arrow, and for a knight's it is the short leg after the turn.
  const corner = isKnightMove(from, to) ? knightCorner(from, to, orientation) : null;
  const legStart = corner ?? start;

  const dx = end.x - legStart.x;
  const dy = end.y - legStart.y;
  const legLength = Math.hypot(dx, dy);
  if (legLength === 0) return null;

  const ux = dx / legLength;
  const uy = dy / legLength;
  const neck = { x: end.x - ux * HEAD_LENGTH, y: end.y - uy * HEAD_LENGTH };

  // Pull the tail clear of the piece it leaves, along the first leg's direction.
  const first = corner ?? end;
  const tailDx = first.x - start.x;
  const tailDy = first.y - start.y;
  const tailLength = Math.hypot(tailDx, tailDy) || 1;
  const tail = {
    x: start.x + (tailDx / tailLength) * TAIL_GAP,
    y: start.y + (tailDy / tailLength) * TAIL_GAP,
  };

  const points = corner
    ? `${tail.x},${tail.y} ${corner.x},${corner.y} ${neck.x},${neck.y}`
    : `${tail.x},${tail.y} ${neck.x},${neck.y}`;

  return (
    <g opacity={opacity}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points={[
          `${end.x},${end.y}`,
          `${neck.x - uy * HEAD_HALF},${neck.y + ux * HEAD_HALF}`,
          `${neck.x + uy * HEAD_HALF},${neck.y - ux * HEAD_HALF}`,
        ].join(' ')}
        fill={color}
      />
    </g>
  );
}

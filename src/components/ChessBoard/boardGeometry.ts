import type { PlayerColor } from '../../types';

/**
 * Turning pixels into squares and squares into drawing coordinates.
 *
 * Every arrow on the board — the coach's, the hint, and the ones you draw — goes
 * through here, so they all sit on the same grid and bend the same way. Pure
 * functions with no React and no DOM beyond a rectangle, which is what makes the
 * whole mapping checkable outside a browser.
 */

/** A board is 8×8; the SVG overlays work in a 0–8 coordinate space. */
export const FILES = 8;

/** Square name for a point inside the board, or null when outside it. */
export function squareAt(
  x: number,
  y: number,
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  orientation: PlayerColor,
): string | null {
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;

  const column = Math.min(
    FILES - 1,
    Math.max(0, Math.floor(((x - rect.left) / rect.width) * FILES)),
  );
  const row = Math.min(FILES - 1, Math.max(0, Math.floor(((y - rect.top) / rect.height) * FILES)));

  // Row 0 is rank 8 for White at the bottom, and rank 1 when the board is flipped.
  const file = orientation === 'white' ? column : FILES - 1 - column;
  const rank = orientation === 'white' ? FILES - row : row + 1;
  return `${'abcdefgh'[file]}${rank}`;
}

/** Centre of a square in the 0–8 drawing space. */
export function centreOf(square: string, orientation: PlayerColor): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const column = orientation === 'white' ? file : FILES - 1 - file;
  const row = orientation === 'white' ? FILES - rank : rank - 1;
  return { x: column + 0.5, y: row + 0.5 };
}

/**
 * Whether a move is a knight's.
 *
 * Used to decide the shape of the arrow: a knight does not travel in a straight
 * line, and an arrow that says it does is drawing a move that cannot be played.
 */
export function isKnightMove(from: string, to: string): boolean {
  const dx = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
  const dy = Math.abs(Number(from[1]) - Number(to[1]));
  return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
}

/**
 * The corner a knight's arrow turns at: two squares along the long axis, then
 * one along the short one — the way the move is taught and the way every board
 * diagram draws it.
 */
export function knightCorner(
  from: string,
  to: string,
  orientation: PlayerColor,
): { x: number; y: number } {
  const start = centreOf(from, orientation);
  const end = centreOf(to, orientation);
  return Math.abs(end.x - start.x) > Math.abs(end.y - start.y)
    ? { x: end.x, y: start.y }
    : { x: start.x, y: end.y };
}

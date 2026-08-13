import type { DrawColor } from '../../types';

/**
 * The pens available when you draw on the board.
 *
 * Four, and no more: enough to separate "my plan" from "their threat" from "the
 * bit I am unsure about", few enough to sit in a row of swatches on a phone
 * without opening a menu. Bright and fully opaque, because these are drawn over
 * pieces on both light and dark squares.
 */
export const DRAW_COLORS: Array<{ id: DrawColor; name: string; value: string }> = [
  { id: 'green', name: 'Green', value: '#22c55e' },
  { id: 'red', name: 'Red', value: '#ef4444' },
  { id: 'blue', name: 'Blue', value: '#38bdf8' },
  { id: 'yellow', name: 'Yellow', value: '#facc15' },
];

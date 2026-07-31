import type { PieceSymbol } from 'chess.js';

/**
 * Chess piece glyphs for UI outside the board itself.
 *
 * Only the *solid* code points (U+265A–U+265F) are used, for both colours, with
 * the colour applied through CSS. The outline code points (U+2654–U+2659) are
 * unreliable: several platforms give them an emoji presentation, and some fonts
 * draw them filled — which makes a white pawn appear as a black one. Taking one
 * consistent shape and tinting it sidesteps the whole problem.
 *
 * The trailing U+FE0E is a variation selector requesting text rather than emoji
 * rendering, which stops the glyph turning into a colour emoji on its own.
 */
export const PIECE_GLYPH: Record<PieceSymbol, string> = {
  k: '♚︎',
  q: '♛︎',
  r: '♜︎',
  b: '♝︎',
  n: '♞︎',
  p: '♟︎',
};

/**
 * Tint classes for a tinted glyph.
 *
 * White pieces get a dark outline so they stay legible on a light background,
 * mirroring how the pieces look on the board.
 */
export const GLYPH_TINT: Record<'w' | 'b', string> = {
  w: 'text-white [text-shadow:0_0_1px_#0f172a,0_0_2px_#0f172a,0_1px_2px_rgba(2,6,23,0.45)]',
  b: 'text-slate-900 [text-shadow:0_1px_1px_rgba(255,255,255,0.25)]',
};

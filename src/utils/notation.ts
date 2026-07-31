import type { PieceSymbol } from 'chess.js';
import { PIECE_NAME } from './chess';

/**
 * Turns algebraic notation into a plain-English sentence.
 *
 * `Nf3` and `exd5` are opaque to anyone who has not been taught to read them,
 * and the move list is otherwise a wall of them. This is shown as a tooltip
 * rather than replacing the notation, so the notation itself stays learnable —
 * you see `Nf3`, you hover, and you find out it means the knight.
 */

/** Letters SAN uses for the pieces; anything else is a pawn. */
const SAN_PIECE: Record<string, PieceSymbol> = {
  K: 'k',
  Q: 'q',
  R: 'r',
  B: 'b',
  N: 'n',
};

/**
 * SAN grammar, in one expression.
 *
 * Groups: piece letter, disambiguation (file and/or rank), capture marker,
 * destination square, promotion piece, and the check/mate suffix.
 */
const SAN_PATTERN = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?([+#])?$/;

/** "the e-file" / "rank 4" — how a disambiguating character is read aloud. */
function describeOrigin(file?: string, rank?: string): string {
  if (file && rank) return ` on ${file}${rank}`;
  if (file) return ` on the ${file}-file`;
  if (rank) return ` on rank ${rank}`;
  return '';
}

/**
 * Explains one move in words.
 *
 * @param san Standard algebraic notation, e.g. `Nf3`, `exd5`, `O-O`, `Qxd8#`.
 * @returns A sentence, or null when the notation is not recognised.
 */
export function explainSan(san: string): string | null {
  const trimmed = san.trim();
  if (!trimmed) return null;

  // Castling is written as a special token rather than a destination square, so
  // it never matches the ordinary grammar.
  const castle = trimmed.replace(/[+#]$/, '');
  if (castle === 'O-O' || castle === '0-0') {
    return 'Castles kingside: the king moves two squares towards the h-file and the rook hops over it.';
  }
  if (castle === 'O-O-O' || castle === '0-0-0') {
    return 'Castles queenside: the king moves two squares towards the a-file and the rook hops over it.';
  }

  const match = SAN_PATTERN.exec(trimmed);
  if (!match) return null;

  const [, letter, file, rank, capture, destination, promotion, suffix] = match;
  const piece = letter ? SAN_PIECE[letter] : 'p';
  const name = PIECE_NAME[piece];
  const origin = describeOrigin(file, rank);

  // A pawn capture always names its starting file, which is what the leading
  // letter in `exd5` is — not a piece letter.
  const subject = letter
    ? `The ${name}${origin}`
    : capture
      ? `The ${file}-file pawn`
      : 'The pawn';

  let sentence = capture
    ? `${subject} captures on ${destination}`
    : `${subject} moves to ${destination}`;

  if (promotion) {
    sentence += ` and promotes to a ${PIECE_NAME[SAN_PIECE[promotion]]}`;
  }

  if (suffix === '#') sentence += ' — checkmate';
  else if (suffix === '+') sentence += ', giving check';

  return `${sentence}.`;
}

/**
 * A one-line reminder of how the notation works, for a legend.
 *
 * Deliberately short: the per-move tooltips do the teaching, and this only has
 * to make it obvious that the letters mean something.
 */
export const NOTATION_LEGEND = [
  'K king · Q queen · R rook · B bishop · N knight · no letter means a pawn',
  '× capture · + check · # checkmate · = promotion · O-O castles',
].join('\n');

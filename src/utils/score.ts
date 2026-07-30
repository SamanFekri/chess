import type { Color, Score } from '../types';

/**
 * Centipawn value used to stand in for a forced mate when a single number is
 * needed (bar geometry, sorting). Large enough to dominate any real evaluation,
 * small enough to keep arithmetic away from overflow.
 */
export const MATE_SCORE = 10_000;

/** Clamps `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Flips a score to the other side's point of view. Stockfish always reports
 * scores relative to the side to move, so this is how we move between
 * "mover's view" and "White's view".
 */
export function negate(score: Score): Score {
  return { type: score.type, value: -score.value } as Score;
}

/**
 * Converts a score to White's point of view.
 *
 * @param score Score as reported by the engine (relative to side to move).
 * @param turn  Side to move in the analysed position.
 */
export function toWhitePov(score: Score, turn: Color): Score {
  return turn === 'w' ? score : negate(score);
}

/** Collapses a score into a single comparable centipawn number. */
export function toCentipawns(score: Score): number {
  if (score.type === 'cp') return score.value;
  // Nearer mates are worth more, so subtract the distance.
  const magnitude = MATE_SCORE - Math.min(Math.abs(score.value), 100) * 10;
  return score.value >= 0 ? magnitude : -magnitude;
}

/**
 * Converts a centipawn evaluation into an expected-score percentage (0–100).
 *
 * Uses the logistic fit popularised by Lichess. Working in win percentage
 * rather than raw centipawns is what makes move classification behave sensibly:
 * losing 200 centipawns matters enormously at 0.00 and barely at all when you
 * are already up a rook.
 */
export function winPercent(centipawns: number): number {
  const capped = clamp(centipawns, -MATE_SCORE, MATE_SCORE);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * capped)) - 1);
}

/** Win percentage for a score, from the point of view that score is given in. */
export function scoreWinPercent(score: Score): number {
  if (score.type === 'mate') return score.value >= 0 ? 100 : 0;
  return winPercent(score.value);
}

/**
 * Formats a score the way chess sites do: `+1.24`, `−0.31`, `M4`, `−M2`.
 * The score is rendered as-is, so pass one already converted to the point of
 * view you want to display.
 */
export function formatScore(score: Score): string {
  if (score.type === 'mate') {
    const sign = score.value >= 0 ? '' : '−';
    return `${sign}M${Math.abs(score.value)}`;
  }
  const pawns = score.value / 100;
  const sign = pawns > 0 ? '+' : pawns < 0 ? '−' : '';
  return `${sign}${Math.abs(pawns).toFixed(2)}`;
}

/**
 * Fraction of the evaluation bar that White should occupy, in `[0.05, 0.95]`.
 * The clamp keeps a sliver of both colours visible so the bar never looks broken.
 */
export function evalBarFraction(whiteScore: Score | null): number {
  if (!whiteScore) return 0.5;
  if (whiteScore.type === 'mate') return whiteScore.value >= 0 ? 0.97 : 0.03;
  return clamp(winPercent(whiteScore.value) / 100, 0.03, 0.97);
}

/** Plain-English description of who stands better and by how much. */
export function describeAdvantage(whiteScore: Score | null): string {
  if (!whiteScore) return 'Position not yet evaluated.';

  if (whiteScore.type === 'mate') {
    const side = whiteScore.value >= 0 ? 'White' : 'Black';
    return `${side} has a forced mate in ${Math.abs(whiteScore.value)}.`;
  }

  const cp = whiteScore.value;
  const leader = cp > 0 ? 'White' : 'Black';
  const magnitude = Math.abs(cp);

  if (magnitude < 30) return 'The position is balanced.';
  if (magnitude < 90) return `${leader} is slightly better.`;
  if (magnitude < 200) return `${leader} is clearly better.`;
  if (magnitude < 500) return `${leader} has a winning advantage.`;
  return `${leader} is completely winning.`;
}

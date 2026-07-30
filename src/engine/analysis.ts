import type { Chess, Move } from 'chess.js';
import type {
  GameReview,
  MoveQuality,
  PlayedMove,
  PositionAnalysis,
  QualityStyle,
  Score,
  SideReview,
} from '../types';
import { identifyOpening } from '../utils/openings';
import { isSacrifice } from '../utils/chess';
import { clamp, negate, scoreWinPercent, toCentipawns } from '../utils/score';

/** Win-percentage loss boundaries between quality bands. */
const THRESHOLDS = {
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 18,
} as const;

/** How much better the top line must be for a move to count as "only move". */
const ONLY_MOVE_GAP = 12;

/** Everything needed to grade one played move. */
export interface ClassificationInput {
  /** Analysis of the position *before* the move; scores are the mover's view. */
  before: PositionAnalysis;
  /** Analysis of the position *after* the move; scores are the opponent's view. */
  after: PositionAnalysis;
  /** The move that was played. */
  move: Move;
  /** Board state before the move. */
  boardBefore: Chess;
  /** Board state after the move. */
  boardAfter: Chess;
  /** Whether the move kept the game in a known opening line. */
  isBook: boolean;
}

/** The verdict on one move, with the numbers behind it. */
export interface Classification {
  quality: MoveQuality;
  /** Centipawns given away, from the mover's point of view. Never negative. */
  centipawnLoss: number;
  /** Expected-score percentage given away. Never negative. */
  winLoss: number;
  /** Evaluation before the move, mover's point of view. */
  scoreBefore: Score;
  /** Evaluation after the move, mover's point of view. */
  scoreAfter: Score;
  /** Engine's preferred move in SAN, or null when unavailable. */
  bestSan: string | null;
  /** True when the played move was the engine's first choice. */
  playedBest: boolean;
  /** True when every alternative was significantly worse. */
  wasOnlyMove: boolean;
}

/**
 * Grades a move by comparing the evaluation before and after it.
 *
 * Both evaluations are normalised to the mover's point of view first — Stockfish
 * reports relative to the side to move, so the raw numbers describe opposite
 * sides and are not directly comparable.
 */
export function classifyMove(input: ClassificationInput): Classification {
  const { before, after, move, boardBefore, boardAfter, isBook } = input;

  const topBefore = before.lines[0];
  const topAfter = after.lines[0];

  const scoreBefore: Score = topBefore?.score ?? { type: 'cp', value: 0 };
  // `after` is scored for the opponent, who is now to move.
  const scoreAfter: Score = topAfter ? negate(topAfter.score) : { type: 'cp', value: 0 };

  const winBefore = scoreWinPercent(scoreBefore);
  const winAfter = scoreWinPercent(scoreAfter);
  const winLoss = Math.max(0, winBefore - winAfter);
  const centipawnLoss = Math.max(0, toCentipawns(scoreBefore) - toCentipawns(scoreAfter));

  const bestUci = before.bestMove ?? topBefore?.moves[0] ?? null;
  const bestSan = topBefore?.san[0] ?? null;
  const playedBest = bestUci !== null && bestUci === move.lan;

  const secondBest = before.lines[1];
  const wasOnlyMove =
    !!topBefore &&
    !!secondBest &&
    scoreWinPercent(topBefore.score) - scoreWinPercent(secondBest.score) >= ONLY_MOVE_GAP;

  const quality = gradeQuality({
    isBook,
    playedBest,
    wasOnlyMove,
    winLoss,
    winAfter,
    isSac: isSacrifice(boardBefore, move, boardAfter),
    deliversMate: boardAfter.isCheckmate(),
  });

  return {
    quality,
    centipawnLoss,
    winLoss,
    scoreBefore,
    scoreAfter,
    bestSan,
    playedBest,
    wasOnlyMove,
  };
}

/** Picks the quality label from the measured facts about a move. */
function gradeQuality(facts: {
  isBook: boolean;
  playedBest: boolean;
  wasOnlyMove: boolean;
  winLoss: number;
  winAfter: number;
  isSac: boolean;
  deliversMate: boolean;
}): MoveQuality {
  // Mate ends the argument, whatever the numbers say.
  if (facts.deliversMate) return facts.isSac ? 'brilliant' : 'best';

  // A sound sacrifice that keeps the position at least equal is the real
  // definition of brilliance: material goes down, evaluation does not.
  if (facts.playedBest && facts.isSac && facts.winAfter >= 45) return 'brilliant';

  // Finding the one move that holds the position is worth more than finding one
  // of several equally good moves.
  if (facts.playedBest && facts.wasOnlyMove) return 'great';

  if (facts.isBook) return 'book';
  if (facts.playedBest) return 'best';

  if (facts.winLoss < THRESHOLDS.excellent) return 'excellent';
  if (facts.winLoss < THRESHOLDS.good) return 'good';
  if (facts.winLoss < THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (facts.winLoss < THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}

/** Presentation metadata for every quality label. */
export const QUALITY_STYLES: Record<MoveQuality, QualityStyle> = {
  brilliant: {
    label: 'Brilliant',
    icon: '‼',
    text: 'text-teal-300',
    chip: 'bg-teal-500/15',
    border: 'border-teal-400/40',
    hex: '#2dd4bf',
  },
  great: {
    label: 'Great move',
    icon: '❗',
    text: 'text-sky-300',
    chip: 'bg-sky-500/15',
    border: 'border-sky-400/40',
    hex: '#38bdf8',
  },
  best: {
    label: 'Best move',
    icon: '★',
    text: 'text-emerald-300',
    chip: 'bg-emerald-500/15',
    border: 'border-emerald-400/40',
    hex: '#34d399',
  },
  excellent: {
    label: 'Excellent',
    icon: '✓',
    text: 'text-emerald-300',
    chip: 'bg-emerald-500/10',
    border: 'border-emerald-400/30',
    hex: '#10b981',
  },
  good: {
    label: 'Good',
    icon: '✓',
    text: 'text-slate-200',
    chip: 'bg-slate-500/15',
    border: 'border-slate-400/30',
    hex: '#94a3b8',
  },
  book: {
    label: 'Book',
    icon: '📖',
    text: 'text-indigo-300',
    chip: 'bg-indigo-500/15',
    border: 'border-indigo-400/30',
    hex: '#818cf8',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    icon: '⚠',
    text: 'text-amber-300',
    chip: 'bg-amber-500/15',
    border: 'border-amber-400/40',
    hex: '#fbbf24',
  },
  mistake: {
    label: 'Mistake',
    icon: '✖',
    text: 'text-orange-300',
    chip: 'bg-orange-500/15',
    border: 'border-orange-400/40',
    hex: '#fb923c',
  },
  blunder: {
    label: 'Blunder',
    icon: '⨯',
    text: 'text-red-300',
    chip: 'bg-red-500/15',
    border: 'border-red-400/40',
    hex: '#f87171',
  },
};

/** True for labels that should trigger "here is what to play instead" coaching. */
export function isMistakeLike(quality: MoveQuality | null): boolean {
  return quality === 'inaccuracy' || quality === 'mistake' || quality === 'blunder';
}

/**
 * Per-move accuracy percentage from the expected-score loss.
 *
 * Uses the exponential fit Lichess publishes, so the numbers land in the same
 * range players are used to seeing elsewhere.
 */
export function moveAccuracy(winLoss: number): number {
  return clamp(103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669, 0, 100);
}

/** An empty aggregate, used as the reduction seed. */
function emptySideReview(): SideReview {
  return {
    accuracy: 0,
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    averageCentipawnLoss: 0,
  };
}

/** Aggregates one side's moves into counts, accuracy and average loss. */
function summarise(moves: PlayedMove[]): SideReview {
  const review = emptySideReview();
  if (moves.length === 0) return review;

  let accuracySum = 0;
  let accuracyCount = 0;
  let lossSum = 0;
  let lossCount = 0;

  for (const move of moves) {
    if (move.quality) review[move.quality] += 1;

    if (move.centipawnLoss !== null) {
      lossSum += move.centipawnLoss;
      lossCount += 1;
      // Reconstruct the win-percentage loss from centipawns for the accuracy
      // curve; graded moves always carry a loss figure.
      accuracySum += moveAccuracy(centipawnsToWinLoss(move.centipawnLoss));
      accuracyCount += 1;
    }
  }

  review.accuracy = accuracyCount > 0 ? Math.round(accuracySum / accuracyCount) : 100;
  review.averageCentipawnLoss = lossCount > 0 ? Math.round(lossSum / lossCount) : 0;
  return review;
}

/**
 * Approximates win-percentage loss from a centipawn loss.
 *
 * The exact conversion needs the evaluation the loss happened at, which the
 * stored move does not keep. Anchoring at a balanced position is the neutral
 * choice and keeps the reported accuracy stable and monotonic.
 */
function centipawnsToWinLoss(centipawnLoss: number): number {
  return Math.abs(scoreWinPercent({ type: 'cp', value: 0 }) - scoreWinPercent({ type: 'cp', value: -centipawnLoss }));
}

/**
 * Builds the end-of-game report.
 *
 * @param moves       Every move played, in order, with its grade attached.
 * @param playerColor Which side the human played.
 */
export function buildReview(moves: PlayedMove[], playerColor: 'w' | 'b'): GameReview {
  const playerMoves = moves.filter((move) => move.color === playerColor);
  const engineMoves = moves.filter((move) => move.color !== playerColor);

  const player = summarise(playerMoves);
  const engine = summarise(engineMoves);
  const opening = identifyOpening(moves.map((move) => move.san));

  const keyMoments = playerMoves
    .filter((move) => isMistakeLike(move.quality))
    .sort((a, b) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
    .slice(0, 5)
    .map((move) => ({
      ply: move.ply,
      san: move.san,
      quality: move.quality as MoveQuality,
      summary: describeKeyMoment(move),
    }));

  return { player, engine, opening, advice: buildAdvice(player, playerMoves), keyMoments };
}

/** One-line description of why a move made the review list. */
function describeKeyMoment(move: PlayedMove): string {
  const moveNumber = Math.floor(move.ply / 2) + 1;
  const loss = move.centipawnLoss ?? 0;
  const pawns = (loss / 100).toFixed(1);

  if (loss >= 500) return `Move ${moveNumber}, ${move.san} — this threw away a winning position.`;
  if (loss >= 300) return `Move ${moveNumber}, ${move.san} — cost about ${pawns} pawns of material or position.`;
  return `Move ${moveNumber}, ${move.san} — a smaller slip worth roughly ${pawns} pawns.`;
}

/** Turns the aggregate numbers into ordered, actionable coaching advice. */
function buildAdvice(review: SideReview, moves: PlayedMove[]): string[] {
  const advice: string[] = [];

  if (review.blunder > 0) {
    advice.push(
      `You made ${review.blunder} blunder${review.blunder > 1 ? 's' : ''}. Before every move, check what your opponent's last move attacks — most blunders are pieces left where they can simply be taken.`,
    );
  }

  if (review.mistake >= 2) {
    advice.push(
      'Several moves cost real material. Slow down in sharp positions and count captures on both sides before committing.',
    );
  }

  if (review.inaccuracy >= 3 && review.blunder === 0) {
    advice.push(
      'Your moves were safe but often not the most useful. Ask "what is my worst-placed piece?" and improve that one.',
    );
  }

  const openingSlips = moves
    .slice(0, 20)
    .filter((move) => isMistakeLike(move.quality)).length;
  if (openingSlips >= 2) {
    advice.push(
      'The opening cost you the most. Aim for the basics: control the centre, develop knights and bishops, then castle early.',
    );
  }

  if (review.accuracy >= 90) {
    advice.push('Very accurate play overall — try a higher engine level to keep the challenge up.');
  } else if (review.accuracy >= 75) {
    advice.push('Solid accuracy. Your main gain now is converting good positions without letting the advantage slip.');
  }

  if (review.brilliant + review.great > 0) {
    advice.push(
      `You found ${review.brilliant + review.great} standout move${review.brilliant + review.great > 1 ? 's' : ''}. Keep looking for forcing ideas — that instinct is working.`,
    );
  }

  if (advice.length === 0) {
    advice.push('A clean game with no serious errors. Play a longer game at a higher level to find your next weakness.');
  }

  return advice;
}

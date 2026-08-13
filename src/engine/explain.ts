import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import type { Explanation, ExplainStep, PositionAnalysis, Score } from '../types';
import {
  findLoosePieces,
  kingSquare,
  materialPointDiff,
  newlyAttackedPieces,
  parseUci,
  PIECE_NAME,
  opposite,
} from '../utils/chess';
import { buildSuggestions } from './coach';

/**
 * Turns an engine analysis into something a teacher would say while pointing at
 * the board.
 *
 * The output is a *script*: an ordered list of short steps, each with one
 * sentence and the arrows and square marks that go with it. Revealing them one
 * at a time is the whole point — a board showing every arrow at once is a
 * diagram, and a diagram is what this is trying not to be. The order follows how
 * a coach actually talks: where you stand, what they are threatening, what to
 * play, what happens next, and what else was possible.
 *
 * Nothing here touches the engine or the DOM. It takes an analysis and returns
 * data, so the whole script can be checked without a browser.
 */

/**
 * The evaluation in the second person.
 *
 * `describeAdvantage` in `utils/score` says "White is clearly better", which is
 * right for a read-out and wrong for a teacher talking to one of the two players.
 *
 * @param score From the point of view of `scoreTurn`.
 */
function describeStanding(score: Score | null, scoreTurn: Color, playerColor: Color): string {
  if (!score) return 'The engine has not finished looking yet';

  // Flip to the player's point of view when the score belongs to the other side.
  const value = scoreTurn === playerColor ? score.value : -score.value;

  if (score.type === 'mate') {
    const moves = Math.abs(value);
    return value > 0
      ? `You have a forced mate in ${moves}`
      : `They have a forced mate in ${moves}, so every move matters`;
  }

  const magnitude = Math.abs(value);
  if (magnitude < 30) return 'The position is balanced';
  const leader = value > 0 ? 'You are' : 'They are';
  if (magnitude < 90) return `${leader} slightly better`;
  if (magnitude < 200) return `${leader} clearly better`;
  if (magnitude < 500) return `${leader} winning`;
  return `${leader} completely winning`;
}

/** How many plies of the main line are walked through, one step each. */
const CONTINUATION_PLIES = 3;

/** Threats worth interrupting for: a knight or better. */
const THREAT_THRESHOLD_CP = 300;

/** Builds one step, dropping empty visuals so a step is never blank. */
function step(
  id: string,
  text: string,
  visuals: Partial<Pick<ExplainStep, 'arrows' | 'marks'>> = {},
): ExplainStep {
  return { id, text, arrows: visuals.arrows ?? [], marks: visuals.marks ?? [] };
}

/** "your knight on f6" — how a piece is named when pointed at. */
function nameAt(board: Chess, square: Square, possessive: string): string {
  const piece = board.get(square);
  return piece ? `${possessive} ${PIECE_NAME[piece.type]} on ${square}` : `the piece on ${square}`;
}

/**
 * The opening step: where the game stands, in one sentence.
 *
 * Marks the king when it is the thing under pressure, because "you are worse"
 * means very little to a beginner without somewhere to look.
 */
function standingStep(
  board: Chess,
  playerColor: Color,
  analysis: PositionAnalysis | null,
): ExplainStep {
  const points = materialPointDiff(board, playerColor);
  const material =
    points === 0
      ? 'Material is level'
      : points > 0
        ? `You are ${points} point${points === 1 ? '' : 's'} of material up`
        : `You are ${-points} point${points === -1 ? '' : 's'} of material down`;

  const evaluation = describeStanding(
    analysis?.lines[0]?.score ?? null,
    analysis?.turn ?? board.turn(),
    playerColor,
  );

  const marks: ExplainStep['marks'] = [];
  if (board.inCheck() && board.turn() === playerColor) {
    const king = kingSquare(board, playerColor);
    if (king) marks.push({ square: king, role: 'threat', label: 'Your king is in check' });
  }

  return step('standing', `${material}. ${evaluation}.`, { marks });
}

/**
 * What the opponent is threatening — the step most players skip on their own.
 *
 * Draws an arrow from each attacker to the piece it can take, which is the
 * gesture a coach makes with a finger: "this takes this".
 */
function threatStep(board: Chess, playerColor: Color): ExplainStep | null {
  const enemy = opposite(playerColor);
  const loose = findLoosePieces(board, playerColor).filter(
    (piece) => piece.value >= THREAT_THRESHOLD_CP,
  );
  if (loose.length === 0) return null;

  const target = loose[0];
  const attackers = board.attackers(target.square, enemy);

  return step(
    'threat',
    `Careful — ${nameAt(board, target.square, 'your')} can be taken. ${
      target.undefended ? 'Nothing is defending it' : 'It is attacked by something cheaper'
    }, so deal with that before anything else.`,
    {
      arrows: attackers.slice(0, 2).map((from) => ({ from, to: target.square, role: 'threat' as const })),
      marks: [{ square: target.square, role: 'threat', label: 'Can be captured' }],
    },
  );
}

/** The recommended move, with the coach's own reason for it. */
function recommendationStep(
  board: Chess,
  suggestion: { san: string; uci: string; reason: string },
): ExplainStep {
  const from = suggestion.uci.slice(0, 2) as Square;
  const to = suggestion.uci.slice(2, 4) as Square;
  const piece = board.get(from);
  const mover = piece ? PIECE_NAME[piece.type] : 'piece';

  return step(
    'recommend',
    `I would play ${suggestion.san} — the ${mover} goes from ${from} to ${to}. It ${suggestion.reason.replace(/^It /, '').replace(/\.$/, '')}.`,
    {
      arrows: [{ from, to, role: 'recommended' }],
      marks: [
        { square: from, role: 'recommended' },
        { square: to, role: 'recommended', label: 'Play here' },
      ],
    },
  );
}

/**
 * What the recommended move actually threatens once it lands.
 *
 * Separated from the recommendation itself: "why this move" and "what it does to
 * them" are two different thoughts, and running them together is how coaching
 * text turns into a paragraph nobody reads.
 */
function payoffStep(board: Chess, uci: string, playerColor: Color): ExplainStep | null {
  const after = new Chess(board.fen());
  try {
    after.move(parseUci(uci));
  } catch {
    return null;
  }

  if (after.isCheckmate()) {
    return step('payoff', 'And that is checkmate — the game ends right there.', {
      marks: [
        { square: kingSquare(after, opposite(playerColor)) ?? (uci.slice(2, 4) as Square), role: 'recommended', label: 'Checkmate' },
      ],
    });
  }

  const won = newlyAttackedPieces(board, after, playerColor).filter(
    (piece) => !piece.defended || piece.value >= THREAT_THRESHOLD_CP,
  );
  if (won.length === 0) return null;

  const target = won[0];
  const to = uci.slice(2, 4) as Square;

  return step(
    'payoff',
    `That move also attacks ${nameAt(after, target.square, 'their')}${
      target.defended ? '' : ', and nothing is defending it'
    }. Watch what happens if they ignore it.`,
    {
      arrows: [{ from: to, to: target.square, role: 'idea' }],
      marks: [{ square: target.square, role: 'target', label: 'Under attack' }],
    },
  );
}

/**
 * The main line, one ply per step.
 *
 * Each step keeps the arrows already drawn and adds the next one, so the
 * sequence builds up on the board the way a coach lays out a variation instead
 * of showing the finished fan of arrows all at once.
 */
function continuationSteps(board: Chess, uciMoves: string[], playerColor: Color): ExplainStep[] {
  const replay = new Chess(board.fen());
  const arrows: ExplainStep['arrows'] = [];
  const steps: ExplainStep[] = [];

  for (const uci of uciMoves.slice(0, CONTINUATION_PLIES + 1)) {
    let move;
    try {
      move = replay.move(parseUci(uci));
    } catch {
      break;
    }

    const theirs = move.color !== playerColor;
    // The first ply is the recommendation itself, already covered above.
    if (steps.length === 0 && arrows.length === 0) {
      arrows.push({ from: move.from, to: move.to, role: 'recommended' });
      continue;
    }

    arrows.push({ from: move.from, to: move.to, role: theirs ? 'threat' : 'variation' });
    steps.push(
      step(
        `line-${steps.length}`,
        theirs
          ? `They would probably answer ${move.san}.`
          : `Then ${move.san}, and you are the one making the threats.`,
        {
          arrows: [...arrows],
          marks: [{ square: move.to, role: theirs ? 'threat' : 'variation' }],
        },
      ),
    );
  }

  return steps;
}

/** The runner-up move, so the recommendation is a choice and not an order. */
function alternativeStep(suggestion: { san: string; uci: string; reason: string }): ExplainStep {
  const from = suggestion.uci.slice(0, 2) as Square;
  const to = suggestion.uci.slice(2, 4) as Square;

  return step(
    'alternative',
    `${suggestion.san} is the other good option: it ${suggestion.reason.replace(/^It /, '').replace(/\.$/, '')}.`,
    {
      arrows: [{ from, to, role: 'idea' }],
      marks: [{ square: to, role: 'idea' }],
    },
  );
}

/**
 * A defensive move to look at when something is hanging.
 *
 * Only offered when the engine's own choice does not already deal with the
 * threat — otherwise the recommendation step has said it, and repeating it in
 * different words is how a coach loses a student's attention.
 */
function defenceStep(board: Chess, playerColor: Color, bestUci: string | null): ExplainStep | null {
  const loose = findLoosePieces(board, playerColor).filter(
    (piece) => piece.value >= THREAT_THRESHOLD_CP,
  );
  if (loose.length === 0) return null;

  const target = loose[0];
  if (bestUci && bestUci.slice(0, 2) === target.square) return null;

  // A square the piece can run to where it is not attacked at all.
  const escape = board
    .moves({ square: target.square, verbose: true })
    .find((move) => {
      const after = new Chess(board.fen());
      try {
        after.move({ from: move.from, to: move.to, promotion: move.promotion });
      } catch {
        return false;
      }
      return !after.isAttacked(move.to, opposite(playerColor));
    });

  if (!escape) return null;

  return step(
    'defence',
    `If you would rather play safe, ${escape.san} moves it somewhere it cannot be taken.`,
    {
      arrows: [{ from: escape.from, to: escape.to, role: 'defence' }],
      marks: [{ square: escape.to, role: 'defence', label: 'Safe square' }],
    },
  );
}

/**
 * Builds the full explanation for a position.
 *
 * @param fen         The position being explained.
 * @param playerColor The side the human is playing.
 * @param analysis    Engine analysis of that position, when it has arrived.
 * @returns A script, or null when there is nothing to explain (game over, no
 *          analysis yet, or not the player's move).
 */
export function buildExplanation(
  fen: string,
  playerColor: Color,
  analysis: PositionAnalysis | null,
): Explanation | null {
  const board = new Chess(fen);
  if (board.isGameOver()) return null;

  const suggestions = analysis ? buildSuggestions(fen, analysis, 2) : [];
  const steps: ExplainStep[] = [standingStep(board, playerColor, analysis)];

  const threat = threatStep(board, playerColor);
  if (threat) steps.push(threat);

  const best = suggestions[0];
  if (best) {
    steps.push(recommendationStep(board, best));

    const payoff = payoffStep(board, best.uci, playerColor);
    if (payoff) steps.push(payoff);

    steps.push(...continuationSteps(board, analysis?.lines[0]?.moves ?? [], playerColor));
  }

  const defence = defenceStep(board, playerColor, best?.uci ?? null);
  if (defence) steps.push(defence);

  if (suggestions[1]) steps.push(alternativeStep(suggestions[1]));

  // One step is a caption, not an explanation — the mode is not worth entering.
  if (steps.length < 2) return null;

  return {
    fen,
    title: best ? `Why ${best.san}` : 'What is going on here',
    steps,
  };
}

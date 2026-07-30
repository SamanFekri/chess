import { Chess } from 'chess.js';
import type { Color, Move, Square } from 'chess.js';
import type {
  CoachFeedback,
  Insight,
  MoveQuality,
  MoveSuggestion,
  PositionAnalysis,
} from '../types';
import {
  CENTER_SQUARES,
  PIECE_NAME,
  PIECE_VALUE,
  centerControl,
  colorName,
  developedPieces,
  findLoosePieces,
  kingSafety,
  materialBalance,
  mobility,
  newlyAttackedPieces,
  opposite,
  parseUci,
  pawnStructure,
  rankOf,
  squaresOf,
  withTurn,
} from '../utils/chess';
import { describeAdvantage, negate, scoreWinPercent, toWhitePov } from '../utils/score';
import { isMistakeLike, QUALITY_STYLES, type Classification } from './analysis';

/**
 * Turns engine numbers and board geometry into plain-English coaching.
 *
 * Nothing in here talks to Stockfish. It takes an evaluation as input and
 * explains it in the terms a learner can act on: what the move did, what it
 * threatens, what it left behind, and what to do next. Engine jargon
 * ("centipawns", "principal variation", "MultiPV") never reaches the user.
 */

/**
 * Whose move is being described. Clauses are written in the third person
 * singular ("develops the knight") so a single phrasing works for both sides;
 * only the possessives change.
 */
interface Voice {
  /** Possessive for the side that moved: `your` or `your opponent's`. */
  poss: string;
  /** Possessive for the other side. */
  oppPoss: string;
  /** Subject pronoun for consequences: `you` or `your opponent`. */
  subject: string;
}

const PLAYER_VOICE: Voice = { poss: 'your', oppPoss: "your opponent's", subject: 'you' };
const ENGINE_VOICE: Voice = { poss: "your opponent's", oppPoss: 'your', subject: 'your opponent' };

/** Adds "a" or "an" in front of a noun. */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/** Joins clauses into one sentence with proper commas and "and". */
function joinClauses(clauses: string[]): string {
  if (clauses.length === 0) return '';
  if (clauses.length === 1) return clauses[0];
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

/** Capitalises the first character of a string. */
function sentence(text: string): string {
  if (!text) return '';
  const withPeriod = /[.!?]$/.test(text) ? text : `${text}.`;
  return withPeriod.charAt(0).toUpperCase() + withPeriod.slice(1);
}

/** Total legal-move count of a side's bishops, rooks and queens, by square. */
function longRangeMobility(chess: Chess, color: Color): Map<Square, number> {
  const board = withTurn(chess, color);
  const result = new Map<Square, number>();
  if (!board) return result;

  for (const square of squaresOf(board, color)) {
    const piece = board.get(square)!;
    if (piece.type !== 'b' && piece.type !== 'r' && piece.type !== 'q') continue;
    result.set(square, board.moves({ square, verbose: true }).length);
  }
  return result;
}

/**
 * Detects a move that shuts in the mover's own long-range pieces.
 *
 * Compares each bishop, rook and queen that did not itself move; a meaningful
 * drop in its available squares means the new pawn or piece is standing in its
 * way. This is the "this blocks your bishop" observation learners need, and it
 * cannot be read off an evaluation number.
 */
function blockedOwnPieces(before: Chess, after: Chess, mover: Color, movedTo: Square): string[] {
  const beforeMobility = longRangeMobility(before, mover);
  const afterMobility = longRangeMobility(after, mover);
  const blocked: string[] = [];

  for (const [square, count] of beforeMobility) {
    if (square === movedTo) continue;
    const now = afterMobility.get(square);
    if (now === undefined) continue;
    if (count - now >= 2) {
      const piece = after.get(square);
      if (piece) blocked.push(PIECE_NAME[piece.type]);
    }
  }
  return [...new Set(blocked)];
}

/**
 * Describes what a move accomplishes, as a list of verb phrases.
 *
 * @returns `positive` clauses (things the move achieves) and `negative` clauses
 *          (weaknesses it creates), so the caller can pick a tone.
 */
function moveIdeas(
  before: Chess,
  move: Move,
  after: Chess,
  voice: Voice,
): { positive: string[]; negative: string[] } {
  const positive: string[] = [];
  const negative: string[] = [];
  const mover = move.color;
  const to = move.to as Square;
  const from = move.from as Square;
  const homeRank = mover === 'w' ? 1 : 8;

  if (after.isCheckmate()) {
    positive.push('delivers checkmate');
    return { positive, negative };
  }

  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    positive.push(`tucks ${voice.poss} king safely behind its own pawns`);
    positive.push('connects the rooks');
  }

  if (move.isPromotion()) {
    const promoted = move.promotion ? PIECE_NAME[move.promotion] : 'queen';
    positive.push(`promotes the pawn to ${article(promoted)}`);
  }

  if (move.captured) {
    const capturedName = PIECE_NAME[move.captured];
    const recapturable = after.attackers(to, opposite(mover)).length > 0;
    if (!recapturable) positive.push(`wins ${article(capturedName)} for free`);
    else if (PIECE_VALUE[move.captured] > PIECE_VALUE[move.piece]) {
      positive.push(`trades up, taking ${voice.oppPoss} ${capturedName}`);
    } else positive.push(`takes ${voice.oppPoss} ${capturedName}`);
  }

  if (after.isCheck()) positive.push(`puts ${voice.oppPoss} king in check`);

  // Development: a piece leaving the back rank for the first time.
  if (move.piece !== 'p' && move.piece !== 'k' && rankOf(from) === homeRank && rankOf(to) !== homeRank) {
    positive.push(`develops ${voice.poss} ${PIECE_NAME[move.piece]} into the game`);
  }

  // Central influence.
  const centerBefore = centerControl(before, mover);
  const centerAfter = centerControl(after, mover);
  if (CENTER_SQUARES.includes(to)) positive.push('occupies the centre');
  else if (centerAfter > centerBefore) positive.push('adds control over the centre');
  else if (centerAfter < centerBefore) negative.push('gives up some control of the centre');

  // Rook or queen landing on a file with no pawns.
  if (move.piece === 'r' || move.piece === 'q') {
    const { openFiles } = pawnStructure(after, mover);
    if (openFiles.includes(to[0])) {
      positive.push(`places ${voice.poss} ${PIECE_NAME[move.piece]} on the open ${to[0]}-file`);
    }
  }

  // New threats the move creates.
  const threats = newlyAttackedPieces(before, after, mover);
  const seriousThreats = threats.filter((t) => !t.defended || t.value > PIECE_VALUE[move.piece]);
  if (seriousThreats.length >= 2) {
    positive.push(
      `attacks two pieces at once — the ${PIECE_NAME[seriousThreats[0].type]} on ${seriousThreats[0].square} and the ${PIECE_NAME[seriousThreats[1].type]} on ${seriousThreats[1].square}`,
    );
  } else if (seriousThreats.length === 1) {
    positive.push(
      `threatens ${voice.oppPoss} ${PIECE_NAME[seriousThreats[0].type]} on ${seriousThreats[0].square}`,
    );
  }

  // King safety damage: pawns in front of the mover's own king.
  const safetyBefore = kingSafety(before, mover);
  const safetyAfter = kingSafety(after, mover);
  if (move.piece === 'p' && safetyAfter.shieldPawns < safetyBefore.shieldPawns) {
    negative.push(`opens up the pawns in front of ${voice.poss} own king`);
  }
  if (safetyAfter.attackers > safetyBefore.attackers + 1) {
    negative.push(`lets more enemy pieces near ${voice.poss} king`);
  }

  // Pieces the move shut in.
  const blocked = blockedOwnPieces(before, after, mover, to);
  if (blocked.length > 0) {
    negative.push(`blocks in ${voice.poss} own ${blocked.join(' and ')}`);
  }

  // The moved piece itself left loose.
  const loose = findLoosePieces(after, mover);
  const nowLoose = loose.find((piece) => piece.square === to);
  if (nowLoose) {
    negative.push(
      nowLoose.undefended
        ? `leaves the ${PIECE_NAME[nowLoose.type]} on ${to} undefended`
        : `leaves the ${PIECE_NAME[nowLoose.type]} on ${to} where a cheaper piece can take it`,
    );
  }

  // Other pieces left hanging by the move.
  const otherLoose = loose.filter((piece) => piece.square !== to && piece.value >= 300);
  if (otherLoose.length > 0) {
    negative.push(
      `leaves ${voice.poss} ${PIECE_NAME[otherLoose[0].type]} on ${otherLoose[0].square} unprotected`,
    );
  }

  // Passed pawn creation.
  const passedBefore = pawnStructure(before, mover).passed.length;
  const passedAfter = pawnStructure(after, mover).passed.length;
  if (passedAfter > passedBefore) positive.push('creates a passed pawn that can run for promotion');

  return { positive, negative };
}

/**
 * Explains what happens if the opponent gets to play their best reply.
 *
 * Walks the engine's own follow-up line and reports the concrete outcome —
 * a piece lost, a mate coming — rather than a number, because "you lose your
 * queen next move" is the part a learner can actually use.
 *
 * @param boardAfter Position after the move being criticised.
 * @param analysis   Analysis of `boardAfter` (scored for the side now to move).
 * @param mover      The side that just moved.
 */
function describeConsequence(
  boardAfter: Chess,
  analysis: PositionAnalysis,
  mover: Color,
  voice: Voice,
): string | null {
  const line = analysis.lines[0];
  if (!line || line.moves.length === 0) return null;

  const moverScore = negate(line.score);
  if (moverScore.type === 'mate') {
    if (moverScore.value < 0) {
      const inMoves = Math.abs(moverScore.value);
      return `${voice.subject} ${voice.subject === 'you' ? 'get' : 'gets'} checkmated in ${inMoves} move${inMoves === 1 ? '' : 's'}`;
    }
    return null;
  }

  const probe = new Chess(boardAfter.fen());
  const balanceBefore = materialBalance(probe, mover);
  const replies: Move[] = [];

  for (const uci of line.moves.slice(0, 4)) {
    try {
      replies.push(probe.move(parseUci(uci)));
    } catch {
      break;
    }
  }
  if (replies.length === 0) return null;

  const materialSwing = materialBalance(probe, mover) - balanceBefore;
  const firstReply = replies[0];

  // The single most useful case: the very next move just takes something.
  if (firstReply.captured && materialSwing <= -200) {
    const lost = PIECE_NAME[firstReply.captured];
    return `${voice.subject} ${voice.subject === 'you' ? 'lose' : 'loses'} ${voice.poss === 'your' ? 'your' : 'their'} ${lost} to ${firstReply.san}`;
  }

  if (probe.isCheckmate()) {
    return `${firstReply.san} leads to checkmate`;
  }

  if (materialSwing <= -300) {
    return `${voice.subject} ${voice.subject === 'you' ? 'end' : 'ends'} up losing material after ${firstReply.san}`;
  }

  if (materialSwing <= -100) {
    return `${firstReply.san} wins a pawn`;
  }

  const threats = newlyAttackedPieces(boardAfter, probe, opposite(mover));
  if (threats.length > 0 && threats[0].value >= 300) {
    return `${firstReply.san} comes with a strong attack on ${voice.poss === 'your' ? 'your' : 'their'} ${PIECE_NAME[threats[0].type]}`;
  }

  return null;
}

/** Builds the "play this instead" list from a MultiPV analysis. */
export function buildSuggestions(fen: string, analysis: PositionAnalysis, limit = 3): MoveSuggestion[] {
  const suggestions: MoveSuggestion[] = [];

  for (const line of analysis.lines.slice(0, limit)) {
    const uci = line.moves[0];
    if (!uci) continue;

    const board = new Chess(fen);
    let move: Move;
    try {
      move = board.move(parseUci(uci));
    } catch {
      continue;
    }

    const before = new Chess(fen);
    const { positive } = moveIdeas(before, move, board, PLAYER_VOICE);
    const reason =
      positive.length > 0
        ? sentence(joinClauses(positive.slice(0, 2)))
        : sentence('keeps the position solid and improves your worst-placed piece');

    suggestions.push({
      san: move.san,
      uci,
      score: line.score,
      reason,
      continuation: line.san.slice(1, 4),
    });
  }

  return suggestions;
}

/** Headline text for each verdict, in the spec's voice. */
const HEADLINES: Record<MoveQuality, string> = {
  brilliant: 'Brilliant move!',
  great: 'Great move.',
  best: 'Best move.',
  excellent: 'Excellent move.',
  good: 'Good move.',
  book: 'Book move.',
  inaccuracy: 'Inaccuracy.',
  mistake: 'Mistake.',
  blunder: 'Blunder.',
};

/** Arguments for {@link coachPlayerMove}. */
export interface PlayerMoveCoachingInput {
  ply: number;
  move: Move;
  boardBefore: Chess;
  boardAfter: Chess;
  classification: Classification;
  /** Analysis of the position before the move — the source of alternatives. */
  before: PositionAnalysis;
  /** Analysis of the position after the move — the source of consequences. */
  after: PositionAnalysis;
}

/**
 * Writes the coaching card for a move the human played.
 *
 * Good moves get told what they achieved; bad moves get the concrete
 * consequence plus up to three better options, each with its own reason.
 */
export function coachPlayerMove(input: PlayerMoveCoachingInput): CoachFeedback {
  const { move, boardBefore, boardAfter, classification, before, after } = input;
  const { quality } = classification;
  const ideas = moveIdeas(boardBefore, move, boardAfter, PLAYER_VOICE);
  const insights: Insight[] = [];

  const bad = isMistakeLike(quality);
  const parts: string[] = [];

  if (bad) {
    const consequence = describeConsequence(boardAfter, after, move.color, PLAYER_VOICE);
    if (consequence) parts.push(sentence(consequence));

    if (ideas.negative.length > 0) {
      parts.push(sentence(`This move ${joinClauses(ideas.negative.slice(0, 2))}`));
    }

    if (parts.length === 0 && classification.bestSan) {
      parts.push(
        sentence(
          `There was more on offer here — ${classification.bestSan} keeps up the pressure while this move lets the position slip`,
        ),
      );
    }
  } else {
    if (ideas.positive.length > 0) {
      parts.push(sentence(`This move ${joinClauses(ideas.positive.slice(0, 3))}`));
    } else {
      parts.push(sentence('A solid, safe move that keeps your position together'));
    }

    if (quality === 'brilliant') {
      parts.push('Giving up material for a bigger idea — this is the hardest kind of move to find.');
    } else if (quality === 'great' && classification.wasOnlyMove) {
      parts.push('This was the only move that held the position. Well spotted.');
    } else if (quality === 'book') {
      parts.push('A well-known opening move, played by strong players for good reason.');
    }

    // Even a good move can leave something behind; say so without undercutting it.
    if (ideas.negative.length > 0) {
      insights.push({
        kind: 'threat',
        tone: 'bad',
        text: sentence(`Keep an eye on this: the move ${ideas.negative[0]}`),
      });
    }
  }

  // A move that ends the game needs saying so, whatever else it did.
  if (boardAfter.isCheckmate()) {
    parts.push('That is checkmate — you won.');
  } else {
    const drawn = describeDrawnEnding(
      boardAfter,
      move.color,
      scoreWinPercent(classification.scoreBefore) >= 65,
    );
    if (drawn) parts.push(drawn);
  }

  // What the player should now watch for.
  const loose = findLoosePieces(boardAfter, move.color);
  for (const piece of loose.slice(0, 2)) {
    insights.push({
      kind: 'threat',
      tone: 'bad',
      text: `Your ${PIECE_NAME[piece.type]} on ${piece.square} ${piece.undefended ? 'has no defender' : 'can be taken by a cheaper piece'}.`,
    });
  }

  const suggestions = bad ? buildSuggestions(boardBefore.fen(), before) : [];

  return {
    ply: input.ply,
    by: 'player',
    san: move.san,
    quality,
    headline: `${QUALITY_STYLES[quality].icon} ${HEADLINES[quality]}`,
    body: parts.join(' '),
    insights,
    suggestions: suggestions.filter((s) => s.san !== move.san),
    centipawnLoss: classification.centipawnLoss,
    evalAfter: toWhitePov(classification.scoreAfter, move.color),
  };
}

/** Arguments for {@link coachEngineMove}. */
export interface EngineMoveCoachingInput {
  ply: number;
  move: Move;
  boardBefore: Chess;
  boardAfter: Chess;
  /** Analysis of the position after the engine moved — i.e. the player's turn. */
  after: PositionAnalysis;
}

/**
 * Writes the coaching card for the engine's move: why it played there, what it
 * threatens, and what the player has to deal with now.
 */
export function coachEngineMove(input: EngineMoveCoachingInput): CoachFeedback {
  const { move, boardBefore, boardAfter, after } = input;
  const player = opposite(move.color);
  const ideas = moveIdeas(boardBefore, move, boardAfter, ENGINE_VOICE);
  const insights: Insight[] = [];

  const parts: string[] = [];
  parts.push(
    ideas.positive.length > 0
      ? sentence(`Your opponent played ${move.san}, which ${joinClauses(ideas.positive.slice(0, 3))}`)
      : sentence(`Your opponent played ${move.san}, a quiet move that improves their position`),
  );

  if (boardAfter.isCheckmate()) {
    parts.push('That is checkmate — you lost this one.');
  } else if (boardAfter.isCheck()) {
    parts.push('You must deal with the check before anything else.');
  } else {
    // The engine only accepts a draw when it is not winning, so from the
    // player's side a stalemate here is a save rather than a squandered win.
    const drawn = describeDrawnEnding(boardAfter, move.color, false);
    if (drawn) parts.push(drawn);
  }

  // What the player now needs to watch out for.
  const playerLoose = findLoosePieces(boardAfter, player);
  if (playerLoose.length > 0) {
    const worst = playerLoose[0];
    insights.push({
      kind: 'threat',
      tone: 'bad',
      text: `Watch out: your ${PIECE_NAME[worst.type]} on ${worst.square} ${worst.undefended ? 'is undefended' : 'is attacked by something cheaper'}.`,
    });
  }

  // If the engine's move created a threat, spell out the target.
  const threats = newlyAttackedPieces(boardBefore, boardAfter, move.color);
  for (const threat of threats.slice(0, 2)) {
    if (threat.value < 300 && threat.defended) continue;
    insights.push({
      kind: 'tactic',
      tone: 'bad',
      text: `Your ${PIECE_NAME[threat.type]} on ${threat.square} is now under attack.`,
    });
  }

  const best = after.lines[0];
  if (best?.san[0]) {
    insights.push({
      kind: 'plan',
      tone: 'neutral',
      text: `A strong answer here is ${best.san[0]}.`,
    });
  }

  return {
    ply: input.ply,
    by: 'engine',
    san: move.san,
    quality: null,
    headline: `Opponent played ${move.san}`,
    body: parts.join(' '),
    insights,
    suggestions: [],
    centipawnLoss: null,
    evalAfter: best ? toWhitePov(best.score, boardAfter.turn()) : null,
  };
}

/** A hint: the best move plus the reason it is best. */
export interface Hint {
  suggestion: MoveSuggestion;
  explanation: string;
}

/**
 * Builds a hint for the position without playing anything.
 *
 * @param fen      Position the player is to move in.
 * @param analysis Analysis of that position.
 */
export function buildHint(fen: string, analysis: PositionAnalysis): Hint | null {
  const [suggestion] = buildSuggestions(fen, analysis, 1);
  if (!suggestion) return null;

  const board = new Chess(fen);
  const mover = board.turn();
  let move: Move;
  try {
    move = board.move(parseUci(suggestion.uci));
  } catch {
    return null;
  }

  const alternatives = analysis.lines.slice(1);
  const gap =
    alternatives.length > 0 && analysis.lines[0]
      ? scoreWinPercent(analysis.lines[0].score) - scoreWinPercent(alternatives[0].score)
      : 0;

  const extra: string[] = [];
  if (board.isCheckmate()) extra.push('It is checkmate straight away.');
  else if (gap >= 12) extra.push('Nothing else comes close here — this is the move.');
  else if (gap < 2) extra.push('Other reasonable moves exist, but this is the cleanest.');

  const loose = findLoosePieces(new Chess(fen), mover);
  if (loose.length > 0 && move.from !== loose[0].square) {
    extra.push(
      `Before you commit, note that your ${PIECE_NAME[loose[0].type]} on ${loose[0].square} still needs attention.`,
    );
  }

  return {
    suggestion,
    explanation: [suggestion.reason, ...extra].join(' '),
  };
}

/** The structured, always-visible read-out for the coaching sidebar. */
export interface PositionBriefing {
  /** Plain-English summary of who stands better. */
  evaluation: string;
  /** Engine's preferred move in SAN, or null. */
  bestMove: string | null;
  /** The one thing to focus on right now. */
  advice: string;
  strategic: string[];
  tactical: string[];
  kingSafety: string;
  activity: string;
  center: string;
  pawns: string;
  threats: string[];
  plans: string[];
}

/**
 * Describes the current position from the player's side of the board.
 *
 * Every field is written as advice rather than measurement, because a number
 * the player cannot act on teaches nothing.
 *
 * @param fen         Current position.
 * @param playerColor The human's colour.
 * @param analysis    Latest analysis of `fen`, if any.
 */
export function buildBriefing(
  fen: string,
  playerColor: Color,
  analysis: PositionAnalysis | null,
): PositionBriefing {
  const board = new Chess(fen);
  const enemy = opposite(playerColor);

  const whiteScore = analysis?.lines[0] ? toWhitePov(analysis.lines[0].score, board.turn()) : null;
  const ownSafety = kingSafety(board, playerColor);
  const enemySafety = kingSafety(board, enemy);
  const ownCenter = centerControl(board, playerColor);
  const enemyCenter = centerControl(board, enemy);
  const ownMobility = mobility(board, playerColor);
  const enemyMobility = mobility(board, enemy);
  const ownDeveloped = developedPieces(board, playerColor);
  const enemyDeveloped = developedPieces(board, enemy);
  const ownPawns = pawnStructure(board, playerColor);
  const material = materialBalance(board, playerColor);

  const threats: string[] = [];
  for (const piece of findLoosePieces(board, playerColor).slice(0, 3)) {
    threats.push(
      `Your ${PIECE_NAME[piece.type]} on ${piece.square} ${piece.undefended ? 'is undefended' : 'is attacked by a cheaper piece'}.`,
    );
  }
  if (board.turn() === playerColor && board.inCheck()) {
    threats.unshift('Your king is in check — you must respond to it this move.');
  }
  if (threats.length === 0) threats.push('Nothing of yours is hanging right now.');

  const tactical: string[] = [];
  const winnable = findLoosePieces(board, enemy);
  for (const piece of winnable.slice(0, 2)) {
    tactical.push(
      `Their ${PIECE_NAME[piece.type]} on ${piece.square} ${piece.undefended ? 'has no defender' : 'is worth attacking'} — look for a way to win it.`,
    );
  }
  if (enemySafety.shieldPawns <= 1 && enemySafety.square) {
    tactical.push(`Their king on ${enemySafety.square} has little pawn cover. Look for an attack.`);
  }
  if (tactical.length === 0) tactical.push('No immediate tactics — build up your position instead.');

  const strategic: string[] = [];
  if (ownDeveloped < 3) strategic.push('Get your knights and bishops off the back rank before starting anything.');
  if (ownCenter > enemyCenter) strategic.push('You control more of the centre. Use that space to push your pieces forward.');
  else if (ownCenter < enemyCenter) strategic.push('They own more of the centre. Challenge it with a pawn rather than retreating.');
  if (material >= 200) strategic.push('You are ahead on material — trade pieces to simplify toward a winning endgame.');
  else if (material <= -200) strategic.push('You are behind on material — avoid trades and keep pieces on to create chances.');
  if (ownPawns.passed.length > 0) strategic.push(`Your pawn on ${ownPawns.passed[0]} can run. Support it and push.`);
  if (strategic.length === 0) strategic.push('Improve your worst-placed piece — that is almost always the best plan.');

  const plans: string[] = [];
  if (!ownSafety.castled && ownSafety.square && ['e1', 'e8'].includes(ownSafety.square)) {
    plans.push('Castle to get your king out of the centre.');
  }
  if (ownDeveloped < 4) plans.push('Bring another piece into the game.');
  const rookFiles = ownPawns.openFiles;
  if (rookFiles.length > 0) plans.push(`Put a rook on the open ${rookFiles[0]}-file.`);
  if (ownMobility < enemyMobility - 6) plans.push('Your pieces are cramped — free them with a pawn break or a trade.');
  if (enemySafety.attackers >= 2) plans.push('You already have pieces near their king. Add one more attacker.');
  if (plans.length === 0) plans.push('Keep improving your pieces and wait for them to commit.');

  const bestMove = analysis?.lines[0]?.san[0] ?? null;
  const advice = buildLiveAdvice({
    board,
    playerColor,
    whiteScore: whiteScore ? scoreWinPercent(whiteScore) : null,
    threatCount: findLoosePieces(board, playerColor).length,
    ownDeveloped,
    castled: ownSafety.castled,
  });

  return {
    evaluation: describeAdvantage(whiteScore),
    bestMove,
    advice,
    strategic,
    tactical,
    kingSafety: describeKingSafety(ownSafety, enemySafety),
    activity: describeActivity(ownMobility, enemyMobility, ownDeveloped, enemyDeveloped),
    center: describeCenter(ownCenter, enemyCenter),
    pawns: describePawns(ownPawns),
    threats,
    plans,
  };
}

/** The single most important thing to do in the current position. */
function buildLiveAdvice(context: {
  board: Chess;
  playerColor: Color;
  whiteScore: number | null;
  threatCount: number;
  ownDeveloped: number;
  castled: boolean;
}): string {
  const { board, playerColor, threatCount, ownDeveloped, castled } = context;

  if (board.isGameOver()) return 'The game is over. Open the review to see how it went.';
  if (board.turn() !== playerColor) return 'Your opponent is thinking. Use the time to look for their threats.';
  if (board.inCheck()) return 'You are in check. Move the king, block, or capture the attacker.';
  if (threatCount > 0) return 'Something of yours can be taken. Deal with that before making plans.';
  if (ownDeveloped < 3) return 'Early game: develop a piece toward the centre.';
  if (!castled) return 'Your king is still in the middle. Castling is usually the most valuable move you have.';
  return 'Nothing is forced. Find your worst-placed piece and improve it.';
}

/** Compares both kings' safety in one sentence. */
function describeKingSafety(
  own: ReturnType<typeof kingSafety>,
  enemy: ReturnType<typeof kingSafety>,
): string {
  if (!own.square) return 'King position unknown.';

  const parts: string[] = [];
  if (own.shieldPawns >= 2 && own.attackers <= 1) parts.push('Your king is well covered.');
  else if (own.shieldPawns <= 1) parts.push(`Your king on ${own.square} is short of pawn cover.`);
  else parts.push(`Your king on ${own.square} is holding, but pieces are gathering nearby.`);

  if (own.attackers >= 3) parts.push('Several enemy pieces already reach squares next to it.');
  if (enemy.shieldPawns <= 1) parts.push('Their king is the more exposed of the two.');

  return parts.join(' ');
}

/** Compares piece activity in one sentence. */
function describeActivity(
  ownMobility: number,
  enemyMobility: number,
  ownDeveloped: number,
  enemyDeveloped: number,
): string {
  const diff = ownMobility - enemyMobility;
  const lead = ownDeveloped - enemyDeveloped;

  const activity =
    diff > 6
      ? 'Your pieces have far more squares to work with.'
      : diff < -6
        ? 'Your pieces are more cramped than theirs.'
        : 'Both sides have similar freedom of movement.';

  const development =
    lead > 1
      ? ' You are ahead in development — try to make it count before they catch up.'
      : lead < -1
        ? ' You are behind in development. Prioritise bringing pieces out.'
        : '';

  return `${activity}${development}`;
}

/** Describes control of the centre. */
function describeCenter(own: number, enemy: number): string {
  if (own === enemy) return `Central control is even (${own}–${enemy} of the four key squares).`;
  return own > enemy
    ? `You control the centre ${own}–${enemy}. Space is on your side.`
    : `They control the centre ${enemy}–${own}. Challenge it with a pawn.`;
}

/** Describes the player's pawn structure. */
function describePawns(structure: ReturnType<typeof pawnStructure>): string {
  const notes: string[] = [];
  if (structure.passed.length > 0) {
    notes.push(`You have a passed pawn on ${structure.passed.join(', ')} — a long-term asset.`);
  }
  if (structure.doubled.length > 0) {
    notes.push(`Doubled pawns on the ${structure.doubled.join(' and ')} file${structure.doubled.length > 1 ? 's' : ''}.`);
  }
  if (structure.isolated.length > 0) {
    notes.push(`Isolated pawn${structure.isolated.length > 1 ? 's' : ''} on the ${structure.isolated.join(' and ')} file${structure.isolated.length > 1 ? 's' : ''} — they need piece support.`);
  }
  if (notes.length === 0) notes.push('Your pawn structure is sound with no weaknesses to defend.');
  return notes.join(' ');
}

/**
 * The teaching point when a move ends the game in a draw.
 *
 * Stalemate is the one every learner runs into: a winning position thrown away
 * by taking every square from a king that was never in check. Saying "draw by
 * stalemate" without saying *why* teaches nothing, so the wording depends on who
 * it helped.
 *
 * @param board       Position after the move.
 * @param mover       Side that just moved.
 * @param moverWasWinning Whether the mover stood better beforehand.
 */
export function describeDrawnEnding(
  board: Chess,
  mover: Color,
  moverWasWinning: boolean,
): string | null {
  if (board.isStalemate()) {
    const victim = colorName(opposite(mover));
    if (moverWasWinning) {
      return `That is stalemate — ${victim} has no legal move and is not in check, so the game is a draw instead of a win. When you are winning, always leave the enemy king one square, or give check.`;
    }
    return `That is stalemate — ${victim} has no legal move and is not in check, so the game is a draw. A useful escape when you are worse.`;
  }

  if (board.isInsufficientMaterial()) {
    return 'That is a draw — neither side has enough material left to force checkmate.';
  }
  if (board.isThreefoldRepetition()) {
    return 'That is a draw by repetition — the same position has now appeared three times.';
  }
  if (board.isDrawByFiftyMoves()) {
    return 'That is a draw — fifty moves have passed with no capture and no pawn move.';
  }
  return null;
}

/** Describes how the game ended, in plain English. */
export function describeGameEnd(board: Chess, playerColor: Color): string {
  if (board.isCheckmate()) {
    const loser = board.turn();
    return loser === playerColor
      ? 'Checkmate — you lost this one. Check the review for where it turned.'
      : 'Checkmate — you won. Nicely done.';
  }
  if (board.isStalemate()) return 'Stalemate. No legal moves left, so the game is a draw.';
  if (board.isInsufficientMaterial()) return 'Draw — neither side has enough material to checkmate.';
  if (board.isThreefoldRepetition()) return 'Draw by repetition — the same position appeared three times.';
  if (board.isDrawByFiftyMoves()) return 'Draw — fifty moves passed with no capture or pawn move.';
  if (board.isDraw()) return 'The game is a draw.';
  return `${colorName(board.turn())} is to move.`;
}

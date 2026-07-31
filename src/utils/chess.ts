import { Chess } from 'chess.js';
import type { Color, Move, PieceSymbol, Square } from 'chess.js';

/** Standard relative piece values in centipawns. The king is priceless. */
export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

/**
 * The conventional teaching values, for the material count shown to the player.
 *
 * Kept separate from {@link PIECE_VALUE}: the engine-style 320/330 split between
 * knight and bishop is right for evaluation but produces figures like "+3.3" in a
 * material readout, where every chess player expects whole numbers.
 */
export const PIECE_POINTS: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/** Human-readable piece names, for prose. */
export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** The four squares that define control of the centre. */
export const CENTER_SQUARES: Square[] = ['d4', 'e4', 'd5', 'e5'];

/** The centre plus the ring around it — the "extended centre". */
export const EXTENDED_CENTER: Square[] = [
  'c3', 'd3', 'e3', 'f3',
  'c4', 'd4', 'e4', 'f4',
  'c5', 'd5', 'e5', 'f5',
  'c6', 'd6', 'e6', 'f6',
];

/** Full name of a colour, for prose. */
export function colorName(color: Color): 'White' | 'Black' {
  return color === 'w' ? 'White' : 'Black';
}

/** The opposing colour. */
export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

/** File letter of a square, e.g. `e` for `e4`. */
export function fileOf(square: Square): string {
  return square[0];
}

/** Rank number of a square, e.g. `4` for `e4`. */
export function rankOf(square: Square): number {
  return Number(square[1]);
}

/**
 * Builds a position identical to `chess` but with the given side to move.
 *
 * Needed because chess.js only generates moves for the side to move, and the
 * coach wants to reason about both sides' options in the same position (for
 * mobility comparisons and for spotting the opponent's threats). Returns null
 * if the resulting position is illegal — for example when flipping the turn
 * would leave a king in check.
 */
export function withTurn(chess: Chess, turn: Color): Chess | null {
  const parts = chess.fen().split(' ');
  parts[1] = turn;
  // A side-to-move flip invalidates any en-passant target.
  parts[3] = '-';
  try {
    const flipped = new Chess(parts.join(' '));
    // A position where the side *not* to move is in check is unreachable, and
    // chess.js will happily generate nonsense moves from it.
    const enemyKing = kingSquare(flipped, opposite(turn));
    if (!enemyKing) return null;
    return flipped.isAttacked(enemyKing, turn) ? null : flipped;
  } catch {
    return null;
  }
}

/** Square the given side's king stands on, or null if absent. */
export function kingSquare(chess: Chess, color: Color): Square | null {
  const found = chess.findPiece({ type: 'k', color });
  return found.length > 0 ? found[0] : null;
}

/** Total centipawn material for a side, pawns included, king excluded. */
export function materialFor(chess: Chess, color: Color): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) total += PIECE_VALUE[cell.type];
    }
  }
  return total;
}

/** Material balance in centipawns from `color`'s point of view. */
export function materialBalance(chess: Chess, color: Color): number {
  return materialFor(chess, color) - materialFor(chess, opposite(color));
}

/**
 * Material difference in conventional points from `color`'s point of view.
 *
 * Positive means `color` is ahead. This counts what is on the board rather than
 * replaying captures, so it stays correct for a game imported from a FEN, where
 * there is no capture history to add up.
 */
export function materialPointDiff(chess: Chess, color: Color): number {
  let diff = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      diff += cell.color === color ? PIECE_POINTS[cell.type] : -PIECE_POINTS[cell.type];
    }
  }
  return diff;
}

/** Every occupied square belonging to a side. */
export function squaresOf(chess: Chess, color: Color): Square[] {
  const squares: Square[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) squares.push(cell.square);
    }
  }
  return squares;
}

/** A piece that can be captured for free, or won by a favourable trade. */
export interface HangingPiece {
  square: Square;
  type: PieceSymbol;
  /** Centipawn value of the piece itself. */
  value: number;
  /** True when nothing defends it at all. */
  undefended: boolean;
  /** Value of the cheapest attacker, or null when none. */
  cheapestAttacker: number | null;
}

/**
 * Values of the pieces attacking a square, in centipawns.
 *
 * A king is dropped from the list whenever the square is defended, because a
 * king may not legally capture into a defended square. Without this the king's
 * zero material value would make it look like the cheapest possible attacker of
 * everything, and every defended piece standing next to the enemy king would be
 * reported as loose.
 */
function attackerValues(
  chess: Chess,
  square: Square,
  attackedBy: Color,
  isDefended: boolean,
): number[] {
  return chess
    .attackers(square, attackedBy)
    .map((from) => chess.get(from)!.type)
    .filter((type) => !(type === 'k' && isDefended))
    .map((type) => PIECE_VALUE[type]);
}

/**
 * Reports whether the piece standing on `square` can be profitably taken.
 *
 * A static exchange approximation, not a search: the piece is at risk when it is
 * attacked and either undefended, or attacked by something cheaper than itself.
 * That catches the overwhelming majority of the "you just left your knight
 * there" situations a learner needs pointed out.
 *
 * @returns The risk, or null when the square is empty, holds a king, or is safe.
 */
export function pieceAtRisk(chess: Chess, square: Square): HangingPiece | null {
  const piece = chess.get(square);
  if (!piece || piece.type === 'k') return null;

  const enemy = opposite(piece.color);
  const defenders = chess.attackers(square, piece.color);
  const isDefended = defenders.length > 0;
  const values = attackerValues(chess, square, enemy, isDefended);
  if (values.length === 0) return null;

  const cheapestAttacker = Math.min(...values);
  const value = PIECE_VALUE[piece.type];

  // Free piece, or a trade the opponent wins material on.
  if (isDefended && cheapestAttacker >= value) return null;

  return {
    square,
    type: piece.type,
    value,
    undefended: !isDefended,
    cheapestAttacker,
  };
}

/** Finds every piece of `color` that the opponent can profitably take. */
export function findLoosePieces(chess: Chess, color: Color): HangingPiece[] {
  return squaresOf(chess, color)
    .map((square) => pieceAtRisk(chess, square))
    .filter((risk): risk is HangingPiece => risk !== null)
    .sort((a, b) => b.value - a.value);
}

/**
 * Material the opponent wins on each square of `color`, in centipawns.
 *
 * The same static exchange rule as {@link pieceAtRisk}: an undefended piece
 * costs its full value, a defended one costs the difference against its
 * cheapest attacker.
 */
function riskBySquare(chess: Chess, color: Color): Map<Square, number> {
  const map = new Map<Square, number>();
  for (const risk of findLoosePieces(chess, color)) {
    map.set(risk.square, risk.undefended ? risk.value : risk.value - (risk.cheapestAttacker ?? 0));
  }
  return map;
}

/** Cheapest capture of `square` available to `color`, or null. */
function cheapestCaptureOf(chess: Chess, square: Square, color: Color): Move | null {
  if (chess.turn() !== color) return null;

  let best: Move | null = null;
  for (const move of chess.moves({ verbose: true })) {
    if (move.to !== square || !move.captured) continue;
    if (!best || PIECE_VALUE[move.piece] < PIECE_VALUE[best.piece]) best = move;
  }
  return best;
}

/**
 * Why a destination square is dangerous.
 *
 * Two different mistakes, which is why they are drawn differently on the board:
 * `moved-piece` is "they can take the thing you just moved", `exposed-piece` is
 * "they can take something else, because moving stopped defending it or opened
 * a line to it". The second is the one beginners never see coming.
 */
export type DangerKind = 'moved-piece' | 'exposed-piece';

/** A destination square that loses material, and what it loses. */
export interface DangerWarning {
  /** The destination this warning is attached to. */
  square: Square;
  kind: DangerKind;
  /** Where the piece that would be lost stands after the move. */
  victim: Square;
  victimType: PieceSymbol;
  /** Material lost in centipawns, after the best exchange. */
  loss: number;
}

/**
 * The worst piece left hanging *elsewhere* by a move — removed defenders and
 * discovered attacks.
 *
 * Only risk the move actually created counts: a piece that was already loose
 * before is not this move's fault, and blaming every move for it would make the
 * board a wall of warnings.
 *
 * @param swing Material the move itself won, which the loss has to beat before
 *   the move is worth calling dangerous.
 */
function worstExposure(
  after: Chess,
  mover: Color,
  target: Square,
  riskBefore: Map<Square, number>,
  swing: number,
): Omit<DangerWarning, 'square'> | null {
  // Giving check does not hand the opponent a free move elsewhere — they have to
  // answer it first — so a static read of the position would cry wolf here.
  if (after.inCheck()) return null;

  let worst: Omit<DangerWarning, 'square'> | null = null;

  for (const [square, gain] of riskBySquare(after, mover)) {
    // The piece that moved is the other kind of warning, handled separately.
    if (square === target) continue;
    if (gain <= (riskBefore.get(square) ?? 0)) continue;

    const loss = gain - swing;
    if (loss <= 0) continue;

    if (!worst || loss > worst.loss) {
      worst = { kind: 'exposed-piece', victim: square, victimType: after.get(square)!.type, loss };
    }
  }

  return worst;
}

/**
 * For each square the piece on `from` could move to, whether moving there would
 * actually lose material — and which piece it would cost.
 *
 * Each candidate is played on a throwaway board and then read two ways. First
 * the piece that moved: the cheapest enemy capture of that square and the
 * cheapest recapture are played on top, a short static exchange. Then everything
 * else, via {@link worstExposure}, which is what catches moving the knight that
 * was the only defender of your rook.
 *
 * Both comparisons are against the material balance *before* the move, which is
 * what stops winning captures being painted as dangerous: taking a defended
 * queen with a knight leaves the knight capturable, but the exchange is still
 * winning, and flagging it would teach exactly the wrong lesson.
 *
 * Only cheapest captures are considered rather than a full search, which keeps a
 * click on a piece to a handful of board clones.
 *
 * @returns Destination squares that lose material, keyed by square.
 */
export function riskyDestinations(chess: Chess, from: Square): Map<Square, DangerWarning> {
  const warnings = new Map<Square, DangerWarning>();
  const fen = chess.fen();
  const piece = chess.get(from);
  if (!piece) return warnings;

  const mover = piece.color;
  const enemy = opposite(mover);
  const baseline = materialBalance(chess, mover);
  const riskBefore = riskBySquare(chess, mover);

  for (const move of chess.moves({ square: from, verbose: true })) {
    const target = move.to as Square;

    const after = new Chess(fen);
    try {
      after.move({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}),
      });
    } catch {
      continue;
    }

    // What the move itself wins: a capture, or the extra material of a promotion.
    const swing = materialBalance(after, mover) - baseline;
    let worst: DangerWarning | null = null;

    const probe = new Chess(after.fen());
    // Nothing can take it: safe, whatever it is standing next to.
    const capture = cheapestCaptureOf(probe, target, enemy);
    if (capture) {
      probe.move({
        from: capture.from,
        to: capture.to,
        ...(capture.promotion ? { promotion: capture.promotion } : {}),
      });

      // Take back if that helps — a defended piece is only lost for real when
      // the recapture still leaves you down.
      const recapture = cheapestCaptureOf(probe, target, mover);
      if (recapture) {
        probe.move({
          from: recapture.from,
          to: recapture.to,
          ...(recapture.promotion ? { promotion: recapture.promotion } : {}),
        });
      }

      const loss = baseline - materialBalance(probe, mover);
      if (loss > 0) {
        worst = {
          square: target,
          kind: 'moved-piece',
          victim: target,
          victimType: move.promotion ?? piece.type,
          loss,
        };
      }
    }

    // The bigger of the two losses wins the square: if moving here drops a rook
    // as well as the knight, the rook is the reason to look somewhere else.
    const exposure = worstExposure(after, mover, target, riskBefore, swing);
    if (exposure && (!worst || exposure.loss > worst.loss)) {
      worst = { square: target, ...exposure };
    }

    if (worst) warnings.set(target, worst);
  }

  return warnings;
}

/** How many of the four central squares a side attacks or occupies. */
export function centerControl(chess: Chess, color: Color): number {
  let count = 0;
  for (const square of CENTER_SQUARES) {
    const occupant = chess.get(square);
    if (occupant?.color === color) count += 1;
    else if (chess.isAttacked(square, color)) count += 1;
  }
  return count;
}

/** Number of legal moves available to a side — a crude but useful activity proxy. */
export function mobility(chess: Chess, color: Color): number {
  if (chess.turn() === color) return chess.moves().length;
  const flipped = withTurn(chess, color);
  return flipped ? flipped.moves().length : 0;
}

/** Minor and major pieces that have left their starting rank. */
export function developedPieces(chess: Chess, color: Color): number {
  const homeRank = color === 'w' ? 1 : 8;
  let developed = 0;
  for (const square of squaresOf(chess, color)) {
    const piece = chess.get(square)!;
    if (piece.type === 'p' || piece.type === 'k') continue;
    if (rankOf(square) !== homeRank) developed += 1;
  }
  return developed;
}

/** Pawn-structure summary for one side. */
export interface PawnStructure {
  doubled: string[];
  isolated: string[];
  passed: Square[];
  /** Files with no pawns of either colour. */
  openFiles: string[];
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Classifies a side's pawns into doubled, isolated and passed groups. */
export function pawnStructure(chess: Chess, color: Color): PawnStructure {
  const own = new Map<string, number[]>();
  const enemyPawns = new Map<string, number[]>();

  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.type !== 'p') continue;
      const bucket = cell.color === color ? own : enemyPawns;
      const file = fileOf(cell.square);
      bucket.set(file, [...(bucket.get(file) ?? []), rankOf(cell.square)]);
    }
  }

  const doubled: string[] = [];
  const isolated: string[] = [];
  const passed: Square[] = [];
  const openFiles: string[] = [];

  for (const file of FILES) {
    const ranks = own.get(file) ?? [];
    if (ranks.length > 1) doubled.push(file);

    const fileIndex = FILES.indexOf(file);
    const neighbours = [FILES[fileIndex - 1], FILES[fileIndex + 1]].filter(Boolean);
    if (ranks.length > 0 && neighbours.every((n) => (own.get(n) ?? []).length === 0)) {
      isolated.push(file);
    }

    if (ranks.length === 0 && (enemyPawns.get(file) ?? []).length === 0) {
      openFiles.push(file);
    }

    // A pawn is passed when no enemy pawn on its own or adjacent files can
    // still block or capture it on the way to promotion.
    for (const rank of ranks) {
      const blockers = [file, ...neighbours].flatMap((f) => enemyPawns.get(f) ?? []);
      const ahead =
        color === 'w'
          ? blockers.some((r) => r > rank)
          : blockers.some((r) => r < rank);
      if (!ahead) passed.push(`${file}${rank}` as Square);
    }
  }

  return { doubled, isolated, passed, openFiles };
}

/** King-safety summary for one side. */
export interface KingSafety {
  square: Square | null;
  /** Friendly pawns on the three files around the king, one rank ahead. */
  shieldPawns: number;
  /** Enemy pieces attacking squares in the king's immediate neighbourhood. */
  attackers: number;
  /** True when the king still sits on its starting square with rooks unmoved. */
  castled: boolean;
  /** Files adjacent to the king with no friendly pawn. */
  exposedFiles: string[];
}

/** The up-to-eight squares surrounding a square. */
export function neighbours(square: Square): Square[] {
  const fileIndex = FILES.indexOf(fileOf(square));
  const rank = rankOf(square);
  const result: Square[] = [];

  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) continue;
      const file = FILES[fileIndex + df];
      const newRank = rank + dr;
      if (file && newRank >= 1 && newRank <= 8) result.push(`${file}${newRank}` as Square);
    }
  }
  return result;
}

/** Assesses how safe a side's king is. */
export function kingSafety(chess: Chess, color: Color): KingSafety {
  const square = kingSquare(chess, color);
  if (!square) {
    return { square: null, shieldPawns: 0, attackers: 0, castled: false, exposedFiles: [] };
  }

  const enemy = opposite(color);
  const zone = neighbours(square);
  const fileIndex = FILES.indexOf(fileOf(square));
  const kingFiles = [FILES[fileIndex - 1], fileOf(square), FILES[fileIndex + 1]].filter(
    Boolean,
  );

  let shieldPawns = 0;
  const exposedFiles: string[] = [];
  for (const file of kingFiles) {
    const hasPawn = [1, 2].some((step) => {
      const rank = color === 'w' ? rankOf(square) + step : rankOf(square) - step;
      if (rank < 1 || rank > 8) return false;
      const occupant = chess.get(`${file}${rank}` as Square);
      return occupant?.type === 'p' && occupant.color === color;
    });
    if (hasPawn) shieldPawns += 1;
    else exposedFiles.push(file);
  }

  const attackers = zone.filter((sq) => chess.isAttacked(sq, enemy)).length;
  const startSquare = color === 'w' ? 'e1' : 'e8';
  const castledFiles = ['g', 'c', 'f', 'b'];
  const castled = square !== startSquare && castledFiles.includes(fileOf(square));

  return { square, shieldPawns, attackers, castled, exposedFiles };
}

/**
 * Enemy pieces this move newly attacks, ignoring anything that was already
 * under attack before the move. Used to describe what a move threatens.
 */
export function newlyAttackedPieces(
  before: Chess,
  after: Chess,
  mover: Color,
): Array<{ square: Square; type: PieceSymbol; value: number; defended: boolean }> {
  const enemy = opposite(mover);
  const result: Array<{
    square: Square;
    type: PieceSymbol;
    value: number;
    defended: boolean;
  }> = [];

  for (const square of squaresOf(after, enemy)) {
    const piece = after.get(square)!;
    if (piece.type === 'k') continue;
    if (!after.isAttacked(square, mover)) continue;
    // Only report threats the move actually created.
    if (before.get(square)?.type === piece.type && before.isAttacked(square, mover)) {
      continue;
    }
    result.push({
      square,
      type: piece.type,
      value: PIECE_VALUE[piece.type],
      defended: after.attackers(square, enemy).length > 0,
    });
  }

  return result.sort((a, b) => b.value - a.value);
}

/** Converts a UCI move string into the `{from, to, promotion}` chess.js accepts. */
export function parseUci(uci: string): { from: string; to: string; promotion?: string } {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  return promotion ? { from, to, promotion } : { from, to };
}

/** Renders a UCI move as SAN in the given position, or null if it is illegal. */
export function uciToSan(fen: string, uci: string): string | null {
  try {
    const probe = new Chess(fen);
    return probe.move(parseUci(uci)).san;
  } catch {
    return null;
  }
}

/**
 * Renders a principal variation as SAN. Stops at the first illegal move so a
 * truncated or stale line degrades gracefully instead of throwing.
 */
export function pvToSan(fen: string, uciMoves: string[], limit = 8): string[] {
  const probe = new Chess(fen);
  const san: string[] = [];

  for (const uci of uciMoves.slice(0, limit)) {
    try {
      san.push(probe.move(parseUci(uci)).san);
    } catch {
      break;
    }
  }
  return san;
}

/** Replays SAN history into a fresh game, for takebacks and imports. */
export function replay(sanMoves: string[]): Chess {
  const game = new Chess();
  for (const san of sanMoves) {
    try {
      game.move(san);
    } catch {
      break;
    }
  }
  return game;
}

/** True when the move gives up material outright — the basis of "brilliant". */
export function isSacrifice(before: Chess, move: Move, after: Chess): boolean {
  const mover = move.color;
  const balanceBefore = materialBalance(before, mover);
  const balanceAfter = materialBalance(after, mover);
  const captured = move.captured ? PIECE_VALUE[move.captured] : 0;

  // The piece that just moved can now be taken by something cheaper.
  const target = after.get(move.to as Square);
  if (!target) return false;

  const defenders = after.attackers(move.to as Square, mover);
  const isDefended = defenders.length > 0;
  const values = attackerValues(after, move.to as Square, opposite(mover), isDefended);
  if (values.length === 0) return false;

  const cheapest = Math.min(...values);
  const exposedValue = PIECE_VALUE[target.type];

  const givesMaterial =
    (!isDefended && exposedValue > captured) || cheapest + captured < exposedValue;

  return givesMaterial && balanceAfter <= balanceBefore;
}

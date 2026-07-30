/**
 * A compact opening book.
 *
 * Not a replacement for a full ECO database — it exists so the coach can name
 * what is being played and can label early moves as "Book" instead of judging
 * them on a 16-ply search, which is exactly where engine evaluation is least
 * meaningful for a learner.
 */

/** One book entry: a SAN move sequence and the name it produces. */
interface OpeningEntry {
  /** Moves in SAN, starting from the initial position. */
  moves: string[];
  name: string;
}

const BOOK: OpeningEntry[] = [
  { moves: ['e4'], name: "King's Pawn Opening" },
  { moves: ['e4', 'e5'], name: 'Open Game' },
  { moves: ['e4', 'e5', 'Nf3'], name: "King's Knight Opening" },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6'], name: 'Open Game, Normal Variation' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Ruy López Opening' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], name: 'Ruy López, Morphy Defence' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Italian Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], name: 'Italian Game, Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], name: 'Italian Game, Two Knights Defence' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], name: 'Petrov Defence' },
  { moves: ['e4', 'e5', 'Nf3', 'd6'], name: 'Philidor Defence' },
  { moves: ['e4', 'e5', 'Nc3'], name: 'Vienna Game' },
  { moves: ['e4', 'e5', 'f4'], name: "King's Gambit" },
  { moves: ['e4', 'e5', 'Bc4'], name: "Bishop's Opening" },
  { moves: ['e4', 'c5'], name: 'Sicilian Defence' },
  { moves: ['e4', 'c5', 'Nf3', 'd6'], name: 'Sicilian Defence, Najdorf-ish setup' },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6'], name: 'Sicilian Defence, Old Sicilian' },
  { moves: ['e4', 'c5', 'Nf3', 'e6'], name: 'Sicilian Defence, French Variation' },
  { moves: ['e4', 'c5', 'c3'], name: 'Sicilian Defence, Alapin Variation' },
  { moves: ['e4', 'c5', 'Nc3'], name: 'Sicilian Defence, Closed' },
  { moves: ['e4', 'e6'], name: 'French Defence' },
  { moves: ['e4', 'e6', 'd4', 'd5'], name: 'French Defence, Main Line' },
  { moves: ['e4', 'c6'], name: 'Caro-Kann Defence' },
  { moves: ['e4', 'c6', 'd4', 'd5'], name: 'Caro-Kann Defence, Main Line' },
  { moves: ['e4', 'd6'], name: 'Pirc Defence' },
  { moves: ['e4', 'd5'], name: 'Scandinavian Defence' },
  { moves: ['e4', 'Nf6'], name: 'Alekhine Defence' },
  { moves: ['e4', 'g6'], name: 'Modern Defence' },
  { moves: ['d4'], name: "Queen's Pawn Opening" },
  { moves: ['d4', 'd5'], name: 'Closed Game' },
  { moves: ['d4', 'd5', 'c4'], name: "Queen's Gambit" },
  { moves: ['d4', 'd5', 'c4', 'dxc4'], name: "Queen's Gambit Accepted" },
  { moves: ['d4', 'd5', 'c4', 'e6'], name: "Queen's Gambit Declined" },
  { moves: ['d4', 'd5', 'c4', 'c6'], name: 'Slav Defence' },
  { moves: ['d4', 'Nf6'], name: 'Indian Defence' },
  { moves: ['d4', 'Nf6', 'c4', 'e6'], name: 'Indian Defence, East Indian' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], name: 'Nimzo-Indian Defence' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], name: "Queen's Indian Defence" },
  { moves: ['d4', 'Nf6', 'c4', 'g6'], name: 'Indian Defence, King’s Indian setup' },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'], name: "King's Indian Defence" },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'], name: 'Grünfeld Defence' },
  { moves: ['d4', 'f5'], name: 'Dutch Defence' },
  { moves: ['d4', 'd5', 'Nf3'], name: "Queen's Pawn Game, Zukertort" },
  { moves: ['c4'], name: 'English Opening' },
  { moves: ['c4', 'e5'], name: 'English Opening, Reversed Sicilian' },
  { moves: ['c4', 'c5'], name: 'English Opening, Symmetrical' },
  { moves: ['Nf3'], name: 'Réti Opening' },
  { moves: ['Nf3', 'd5', 'c4'], name: 'Réti Opening, Main Line' },
  { moves: ['g3'], name: "King's Fianchetto Opening" },
  { moves: ['b3'], name: 'Nimzo-Larsen Attack' },
  { moves: ['f4'], name: "Bird's Opening" },
  { moves: ['Nc3'], name: 'Dunst Opening' },
  { moves: ['b4'], name: 'Polish Opening' },
];

/** Longest book line, used to bound how far we bother matching. */
const MAX_BOOK_PLY = Math.max(...BOOK.map((entry) => entry.moves.length));

/**
 * Names the opening from a SAN move list, choosing the most specific match.
 *
 * @param sanMoves Moves played so far, in SAN.
 * @returns The opening name, or "Unknown opening" when nothing matches.
 */
export function identifyOpening(sanMoves: string[]): string {
  let best: OpeningEntry | null = null;

  for (const entry of BOOK) {
    if (entry.moves.length > sanMoves.length) continue;
    const matches = entry.moves.every((move, index) => move === sanMoves[index]);
    if (matches && (!best || entry.moves.length > best.moves.length)) best = entry;
  }

  return best?.name ?? 'Unknown opening';
}

/**
 * True when the move at `ply` keeps the game inside a known book line.
 *
 * Book moves are exempted from evaluation-based grading: a perfectly normal
 * developing move can register as a small "loss" against a 16-ply search
 * without being a mistake in any sense a learner should worry about.
 */
export function isBookMove(sanMovesIncludingThisOne: string[]): boolean {
  const ply = sanMovesIncludingThisOne.length;
  if (ply === 0 || ply > MAX_BOOK_PLY) return false;

  return BOOK.some(
    (entry) =>
      entry.moves.length >= ply &&
      sanMovesIncludingThisOne.every((move, index) => move === entry.moves[index]),
  );
}

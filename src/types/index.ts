import type { Color, PieceSymbol, Square } from 'chess.js';

export type { Color, PieceSymbol, Square };

/** Which side the human is playing. */
export type PlayerColor = 'white' | 'black';

/** Stockfish difficulty exposed to the user, 1 (beginner) to 20 (full strength). */
export type EngineLevel = number;

/**
 * An engine score. Stockfish reports either a centipawn evaluation or a forced
 * mate distance; we keep them distinct instead of collapsing mate into a large
 * centipawn number, because the two need different formatting and different
 * comparison rules.
 */
export type Score =
  | { type: 'cp'; value: number }
  | { type: 'mate'; value: number };

/** One principal variation returned by a MultiPV search. */
export interface PvLine {
  /** 1-based MultiPV rank; 1 is the engine's preferred line. */
  rank: number;
  /** Score from the point of view of the side to move. */
  score: Score;
  /** Moves in UCI long-algebraic notation, e.g. `["e2e4", "e7e5"]`. */
  moves: string[];
  /** Same line rendered as SAN, e.g. `["e4", "e5"]`. Empty if unplayable. */
  san: string[];
  depth: number;
}

/** Result of analysing one position at full strength. */
export interface PositionAnalysis {
  fen: string;
  /** Side to move in `fen`. */
  turn: Color;
  depth: number;
  /** Best lines, ordered by rank. Length is up to the requested MultiPV. */
  lines: PvLine[];
  /** Engine's chosen move in UCI notation, or null in a terminal position. */
  bestMove: string | null;
  /** Nodes per second of the last search, for the telemetry readout. */
  nps?: number;
}

/** Quality label assigned to a played move. */
export type MoveQuality =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

/** Presentation metadata for a {@link MoveQuality}. */
export interface QualityStyle {
  label: string;
  icon: string;
  /** Tailwind text colour class. */
  text: string;
  /** Tailwind background class for chips. */
  chip: string;
  /** Border colour class for cards. */
  border: string;
  /** Literal colour, for canvas/SVG fills where a class name cannot be used. */
  hex: string;
}

/** A single suggested alternative shown after a mistake, or for a hint. */
export interface MoveSuggestion {
  san: string;
  uci: string;
  score: Score;
  /** One-sentence plain-English reason this move is good. */
  reason: string;
  /** Follow-up moves, SAN, for the "and then…" continuation. */
  continuation: string[];
}

/** Named categories the coach uses to group its observations. */
export type InsightKind =
  | 'threat'
  | 'king-safety'
  | 'center'
  | 'activity'
  | 'pawns'
  | 'material'
  | 'plan'
  | 'tactic';

/** One plain-English observation about a position or move. */
export interface Insight {
  kind: InsightKind;
  text: string;
  /** Whether this is good news for the human player. */
  tone: 'good' | 'bad' | 'neutral';
}

/** Everything the coach has to say about one played move. */
export interface CoachFeedback {
  /** Ply index (0-based) of the move this feedback describes. */
  ply: number;
  /** Who played the move. */
  by: 'player' | 'engine';
  san: string;
  quality: MoveQuality | null;
  /** Headline verdict, e.g. "Excellent move." */
  headline: string;
  /** Main teaching paragraph, plain English. */
  body: string;
  /** Supporting observations. */
  insights: Insight[];
  /** Better alternatives — populated when the move was a mistake. */
  suggestions: MoveSuggestion[];
  /** Centipawn swing against the mover, >= 0. Null when incomparable. */
  centipawnLoss: number | null;
  /** Evaluation after the move, from White's point of view. */
  evalAfter: Score | null;
}

/** A move that has been played, with its coaching verdict attached. */
export interface PlayedMove {
  ply: number;
  san: string;
  uci: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  quality: MoveQuality | null;
  centipawnLoss: number | null;
  /** Evaluation after this move, from White's point of view. */
  evaluation: Score | null;
}

/** How the game finished. */
export type GameResult =
  | { status: 'in-progress' }
  | {
      status: 'checkmate' | 'resignation' | 'stalemate' | 'draw';
      /** Winner, or null for a draw. */
      winner: Color | null;
      /** Plain-English reason, e.g. "Black resigned." */
      reason: string;
    };

/** Per-side aggregate produced by the end-of-game review. */
export interface SideReview {
  accuracy: number;
  brilliant: number;
  great: number;
  best: number;
  excellent: number;
  good: number;
  book: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  averageCentipawnLoss: number;
}

/** Full post-game report. */
export interface GameReview {
  player: SideReview;
  engine: SideReview;
  opening: string;
  /** Ordered, actionable coaching takeaways. */
  advice: string[];
  /** The worst few moves, for a "review these" list. */
  keyMoments: Array<{
    ply: number;
    san: string;
    quality: MoveQuality;
    summary: string;
  }>;
}

/** Engine lifecycle, surfaced in the header so loading is never a mystery. */
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'thinking' | 'error';

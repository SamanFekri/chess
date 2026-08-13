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
  /**
   * Whether the moves carry grades.
   *
   * False for a game played with the coach off: the result, the opening and the
   * rating change are all still real, but every accuracy figure would be an
   * artefact of having measured nothing.
   */
  graded: boolean;
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

/**
 * Colours available when you draw on the board yourself.
 *
 * Four is deliberate: enough to separate "my plan" from "their threat" from "the
 * bit I am unsure about", few enough to pick from a row of swatches on a phone
 * without a menu.
 */
export type DrawColor = 'green' | 'red' | 'blue' | 'yellow';

/** An arrow the player drew. */
export interface DrawnArrow {
  from: string;
  to: string;
  color: DrawColor;
}

/** A square the player ringed. */
export interface DrawnCircle {
  square: string;
  color: DrawColor;
}

/** Everything the player has drawn on the current position. */
export interface BoardDrawings {
  arrows: DrawnArrow[];
  circles: DrawnCircle[];
}

/**
 * What a drawing on the board means.
 *
 * The role is the vocabulary of the visual explanation: each one gets its own
 * colour *and* its own shape of highlight, so the meaning survives a small
 * screen and colour blindness alike.
 */
export type ExplainRole =
  /** The move the coach would play. */
  | 'recommended'
  /** A follow-up move in the main line. */
  | 'variation'
  /** Something the opponent can do to you. */
  | 'threat'
  /** A move that makes you safe rather than better. */
  | 'defence'
  /** A piece the recommended move attacks. */
  | 'target'
  /** A second idea worth seeing. */
  | 'idea';

/** One arrow drawn between two squares. */
export interface ExplainArrow {
  from: string;
  to: string;
  role: ExplainRole;
}

/** One highlighted square, optionally captioned. */
export interface ExplainMark {
  square: string;
  role: ExplainRole;
  /** Short caption for the legend and for screen readers. */
  label?: string;
}

/** One beat of the explanation: a sentence and the drawings that go with it. */
export interface ExplainStep {
  id: string;
  text: string;
  arrows: ExplainArrow[];
  marks: ExplainMark[];
}

/**
 * A full explanation of one position.
 *
 * Tied to the FEN it was built from: an explanation of a position that is no
 * longer on the board is worse than none, so the board checks before drawing.
 */
export interface Explanation {
  fen: string;
  title: string;
  steps: ExplainStep[];
}

/** How loudly the coach volunteers advice before you move. */
export type TipLevel = 'off' | 'key' | 'balanced' | 'all';

/** How much a piece of advice matters, which is what the level filters on. */
export type TipUrgency = 'critical' | 'high' | 'medium' | 'low';

/**
 * One piece of unprompted advice about the position in front of you.
 *
 * Shown as a cloud over the board — the same treatment as a blunder, because it
 * is the same kind of interruption, just before the mistake instead of after it.
 */
export interface CoachTip {
  /**
   * What the tip is about, not when it was made.
   *
   * Identity rather than timestamp, so the coach can notice it is about to
   * repeat itself and stay quiet instead.
   */
  key: string;
  urgency: TipUrgency;
  /** Warning, opportunity, or a quiet suggestion — drives the cloud's colour. */
  tone: 'warn' | 'chance' | 'idea';
  headline: string;
  body: string;
  /** A move to name, when naming one does not give the whole game away. */
  move: string | null;
}

/**
 * Time each side has spent on the move, in milliseconds.
 *
 * Not a chess clock: nothing runs out and nobody loses on time. It measures
 * attention, which is why it stops for a pause, for the position editor and for
 * a tab you have switched away from — time spent in another window is not time
 * spent thinking about the position.
 */
export interface GameClock {
  w: number;
  b: number;
  /** When the currently running segment started, or null when stopped. */
  since: number | null;
  /** The side that segment belongs to. */
  side: 'w' | 'b' | null;
}

/** Engine lifecycle, surfaced in the header so loading is never a mystery. */
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'thinking' | 'error';

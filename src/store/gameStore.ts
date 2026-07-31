import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Color, Move, PieceSymbol, Square } from 'chess.js';
import { create } from 'zustand';
import { classifyMove, buildReview } from '../engine/analysis';
import {
  buildBriefing,
  buildHint,
  coachEngineMove,
  coachPlayerMove,
  type Hint,
  type PositionBriefing,
} from '../engine/coach';
import {
  coachDepthForElo,
  DEFAULT_COACH_ELO,
  getEngine,
  strengthForElo,
  MAX_COACH_ELO,
  MIN_COACH_ELO,
  MIN_OPPONENT_ELO,
  UNLIMITED_ELO,
} from '../engine/stockfish';
import type {
  CoachFeedback,
  EngineStatus,
  GameResult,
  GameReview,
  PlayedMove,
  PlayerColor,
  PositionAnalysis,
} from '../types';
import { isBookMove } from '../utils/openings';
import { MATE_SCORE, toWhitePov } from '../utils/score';
import { parseFen, parsePgn } from '../utils/pgn';
import { clearGame, loadGame, saveGame } from './persistence';
import {
  applyGame,
  emptyRating,
  loadRating,
  saveRating,
  withManualElo,
  type RatingRecord,
} from './rating';

/**
 * The live game object.
 *
 * Kept outside the store because `Chess` is mutable and comparing it by
 * reference would defeat React's change detection. The store holds the derived,
 * immutable facts (FEN, move list, verdicts) that components actually render, so
 * a re-render only happens when something visible changed.
 */
let game = new Chess();

/**
 * A game recovered from `localStorage`, applied to the initial state below.
 *
 * Restoring at module scope rather than in an effect means the board renders the
 * saved position on the very first paint — no flash of a fresh game.
 */
const restored = loadGame();
if (restored) game = restored.game;

/**
 * Incremented on every new game, import or takeback.
 *
 * Engine work is asynchronous and cannot be cancelled mid-search, so every async
 * step checks this token before writing to the store. Without it, a search
 * started before "New game" would land afterwards and coach a position that no
 * longer exists.
 */
let generation = 0;

/** Current coach search depth, from the `coachElo` setting. */
function coachDepth(state: { coachElo: number }): number {
  return coachDepthForElo(state.coachElo);
}

/** One taken-back ply, with everything the coach had said about it. */
export interface RedoEntry {
  san: string;
  move: PlayedMove | null;
  feedback: CoachFeedback[];
}

/** Shape of the game store. */
interface GameStore {
  // ── Configuration ────────────────────────────────────────────────────────
  playerColor: PlayerColor;
  /** Opponent playing strength in Elo, or UNLIMITED_ELO for full strength. */
  opponentElo: number;
  /** How deeply the coach analyses, expressed as an Elo-style strength. */
  coachElo: number;
  boardOrientation: PlayerColor;
  /**
   * When false the app is a plain chess game: no grading, no explanations, no
   * hints, no evaluation — and no analysis searches are run at all.
   */
  coachEnabled: boolean;
  /**
   * Whether picking up a piece marks the squares where it could be captured.
   *
   * A child of {@link coachEnabled}: it is coaching, so it only applies while the
   * coach is on, and the control for it lives inside the coach panel.
   */
  dangerMode: boolean;

  // ── Position ─────────────────────────────────────────────────────────────
  /**
   * The position this game began from.
   *
   * Not always the standard opening: a game can start from an edited board or an
   * imported FEN. Everything that rebuilds the board by replaying moves — undo,
   * restoring from storage, exporting PGN — has to start here, or it silently
   * reconstructs a different game.
   */
  startFen: string;
  fen: string;
  sanHistory: string[];
  moves: PlayedMove[];
  result: GameResult;
  /** Ply the user is reviewing, or null when following the live position. */
  viewingPly: number | null;
  /**
   * True while the game is halted: neither side moves.
   *
   * Entered automatically by flipping, which hands your move to the engine — you
   * almost always want to look at the position from your new side before it
   * fires off a reply.
   */
  isPaused: boolean;

  // ── Engine ───────────────────────────────────────────────────────────────
  engineStatus: EngineStatus;
  engineError: string | null;
  /** Analysis of the current live position. */
  analysis: PositionAnalysis | null;
  isOpponentThinking: boolean;
  isCoachThinking: boolean;

  // ── Coaching ─────────────────────────────────────────────────────────────
  feedback: CoachFeedback[];
  briefing: PositionBriefing | null;
  hint: Hint | null;
  isHintLoading: boolean;
  review: GameReview | null;

  /**
   * A pawn move waiting for the player to choose what it promotes to.
   *
   * The move is held rather than played: auto-queening is right most of the time
   * but silently wrong in the endgames where a rook or knight is the only move
   * that wins, and those are exactly the positions worth learning from.
   */
  pendingPromotion: { from: Square; to: Square } | null;

  // ── Position editor ──────────────────────────────────────────────────────
  /** True while the board is being set up by hand rather than played. */
  editMode: boolean;
  /** FEN of the position under construction. May be illegal mid-edit. */
  editFen: string;
  /** Piece the next board tap places, or `erase` to clear a square. */
  editSelection: { type: PieceSymbol; color: Color } | 'erase';
  /**
   * Side the player will take when the edited position starts.
   *
   * Independent of who moves first: setting up a position where the opponent
   * moves and you have to find the answer is a normal thing to want.
   */
  editPlayerColor: PlayerColor;

  /**
   * Moves taken back, in the order they would be replayed.
   *
   * Undo rebuilds the board from the move list, so the verdicts and coaching for
   * a taken-back move would otherwise be gone for good. Parking them here means
   * redo restores the position *and* everything the coach said about it, without
   * re-running the engine.
   */
  redoStack: RedoEntry[];

  // ── Rating ───────────────────────────────────────────────────────────────
  /** Persisted Elo estimate for the player. */
  rating: RatingRecord;
  /** True once this game's result has been counted, so it counts only once. */
  ratingApplied: boolean;

  /**
   * A new game waiting on confirmation, or null.
   *
   * Only set when there is a game worth losing — see {@link requestNewGame}.
   */
  pendingNewGame: { playerColor?: PlayerColor; opponentElo?: number } | null;

  // ── Actions ──────────────────────────────────────────────────────────────
  bootEngine: () => Promise<void>;
  newGame: (options?: { playerColor?: PlayerColor; opponentElo?: number }) => Promise<void>;
  /** Starts a new game, asking first when one is genuinely in progress. */
  requestNewGame: (options?: { playerColor?: PlayerColor; opponentElo?: number }) => Promise<void>;
  /** Goes ahead with the new game the confirmation was asked about. */
  confirmNewGame: () => Promise<void>;
  /** Dismisses the confirmation and keeps the current game. */
  cancelNewGame: () => void;
  playerMove: (from: string, to: string, promotion?: string) => boolean;
  /** Opens the promotion chooser for a pawn move that needs one. */
  requestPromotion: (from: Square, to: Square) => void;
  /** Plays the held promotion with the chosen piece, or cancels with null. */
  resolvePromotion: (piece: PieceSymbol | null) => void;
  undoMove: () => Promise<void>;
  /** Replays the most recently taken-back move. */
  redoMove: () => Promise<void>;
  /** True when there is anything to redo. */
  canRedo: () => boolean;
  resign: () => void;
  /** Swaps which side you play; the board follows so your colour is at the bottom. */
  flipBoard: () => Promise<void>;
  /** Halts or resumes play. Resuming lets the engine move if it is its turn. */
  setPaused: (paused: boolean) => Promise<void>;
  setOpponentElo: (elo: number) => void;
  setCoachElo: (elo: number) => void;
  setCoachEnabled: (enabled: boolean) => Promise<void>;
  setDangerMode: (enabled: boolean) => void;
  /** Anchors the rating estimate to a value the player supplies. */
  setRatingManually: (elo: number) => void;
  /** Discards the rating estimate and its game counters. */
  resetRating: () => void;
  /** Opens the editor, seeded with the position currently on the board. */
  enterEditMode: () => void;
  /** Leaves the editor and discards the edited position. */
  cancelEditMode: () => void;
  /** Sets the piece the next board tap will place, or selects the eraser. */
  setEditSelection: (selection: { type: PieceSymbol; color: Color } | 'erase') => void;
  /** Applies the current editor selection to a square. */
  editSquare: (square: Square) => void;
  /** Drags a piece to another square, or off the board (`to` null) to remove it. */
  moveEditPiece: (from: Square, to: Square | null) => void;
  /** Chooses which side moves first from the edited position. */
  setEditTurn: (color: Color) => void;
  /** Chooses which side the player takes when the edited position starts. */
  setEditPlayerColor: (color: PlayerColor) => void;
  /** Empties the board, or restores the standard starting position. */
  resetEditBoard: (to: 'empty' | 'start') => void;
  /** Validates the edited position and starts a game from it. */
  startFromEditPosition: () => Promise<string | null>;
  requestHint: () => Promise<void>;
  dismissHint: () => void;
  viewPly: (ply: number | null) => void;
  importPgn: (pgn: string) => Promise<string | null>;
  importFen: (fen: string) => Promise<string | null>;
  dismissReview: () => void;
}

/** Colour code for the human player. */
function playerCode(playerColor: PlayerColor): Color {
  return playerColor === 'white' ? 'w' : 'b';
}

/** Reads the current result straight off the board. */
function resultFromBoard(board: Chess): GameResult {
  if (!board.isGameOver()) return { status: 'in-progress' };

  if (board.isCheckmate()) {
    const winner: Color = board.turn() === 'w' ? 'b' : 'w';
    return {
      status: 'checkmate',
      winner,
      reason: `${winner === 'w' ? 'White' : 'Black'} won by checkmate.`,
    };
  }
  if (board.isStalemate()) {
    return { status: 'stalemate', winner: null, reason: 'Draw by stalemate.' };
  }
  if (board.isInsufficientMaterial()) {
    return { status: 'draw', winner: null, reason: 'Draw — insufficient material.' };
  }
  if (board.isThreefoldRepetition()) {
    return { status: 'draw', winner: null, reason: 'Draw by threefold repetition.' };
  }
  if (board.isDrawByFiftyMoves()) {
    return { status: 'draw', winner: null, reason: 'Draw by the fifty-move rule.' };
  }
  return { status: 'draw', winner: null, reason: 'Draw.' };
}

export const useGameStore = create<GameStore>((set, get) => {
  /** True when the async step belongs to the game still on the board. */
  const isCurrent = (token: number) => token === generation;

  /** Pushes the immutable snapshot of `game` into the store. */
  const syncPosition = () => {
    set({
      fen: game.fen(),
      sanHistory: game.history(),
      result: resultFromBoard(game),
      viewingPly: null,
    });
  };

  /** Refreshes the sidebar briefing from the latest analysis. */
  const refreshBriefing = () => {
    const { playerColor, analysis, coachEnabled } = get();
    if (!coachEnabled) {
      set({ briefing: null });
      return;
    }
    set({ briefing: buildBriefing(game.fen(), playerCode(playerColor), analysis) });
  };

  /**
   * Analyses the live position, streaming depth updates into the store so the
   * evaluation bar and depth readout move while the search runs.
   */
  const analyseCurrent = async (token: number): Promise<PositionAnalysis | null> => {
    const fen = game.fen();
    if (game.isGameOver()) {
      set({ analysis: null });
      return null;
    }

    const analysis = await getEngine().analyse(fen, {
      depth: coachDepth(get()),
      multiPv: 3,
      onProgress: (partial) => {
        // Late `info` lines from a superseded search must not overwrite the
        // current position's evaluation.
        if (isCurrent(token) && game.fen() === fen) set({ analysis: partial });
      },
    });

    if (!isCurrent(token)) return null;
    set({ analysis });
    return analysis;
  };

  /**
   * A stand-in analysis for a position where the game has just ended.
   *
   * A terminal position has no legal moves, so Stockfish returns no lines and
   * the normal grading path has nothing to compare against. Without this, the
   * move that delivers checkmate — the one the player most wants explained —
   * would get no verdict at all. Scores are from the side to move's point of
   * view, so a checkmated side is at `-MATE_SCORE`.
   */
  const terminalAnalysis = (board: Chess): PositionAnalysis => ({
    fen: board.fen(),
    turn: board.turn(),
    depth: 0,
    bestMove: null,
    lines: [
      {
        rank: 1,
        score: { type: 'cp', value: board.isCheckmate() ? -MATE_SCORE : 0 },
        moves: [],
        san: [],
        depth: 0,
      },
    ],
  });

  /**
   * Ends the game, updates the rating, and produces the post-game review.
   *
   * With coaching off no move was ever graded, so a review would be a table of
   * zeroes; the game simply ends instead. The rating is updated either way — it
   * comes from the result, not from the analysis.
   */
  const finishGame = (result: GameResult) => {
    const { moves, playerColor, coachEnabled, rating, ratingApplied, opponentElo } = get();

    // `finishIfOver` can be reached from more than one path in a single ply, so
    // the flag is what guarantees one rating update per game.
    const updated = ratingApplied
      ? rating
      : applyGame(rating, result, playerColor, opponentElo);
    if (!ratingApplied) saveRating(updated);

    set({
      result,
      rating: updated,
      ratingApplied: true,
      review: coachEnabled ? buildReview(moves, playerCode(playerColor)) : null,
      isOpponentThinking: false,
      isCoachThinking: false,
      engineStatus: 'ready',
    });
  };

  /** Ends the game if the board says it is over. Returns whether it did. */
  const finishIfOver = (): boolean => {
    const result = resultFromBoard(game);
    if (result.status === 'in-progress') return false;
    finishGame(result);
    return true;
  };

  /**
   * Plays the engine's move, then explains it.
   *
   * The engine's choice uses the opponent-strength setting; the explanation that
   * follows always comes from a full-skill analysis, so coaching quality never
   * depends on how weak the opponent is.
   */
  const playOpponentMove = async (token: number) => {
    // Checked here rather than at each call site so boot, resume, redo and the
    // normal move cycle all respect a pause without repeating the test.
    if (get().isPaused) {
      set({ engineStatus: 'ready' });
      return;
    }

    set({ isOpponentThinking: true, engineStatus: 'thinking' });

    try {
      const fenBefore = game.fen();

      // Below Stockfish's own rating floor the engine cannot be asked to play
      // weaker, so a share of moves are picked at random instead. At the very
      // bottom of the slider that share is 1 — a purely random mover.
      const strength = strengthForElo(get().opponentElo);
      let uci: string | null;
      if (strength.randomChance > 0 && Math.random() < strength.randomChance) {
        const legal = game.moves({ verbose: true });
        uci = legal.length > 0 ? legal[Math.floor(Math.random() * legal.length)].lan : null;
      } else {
        uci = await getEngine().chooseMove(fenBefore, get().opponentElo);
      }

      if (!isCurrent(token) || !uci) {
        if (isCurrent(token)) set({ isOpponentThinking: false, engineStatus: 'ready' });
        return;
      }

      const boardBefore = new Chess(fenBefore);
      let move: Move;
      try {
        move = game.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          ...(uci.length > 4 ? { promotion: uci[4] } : {}),
        });
      } catch {
        set({ isOpponentThinking: false, engineStatus: 'ready' });
        return;
      }

      const ply = game.history().length - 1;
      syncPosition();
      set({
        moves: [
          ...get().moves,
          {
            ply,
            san: move.san,
            uci,
            color: move.color,
            fenBefore,
            fenAfter: game.fen(),
            quality: null,
            centipawnLoss: null,
            evaluation: null,
          },
        ],
        isOpponentThinking: false,
      });

      // With coaching off there is nothing to explain and no baseline to keep, so
      // the analysis search is skipped entirely rather than run and discarded.
      if (!get().coachEnabled) {
        set({ engineStatus: 'ready' });
        finishIfOver();
        return;
      }

      // This analysis serves double duty: it explains the move just played and
      // becomes the baseline the player's next move is graded against. When the
      // engine's move ended the game there is nothing to search, but the move
      // still needs explaining.
      set({ isCoachThinking: true, engineStatus: 'thinking' });
      const isOver = game.isGameOver();
      const analysis = isOver
        ? terminalAnalysis(new Chess(game.fen()))
        : await analyseCurrent(token);
      if (!isCurrent(token)) return;

      if (analysis && analysis.lines.length > 0) {
        const feedback = coachEngineMove({
          ply,
          move,
          boardBefore,
          boardAfter: new Chess(game.fen()),
          after: analysis,
        });
        const evaluation = toWhitePov(analysis.lines[0].score, analysis.turn);
        set((state) => ({
          feedback: [...state.feedback, feedback],
          moves: state.moves.map((entry) =>
            entry.ply === ply ? { ...entry, evaluation } : entry,
          ),
        }));
      }

      set({ isCoachThinking: false, engineStatus: 'ready' });
      refreshBriefing();
      if (isOver) finishIfOver();
    } catch (error) {
      if (!isCurrent(token)) return;
      set({
        engineStatus: 'error',
        engineError: error instanceof Error ? error.message : 'The engine stopped responding.',
        isOpponentThinking: false,
        isCoachThinking: false,
      });
    }
  };

  /** Grades and explains the move the human just played, then replies. */
  const coachAndReply = async (token: number, context: { move: Move; fenBefore: string; ply: number }) => {
    const { move, fenBefore, ply } = context;

    try {
      // Coaching off: no grading, no explanation, no analysis search — just hand
      // over to the opponent, which is what "play normally" means.
      if (!get().coachEnabled) {
        if (finishIfOver()) return;
        await playOpponentMove(token);
        return;
      }

      // Baseline for grading: the analysis of the position the player moved in.
      // It is normally already in the store from the previous ply, so no extra
      // search is needed.
      const cached = get().analysis;
      const before =
        cached && cached.fen === fenBefore
          ? cached
          : await getEngine().analyse(fenBefore, { depth: coachDepth(get()), multiPv: 3 });
      if (!isCurrent(token)) return;

      set({ isCoachThinking: true, engineStatus: 'thinking' });
      // A move that ends the game leaves nothing to search, so it is graded
      // against a synthetic terminal evaluation instead of being skipped.
      const isOver = game.isGameOver();
      const after = isOver
        ? terminalAnalysis(new Chess(game.fen()))
        : await analyseCurrent(token);
      if (!isCurrent(token)) return;

      const boardBefore = new Chess(fenBefore);
      const boardAfter = new Chess(game.fen());

      if (after && before.lines.length > 0) {
        const classification = classifyMove({
          before,
          after,
          move,
          boardBefore,
          boardAfter,
          isBook: isBookMove(game.history()),
        });

        const feedback = coachPlayerMove({
          ply,
          move,
          boardBefore,
          boardAfter,
          classification,
          before,
          after,
        });

        set((state) => ({
          feedback: [...state.feedback, feedback],
          moves: state.moves.map((entry) =>
            entry.ply === ply
              ? {
                  ...entry,
                  quality: classification.quality,
                  centipawnLoss: classification.centipawnLoss,
                  evaluation: toWhitePov(classification.scoreAfter, move.color),
                }
              : entry,
          ),
        }));
      }

      set({ isCoachThinking: false });
      refreshBriefing();

      if (finishIfOver()) return;
      if (!isCurrent(token)) return;

      await playOpponentMove(token);
    } catch (error) {
      if (!isCurrent(token)) return;
      set({
        engineStatus: 'error',
        engineError: error instanceof Error ? error.message : 'The engine stopped responding.',
        isCoachThinking: false,
        isOpponentThinking: false,
      });
    }
  };

  /**
   * Rebuilds the board from the first `keep` moves of the current game.
   *
   * Unlike a full reset this preserves the verdicts and coaching for the moves
   * that survive — taking one move back should not erase what the coach said
   * about the twenty before it.
   */
  const rebuildTo = async (keep: number) => {
    generation += 1;
    const token = generation;
    getEngine().stop();

    const history = game.history();
    const rebuilt = new Chess(get().startFen);
    for (const san of history.slice(0, keep)) {
      try {
        rebuilt.move(san);
      } catch {
        break;
      }
    }
    game = rebuilt;

    set((state) => ({
      fen: game.fen(),
      sanHistory: game.history(),
      moves: state.moves.filter((move) => move.ply < keep),
      feedback: state.feedback.filter((entry) => entry.ply < keep),
      result: resultFromBoard(game),
      viewingPly: null,
      analysis: null,
      hint: null,
      isHintLoading: false,
      review: null,
      pendingPromotion: null,
      isPaused: false,
      isOpponentThinking: false,
      isCoachThinking: false,
      engineStatus: 'loading',
      engineError: null,
      // Rewinding past the end un-finishes the game, so its result must be able
      // to count again if it is replayed to a conclusion.
      ratingApplied: false,
    }));

    refreshBriefing();
    await startPosition(token);
  };

  /** Analyses the opening position and lets the engine start if it is White. */
  const startPosition = async (token: number) => {
    try {
      await getEngine().init();
      if (!isCurrent(token)) return;
      set({ engineStatus: 'ready', engineError: null });

      const { playerColor } = get();
      if (game.turn() !== playerCode(playerColor) && !game.isGameOver()) {
        await playOpponentMove(token);
        return;
      }

      if (get().coachEnabled) {
        await analyseCurrent(token);
        if (!isCurrent(token)) return;
      }
      refreshBriefing();
    } catch (error) {
      if (!isCurrent(token)) return;
      set({
        engineStatus: 'error',
        engineError:
          error instanceof Error ? error.message : 'The chess engine could not be started.',
      });
    }
  };

  /** Replaces the board with a new position and restarts the coaching cycle. */
  const resetTo = async (
    setup: () => void,
    overrides: Partial<
      Pick<GameStore, 'playerColor' | 'opponentElo' | 'boardOrientation' | 'startFen'>
    > = {},
  ) => {
    generation += 1;
    const token = generation;
    getEngine().stop();

    setup();

    set({
      // Defaults to the standard opening unless the caller says otherwise.
      startFen: DEFAULT_POSITION,
      ...overrides,
      fen: game.fen(),
      sanHistory: game.history(),
      moves: [],
      result: resultFromBoard(game),
      viewingPly: null,
      analysis: null,
      feedback: [],
      briefing: null,
      hint: null,
      isHintLoading: false,
      review: null,
      isOpponentThinking: false,
      isCoachThinking: false,
      engineStatus: 'loading',
      engineError: null,
      pendingPromotion: null,
      pendingNewGame: null,
      redoStack: [],
      isPaused: false,
      // A new board is a new game as far as the rating is concerned.
      ratingApplied: false,
    });

    refreshBriefing();
    await startPosition(token);
  };

  return {
    playerColor: restored?.snapshot.playerColor ?? 'white',
    opponentElo: restored?.snapshot.opponentElo ?? 1800,
    coachElo: restored?.snapshot.coachElo ?? DEFAULT_COACH_ELO,
    boardOrientation: restored?.snapshot.boardOrientation ?? 'white',
    coachEnabled: restored?.snapshot.coachEnabled ?? true,
    dangerMode: restored?.snapshot.dangerMode ?? false,

    startFen: restored?.snapshot.startFen ?? DEFAULT_POSITION,
    fen: game.fen(),
    sanHistory: game.history(),
    moves: restored?.snapshot.moves ?? [],
    result: restored?.snapshot.result ?? { status: 'in-progress' },
    viewingPly: null,
    isPaused: restored?.snapshot.isPaused ?? false,

    engineStatus: 'idle',
    engineError: null,
    analysis: null,
    isOpponentThinking: false,
    isCoachThinking: false,

    feedback: restored?.snapshot.feedback ?? [],
    briefing: null,
    hint: null,
    isHintLoading: false,
    // A finished game's review is rebuilt on demand rather than stored.
    review: null,

    pendingPromotion: null,
    pendingNewGame: null,
    redoStack: restored?.snapshot.redoStack ?? [],

    editMode: false,
    editFen: new Chess().fen(),
    editSelection: { type: 'q', color: 'w' },
    editPlayerColor: 'white',

    rating: loadRating(),
    ratingApplied: restored?.snapshot.ratingApplied ?? false,

    async bootEngine() {
      if (get().engineStatus !== 'idle') return;
      set({ engineStatus: 'loading' });
      generation += 1;
      await startPosition(generation);
    },

    async requestNewGame(options = {}) {
      const state = get();

      // Nothing is lost when the game is already over, or when only the engine
      // has moved — a board where you have not played yet is not "your game".
      const youHaveMoved = state.moves.some(
        (move) => move.color === playerCode(state.playerColor),
      );
      if (!youHaveMoved || state.result.status !== 'in-progress') {
        await get().newGame(options);
        return;
      }

      set({ pendingNewGame: options });
    },

    async confirmNewGame() {
      const options = get().pendingNewGame ?? {};
      set({ pendingNewGame: null });
      await get().newGame(options);
    },

    cancelNewGame() {
      set({ pendingNewGame: null });
    },

    async newGame(options = {}) {
      const playerColor = options.playerColor ?? get().playerColor;
      const opponentElo = options.opponentElo ?? get().opponentElo;

      await resetTo(
        () => {
          game = new Chess();
        },
        { playerColor, opponentElo, boardOrientation: playerColor },
      );
    },

    playerMove(from, to, promotion) {
      const state = get();
      if (state.result.status !== 'in-progress') return false;
      if (state.isOpponentThinking || state.isPaused) return false;
      if (game.turn() !== playerCode(state.playerColor)) return false;

      const fenBefore = game.fen();
      let move: Move;
      try {
        move = game.move({ from, to, ...(promotion ? { promotion } : {}) });
      } catch {
        return false;
      }

      const ply = game.history().length - 1;

      // The board updates synchronously; coaching catches up asynchronously.
      // This is what keeps the piece drop feeling instant while Stockfish works.
      syncPosition();
      set({
        hint: null,
        pendingPromotion: null,
        // Playing on abandons the taken-back branch, exactly as a text editor
        // drops its redo history once you type something new.
        redoStack: [],
        moves: [
          ...state.moves,
          {
            ply,
            san: move.san,
            uci: move.lan,
            color: move.color,
            fenBefore,
            fenAfter: game.fen(),
            quality: null,
            centipawnLoss: null,
            evaluation: null,
          },
        ],
      });

      void coachAndReply(generation, { move, fenBefore, ply });
      return true;
    },

    async undoMove() {
      const state = get();
      if (state.sanHistory.length === 0) return;
      // Matches what the Undo button allows, so the keyboard shortcut — which has
      // no disabled state to respect — behaves identically.
      if (state.isOpponentThinking) return;

      // Take back to the player's own turn: their move plus the engine's reply
      // when there is one, so the takeback lands on a position they can move in.
      // `parity` is the history length at which it is the player's turn.
      const history = game.history();
      const parity = state.playerColor === 'white' ? 0 : 1;
      const alreadyPlayerTurn = history.length % 2 === parity;
      const keep = Math.max(0, history.length - (alreadyPlayerTurn ? 2 : 1));

      // Capture what is about to be removed so redo can put it back verbatim.
      const undone: RedoEntry[] = history.slice(keep).map((san, index) => {
        const ply = keep + index;
        return {
          san,
          move: state.moves.find((entry) => entry.ply === ply) ?? null,
          feedback: state.feedback.filter((entry) => entry.ply === ply),
        };
      });

      await rebuildTo(keep);
      set((current) => ({ redoStack: [...undone, ...current.redoStack] }));
    },

    async redoMove() {
      const state = get();
      if (state.redoStack.length === 0 || state.isOpponentThinking) return;

      generation += 1;
      const token = generation;
      getEngine().stop();

      // Replay whole plies until it is the player's turn again, mirroring how
      // undo takes them back, so undo and redo are exact inverses.
      const restoredMoves: PlayedMove[] = [];
      const restoredFeedback: CoachFeedback[] = [];
      const remaining = [...state.redoStack];

      while (remaining.length > 0) {
        const next = remaining[0];
        try {
          game.move(next.san);
        } catch {
          // The stack no longer matches the board; drop it rather than guess.
          remaining.length = 0;
          break;
        }
        remaining.shift();
        if (next.move) restoredMoves.push(next.move);
        restoredFeedback.push(...next.feedback);
        if (game.turn() === playerCode(state.playerColor)) break;
      }

      set((current) => ({
        fen: game.fen(),
        sanHistory: game.history(),
        moves: [...current.moves, ...restoredMoves],
        feedback: [...current.feedback, ...restoredFeedback],
        result: resultFromBoard(game),
        redoStack: remaining,
        viewingPly: null,
        analysis: null,
        hint: null,
        pendingPromotion: null,
        engineStatus: 'loading',
      }));

      if (finishIfOver()) {
        refreshBriefing();
        return;
      }
      await startPosition(token);
    },

    canRedo() {
      return get().redoStack.length > 0;
    },

    requestPromotion(from, to) {
      set({ pendingPromotion: { from, to } });
    },

    resolvePromotion(piece) {
      const pending = get().pendingPromotion;
      set({ pendingPromotion: null });
      if (!pending || !piece) return;
      get().playerMove(pending.from, pending.to, piece);
    },

    resign() {
      const winner: Color = get().playerColor === 'white' ? 'b' : 'w';
      generation += 1;
      getEngine().stop();
      finishGame({
        status: 'resignation',
        winner,
        reason: 'You resigned.',
      });
    },

    async flipBoard() {
      // Flipping swaps sides, not just the view: the colour at the bottom of the
      // board is always the colour you play. `boardOrientation` and `playerColor`
      // are therefore always set together and never diverge.
      const state = get();
      if (state.isOpponentThinking) return;

      const next: PlayerColor = state.playerColor === 'white' ? 'black' : 'white';
      // Pausing is the point: swapping sides hands the move to the engine, and
      // playing it instantly would give you no chance to see the position from
      // the side you just took.
      set({ playerColor: next, boardOrientation: next, hint: null, isPaused: true });
      refreshBriefing();
    },

    async setPaused(paused) {
      if (get().isPaused === paused) return;
      set({ isPaused: paused });

      if (paused) {
        getEngine().stop();
        return;
      }

      refreshBriefing();
      const { result, playerColor } = get();
      if (result.status === 'in-progress' && game.turn() !== playerCode(playerColor)) {
        await playOpponentMove(generation);
      }
    },

    setOpponentElo(elo) {
      set({
        opponentElo: Math.min(UNLIMITED_ELO, Math.max(MIN_OPPONENT_ELO, Math.round(elo))),
      });
    },

    setCoachElo(elo) {
      set({ coachElo: Math.min(MAX_COACH_ELO, Math.max(MIN_COACH_ELO, Math.round(elo))) });
    },

    setDangerMode(enabled) {
      set({ dangerMode: enabled });
    },

    async setCoachEnabled(enabled) {
      if (get().coachEnabled === enabled) return;

      if (!enabled) {
        // Abandon any search in flight; nothing is going to read its result.
        getEngine().stop();
        set({
          coachEnabled: false,
          analysis: null,
          briefing: null,
          hint: null,
          isHintLoading: false,
          isCoachThinking: false,
          review: null,
        });
        return;
      }

      // Turning coaching back on mid-game picks up from the current position.
      // Moves already played stay ungraded — they were never analysed.
      set({ coachEnabled: true });
      const token = generation;
      if (game.isGameOver() || game.turn() !== playerCode(get().playerColor)) {
        refreshBriefing();
        return;
      }

      try {
        set({ isCoachThinking: true });
        await analyseCurrent(token);
        if (!isCurrent(token)) return;
        set({ isCoachThinking: false });
        refreshBriefing();
      } catch {
        if (isCurrent(token)) set({ isCoachThinking: false });
      }
    },

    async requestHint() {
      const state = get();
      if (state.result.status !== 'in-progress') return;
      if (game.turn() !== playerCode(state.playerColor)) return;

      set({ isHintLoading: true });
      const token = generation;

      try {
        const fen = game.fen();
        const analysis =
          state.analysis && state.analysis.fen === fen
            ? state.analysis
            : await getEngine().analyse(fen, { depth: coachDepth(get()), multiPv: 3 });
        if (!isCurrent(token)) return;

        set({ hint: buildHint(fen, analysis), isHintLoading: false });
      } catch {
        if (isCurrent(token)) set({ isHintLoading: false });
      }
    },

    enterEditMode() {
      getEngine().stop();
      set({
        editMode: true,
        editFen: game.fen(),
        editSelection: { type: 'q', color: 'w' },
        editPlayerColor: get().playerColor,
        hint: null,
        review: null,
      });
    },

    cancelEditMode() {
      set({ editMode: false });
    },

    setEditSelection(selection) {
      set({ editSelection: selection });
    },

    moveEditPiece(from, to) {
      const board = new Chess(get().editFen, { skipValidation: true });
      const piece = board.get(from);
      if (!piece) return;

      board.remove(from);
      // A null target means the piece was dragged off the board, which is the
      // quickest way to delete one.
      if (to) board.put(piece, to);

      set({ editFen: board.fen() });
    },

    editSquare(square) {
      const { editFen, editSelection } = get();
      // `skipValidation` is essential: half-built positions are routinely
      // illegal (no kings, pawns on the first rank) and chess.js would refuse to
      // load them. Legality is checked once, when starting the game.
      const board = new Chess(editFen, { skipValidation: true });

      if (editSelection === 'erase') board.remove(square);
      else board.put({ type: editSelection.type, color: editSelection.color }, square);

      set({ editFen: board.fen() });
    },

    setEditPlayerColor(color) {
      set({ editPlayerColor: color });
    },

    setEditTurn(color) {
      const parts = get().editFen.split(' ');
      parts[1] = color;
      // The en-passant target belongs to the previous move, which no longer
      // exists once the side to move is chosen by hand.
      parts[3] = '-';
      set({ editFen: parts.join(' ') });
    },

    resetEditBoard(to) {
      if (to === 'start') {
        set({ editFen: new Chess().fen() });
        return;
      }
      // Kings included: a position without both kings can never be legal, so
      // starting from bare kings saves the user a guaranteed error.
      set({ editFen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' });
    },

    async startFromEditPosition() {
      const { editFen } = get();

      // chess.js validates structure (piece counts, kings, castling fields); it
      // does not reject a side-to-move that is already delivering check, which is
      // unreachable in a real game, so that is checked separately.
      const parsed = parseFen(editFen);
      if (!parsed.ok) return parsed.error;

      let probe: Chess;
      try {
        probe = new Chess(parsed.fen);
      } catch (error) {
        return error instanceof Error ? error.message : 'That position is not playable.';
      }

      const waiting = probe.turn() === 'w' ? 'b' : 'w';
      const waitingKing = probe.findPiece({ type: 'k', color: waiting })[0];
      if (waitingKing && probe.isAttacked(waitingKing, probe.turn())) {
        return 'The side not to move is in check, which cannot happen in a real game.';
      }
      if (probe.moves().length === 0) {
        return 'That position has no legal moves — the game would be over immediately.';
      }

      set({ editMode: false });

      // The side chosen in the editor, which need not be the side to move: the
      // engine simply moves first if the position starts on its turn.
      const mine = get().editPlayerColor;
      await resetTo(
        () => {
          game = new Chess(parsed.fen);
        },
        { playerColor: mine, boardOrientation: mine, startFen: parsed.fen },
      );
      return null;
    },

    setRatingManually(elo) {
      const updated = withManualElo(get().rating, elo);
      saveRating(updated);
      set({ rating: updated });
    },

    resetRating() {
      const cleared = emptyRating();
      saveRating(cleared);
      set({ rating: cleared });
    },

    dismissHint() {
      set({ hint: null });
    },

    viewPly(ply) {
      set({ viewingPly: ply });
    },

    async importPgn(pgn) {
      const parsed = parsePgn(pgn);
      if (!parsed.ok) return parsed.error;

      await resetTo(
        () => {
          const rebuilt = new Chess(parsed.startFen);
          for (const san of parsed.sanMoves) {
            try {
              rebuilt.move(san);
            } catch {
              break;
            }
          }
          game = rebuilt;
        },
        { startFen: parsed.startFen },
      );
      return null;
    },

    async importFen(fen) {
      const parsed = parseFen(fen);
      if (!parsed.ok) return parsed.error;

      // Whoever is to move in the imported position becomes the human's side —
      // otherwise the engine would immediately move for them.
      const turn = parsed.fen.split(' ')[1] === 'b' ? 'black' : 'white';

      await resetTo(
        () => {
          game = new Chess(parsed.fen);
        },
        { playerColor: turn, boardOrientation: turn, startFen: parsed.fen },
      );
      return null;
    },

    dismissReview() {
      set({ review: null });
    },
  };
});

/** Read-only access to the live game, for components that need move legality. */
export function getBoard(): Chess {
  return game;
}

/**
 * Signature of everything worth persisting.
 *
 * The store updates many times per second while Stockfish searches — every
 * `info` line deepens the analysis and sets state. Writing to `localStorage` on
 * each of those would be wasteful and janky, so saves are driven by a cheap key
 * that changes only when durable facts do.
 */
function persistenceKey(state: GameStore): string {
  const graded = state.moves.reduce((count, move) => count + (move.quality ? 1 : 0), 0);
  return [
    state.startFen,
    state.sanHistory.length,
    graded,
    state.feedback.length,
    state.result.status,
    state.redoStack.length,
    state.isPaused,
    state.playerColor,
    state.boardOrientation,
    state.opponentElo,
    state.coachElo,
    state.coachEnabled,
    state.dangerMode,
    state.ratingApplied,
  ].join('|');
}

let lastPersistenceKey = persistenceKey(useGameStore.getState());

useGameStore.subscribe((state) => {
  const key = persistenceKey(state);
  if (key === lastPersistenceKey) return;
  lastPersistenceKey = key;

  // A fresh standard game is not worth restoring, and leaving the previous game
  // in storage would resurrect it on the next reload. A custom starting position
  // is worth keeping even before a move is played — it is the thing the user
  // just built in the editor.
  if (state.sanHistory.length === 0 && state.startFen === DEFAULT_POSITION) {
    clearGame();
    return;
  }

  saveGame({
    startFen: state.startFen,
    sanMoves: state.sanHistory,
    playerColor: state.playerColor,
    boardOrientation: state.boardOrientation,
    opponentElo: state.opponentElo,
    coachElo: state.coachElo,
    coachEnabled: state.coachEnabled,
    dangerMode: state.dangerMode,
    moves: state.moves,
    feedback: state.feedback,
    result: state.result,
    redoStack: state.redoStack,
    isPaused: state.isPaused,
    ratingApplied: state.ratingApplied,
  });
});

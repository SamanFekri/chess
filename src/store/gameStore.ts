import { Chess } from 'chess.js';
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

  // ── Position ─────────────────────────────────────────────────────────────
  fen: string;
  sanHistory: string[];
  moves: PlayedMove[];
  result: GameResult;
  /** Ply the user is reviewing, or null when following the live position. */
  viewingPly: number | null;

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

  // ── Position editor ──────────────────────────────────────────────────────
  /** True while the board is being set up by hand rather than played. */
  editMode: boolean;
  /** FEN of the position under construction. May be illegal mid-edit. */
  editFen: string;
  /** Piece the next board tap places, or `erase` to clear a square. */
  editSelection: { type: PieceSymbol; color: Color } | 'erase';

  // ── Rating ───────────────────────────────────────────────────────────────
  /** Persisted Elo estimate for the player. */
  rating: RatingRecord;
  /** True once this game's result has been counted, so it counts only once. */
  ratingApplied: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────
  bootEngine: () => Promise<void>;
  newGame: (options?: { playerColor?: PlayerColor; opponentElo?: number }) => Promise<void>;
  playerMove: (from: string, to: string, promotion?: string) => boolean;
  undoMove: () => Promise<void>;
  resign: () => void;
  /** Swaps which side you play; the board follows so your colour is at the bottom. */
  flipBoard: () => Promise<void>;
  setOpponentElo: (elo: number) => void;
  setCoachElo: (elo: number) => void;
  setCoachEnabled: (enabled: boolean) => Promise<void>;
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
  /** Chooses which side moves first from the edited position. */
  setEditTurn: (color: Color) => void;
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
    set({ isOpponentThinking: true, engineStatus: 'thinking' });

    try {
      const fenBefore = game.fen();
      const uci = await getEngine().chooseMove(fenBefore, get().opponentElo);
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
      Pick<GameStore, 'playerColor' | 'opponentElo' | 'boardOrientation'>
    > = {},
  ) => {
    generation += 1;
    const token = generation;
    getEngine().stop();

    setup();

    set({
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

    fen: game.fen(),
    sanHistory: game.history(),
    moves: restored?.snapshot.moves ?? [],
    result: restored?.snapshot.result ?? { status: 'in-progress' },
    viewingPly: null,

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

    editMode: false,
    editFen: new Chess().fen(),
    editSelection: { type: 'q', color: 'w' },

    rating: loadRating(),
    ratingApplied: restored?.snapshot.ratingApplied ?? false,

    async bootEngine() {
      if (get().engineStatus !== 'idle') return;
      set({ engineStatus: 'loading' });
      generation += 1;
      await startPosition(generation);
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
      if (state.isOpponentThinking) return false;
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

      await resetTo(() => {
        const rebuilt = new Chess();
        for (const san of history.slice(0, keep)) {
          try {
            rebuilt.move(san);
          } catch {
            break;
          }
        }
        game = rebuilt;
      });
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
      set({ playerColor: next, boardOrientation: next, hint: null });
      refreshBriefing();

      // Handing over your side mid-move means the move now belongs to the engine.
      if (get().result.status === 'in-progress' && game.turn() !== playerCode(next)) {
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

      // Whoever moves first becomes the human's side, matching FEN import.
      const turn: PlayerColor = probe.turn() === 'b' ? 'black' : 'white';
      await resetTo(
        () => {
          game = new Chess(parsed.fen);
        },
        { playerColor: turn, boardOrientation: turn },
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

      await resetTo(() => {
        const rebuilt = new Chess();
        for (const san of parsed.sanMoves) {
          try {
            rebuilt.move(san);
          } catch {
            break;
          }
        }
        game = rebuilt;
      });
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
        { playerColor: turn, boardOrientation: turn },
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
    state.sanHistory.length,
    graded,
    state.feedback.length,
    state.result.status,
    state.playerColor,
    state.boardOrientation,
    state.opponentElo,
    state.coachElo,
    state.coachEnabled,
    state.ratingApplied,
  ].join('|');
}

let lastPersistenceKey = persistenceKey(useGameStore.getState());

useGameStore.subscribe((state) => {
  const key = persistenceKey(state);
  if (key === lastPersistenceKey) return;
  lastPersistenceKey = key;

  // An empty board is not worth restoring, and leaving the previous game in
  // storage would resurrect it on the next reload.
  if (state.sanHistory.length === 0) {
    clearGame();
    return;
  }

  saveGame({
    sanMoves: state.sanHistory,
    playerColor: state.playerColor,
    boardOrientation: state.boardOrientation,
    opponentElo: state.opponentElo,
    coachElo: state.coachElo,
    coachEnabled: state.coachEnabled,
    moves: state.moves,
    feedback: state.feedback,
    result: state.result,
    ratingApplied: state.ratingApplied,
  });
});

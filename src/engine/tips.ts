import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import type { CoachTip, PositionAnalysis, TipLevel, TipUrgency } from '../types';
import { findLoosePieces, kingSafety, PIECE_NAME } from '../utils/chess';
import type { PositionBriefing } from './coach';

/**
 * Unprompted coaching: the one thing worth saying before you move.
 *
 * The blunder cloud is a post-mortem — it tells you what you already did. This
 * is the other half: a warning while it can still change the move. The whole
 * design constraint is that it interrupts, so it has to be right more often than
 * it is chatty, and it says exactly one thing. Everything it might have said
 * instead is still in the coach panel, which the player reads on their own terms.
 */

/** How much of an evaluation gap makes a position a genuine only-move. */
const ONLY_MOVE_GAP_CP = 200;

/** Material at stake, in centipawns, before a hanging piece is worth shouting about. */
const MINOR_PIECE_CP = 300;
const ROOK_CP = 500;

/** Ordering of the urgency bands, cheapest comparison first. */
const URGENCY_RANK: Record<TipUrgency, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

/** The lowest urgency each level lets through. */
const LEVEL_FLOOR: Record<TipLevel, number> = {
  off: Infinity,
  key: URGENCY_RANK.critical,
  balanced: URGENCY_RANK.high,
  all: URGENCY_RANK.low,
};

/** The settings, in slider order, with the wording shown in the UI. */
export const TIP_LEVELS: Array<{ value: TipLevel; label: string; description: string }> = [
  { value: 'off', label: 'Off', description: 'No pop-up advice. The coach panel still says everything.' },
  { value: 'key', label: 'Key', description: 'Only when material or the game is genuinely on the line.' },
  { value: 'balanced', label: 'Balanced', description: 'Danger and chances to win material.' },
  { value: 'all', label: 'All', description: 'Plans and positional nudges as well — expect one most moves.' },
];

/** Whether a tip of this urgency should be shown at this setting. */
export function passesLevel(urgency: TipUrgency, level: TipLevel): boolean {
  return URGENCY_RANK[urgency] >= LEVEL_FLOOR[level];
}

/** The value of the most valuable piece the opponent can profitably take. */
function worstHanging(board: Chess, color: Color) {
  return findLoosePieces(board, color)[0] ?? null;
}

/**
 * Chooses the single most important thing to say about a position.
 *
 * Ordered by consequence, not by how interesting the observation is: losing a
 * rook next move outranks any plan, and a forced mate outranks everything. The
 * first match wins, so the list reads top-down as a priority order.
 *
 * @param fen         The position, with the player to move.
 * @param playerColor The side the human is playing.
 * @param analysis    Full-strength analysis of that position, when available.
 * @param briefing    The panel's read-out, reused for the quieter positional tips.
 */
export function buildTip(
  fen: string,
  playerColor: Color,
  analysis: PositionAnalysis | null,
  briefing: PositionBriefing | null,
): CoachTip | null {
  const board = new Chess(fen);
  if (board.isGameOver() || board.turn() !== playerColor) return null;

  const best = analysis?.lines[0] ?? null;
  const second = analysis?.lines[1] ?? null;
  const bestSan = best?.san[0] ?? null;

  // ── Forced mate, either way ────────────────────────────────────────────────
  if (best?.score.type === 'mate') {
    const moves = Math.abs(best.score.value);
    if (best.score.value > 0) {
      return {
        key: `mate-for-${moves}`,
        urgency: 'critical',
        tone: 'chance',
        headline: `Mate in ${moves}`,
        body: `There is a forced checkmate in ${moves} ${moves === 1 ? 'move' : 'moves'} from here. Take the time to find it.`,
        move: null,
      };
    }
    return {
      key: `mate-against-${moves}`,
      urgency: 'critical',
      tone: 'warn',
      headline: 'You are being mated',
      body: `Your opponent has a forced mate in ${moves}. Look for checks, captures and anything that blocks the attack.`,
      move: null,
    };
  }

  // ── Something of yours is about to be taken ────────────────────────────────
  const mine = worstHanging(board, playerColor);
  if (mine && mine.value >= ROOK_CP) {
    return {
      key: `hanging-${mine.square}`,
      urgency: 'critical',
      tone: 'warn',
      headline: `Your ${PIECE_NAME[mine.type]} is in danger`,
      body: `The ${PIECE_NAME[mine.type]} on ${mine.square} ${
        mine.undefended ? 'has no defender' : 'is attacked by something cheaper'
      } — your opponent can just take it. Move it, defend it, or make a bigger threat.`,
      move: null,
    };
  }

  // ── The position hangs on one move ─────────────────────────────────────────
  if (best && second && best.score.type === 'cp' && second.score.type === 'cp') {
    const gap = best.score.value - second.score.value;
    if (gap >= ONLY_MOVE_GAP_CP) {
      return {
        key: `only-move-${bestSan ?? 'x'}`,
        urgency: 'critical',
        tone: 'warn',
        headline: 'Only one good move',
        body: 'Every other move here loses something real. Work out what your opponent is threatening before you commit.',
        move: null,
      };
    }
  }

  if (mine && mine.value >= MINOR_PIECE_CP) {
    return {
      key: `hanging-${mine.square}`,
      urgency: 'high',
      tone: 'warn',
      headline: `Your ${PIECE_NAME[mine.type]} can be taken`,
      body: `The ${PIECE_NAME[mine.type]} on ${mine.square} ${
        mine.undefended ? 'is undefended' : 'is attacked by a cheaper piece'
      }. Deal with it before you start anything else.`,
      move: null,
    };
  }

  // ── Something of theirs is free ────────────────────────────────────────────
  const theirs = worstHanging(board, playerColor === 'w' ? 'b' : 'w');
  if (theirs && theirs.value >= MINOR_PIECE_CP) {
    return {
      key: `free-${theirs.square}`,
      urgency: 'high',
      tone: 'chance',
      headline: 'There is material to win',
      body: `Their ${PIECE_NAME[theirs.type]} on ${theirs.square} ${
        theirs.undefended ? 'has nothing defending it' : 'is worth less than what attacks it'
      }. Check whether you can take it and keep it.`,
      move: null,
    };
  }

  // ── Quieter advice, for players who want to hear more ──────────────────────
  // `moveNumber` rather than the history length: the board is rebuilt from a FEN
  // here, so it has no history of its own to count.
  const safety = kingSafety(board, playerColor);
  if (!safety.castled && board.moveNumber() >= 7 && board.moves().some((san) => san.startsWith('O-O'))) {
    return {
      key: 'castle',
      urgency: 'medium',
      tone: 'idea',
      headline: 'Your king is still in the centre',
      body: 'You can castle this move. Files open up fast, and a king caught in the middle is how most short games end.',
      move: null,
    };
  }

  if (briefing) {
    const plan = briefing.plans[0];
    if (plan) {
      return {
        key: `plan-${plan}`,
        urgency: 'low',
        tone: 'idea',
        headline: 'Something to work on',
        body: plan,
        move: null,
      };
    }
  }

  return null;
}

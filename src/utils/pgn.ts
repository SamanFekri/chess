import { Chess, DEFAULT_POSITION, validateFen } from 'chess.js';
import { UNLIMITED_ELO } from '../engine/stockfish';
import type { GameResult, PlayerColor } from '../types';

/** Metadata written into an exported PGN. */
export interface PgnMeta {
  playerColor: PlayerColor;
  /** Opponent strength setting, written into the engine's player name. */
  opponentElo: number;
  result: GameResult;
  /** Position the game began from; omitted means the standard opening. */
  startFen?: string;
}

/** PGN result token for a finished (or unfinished) game. */
function resultToken(result: GameResult): string {
  if (result.status === 'in-progress') return '*';
  if (result.winner === null) return '1/2-1/2';
  return result.winner === 'w' ? '1-0' : '0-1';
}

/**
 * Serialises the game to PGN with the standard seven-tag roster filled in.
 *
 * @param sanMoves Moves played, in SAN.
 * @param meta     Who played which colour, engine level and the result.
 */
export function buildPgn(sanMoves: string[], meta: PgnMeta): string {
  const startFen = meta.startFen ?? DEFAULT_POSITION;
  const game = new Chess(startFen);
  for (const san of sanMoves) {
    try {
      game.move(san);
    } catch {
      break;
    }
  }

  const engineName =
    meta.opponentElo >= UNLIMITED_ELO
      ? 'Stockfish (full strength)'
      : `Stockfish (~${meta.opponentElo} Elo)`;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

  game.setHeader('Event', 'AI Chess Coach');
  game.setHeader('Site', 'AI Chess Coach');
  game.setHeader('Date', today);
  game.setHeader('Round', '1');
  game.setHeader('White', meta.playerColor === 'white' ? 'Player' : engineName);
  game.setHeader('Black', meta.playerColor === 'black' ? 'Player' : engineName);
  game.setHeader('Result', resultToken(meta.result));

  // The standard SetUp/FEN pair, so a game that began from an edited board or an
  // imported position reopens as that position rather than as move 1.
  if (startFen !== DEFAULT_POSITION) {
    game.setHeader('SetUp', '1');
    game.setHeader('FEN', startFen);
  }

  return game.pgn({ maxWidth: 80, newline: '\n' });
}

/** Outcome of parsing user-supplied PGN or FEN. */
export type ImportResult =
  | { ok: true; sanMoves: string[]; fen: string; startFen: string }
  | { ok: false; error: string };

/**
 * Parses a PGN into a validated move list.
 *
 * Returns a failure rather than throwing: the input comes from a textarea, so a
 * malformed value is an expected case that the UI has to explain, not a bug.
 */
export function parsePgn(pgn: string): ImportResult {
  const trimmed = pgn.trim();
  if (!trimmed) return { ok: false, error: 'Paste a PGN first.' };

  try {
    const game = new Chess();
    game.loadPgn(trimmed);
    const sanMoves = game.history();
    if (sanMoves.length === 0) {
      return { ok: false, error: 'That PGN contains no moves.' };
    }

    // A PGN may declare its own starting position with SetUp/FEN.
    const declared = game.getHeaders().FEN;
    const startFen = declared && validateFen(declared).ok ? declared : DEFAULT_POSITION;

    return { ok: true, sanMoves, fen: game.fen(), startFen };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Could not read that PGN: ${error.message}` : 'Could not read that PGN.',
    };
  }
}

/** Validates a FEN string and reports why it failed if it did. */
export function parseFen(fen: string): { ok: true; fen: string } | { ok: false; error: string } {
  const trimmed = fen.trim();
  if (!trimmed) return { ok: false, error: 'Paste a FEN first.' };

  const validation = validateFen(trimmed);
  if (!validation.ok) {
    return { ok: false, error: validation.error ?? 'That is not a valid FEN.' };
  }

  return { ok: true, fen: trimmed };
}

/** Triggers a browser download of a text file. */
export function downloadText(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Copies text to the clipboard, resolving to whether it worked. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Groups a flat SAN list into numbered move pairs for display. */
export function toMovePairs<T>(items: T[]): Array<{ number: number; white: T | null; black: T | null }> {
  const pairs: Array<{ number: number; white: T | null; black: T | null }> = [];
  for (let index = 0; index < items.length; index += 2) {
    pairs.push({
      number: index / 2 + 1,
      white: items[index] ?? null,
      black: items[index + 1] ?? null,
    });
  }
  return pairs;
}

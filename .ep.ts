/** End-to-end checks that en passant survives every layer of the app. */
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  get length() {
    return store.size;
  },
} as Storage;

import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { materialPointDiff, parseUci, uciToSan, pvToSan } from './src/utils/chess';
import { coachPlayerMove, coachEngineMove } from './src/engine/coach';
import { classifyMove } from './src/engine/analysis';
import { buildPgn, parsePgn } from './src/utils/pgn';
import { loadGame, saveGame } from './src/store/persistence';
import type { PositionAnalysis } from './src/types';

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`, ok ? '' : JSON.stringify(detail));
  if (!ok) failures += 1;
};
const section = (n: string) => console.log(`\n=== ${n} ===`);

const fake = (fen: string, lines: Array<{ uci: string; cp?: number }>): PositionAnalysis => {
  const b = new Chess(fen);
  return {
    fen,
    turn: b.turn(),
    depth: 16,
    bestMove: lines[0]?.uci ?? null,
    lines: lines.map((l, i) => {
      const probe = new Chess(fen);
      const san = probe.move(parseUci(l.uci)).san;
      return { rank: i + 1, score: { type: 'cp' as const, value: l.cp ?? 0 }, moves: [l.uci], san: [san], depth: 16 };
    }),
  };
};

/** Reaches a real en-passant position by playing the moves that create it. */
function epPosition() {
  const g = new Chess();
  g.move('e4');
  g.move('a6');
  g.move('e5');
  g.move('d5'); // black double-steps past the white e5 pawn
  return g;
}

section('The board offers en passant');
{
  const g = epPosition();
  console.log('  fen:', g.fen());
  check('the fen records the en-passant target', g.fen().split(' ')[3] === 'd6', g.fen().split(' ')[3]);

  const fromE5 = g.moves({ square: 'e5', verbose: true });
  const ep = fromE5.find((m) => m.isEnPassant());
  console.log('  offered from e5:', fromE5.map((m) => m.san).join(' '));
  check('en passant is generated', !!ep, fromE5.map((m) => m.san));
  check('it targets the empty square behind the pawn', ep?.to === 'd6', ep?.to);
  check('it is flagged a capture', !!ep?.captured && ep.captured === 'p', ep?.captured);
  check('SAN renders as exd6', ep?.san === 'exd6', ep?.san);
  check('LAN is e5d6', ep?.lan === 'e5d6', ep?.lan);
}

section('The move layer plays it from a from/to pair');
{
  // This is exactly what useBoardInteraction -> playerMove does: look up the
  // candidate by destination, then replay it as {from, to}.
  const g = epPosition();
  const candidate = g.moves({ square: 'e5' as Square, verbose: true }).find((m) => m.to === 'd6');
  check('the click handler finds the move by destination', !!candidate, candidate?.san);
  check('it is not mistaken for a promotion', candidate?.isPromotion() === false);

  const played = g.move({ from: 'e5', to: 'd6' });
  check('from/to alone is enough to play it', played.isEnPassant(), played.san);

  // The captured pawn is on d5, not on the destination square.
  check('the capturing pawn lands on d6', g.get('d6')?.type === 'p' && g.get('d6')?.color === 'w', g.get('d6'));
  check('the captured pawn is removed from d5', g.get('d5') === undefined, g.get('d5'));
  check('the origin square is emptied', g.get('e5') === undefined, g.get('e5'));
}

section('Material count reflects the off-square capture');
{
  const g = epPosition();
  const before = materialPointDiff(g, 'w');
  g.move({ from: 'e5', to: 'd6' });
  const after = materialPointDiff(g, 'w');
  console.log(`  white material ${before} -> ${after}`);
  check('white gains a pawn', after === before + 1, [before, after]);
  check('black loses a pawn', materialPointDiff(g, 'b') === -after, materialPointDiff(g, 'b'));
}

section('The window closes after one move');
{
  const g = epPosition();
  g.move('Nf3');
  g.move('a5');
  const stillThere = g.moves({ square: 'e5', verbose: true }).some((m) => m.isEnPassant());
  check('en passant expires if not taken immediately', !stillThere);
  check('the fen no longer carries a target', g.fen().split(' ')[3] === '-', g.fen().split(' ')[3]);
}

section('Coaching describes it as a capture');
{
  const g = epPosition();
  const fen = g.fen();
  const bb = new Chess(fen);
  const ba = new Chess(fen);
  const move = ba.move({ from: 'e5', to: 'd6' });

  const before = fake(fen, [{ uci: 'e5d6', cp: 40 }, { uci: 'g1f3', cp: 10 }]);
  const after = fake(ba.fen(), [{ uci: 'b8c6', cp: -40 }]);
  const cls = classifyMove({ before, after, move, boardBefore: bb, boardAfter: ba, isBook: false });
  const fb = coachPlayerMove({ ply: 4, move, boardBefore: bb, boardAfter: ba, classification: cls, before, after });

  console.log('  verdict:', cls.quality);
  console.log('  body:', fb.body);
  check('it is graded', !!cls.quality, cls.quality);
  check('the coach calls it a capture', /takes|wins/i.test(fb.body), fb.body);
  check('the card names the move', fb.san === 'exd6', fb.san);
  check('no crash and no empty prose', fb.body.length > 10);

  // And from the engine's side.
  const eb = new Chess(fen);
  const ea = new Chess(fen);
  const em = ea.move({ from: 'e5', to: 'd6' });
  const efb = coachEngineMove({ ply: 4, move: em, boardBefore: eb, boardAfter: ea, after });
  console.log('  opponent body:', efb.body);
  check('the opponent card mentions it', efb.body.includes('exd6'), efb.body);
}

section('UCI and principal variations');
{
  const g = epPosition();
  const fen = g.fen();
  check('uciToSan converts the ep move', uciToSan(fen, 'e5d6') === 'exd6', uciToSan(fen, 'e5d6'));

  // A PV that begins with en passant must render, not truncate.
  const san = pvToSan(fen, ['e5d6', 'b8c6', 'd6c7']);
  console.log('  pv:', san.join(' '));
  check('a pv starting with en passant renders', san[0] === 'exd6', san);
  check('the rest of the line follows', san.length === 3, san);
}

section('Replay, storage and PGN keep it');
{
  const g = epPosition();
  g.move({ from: 'e5', to: 'd6' });
  const history = g.history();
  const finalFen = g.fen();
  console.log('  history:', history.join(' '));

  // rebuildTo / persistence replay the SAN list from the start position.
  const replayed = new Chess();
  for (const san of history) replayed.move(san);
  check('replaying the SAN history reproduces the position', replayed.fen() === finalFen, [replayed.fen(), finalFen]);

  // Undo to just before the capture, then redo it.
  const undone = new Chess();
  for (const san of history.slice(0, history.length - 1)) undone.move(san);
  check('undo restores the en-passant chance', undone.moves({ square: 'e5', verbose: true }).some((m) => m.isEnPassant()));
  undone.move(history[history.length - 1]);
  check('redo replays the capture', undone.fen() === finalFen, undone.fen());

  // PGN round trip.
  const pgn = buildPgn(history, { playerColor: 'white', opponentElo: 2000, result: { status: 'in-progress' } });
  const reimported = parsePgn(pgn);
  check('the pgn round-trips the capture', reimported.ok && reimported.sanMoves.join(' ') === history.join(' '), reimported);

  // localStorage round trip.
  store.clear();
  saveGame({
    startFen: new Chess().fen(),
    sanMoves: history,
    playerColor: 'white',
    boardOrientation: 'white',
    opponentElo: 1800,
    coachElo: 2900,
    coachEnabled: true,
    moves: [],
    feedback: [],
    result: { status: 'in-progress' },
    redoStack: [],
    isPaused: false,
    ratingApplied: false,
  });
  check('storage restores the position exactly', loadGame()?.game.fen() === finalFen, loadGame()?.game.fen());
}

section('A saved position mid-window keeps the right to capture');
{
  // The en-passant target lives in the FEN, so a game started from one must
  // still offer the capture.
  const midWindow = 'rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
  const g = new Chess(midWindow);
  check('a stored ep target is honoured', g.moves({ square: 'e5', verbose: true }).some((m) => m.isEnPassant()), g.moves({ square: 'e5' }));

  // And a FEN without the target must not invent it.
  const noTarget = 'rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
  const h = new Chess(noTarget);
  check('no target means no capture', !h.moves({ square: 'e5', verbose: true }).some((m) => m.isEnPassant()));
}

section('Black captures en passant too');
{
  const g = new Chess();
  g.move('a4');
  g.move('e5');
  g.move('a5');
  g.move('e4');
  g.move('d4'); // white double-steps past the black e4 pawn
  const ep = g.moves({ square: 'e4', verbose: true }).find((m) => m.isEnPassant());
  check('black is offered en passant', !!ep, g.moves({ square: 'e4' }));
  check('it renders as exd3', ep?.san === 'exd3', ep?.san);
  g.move({ from: 'e4', to: 'd3' });
  check('the white pawn on d4 is removed', g.get('d4') === undefined, g.get('d4'));
  check('the black pawn lands on d3', g.get('d3')?.color === 'b', g.get('d3'));
}

console.log(`\n${failures === 0 ? 'ALL EN PASSANT CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

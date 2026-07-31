import { memo, useEffect, useRef } from 'react';
import { QUALITY_STYLES } from '../../engine/analysis';
import { useGameStore } from '../../store/gameStore';
import type { PlayedMove } from '../../types';
import { formatScore } from '../../utils/score';
import { explainSan, NOTATION_LEGEND } from '../../utils/notation';
import { Panel } from '../ui/Panel';

/** One clickable half-move, showing its verdict icon and resulting evaluation. */
function MoveCell({ move, isActive }: { move: PlayedMove | null; isActive: boolean }) {
  const viewPly = useGameStore((state) => state.viewPly);
  const coachEnabled = useGameStore((state) => state.coachEnabled);

  if (!move) return <span className="flex-1" />;

  // Verdicts and evaluations are coaching output; in plain-game mode the list is
  // just a record of the moves.
  const style = coachEnabled && move.quality ? QUALITY_STYLES[move.quality] : null;
  const evaluation = coachEnabled ? move.evaluation : null;
  // What the notation actually means, for anyone still learning to read it.
  const meaning = explainSan(move.san);

  return (
    <button
      type="button"
      onClick={() => viewPly(isActive ? null : move.ply)}
      className={`flex min-h-9 flex-1 items-center gap-1.5 rounded-lg px-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 ${
        isActive ? 'bg-blue-500/20 ring-1 ring-blue-400/50' : 'hover:bg-slate-800/70'
      }`}
      title={[meaning, style?.label].filter(Boolean).join(' ')}
      aria-label={[meaning ?? move.san, style?.label].filter(Boolean).join(' ')}
      aria-pressed={isActive}
    >
      <span className="font-mono font-medium text-slate-200">{move.san}</span>
      {style && (
        <span className={`text-xs ${style.text}`} title={style.label} aria-hidden>
          {style.icon}
        </span>
      )}
      {evaluation && (
        <span className="ml-auto font-mono text-[0.7rem] tabular-nums text-slate-500">
          {formatScore(evaluation)}
        </span>
      )}
    </button>
  );
}

/**
 * The move list.
 *
 * Doubles as the game's navigation: clicking a move shows that position on the
 * board, clicking it again returns to the live game. Verdict icons make the
 * whole game's shape readable at a glance.
 */
export const MoveList = memo(function MoveList() {
  const moves = useGameStore((state) => state.moves);
  const viewingPly = useGameStore((state) => state.viewingPly);
  const viewPly = useGameStore((state) => state.viewPly);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the game as it is played, but leave the scroll alone while the user
  // is deliberately browsing an earlier position.
  useEffect(() => {
    if (viewingPly === null) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [moves.length, viewingPly]);

  // Built by walking the moves rather than slicing in pairs, so a game imported
  // from a position with Black to move still lays out in the correct columns.
  const pairs: Array<{ number: number; white: PlayedMove | null; black: PlayedMove | null }> = [];
  for (const move of moves) {
    const last = pairs[pairs.length - 1];
    if (move.color === 'w' || !last || last.black !== null) {
      pairs.push({
        number: pairs.length + 1,
        white: move.color === 'w' ? move : null,
        black: move.color === 'b' ? move : null,
      });
    } else {
      last.black = move;
    }
  }

  return (
    <Panel
      title="Moves"
      action={
        viewingPly !== null && (
          <button
            type="button"
            onClick={() => viewPly(null)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400"
          >
            Back to live
          </button>
        )
      }
      bodyClassName="p-0"
    >
      <div
        ref={scrollRef}
        className="max-h-64 overflow-y-auto overscroll-contain px-3 py-2 lg:max-h-72"
      >
        {pairs.length === 0 ? (
          <p className="px-1 py-2 text-sm text-slate-500">No moves yet.</p>
        ) : (
          <ol className="space-y-0.5">
            {pairs.map((pair) => (
              <li key={pair.number} className="flex items-center gap-1">
                <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-slate-600">
                  {pair.number}.
                </span>
                <MoveCell move={pair.white} isActive={pair.white?.ply === viewingPly} />
                <MoveCell move={pair.black} isActive={pair.black?.ply === viewingPly} />
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Without this the tooltips are invisible until someone happens to hover. */}
      <p
        className="border-t border-slate-800/70 px-4 py-2 text-[0.7rem] leading-relaxed text-slate-500"
        title={NOTATION_LEGEND}
      >
        <span className="font-semibold text-slate-400">K</span> king ·{' '}
        <span className="font-semibold text-slate-400">Q</span> queen ·{' '}
        <span className="font-semibold text-slate-400">R</span> rook ·{' '}
        <span className="font-semibold text-slate-400">B</span> bishop ·{' '}
        <span className="font-semibold text-slate-400">N</span> knight · no letter is a pawn.
        Hover a move to read it in words.
      </p>
    </Panel>
  );
});

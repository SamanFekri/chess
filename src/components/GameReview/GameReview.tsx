import { memo } from 'react';
import { motion } from 'framer-motion';
import { QUALITY_STYLES } from '../../engine/analysis';
import { useGameStore } from '../../store/gameStore';
import { describeRating, opponentEloFor } from '../../store/rating';
import type { MoveQuality, SideReview } from '../../types';
import { buildPgn, downloadText } from '../../utils/pgn';
import { describeDuration } from '../../utils/time';
import { Button } from '../ui/Button';

/** Quality labels shown in the breakdown, in the order they are listed. */
const BREAKDOWN: MoveQuality[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'blunder',
];

/** Accuracy figure with a colour that matches how good it is. */
function AccuracyDial({ value, label }: { value: number; label: string }) {
  const tone =
    value >= 90
      ? 'text-emerald-300'
      : value >= 75
        ? 'text-sky-300'
        : value >= 55
          ? 'text-amber-300'
          : 'text-red-300';

  return (
    <div className="flex-1 rounded-xl bg-slate-950/60 p-3 text-center">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}%</p>
      <p className="text-[0.7rem] text-slate-500">accuracy</p>
    </div>
  );
}

/** Table of move-quality counts for one side. */
function Breakdown({ review }: { review: SideReview }) {
  const rows = BREAKDOWN.filter((quality) => review[quality] > 0);
  if (rows.length === 0) return null;

  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
      {rows.map((quality) => {
        const style = QUALITY_STYLES[quality];
        return (
          <li key={quality} className="flex items-center justify-between gap-2 text-sm">
            <span className={`flex items-center gap-1.5 ${style.text}`}>
              <span aria-hidden>{style.icon}</span>
              <span className="text-slate-400">{style.label}</span>
            </span>
            <span className="font-mono font-semibold tabular-nums text-slate-200">
              {review[quality]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The post-game report, shown as a modal over the board once the game ends.
 *
 * Dismissible rather than blocking: the board underneath is still worth looking
 * at, and the move list keeps every verdict for later.
 */
export const GameReview = memo(function GameReview() {
  const review = useGameStore((state) => state.review);
  const result = useGameStore((state) => state.result);
  const dismissReview = useGameStore((state) => state.dismissReview);
  const newGame = useGameStore((state) => state.newGame);
  const sanHistory = useGameStore((state) => state.sanHistory);
  const playerColor = useGameStore((state) => state.playerColor);
  const opponentElo = useGameStore((state) => state.opponentElo);
  const startFen = useGameStore((state) => state.startFen);
  const rating = useGameStore((state) => state.rating);
  const clock = useGameStore((state) => state.clock);

  if (!review) return null;

  const outcome =
    result.status === 'in-progress'
      ? 'Game in progress'
      : result.winner === null
        ? 'Draw'
        : result.winner === (playerColor === 'white' ? 'w' : 'b')
          ? 'You won'
          : 'You lost';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-700/80 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="review-title" className="text-xl font-bold text-slate-100">
              Game review — {outcome}
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              {result.status !== 'in-progress' ? result.reason : ''} Opening: {review.opening}.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissReview}
            aria-label="Close review"
            className="shrink-0 rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex gap-3">
          {/* Accuracy is only meaningful when the moves were actually graded —
              with the coach off there is nothing behind the number. */}
          {review.graded && (
            <>
              <AccuracyDial value={review.player.accuracy} label="You" />
              <AccuracyDial value={review.engine.accuracy} label="Stockfish" />
            </>
          )}
          <div className="flex-1 rounded-xl bg-slate-950/60 p-3 text-center">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Your rating
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-200">{rating.elo}</p>
            <p
              className={`text-[0.7rem] font-semibold tabular-nums ${
                (rating.lastChange ?? 0) > 0
                  ? 'text-emerald-400'
                  : (rating.lastChange ?? 0) < 0
                    ? 'text-red-400'
                    : 'text-slate-500'
              }`}
            >
              {rating.lastChange !== null
                ? `${rating.lastChange > 0 ? '+' : ''}${rating.lastChange} this game`
                : 'unchanged'}
            </p>
          </div>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {describeRating(rating)} You played Stockfish at roughly {opponentEloFor(opponentElo)}{' '}
          Elo. You spent {describeDuration(playerColor === 'white' ? clock.w : clock.b)} on the
          board, your opponent {describeDuration(playerColor === 'white' ? clock.b : clock.w)}.
        </p>

        {review.graded ? (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-200">Your moves</h3>
            <Breakdown review={review.player} />
          </section>
        ) : (
          <p className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/50 px-3 py-2.5 text-sm leading-relaxed text-slate-400">
            You played this one with the coach off, so there are no move grades to
            report. Turn <span className="font-semibold text-slate-300">Coach</span> on in the
            header and the next game gets accuracy figures, a move breakdown and the moments
            worth going back over.
          </p>
        )}

        {review.keyMoments.length > 0 && (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-200">Moments to review</h3>
            <ul className="mt-2 space-y-1.5">
              {review.keyMoments.map((moment) => (
                <li
                  key={moment.ply}
                  className={`rounded-lg border px-3 py-2 text-sm text-slate-300 ${QUALITY_STYLES[moment.quality].border} bg-slate-950/50`}
                >
                  <span className={`mr-1.5 font-semibold ${QUALITY_STYLES[moment.quality].text}`}>
                    {QUALITY_STYLES[moment.quality].icon} {QUALITY_STYLES[moment.quality].label}
                  </span>
                  {moment.summary}
                </li>
              ))}
            </ul>
          </section>
        )}

        {review.advice.length > 0 && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-slate-200">How to improve</h3>
          <ul className="mt-2 space-y-2">
            {review.advice.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-slate-300">
                <span aria-hidden className="shrink-0 text-blue-400">
                  →
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => void newGame()}
            className="flex-1 basis-40"
          >
            ↻ Play again
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              downloadText(
                'shatranj-ai.pgn',
                buildPgn(sanHistory, { playerColor, opponentElo, result, startFen }),
              )
            }
            className="flex-1 basis-40"
          >
            ⬇ Download PGN
          </Button>
          <Button variant="ghost" onClick={dismissReview} className="flex-1 basis-32">
            Review the board
          </Button>
        </div>
      </motion.div>
    </div>
  );
});

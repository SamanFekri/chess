import { memo, useMemo } from 'react';
import { useGameStore } from '../../store/gameStore';
import { evalBarFraction, formatScore, toWhitePov } from '../../utils/score';

/**
 * Vertical evaluation bar plus the numeric score.
 *
 * The bar is always drawn from White's point of view — the convention every
 * chess site uses — regardless of which colour the player chose, so the number
 * and the bar never disagree.
 *
 * @param orientation `vertical` beside the board on desktop, `horizontal` above
 *                    it on narrow screens where a tall bar would waste height.
 */
export const EvaluationBar = memo(function EvaluationBar({
  orientation = 'vertical',
}: {
  orientation?: 'vertical' | 'horizontal';
}) {
  const analysis = useGameStore((state) => state.analysis);
  const boardOrientation = useGameStore((state) => state.boardOrientation);

  const whiteScore = useMemo(() => {
    const top = analysis?.lines[0];
    return top ? toWhitePov(top.score, analysis.turn) : null;
  }, [analysis]);

  const whiteFraction = evalBarFraction(whiteScore);
  const label = whiteScore ? formatScore(whiteScore) : '—';
  const percent = `${(whiteFraction * 100).toFixed(1)}%`;

  const accessibleValue = whiteScore
    ? whiteScore.type === 'mate'
      ? `Mate in ${Math.abs(whiteScore.value)} for ${whiteScore.value > 0 ? 'White' : 'Black'}`
      : `${label} for White`
    : 'Not yet evaluated';

  if (orientation === 'horizontal') {
    return (
      <div
        className="flex items-center gap-3"
        role="meter"
        aria-label="Position evaluation"
        aria-valuetext={accessibleValue}
      >
        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-900 ring-1 ring-slate-700/70">
          <div
            className="absolute inset-y-0 left-0 bg-slate-100 transition-[width] duration-500 ease-out"
            style={{ width: percent }}
          />
        </div>
        <span className="w-14 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-slate-100">
          {label}
        </span>
      </div>
    );
  }

  // When the board is flipped, White's share has to grow from the top instead of
  // the bottom so the bar still lines up with the side of the board it describes.
  const whiteAtBottom = boardOrientation === 'white';

  return (
    <div
      className="flex h-full flex-col items-center gap-2"
      role="meter"
      aria-label="Position evaluation"
      aria-valuetext={accessibleValue}
    >
      <div className="relative w-6 flex-1 overflow-hidden rounded-full bg-slate-900 ring-1 ring-slate-700/70">
        <div
          className={`absolute inset-x-0 bg-slate-100 transition-[height] duration-500 ease-out ${
            whiteAtBottom ? 'bottom-0' : 'top-0'
          }`}
          style={{ height: percent }}
        />
      </div>
      <span className="font-mono text-xs font-semibold tabular-nums text-slate-200">{label}</span>
    </div>
  );
});

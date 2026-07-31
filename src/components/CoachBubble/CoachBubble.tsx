import { memo, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QUALITY_STYLES } from '../../engine/analysis';
import { useGameStore } from '../../store/gameStore';

/** Accent colour of the cloud's outline glow. */
const GLOW = 'rgba(248, 113, 113, 0.95)';

/** How long the cloud stays up before fading itself out, in milliseconds. */
const DWELL_MS = 9000;

/**
 * First sentence of a coaching paragraph.
 *
 * The cloud sits on top of the board, so it gets the headline finding only — for
 * a blunder that is the concrete consequence, since `coachPlayerMove` puts it
 * first. The full explanation stays in the coach panel where there is room.
 */
function firstSentence(text: string): string {
  const match = /^(.*?[.!?])(\s|$)/.exec(text.trim());
  return match ? match[1] : text.trim();
}

/**
 * A speech cloud over the bottom-left of the board, shown only for blunders.
 *
 * Deliberately reserved for the worst verdict: a bubble that popped up on every
 * move would cover the a1 corner constantly and stop being read. Every other
 * verdict is still reported by the badge on the piece and in the coach panel.
 */
export const CoachBubble = memo(function CoachBubble() {
  const feedback = useGameStore((state) => state.feedback);
  const viewingPly = useGameStore((state) => state.viewingPly);
  const coachEnabled = useGameStore((state) => state.coachEnabled);

  /**
   * The blunder to announce, or null.
   *
   * Only the *most recent* graded move qualifies, so once you have played on, an
   * earlier blunder's cloud does not come back.
   */
  const blunder = useMemo(() => {
    for (let index = feedback.length - 1; index >= 0; index -= 1) {
      const entry = feedback[index];
      if (!entry.quality) continue;
      return entry.quality === 'blunder' ? entry : null;
    }
    return null;
  }, [feedback]);

  const key = blunder ? `${blunder.ply}-${blunder.san}` : null;
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Browsing history is a deliberate, separate mode — a verdict about the live
  // position would be talking about a board that is not on screen.
  const visible =
    coachEnabled && blunder !== null && key !== null && key !== dismissed && viewingPly === null;

  useEffect(() => {
    if (!visible || !key) return;
    const timer = setTimeout(() => setDismissed(key), DWELL_MS);
    return () => clearTimeout(timer);
  }, [visible, key]);

  const style = QUALITY_STYLES.blunder;

  return (
    <AnimatePresence>
      {visible && blunder && (
        <motion.div
          key={key}
          initial={{ opacity: 0, scale: 0.82, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 6 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          className="coach-cloud absolute bottom-8 left-3 z-20 w-[min(17rem,72%)] cursor-pointer sm:w-[min(19rem,62%)]"
          style={
            {
              '--cloud-bg': 'rgba(9, 12, 28, 0.97)',
              '--cloud-bg-top': 'rgba(30, 35, 56, 0.97)',
              '--cloud-glow': GLOW,
            } as React.CSSProperties
          }
          onClick={() => setDismissed(key)}
          role="status"
          aria-live="polite"
          title="Click to dismiss"
        >
          {/* Tail: three shrinking dots trailing off the bottom-left corner. */}
          <span className="coach-cloud__puff" style={{ left: 20, bottom: -12, width: 16, height: 16 }} />
          <span className="coach-cloud__puff" style={{ left: 8, bottom: -25, width: 10, height: 10 }} />
          <span className="coach-cloud__puff" style={{ left: 1, bottom: -34, width: 6, height: 6 }} />

          <div className="coach-cloud__body px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-black text-slate-950"
                style={{ backgroundColor: style.hex }}
              >
                {style.icon}
              </span>
              <p className={`text-sm font-bold leading-tight ${style.text}`}>{style.label}</p>
              <span className="ml-auto rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[0.7rem] font-medium text-slate-300">
                {blunder.san}
              </span>
            </div>

            {/* Clamped so a long explanation cannot grow the cloud over the board. */}
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-200">
              {firstSentence(blunder.body)}
            </p>

            {(blunder.centipawnLoss !== null && blunder.centipawnLoss >= 100) ||
            blunder.suggestions.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-[0.7rem]">
                {blunder.centipawnLoss !== null && blunder.centipawnLoss >= 100 && (
                  <span className="font-medium text-red-300/90">
                    −{(blunder.centipawnLoss / 100).toFixed(1)} pawns
                  </span>
                )}
                {blunder.suggestions.length > 0 && (
                  <span className="text-slate-400">
                    Better:{' '}
                    <span className="font-mono font-semibold text-emerald-300">
                      {blunder.suggestions[0].san}
                    </span>
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

import { memo, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QUALITY_STYLES } from '../../engine/analysis';
import { useGameStore } from '../../store/gameStore';

/** Accent colour of the cloud's outline glow, by what the cloud is saying. */
const GLOW = {
  blunder: 'rgba(248, 113, 113, 0.95)',
  warn: 'rgba(251, 191, 36, 0.95)',
  chance: 'rgba(52, 211, 153, 0.95)',
  idea: 'rgba(96, 165, 250, 0.95)',
} as const;

/** How long a verdict stays up before fading itself out, in milliseconds. */
const DWELL_MS = 9000;

/** Advice dwells longer than a verdict: it is meant to be acted on. */
const TIP_DWELL_MS = 13000;

/** Icon and text colour for each kind of advice. */
const TIP_STYLE = {
  warn: { icon: '!', text: 'text-amber-300', hex: '#fbbf24' },
  chance: { icon: '★', text: 'text-emerald-300', hex: '#34d399' },
  idea: { icon: '?', text: 'text-blue-300', hex: '#60a5fa' },
} as const;

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
 * Auto-dismissal, keyed by what is being shown.
 *
 * A new key is a new thing to say, so the timer restarts and the cloud comes
 * back; dismissing pins the current key as spent.
 */
function useDwell(key: string | null, ms: number): [boolean, () => void] {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const visible = key !== null && key !== dismissed;

  useEffect(() => {
    if (!visible || key === null) return;
    const timer = setTimeout(() => setDismissed(key), ms);
    return () => clearTimeout(timer);
  }, [visible, key, ms]);

  return [visible, () => setDismissed(key)];
}

/** The cloud itself: rounded body, trailing puffs, click to dismiss. */
function Cloud({
  glow,
  onDismiss,
  children,
}: {
  glow: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.82, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 6 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className="coach-cloud absolute bottom-8 left-3 z-20 w-[min(17rem,72%)] cursor-pointer sm:w-[min(19rem,62%)]"
      style={
        {
          '--cloud-bg': 'rgba(9, 12, 28, 0.97)',
          '--cloud-bg-top': 'rgba(30, 35, 56, 0.97)',
          '--cloud-glow': glow,
        } as React.CSSProperties
      }
      onClick={onDismiss}
      role="status"
      aria-live="polite"
      title="Click to dismiss"
    >
      {/* Tail: three shrinking dots trailing off the bottom-left corner. */}
      <span className="coach-cloud__puff" style={{ left: 20, bottom: -12, width: 16, height: 16 }} />
      <span className="coach-cloud__puff" style={{ left: 8, bottom: -25, width: 10, height: 10 }} />
      <span className="coach-cloud__puff" style={{ left: 1, bottom: -34, width: 6, height: 6 }} />

      <div className="coach-cloud__body px-3.5 py-3">{children}</div>
    </motion.div>
  );
}

/**
 * A speech cloud over the bottom-left of the board.
 *
 * Says one of two things, never both. A blunder verdict wins, because it is
 * about the move you just played and has the shorter shelf life; otherwise the
 * cloud carries the coach's advice about the position in front of you.
 *
 * Both are deliberately rationed. A bubble that popped up on every move would
 * cover the a1 corner constantly and stop being read — which is the whole reason
 * the advice level exists.
 */
export const CoachBubble = memo(function CoachBubble() {
  const feedback = useGameStore((state) => state.feedback);
  const viewingPly = useGameStore((state) => state.viewingPly);
  const coachEnabled = useGameStore((state) => state.coachEnabled);
  const tip = useGameStore((state) => state.tip);
  const dismissTip = useGameStore((state) => state.dismissTip);

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

  const blunderKey = blunder ? `${blunder.ply}-${blunder.san}` : null;
  const [blunderVisible, dismissBlunder] = useDwell(blunderKey, DWELL_MS);

  // Keyed by the move count as well as the identity, so the same advice about a
  // later position can be shown again — the store is what stops it repeating
  // back to back.
  const tipKey = tip ? `${feedback.length}-${tip.key}` : null;
  const [tipVisible, hideTip] = useDwell(tipKey, TIP_DWELL_MS);

  // Browsing history is a deliberate, separate mode — a verdict about the live
  // position would be talking about a board that is not on screen.
  const live = coachEnabled && viewingPly === null;
  const showBlunder = live && blunderVisible && blunder !== null;
  const showTip = live && !showBlunder && tipVisible && tip !== null;

  const style = QUALITY_STYLES.blunder;
  const tipStyle = tip ? TIP_STYLE[tip.tone] : null;

  return (
    <AnimatePresence>
      {showBlunder && blunder && (
        <Cloud key={blunderKey} glow={GLOW.blunder} onDismiss={dismissBlunder}>
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
        </Cloud>
      )}

      {showTip && tip && tipStyle && (
        <Cloud
          key={tipKey}
          glow={GLOW[tip.tone]}
          onDismiss={() => {
            hideTip();
            dismissTip();
          }}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-black text-slate-950"
              style={{ backgroundColor: tipStyle.hex }}
            >
              {tipStyle.icon}
            </span>
            <p className={`text-sm font-bold leading-tight ${tipStyle.text}`}>{tip.headline}</p>
          </div>

          <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-slate-200">{tip.body}</p>

          {tip.move && (
            <div className="mt-2.5 border-t border-white/10 pt-2 text-[0.7rem] text-slate-400">
              Look at <span className="font-mono font-semibold text-emerald-300">{tip.move}</span>
            </div>
          )}
        </Cloud>
      )}
    </AnimatePresence>
  );
});

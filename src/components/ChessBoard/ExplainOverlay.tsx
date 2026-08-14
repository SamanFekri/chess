import { memo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { LEGEND_ORDER, ROLE_STYLES } from './explainStyles';

/**
 * The teacher's voice-over: the caption strip and transport above the board.
 *
 * The arrows are drawn on the board itself; this is the sentence that goes with
 * them and the controls for moving through the script. Placed directly above the
 * board — not floating over it — so the position is never hidden behind the card
 * that is describing it. It sits in normal document flow and pushes the board
 * down rather than covering the top of it.
 */

/** How long each step is left on screen before the next one arrives. */
const STEP_MS = 5200;

/** Advances the script while it is playing. */
function useStepPlayback() {
  const playing = useGameStore((state) => state.explainPlaying);
  const step = useGameStore((state) => state.explainStep);
  const total = useGameStore((state) => state.explanation?.steps.length ?? 0);
  const next = useGameStore((state) => state.nextExplainStep);

  useEffect(() => {
    if (!playing || total === 0) return;
    const timer = setTimeout(next, STEP_MS);
    return () => clearTimeout(timer);
    // `step` is a dependency so each step gets its own full dwell.
  }, [playing, step, total, next]);
}

/** A small square button for the transport row. */
function ControlButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-300"
    >
      {children}
    </button>
  );
}

/** What the colours on the board mean, in one line. */
function Legend({ roles }: { roles: string[] }) {
  const shown = LEGEND_ORDER.filter((role) => roles.includes(role));
  if (shown.length === 0) return null;

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.65rem] text-slate-300">
      {shown.map((role) => (
        <span key={role} className="flex items-center gap-1">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: ROLE_STYLES[role].arrow }}
          />
          {ROLE_STYLES[role].label}
        </span>
      ))}
    </p>
  );
}

export const ExplainOverlay = memo(function ExplainOverlay() {
  useStepPlayback();

  const explanation = useGameStore((state) => state.explanation);
  const index = useGameStore((state) => state.explainStep);
  const playing = useGameStore((state) => state.explainPlaying);
  const nextStep = useGameStore((state) => state.nextExplainStep);
  const prevStep = useGameStore((state) => state.prevExplainStep);
  const setPlaying = useGameStore((state) => state.setExplainPlaying);
  const replay = useGameStore((state) => state.replayExplanation);
  const clear = useGameStore((state) => state.clearExplanation);

  if (!explanation) return null;

  const step = explanation.steps[index];
  if (!step) return null;

  const total = explanation.steps.length;
  const atEnd = index >= total - 1;
  const roles = [...step.arrows.map((a) => a.role), ...step.marks.map((m) => m.role)];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      /*
       * Solid, not glass — and no longer over the board at all.
       *
       * This used to float on top of the squares, which meant reading it cost
       * you the position underneath. It is opaque anyway, kept from the version
       * where it did sit over the board, since a bright card is still easier to
       * scan than a muted one even in normal flow.
       */
      className="mb-2 w-full rounded-xl border-2 border-emerald-400/70 bg-slate-950/98 px-3 py-2.5 shadow-[0_10px_30px_-6px_rgba(2,6,23,0.95)] ring-1 ring-black/40"
      role="region"
      aria-label="Coach explanation"
    >
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-sm">
            🎓
          </span>
          <p className="min-w-0 flex-1 truncate text-[0.7rem] font-bold uppercase tracking-[0.08em] text-emerald-300">
            {explanation.title}
          </p>
          <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-slate-400">
            {index + 1}/{total}
          </span>
        </div>

        {/* Keyed on the step so each sentence animates in as its arrows appear. */}
        <AnimatePresence mode="wait">
          <motion.p
            key={step.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="mt-1.5 text-[0.82rem] font-medium leading-relaxed text-white"
            aria-live="polite"
          >
            {step.text}
          </motion.p>
        </AnimatePresence>

        <Legend roles={roles} />

        <div className="mt-1.5 flex items-center gap-1 border-t border-white/10 pt-1.5">
          <ControlButton onClick={prevStep} label="Previous step" disabled={index === 0}>
            ‹
          </ControlButton>

          {atEnd ? (
            <ControlButton onClick={replay} label="Play again">
              ↻
            </ControlButton>
          ) : (
            <ControlButton
              onClick={() => setPlaying(!playing)}
              label={playing ? 'Pause the explanation' : 'Play the explanation'}
            >
              {playing ? '❚❚' : '▶'}
            </ControlButton>
          )}

          <ControlButton onClick={nextStep} label="Next step" disabled={atEnd}>
            ›
          </ControlButton>

          {/* Progress doubles as a step picker: the dots are how you skip back to
              "what are they threatening" without stepping through the line. */}
          <div className="mx-1 flex flex-1 items-center gap-1">
            {explanation.steps.map((entry, position) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => useGameStore.getState().showExplainStep(position)}
                aria-label={`Step ${position + 1}: ${entry.text}`}
                aria-current={position === index}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  position === index
                    ? 'bg-emerald-400'
                    : position < index
                      ? 'bg-emerald-400/40'
                      : 'bg-white/15 hover:bg-white/30'
                }`}
              />
            ))}
          </div>

          <ControlButton onClick={clear} label="Clear the drawings">
            ✕
          </ControlButton>
        </div>
    </motion.div>
  );
});

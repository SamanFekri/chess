import { memo, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QUALITY_STYLES } from '../../engine/analysis';
import { TIP_LEVELS } from '../../engine/tips';
import { useGameStore } from '../../store/gameStore';
import type { CoachFeedback, Insight, TipLevel } from '../../types';
import { explainSan } from '../../utils/notation';
import { formatScore } from '../../utils/score';
import { InfoRow, Panel } from '../ui/Panel';
import { Switch } from '../ui/Switch';

/**
 * How much unprompted advice the coach gives.
 *
 * A four-step control rather than an on/off switch because the useful answer is
 * different for different players: one wants to be told when a rook is hanging
 * and nothing else, another wants a nudge every move. Sits next to Danger as
 * another child of the coach.
 */
function TipLevelControl() {
  const tipLevel = useGameStore((state) => state.tipLevel);
  const setTipLevel = useGameStore((state) => state.setTipLevel);
  const current = TIP_LEVELS.find((level) => level.value === tipLevel) ?? TIP_LEVELS[2];

  return (
    <label className="flex shrink-0 items-center gap-1" title={current.description}>
      <span className="text-[0.6rem] font-medium text-slate-400">Tips</span>
      <select
        value={tipLevel}
        onChange={(event) => setTipLevel(event.target.value as TipLevel)}
        aria-label="How much advice the coach volunteers"
        className="rounded-md border border-slate-700/70 bg-slate-900 px-0.5 py-0 text-[0.6rem] font-semibold text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400"
      >
        {TIP_LEVELS.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Icon shown next to an insight, by tone. */
const TONE_ICON: Record<Insight['tone'], string> = {
  good: '✓',
  bad: '⚠',
  neutral: '→',
};

const TONE_COLOR: Record<Insight['tone'], string> = {
  good: 'text-emerald-300',
  bad: 'text-amber-300',
  neutral: 'text-slate-400',
};

/** One coaching card: verdict, explanation, observations and alternatives. */
const FeedbackCard = memo(function FeedbackCard({ feedback }: { feedback: CoachFeedback }) {
  const style = feedback.quality ? QUALITY_STYLES[feedback.quality] : null;
  const moveNumber = Math.floor(feedback.ply / 2) + 1;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-xl border bg-slate-900/70 p-3 ${
        style ? style.border : 'border-slate-800/80'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-sm font-bold ${style ? style.text : 'text-slate-300'}`}>
          {feedback.headline}
        </h3>
        <span
          className="shrink-0 cursor-help rounded-md bg-slate-800/80 px-1.5 py-0.5 font-mono text-[0.7rem] text-slate-400"
          title={explainSan(feedback.san) ?? undefined}
        >
          {moveNumber}
          {feedback.by === 'player' ? '' : '…'} {feedback.san}
        </span>
      </div>

      {feedback.body && (
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{feedback.body}</p>
      )}

      {feedback.insights.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {feedback.insights.map((insight, index) => (
            <li key={`${insight.kind}-${index}`} className="flex gap-2 text-[0.8rem] leading-relaxed">
              <span className={`shrink-0 ${TONE_COLOR[insight.tone]}`} aria-hidden>
                {TONE_ICON[insight.tone]}
              </span>
              <span className="text-slate-400">{insight.text}</span>
            </li>
          ))}
        </ul>
      )}

      {feedback.suggestions.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-950/50 p-2.5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Better options
          </p>
          <ol className="mt-1.5 space-y-2">
            {feedback.suggestions.map((suggestion, index) => (
              <li key={suggestion.uci} className="text-[0.8rem] leading-relaxed">
                <div className="flex items-baseline gap-2">
                  <span className="text-slate-500">{index + 1}.</span>
                  <span className="font-mono font-semibold text-emerald-300">{suggestion.san}</span>
                  <span className="font-mono text-[0.7rem] text-slate-500">
                    {formatScore(suggestion.score)}
                  </span>
                </div>
                <p className="ml-5 text-slate-400">{suggestion.reason}</p>
                {suggestion.continuation.length > 0 && (
                  <p className="ml-5 mt-0.5 font-mono text-[0.7rem] text-slate-600">
                    then {suggestion.continuation.join(' ')}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </motion.article>
  );
});

/** The active hint card, shown until dismissed or the next move is played. */
function HintCard() {
  const hint = useGameStore((state) => state.hint);
  const dismissHint = useGameStore((state) => state.dismissHint);

  if (!hint) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-emerald-300">
          💡 Try {hint.suggestion.san}
        </h3>
        <button
          type="button"
          onClick={dismissHint}
          className="rounded-md px-1.5 text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          aria-label="Dismiss hint"
        >
          ✕
        </button>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-emerald-100/85">{hint.explanation}</p>
      {hint.suggestion.continuation.length > 0 && (
        <p className="mt-1 font-mono text-[0.7rem] text-emerald-200/60">
          then {hint.suggestion.continuation.join(' ')}
        </p>
      )}
      <p className="mt-2 text-[0.7rem] text-emerald-200/60">
        The move has not been played — it is still your turn.
      </p>
    </motion.div>
  );
}

/** Live position read-out: the always-on half of the coaching sidebar. */
function Briefing() {
  const briefing = useGameStore((state) => state.briefing);
  const analysis = useGameStore((state) => state.analysis);
  const isCoachThinking = useGameStore((state) => state.isCoachThinking);

  if (!briefing) {
    return <p className="text-sm text-slate-500">Starting the engine…</p>;
  }

  const pv = analysis?.lines[0]?.san.slice(0, 6).join(' ');

  return (
    <dl className="divide-y divide-slate-800/60">
      <InfoRow label="Right now">
        <span className="text-slate-200">{briefing.advice}</span>
      </InfoRow>

      <InfoRow label="Evaluation">
        {briefing.evaluation}
        {briefing.bestMove && (
          <>
            {' '}
            Best move here is{' '}
            <span className="font-mono font-semibold text-emerald-300">{briefing.bestMove}</span>.
          </>
        )}
        {isCoachThinking && (
          <span className="ml-1 text-slate-500" aria-live="polite">
            (thinking…)
          </span>
        )}
      </InfoRow>

      {pv && (
        <InfoRow label="Expected continuation">
          <span className="font-mono text-[0.8rem] text-slate-400">{pv}</span>
        </InfoRow>
      )}

      <InfoRow label="Threats">
        <ul className="space-y-1">
          {briefing.threats.map((threat) => (
            <li key={threat}>{threat}</li>
          ))}
        </ul>
      </InfoRow>

      <InfoRow label="Tactical ideas">
        <ul className="space-y-1">
          {briefing.tactical.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ul>
      </InfoRow>

      <InfoRow label="Strategic ideas">
        <ul className="space-y-1">
          {briefing.strategic.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ul>
      </InfoRow>

      <InfoRow label="Plans">
        <ol className="space-y-1">
          {briefing.plans.map((plan) => (
            <li key={plan}>{plan}</li>
          ))}
        </ol>
      </InfoRow>

      <InfoRow label="King safety">{briefing.kingSafety}</InfoRow>
      <InfoRow label="Piece activity">{briefing.activity}</InfoRow>
      <InfoRow label="Centre control">{briefing.center}</InfoRow>
      <InfoRow label="Pawn structure">{briefing.pawns}</InfoRow>
    </dl>
  );
}

/**
 * The AI coach sidebar.
 *
 * Two stacked panels: the running commentary (newest first, so the latest
 * verdict is visible without scrolling) and the standing read-out of the current
 * position.
 */
export const CoachPanel = memo(function CoachPanel() {
  const feedback = useGameStore((state) => state.feedback);
  const isCoachThinking = useGameStore((state) => state.isCoachThinking);
  const dangerMode = useGameStore((state) => state.dangerMode);
  const setDangerMode = useGameStore((state) => state.setDangerMode);
  const showCoachThinking = useGameStore((state) => state.showCoachThinking);
  const setShowCoachThinking = useGameStore((state) => state.setShowCoachThinking);

  const listRef = useRef<HTMLDivElement>(null);
  const recent = [...feedback].reverse().slice(0, 12);

  // Newest card first means the scroll position should reset to the top, not
  // follow the bottom the way a chat log would.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [feedback.length]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden>🎓</span> AI Coach
            {/* A dot rather than the word "analysing": the text sat in the
                control row and pushed the switches around every time a search
                started, which is a layout that moves while you are reaching for
                it. The sentence still exists for screen readers below. */}
            {isCoachThinking && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400"
              />
            )}
            <span className="sr-only" aria-live="polite">
              {isCoachThinking ? 'Analysing the position' : ''}
            </span>
          </span>
        }
        // Wraps rather than shrinks: three controls and a status label do not fit
        // one line on a narrow sidebar, and a squashed switch is worse than a
        // second row.
        action={
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
            {/* All three on one line and deliberately small: they are settings
                you touch once and then read past, so they should not compete
                with the coaching underneath. They live inside the coach's panel
                because it only exists while the coach is on, which makes the
                parent/child relationship structural rather than a visual
                convention. Drawing is not here — it is something you do to a
                position, so its button is under the board. */}
            <TipLevelControl />
            <Switch
              checked={showCoachThinking}
              onChange={setShowCoachThinking}
              label="Thinking"
              description="Show how the coach thinks: its arrows on the board, the line it expects, and the reason for each, one step at a time"
              labelClassName="text-[0.6rem]"
              size="sm"
            />
            <Switch
              checked={dangerMode}
              onChange={setDangerMode}
              label="Danger"
              description="Mark the moves that lose material: ⚠ the piece you picked up can be taken there, ⊕ moving there costs you a piece elsewhere"
              labelClassName="text-[0.6rem]"
              size="sm"
            />
          </div>
        }
        bodyClassName="p-0"
      >
        {/* Indeterminate hairline: the honest signal that the engine is working,
            in a place where growing and shrinking cannot disturb anything. */}
        <div className="h-0.5 w-full overflow-hidden bg-transparent" aria-hidden>
          {isCoachThinking && <div className="coach-progress h-full w-1/3 bg-blue-400/80" />}
        </div>

        <div
          ref={listRef}
          className="max-h-[min(52vh,32rem)] space-y-2.5 overflow-y-auto overscroll-contain px-4 pb-3 pt-2"
          aria-live="polite"
        >
          <AnimatePresence initial={false}>
            <HintCard />
          </AnimatePresence>

          {recent.length === 0 ? (
            <p className="text-sm leading-relaxed text-slate-400">
              Make a move and I will tell you what it did well, what it missed, and what to look at
              next.
            </p>
          ) : (
            recent.map((entry) => (
              <FeedbackCard key={`${entry.ply}-${entry.by}-${entry.san}`} feedback={entry} />
            ))
          )}
        </div>
      </Panel>

      <Panel title="Position read-out" bodyClassName="px-4 py-1">
        <Briefing />
      </Panel>
    </div>
  );
});

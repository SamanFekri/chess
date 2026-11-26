import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion';
import { TIP_LEVELS } from '../../engine/tips';
import { useGameStore } from '../../store/gameStore';
import type { TipLevel } from '../../types';
import {
  ColorChoice,
  RatingSetting,
  StrengthSettings,
  TransferPanel,
} from '../Controls/Controls';
import { EngineSelector } from '../Controls/EngineSelector';
import { ModeSwitch, TimeControlPicker } from '../Controls/ModeSettings';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Switch } from '../ui/Switch';
import { CloseIcon, FlagIcon, NewGameIcon, PencilIcon } from '../ui/icons';

/** The iOS sheet curve: quick to start, long gentle settle. */
const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** Everything that can take keyboard focus inside the menu. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

/** A titled group of settings. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-white/[0.06] px-5 py-4 first:border-t-0">
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** How much advice the coach volunteers, as a full-size menu row. */
function TipsRow() {
  const tipLevel = useGameStore((state) => state.tipLevel);
  const setTipLevel = useGameStore((state) => state.setTipLevel);
  const current = TIP_LEVELS.find((level) => level.value === tipLevel) ?? TIP_LEVELS[2];

  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span>
        <span className="block text-sm font-semibold text-slate-100">Tips</span>
        <span className="block text-xs text-slate-400">{current.description}</span>
      </span>
      <select
        value={tipLevel}
        onChange={(event) => setTipLevel(event.target.value as TipLevel)}
        className="glass-control min-h-9 shrink-0 rounded-lg px-2 text-sm font-semibold text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
      >
        {TIP_LEVELS.map((level) => (
          <option key={level.value} value={level.value} className="bg-slate-900">
            {level.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A switch with its explanation underneath, for the menu's settings rows. */
function SettingRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span>
        <span className="block text-sm font-semibold text-slate-100">{label}</span>
        <span className="block text-xs text-slate-400">{detail}</span>
      </span>
      <Switch checked={checked} onChange={onChange} label={label} description={detail} labelClassName="sr-only" />
    </div>
  );
}

/**
 * The side menu: every setting, out of the way of the game.
 *
 * The main screen keeps only what is used on every move — the board, its clocks
 * or turn bar, and the quick actions. Choosing who to play, the clock, the
 * coach's settings, the rating and the file tools all live here, opened from the
 * button in the header.
 *
 * A modal panel from the left: the backdrop, Escape, the close button or a
 * swipe to the left all close it; focus stays inside while it is open and goes
 * back to the menu button afterwards.
 */
export const SideMenu = memo(function SideMenu() {
  const open = useGameStore((state) => state.menuOpen);
  const setMenuOpen = useGameStore((state) => state.setMenuOpen);
  const mode = useGameStore((state) => state.mode);
  const coachEnabled = useGameStore((state) => state.coachEnabled);
  const setCoachEnabled = useGameStore((state) => state.setCoachEnabled);
  const showCoachThinking = useGameStore((state) => state.showCoachThinking);
  const setShowCoachThinking = useGameStore((state) => state.setShowCoachThinking);
  const dangerMode = useGameStore((state) => state.dangerMode);
  const setDangerMode = useGameStore((state) => state.setDangerMode);
  const soundEnabled = useGameStore((state) => state.soundEnabled);
  const setSoundEnabled = useGameStore((state) => state.setSoundEnabled);
  const requestNewGame = useGameStore((state) => state.requestNewGame);
  const enterEditMode = useGameStore((state) => state.enterEditMode);
  const resign = useGameStore((state) => state.resign);
  const moves = useGameStore((state) => state.moves);
  const result = useGameStore((state) => state.result);
  const turn = useGameStore((state) => (state.fen.split(' ')[1] === 'b' ? 'Black' : 'White'));

  const [confirmResign, setConfirmResign] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();

  const friend = mode === 'friend';
  const canResign = result.status === 'in-progress' && moves.length > 0;
  const close = () => setMenuOpen(false);

  // Focus in on open, back to whatever opened it on close; the page behind does
  // not scroll while the menu is up.
  useEffect(() => {
    if (!open) return;
    // Back to whatever opened the menu — or the menu button, since Safari does
    // not focus a button when it is tapped.
    const active = document.activeElement as HTMLElement | null;
    returnFocus.current =
      active && active !== document.body
        ? active
        : document.querySelector<HTMLElement>('[aria-label="Open menu"]');
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const id = requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(),
    );
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = overflow;
      returnFocus.current?.focus();
    };
  }, [open]);

  // Escape closes; Tab cycles inside. The resign prompt has its own Escape, so
  // the menu stands aside while it is up.
  useEffect(() => {
    if (!open || confirmResign) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => item.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, confirmResign, setMenuOpen]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="menu-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-0 z-50 bg-slate-950/55"
              onClick={close}
              aria-hidden
            />

            <motion.aside
              key="menu-panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              // Leaving is quicker than arriving: the system is responding now,
              // not presenting something new.
              exit={
                reduceMotion
                  ? { opacity: 0, transition: { duration: 0.15 } }
                  : { x: '-100%', transition: { duration: 0.22, ease: EASE_DRAWER } }
              }
              transition={{ duration: 0.34, ease: EASE_DRAWER }}
              // Swipe left to dismiss — started only from the panel itself, never
              // from a slider or a field, so dragging a slider moves the slider.
              drag={reduceMotion ? false : 'x'}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.8, right: 0 }}
              onPointerDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest('input, select, textarea, button, summary, a, label')) return;
                dragControls.start(event);
              }}
              onDragEnd={(_, info) => {
                // A short flick counts as much as a long drag.
                if (info.offset.x < -80 || info.velocity.x < -450) close();
              }}
              className="glass glass-thick fixed inset-y-0 left-0 z-50 flex w-[min(88vw,23rem)] touch-pan-y flex-col rounded-none rounded-r-3xl pt-[env(safe-area-inset-top)] shadow-2xl"
            >
              <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-5 sm:h-16">
                <h2 className="text-base font-bold text-slate-50">Menu</h2>
                <button
                  type="button"
                  data-autofocus
                  onClick={close}
                  aria-label="Close menu"
                  className="glass-control grid h-9 w-9 place-items-center rounded-full text-slate-300 transition-[color,transform] duration-150 ease-out hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 active:scale-[0.94]"
                >
                  <CloseIcon />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                <Section title="Play">
                  <ModeSwitch onSwitch={close} />
                  {friend ? (
                    <TimeControlPicker />
                  ) : (
                    <>
                      <ColorChoice />
                      <StrengthSettings />
                    </>
                  )}
                  {/* Glass, not blue: in this section blue marks what is selected. */}
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      close();
                      void requestNewGame();
                    }}
                  >
                    <NewGameIcon /> New game
                  </Button>
                </Section>

                {!friend && (
                  <Section title="Coach">
                    <SettingRow
                      label="Coach"
                      detail="Grades, hints and advice on every move"
                      checked={coachEnabled}
                      onChange={(value) => void setCoachEnabled(value)}
                    />
                    {coachEnabled && (
                      <>
                        <TipsRow />
                        <SettingRow
                          label="Thinking arrows"
                          detail="Show the coach's reasoning on the board, step by step"
                          checked={showCoachThinking}
                          onChange={setShowCoachThinking}
                        />
                        <SettingRow
                          label="Danger squares"
                          detail="Mark moves that lose material when you pick a piece up"
                          checked={dangerMode}
                          onChange={setDangerMode}
                        />
                      </>
                    )}
                  </Section>
                )}

                <Section title="Board">
                  <SettingRow
                    label="Sound"
                    detail="Moves, captures, check and the result"
                    checked={soundEnabled}
                    onChange={setSoundEnabled}
                  />
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      close();
                      enterEditMode();
                    }}
                  >
                    <PencilIcon /> Set up a position
                  </Button>
                  <TransferPanel />
                </Section>

                {!friend && (
                  <Section title="You">
                    <RatingSetting />
                    <EngineSelector />
                  </Section>
                )}

                <div className="border-t border-white/[0.06] px-5 py-4">
                  <Button
                    variant="danger"
                    className="w-full"
                    disabled={!canResign}
                    onClick={() => setConfirmResign(true)}
                  >
                    <FlagIcon /> {friend ? `${turn} resigns` : 'Resign'}
                  </Button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmResign}
        title={friend ? `${turn} resigns?` : 'Resign this game?'}
        message={
          friend
            ? `${turn === 'White' ? 'Black' : 'White'} wins the game.`
            : 'The game ends as a loss and counts towards your rating.'
        }
        confirmLabel="Resign"
        cancelLabel="Keep playing"
        onConfirm={() => {
          setConfirmResign(false);
          close();
          resign();
        }}
        onCancel={() => setConfirmResign(false)}
      />
    </>
  );
});

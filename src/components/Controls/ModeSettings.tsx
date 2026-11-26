import { useGameStore } from '../../store/gameStore';
import type { GameMode, TimeControl } from '../../types';

/** Minutes and seconds to a time control, for the preset table. */
const tc = (minutes: number, incrementSeconds: number): TimeControl => ({
  baseMs: minutes * 60_000,
  incrementMs: incrementSeconds * 1000,
});

/**
 * The standard time controls, grouped the way chess players name them.
 * "3+2" is three minutes each plus two seconds added after every move.
 */
const PRESETS: Array<{ group: string; controls: TimeControl[] }> = [
  { group: 'Bullet', controls: [tc(1, 0), tc(2, 1)] },
  { group: 'Blitz', controls: [tc(3, 0), tc(3, 2), tc(5, 0), tc(5, 3)] },
  { group: 'Rapid', controls: [tc(10, 0), tc(10, 5), tc(15, 10)] },
  { group: 'Classical', controls: [tc(30, 0), tc(30, 20)] },
];

/** "5+3" — minutes plus increment seconds. */
function label(control: TimeControl): string {
  return `${control.baseMs / 60_000}+${control.incrementMs / 1000}`;
}

function same(a: TimeControl | null, b: TimeControl | null): boolean {
  if (a === null || b === null) return a === b;
  return a.baseMs === b.baseMs && a.incrementMs === b.incrementMs;
}

/**
 * Computer or friend — a segmented control at the top of the Game panel.
 *
 * Switching starts a new game, so it goes through `requestNewGame` and asks
 * first when there is a game worth losing.
 */
export function ModeSwitch({ onSwitch }: { onSwitch?: () => void } = {}) {
  const mode = useGameStore((state) => state.mode);
  const requestNewGame = useGameStore((state) => state.requestNewGame);

  const options: Array<{ value: GameMode; label: string }> = [
    { value: 'computer', label: 'vs Computer' },
    { value: 'friend', label: 'vs Friend' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Opponent"
      className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.06]"
    >
      {options.map((option) => {
        const selected = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              if (selected) return;
              // Closing first, so a "start a new game?" prompt — or the new
              // game itself — is what you see next, not the menu over it.
              onSwitch?.();
              void requestNewGame({ mode: option.value });
            }}
            className={`min-h-9 rounded-lg text-sm font-semibold transition-[background-color,color,transform] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 active:scale-[0.97] ${
              selected ? 'glass-control text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The clock for a friend game: no limit (clocks count up, the default), or a
 * count-down control where running out of time loses.
 *
 * Picking one starts a new game with it — changing the clock halfway through a
 * game would not be the same game.
 */
export function TimeControlPicker() {
  const timeControl = useGameStore((state) => state.timeControl);
  const requestNewGame = useGameStore((state) => state.requestNewGame);

  const choose = (next: TimeControl | null) => {
    if (!same(next, timeControl)) void requestNewGame({ timeControl: next });
  };

  const chip = (selected: boolean) =>
    `min-h-9 rounded-lg px-2.5 text-sm font-semibold tabular-nums transition-[background-color,color,transform] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 active:scale-[0.96] ${
      selected
        ? 'glass-prominent bg-blue-500 text-white'
        : 'glass-control text-slate-300 hover:text-white'
    }`;

  return (
    <fieldset className="space-y-2">
      <legend className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        Clock
      </legend>

      <button
        type="button"
        aria-pressed={timeControl === null}
        onClick={() => choose(null)}
        className={`${chip(timeControl === null)} w-full`}
      >
        No limit — clocks count up
      </button>

      {PRESETS.map(({ group, controls }) => (
        <div key={group} className="flex items-center gap-2">
          <span className="w-[4.5rem] shrink-0 text-xs font-medium text-slate-500">{group}</span>
          <div className="flex flex-wrap gap-1.5">
            {controls.map((control) => {
              const selected = same(control, timeControl);
              return (
                <button
                  key={label(control)}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${control.baseMs / 60_000} minutes${
                    control.incrementMs ? ` plus ${control.incrementMs / 1000} seconds a move` : ''
                  }`}
                  onClick={() => choose(control)}
                  className={chip(selected)}
                >
                  {label(control)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-xs leading-relaxed text-slate-500">
        Each side gets the first number in minutes, plus the second in seconds after every move.
        Run out and you lose — unless your opponent has too little left to checkmate, which is a
        draw.
      </p>
    </fieldset>
  );
}

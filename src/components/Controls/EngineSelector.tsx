import { memo, useId, type ReactNode } from 'react';
import { ENGINES } from '../../engine/catalogue';
import type { EngineDefinition, EngineSettings, SettingRange } from '../../engine/types';
import { useGameStore } from '../../store/gameStore';

/**
 * Picking the engine that does the analysing.
 *
 * Written for someone who has never heard of Stockfish: the choice is one line
 * of plain English about what each engine is *for*, and the numbers that only
 * matter to an advanced user are folded away behind "Engine settings". Anything
 * the selected engine does not support is not shown at all, rather than shown
 * greyed out — an option that cannot do anything is just noise.
 */

/** Short badge describing where an engine runs and what it costs to fetch. */
function EngineFacts({ engine }: { engine: EngineDefinition }) {
  const facts: ReactNode[] = [
    engine.location === 'local' ? (
      <span key="where" className="text-emerald-300/90">
        Runs on your device
      </span>
    ) : (
      <span key="where" className="text-amber-300/90">
        Needs an internet service
      </span>
    ),
  ];

  if (engine.strengthElo) facts.push(<span key="elo">~{engine.strengthElo} Elo</span>);
  if (engine.downloadMb) facts.push(<span key="size">{engine.downloadMb} MB download</span>);
  facts.push(<span key="tech">{engine.technology}</span>);

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] text-slate-500">
      {facts.map((fact, index) => (
        <span key={index} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden>·</span>}
          {fact}
        </span>
      ))}
    </p>
  );
}

/** A numeric engine setting with a slider and a live value. */
function SettingSlider({
  label,
  range,
  value,
  hint,
  format = String,
  onChange,
}: {
  label: string;
  range: SettingRange;
  value: number;
  hint: string;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-slate-400">
          {label}
        </label>
        <span className="font-mono text-xs font-semibold text-blue-300">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-5 w-full cursor-pointer accent-blue-500"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-[0.7rem] leading-relaxed text-slate-500">
        {hint}
      </p>
    </div>
  );
}

/**
 * A setting that can either follow the app's own sliders or be pinned.
 *
 * Depth and thinking time are already derived from the coach and opponent
 * strength sliders, which is the right answer for almost everyone. This lets an
 * advanced user override that without making everyone else choose a number.
 */
function AutoSetting({
  label,
  range,
  value,
  hint,
  autoHint,
  format,
  onChange,
}: {
  label: string;
  range: SettingRange;
  value: number | null;
  hint: string;
  autoHint: string;
  format?: (value: number) => string;
  onChange: (value: number | null) => void;
}) {
  const id = useId();

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-[0.7rem] text-slate-400">
          <input
            id={id}
            type="checkbox"
            checked={value === null}
            onChange={(event) => onChange(event.target.checked ? null : range.fallback)}
            className="h-3.5 w-3.5 cursor-pointer accent-blue-500"
          />
          Automatic
        </label>
      </div>

      {value === null ? (
        <p className="text-[0.7rem] leading-relaxed text-slate-500">{autoHint}</p>
      ) : (
        <SettingSlider
          label={label}
          range={range}
          value={value}
          hint={hint}
          format={format}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** The advanced panel: only the settings this engine actually honours. */
function EngineSettingsPanel({
  engine,
  settings,
  onChange,
}: {
  engine: EngineDefinition;
  settings: EngineSettings;
  onChange: <K extends keyof EngineSettings>(key: K, value: EngineSettings[K]) => void;
}) {
  const { capabilities, limits } = engine;

  return (
    <details className="mt-2 rounded-lg border border-slate-800/80 bg-slate-950/40">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:text-slate-200">
        Engine settings
        <span aria-hidden className="float-right text-slate-600">
          ▾
        </span>
      </summary>

      <div className="space-y-3 border-t border-slate-800/80 px-3 py-3">
        {capabilities.depth && (
          <AutoSetting
            label="Analysis depth"
            range={limits.depth}
            value={settings.depth}
            autoHint="Follows the coach strength slider above."
            hint="Moves ahead the coach searches. Deeper is more accurate and slower."
            onChange={(value) => onChange('depth', value)}
          />
        )}

        {capabilities.moveTime && (
          <AutoSetting
            label="Thinking time"
            range={limits.moveTimeMs}
            value={settings.moveTimeMs}
            autoHint="Follows the opponent Elo slider above."
            hint="How long the opponent may think about its own move."
            format={(value) => `${(value / 1000).toFixed(1)}s`}
            onChange={(value) => onChange('moveTimeMs', value)}
          />
        )}

        {capabilities.multiPv && (
          <SettingSlider
            label="Candidate moves"
            range={limits.multiPv}
            value={settings.multiPv}
            hint="How many alternatives the coach compares. More costs search time."
            onChange={(value) => onChange('multiPv', value)}
          />
        )}

        {capabilities.threads && (
          <SettingSlider
            label="CPU threads"
            range={limits.threads}
            value={settings.threads}
            hint="More threads search faster. Above your core count it gets slower, not faster."
            onChange={(value) => onChange('threads', value)}
          />
        )}

        {capabilities.hash && (
          <SettingSlider
            label="Memory"
            range={limits.hashMb}
            value={settings.hashMb}
            hint="Table the engine remembers positions in. Large values can crash a phone."
            format={(value) => `${value} MB`}
            onChange={(value) => onChange('hashMb', value)}
          />
        )}
      </div>
    </details>
  );
}

/** The engine picker, with its description and advanced settings. */
export const EngineSelector = memo(function EngineSelector() {
  const engine = useGameStore((state) => state.engineDefinition);
  const settings = useGameStore((state) => state.engineSettings);
  const fallback = useGameStore((state) => state.engineFallback);
  const status = useGameStore((state) => state.engineStatus);
  const setEngine = useGameStore((state) => state.setEngine);
  const setEngineSetting = useGameStore((state) => state.setEngineSetting);
  const id = useId();

  return (
    <div>
      <label
        htmlFor={id}
        className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500"
      >
        Chess engine
      </label>

      <select
        id={id}
        value={engine.id}
        onChange={(event) => void setEngine(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700/70 bg-slate-900 px-2.5 py-2 text-sm font-semibold text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400"
        aria-describedby={`${id}-description`}
      >
        {ENGINES.map((option) => {
          const availability = option.isAvailable();
          return (
            <option key={option.id} value={option.id} disabled={!availability.ok}>
              {option.name}
              {availability.ok ? '' : ' — unavailable here'}
            </option>
          );
        })}
      </select>

      <p id={`${id}-description`} className="mt-1.5 text-xs leading-relaxed text-slate-400">
        {engine.description}
      </p>
      <EngineFacts engine={engine} />

      {/* Why you are not on the engine you picked. Worth the space: silently
          running something else would be worse than the failure itself. */}
      {fallback && (
        <p
          role="status"
          className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[0.7rem] leading-relaxed text-amber-200"
        >
          {fallback}
        </p>
      )}

      {status === 'loading' && (
        <p className="mt-2 text-[0.7rem] text-slate-500" aria-live="polite">
          Starting {engine.name}…
        </p>
      )}

      <EngineSettingsPanel engine={engine} settings={settings} onChange={setEngineSetting} />
    </div>
  );
});

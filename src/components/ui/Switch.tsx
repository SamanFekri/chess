/**
 * An accessible on/off switch.
 *
 * Built on a native `<button role="switch">` rather than a styled checkbox, so
 * screen readers announce it as a switch with an on/off state and it responds to
 * Space and Enter without extra key handling.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  labelClassName = '',
  size = 'md',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Optional hint text; also used as the accessible description. */
  description?: string;
  /**
   * Extra classes for the visible label — pass `hidden sm:inline` to drop it on
   * narrow screens. The accessible name comes from `aria-label`, so hiding the
   * text costs nothing for screen readers.
   */
  labelClassName?: string;
  /**
   * `sm` for switches that sit inside a panel header alongside other controls,
   * where a full-size track dominates a row it is only a corner of. The tap
   * target stays finger-sized either way — only the drawing shrinks.
   */
  size?: 'sm' | 'md';
}) {
  const small = size === 'sm';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={description ? `${label}. ${description}` : label}
      onClick={() => onChange(!checked)}
      className={`group inline-flex items-center rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
        small ? 'min-h-8 shrink-0 gap-1 px-0' : 'min-h-11 gap-2.5 px-1'
      }`}
    >
      {/* Compact on phones so the header stays on one line, full size from `sm`. */}
      <span
        aria-hidden
        className={`relative shrink-0 rounded-full transition-colors ${
          small ? 'h-3.5 w-6' : 'h-5 w-9 sm:h-6 sm:w-11'
        } ${checked ? 'bg-blue-500' : 'bg-slate-700'}`}
      >
        <span
          className={`absolute rounded-full bg-white shadow transition-[left] duration-200 ease-out ${
            small
              ? `top-0.5 h-2.5 w-2.5 ${checked ? 'left-[0.8125rem]' : 'left-0.5'}`
              : `top-0.5 h-4 w-4 sm:h-5 sm:w-5 ${checked ? 'left-[1.125rem] sm:left-[1.375rem]' : 'left-0.5'}`
          }`}
        />
      </span>
      <span
        className={`font-semibold transition-colors ${
          checked ? 'text-slate-100' : 'text-slate-400'
        } ${labelClassName}`}
      >
        {label}
      </span>
    </button>
  );
}

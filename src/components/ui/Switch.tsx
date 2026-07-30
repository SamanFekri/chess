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
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={description ? `${label}. ${description}` : label}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 items-center gap-2.5 rounded-xl px-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
    >
      {/* Compact on phones so the header stays on one line, full size from `sm`. */}
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors sm:h-6 sm:w-11 ${
          checked ? 'bg-blue-500' : 'bg-slate-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-200 ease-out sm:h-5 sm:w-5 ${
            checked ? 'left-[1.125rem] sm:left-[1.375rem]' : 'left-0.5'
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

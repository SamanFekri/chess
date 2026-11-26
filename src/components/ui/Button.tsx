import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

/**
 * Secondary and ghost are panes of glass; primary, danger and success are
 * tinted glass — the colour goes on the background, not the label, which is how
 * the platform marks the one action that matters (`liquid-glass.md › Color on
 * glass`). Keep tinted buttons to one or two in view.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'glass-prominent bg-blue-500 text-white [--prominent-glow:rgb(59_130_246/0.6)] hover:bg-blue-400 focus-visible:outline-blue-400 disabled:hover:bg-blue-500',
  secondary: 'glass-control text-slate-100 focus-visible:outline-slate-300',
  ghost:
    'bg-transparent text-slate-300 ring-1 ring-inset ring-white/10 hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-slate-300',
  danger:
    'glass-prominent bg-red-500/90 text-white [--prominent-glow:rgb(239_68_68/0.5)] hover:bg-red-500 focus-visible:outline-red-400 disabled:hover:bg-red-500/90',
  success:
    'glass-prominent bg-emerald-500 text-slate-950 [--prominent-glow:rgb(16_185_129/0.55)] hover:bg-emerald-400 focus-visible:outline-emerald-300 disabled:hover:bg-emerald-500',
};

/**
 * The app's button.
 *
 * `min-h-11` is not decorative: it keeps every control at or above the ~44px
 * touch target that phone use requires, which is also comfortable with a mouse.
 *
 * Presses scale to 0.97 so the button visibly gives under the finger. Only
 * colour and transform transition, and only for 150ms: these are pressed on
 * every move, so anything slower would feel like lag.
 */
export function Button({
  variant = 'secondary',
  className = '',
  children,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
  /** React 19 takes `ref` as an ordinary prop, so no `forwardRef` is needed. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-sm font-semibold sm:gap-2 sm:px-3.5 [&>svg]:shrink-0 transition-[background-color,color,transform] duration-150 ease-out [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

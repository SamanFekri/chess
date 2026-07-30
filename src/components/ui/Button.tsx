import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-blue-500 text-white hover:bg-blue-400 focus-visible:outline-blue-400 disabled:hover:bg-blue-500',
  secondary:
    'bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:outline-slate-400 disabled:hover:bg-slate-800',
  ghost:
    'bg-transparent text-slate-300 ring-1 ring-inset ring-slate-700 hover:bg-slate-800/70 focus-visible:outline-slate-400',
  danger:
    'bg-red-500/90 text-white hover:bg-red-500 focus-visible:outline-red-400 disabled:hover:bg-red-500/90',
  success:
    'bg-emerald-500 text-slate-950 hover:bg-emerald-400 focus-visible:outline-emerald-300 disabled:hover:bg-emerald-500',
};

/**
 * The app's button.
 *
 * `min-h-11` is not decorative: it keeps every control at or above the ~44px
 * touch target that phone use requires, which is also comfortable with a mouse.
 */
export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

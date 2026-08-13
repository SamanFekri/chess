import type { ReactNode } from 'react';

/**
 * The card surface every panel in the app sits on.
 *
 * One component rather than repeated class strings, so spacing, radius and
 * border treatment stay identical across the board, sidebar and move list.
 */
export function Panel({
  title,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg shadow-slate-950/30 backdrop-blur ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-3">
          {/* `min-w-0` so a long title gives way to the controls beside it
              rather than pushing them onto a second line. */}
          <h2 className="min-w-0 text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
          {action}
        </header>
      )}
      <div className={`px-4 py-3 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** A labelled row of prose, used throughout the coaching sidebar. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-relaxed text-slate-300">{children}</dd>
    </div>
  );
}

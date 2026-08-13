import type { ExplainRole } from '../../types';

/**
 * The visual vocabulary of Explain Mode.
 *
 * Every role gets a colour *and* a distinct shape of highlight. The colour alone
 * would not survive colour blindness or a phone screen in sunlight, and these
 * marks carry meaning — "this is the move" versus "this can be taken" — so the
 * shape has to say it too.
 *
 * The colours deliberately reuse the ones the rest of the app already assigns to
 * these ideas: emerald is advice (the hint arrow), red is danger (the capture
 * ring), amber is a warning (danger mode), violet is the exposure crosshair.
 */

export interface RoleStyle {
  /** Arrow colour. */
  arrow: string;
  /** Ring drawn inside the square. */
  ring: string;
  /** Wash over the square, behind the piece. */
  wash: string;
  /** Legend label. */
  label: string;
  /** Tailwind text colour for the legend and caption. */
  text: string;
}

export const ROLE_STYLES: Record<ExplainRole, RoleStyle> = {
  recommended: {
    arrow: 'rgba(16, 185, 129, 0.95)',
    ring: 'inset 0 0 0 4px rgba(16, 185, 129, 0.95)',
    wash: 'rgba(16, 185, 129, 0.22)',
    label: 'Play this',
    text: 'text-emerald-300',
  },
  variation: {
    arrow: 'rgba(56, 189, 248, 0.85)',
    ring: 'inset 0 0 0 3px rgba(56, 189, 248, 0.85)',
    wash: 'rgba(56, 189, 248, 0.18)',
    label: 'What follows',
    text: 'text-sky-300',
  },
  threat: {
    arrow: 'rgba(248, 113, 113, 0.92)',
    ring: 'inset 0 0 0 4px rgba(248, 113, 113, 0.92)',
    wash: 'rgba(248, 113, 113, 0.24)',
    label: 'Their threat',
    text: 'text-red-300',
  },
  defence: {
    arrow: 'rgba(167, 139, 250, 0.92)',
    ring: 'inset 0 0 0 4px rgba(167, 139, 250, 0.92)',
    wash: 'rgba(167, 139, 250, 0.20)',
    label: 'Safety first',
    text: 'text-violet-300',
  },
  target: {
    arrow: 'rgba(251, 191, 36, 0.92)',
    ring: 'inset 0 0 0 4px rgba(251, 191, 36, 0.92)',
    wash: 'rgba(251, 191, 36, 0.22)',
    label: 'You attack this',
    text: 'text-amber-300',
  },
  idea: {
    arrow: 'rgba(148, 163, 184, 0.85)',
    ring: 'inset 0 0 0 3px rgba(148, 163, 184, 0.8)',
    wash: 'rgba(148, 163, 184, 0.16)',
    label: 'Another idea',
    text: 'text-slate-300',
  },
};

/** Roles in the order the legend lists them. */
export const LEGEND_ORDER: ExplainRole[] = [
  'recommended',
  'variation',
  'target',
  'threat',
  'defence',
  'idea',
];

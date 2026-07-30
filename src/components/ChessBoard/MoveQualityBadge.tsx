import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { QUALITY_STYLES } from '../../engine/analysis';
import { useGameStore } from '../../store/gameStore';
import type { MoveQuality, PlayerColor } from '../../types';

/** Badge width as a percentage of the board's width (a square is 12.5%). */
const BADGE_SIZE_PERCENT = 5.6;

/**
 * Verdicts worth marking on the board.
 *
 * Only the standouts in either direction. Badging every move would put a sticker
 * on the board constantly — including for ordinary "Good" moves, where it says
 * nothing — and the marks would stop registering as signal.
 */
const BADGED: MoveQuality[] = ['brilliant', 'great', 'mistake', 'blunder'];

const FILES = 'abcdefgh';

/** Width of one square, as a percentage of the board. */
const SQUARE_PERCENT = 12.5;

/**
 * Board-relative percentages for the *centre* of the badge on a given square.
 *
 * The badge is tucked fully inside the square's top-right corner rather than
 * centred on the corner point itself — centring on the corner would leave three
 * quarters of the badge sitting in the neighbouring squares, which reads as the
 * mark being on the wrong square.
 *
 * The overlay does its own coordinate maths rather than hooking into the board's
 * internals, which keeps the badge correct when the board is flipped and means
 * nothing breaks if the library changes how it renders squares.
 */
function badgeCenterOf(square: string, orientation: PlayerColor): { left: number; top: number } {
  const fileIndex = FILES.indexOf(square[0]);
  const rank = Number(square[1]);

  const column = orientation === 'white' ? fileIndex : 7 - fileIndex;
  const row = orientation === 'white' ? 8 - rank : rank - 1;

  // Half a badge in from the square's top-right corner, so it sits flush inside
  // it. This is always on the board, so no clamping is needed.
  const inset = BADGE_SIZE_PERCENT / 2;
  return {
    left: (column + 1) * SQUARE_PERCENT - inset,
    top: row * SQUARE_PERCENT + inset,
  };
}

/**
 * The move-quality badge pinned to the piece that just moved.
 *
 * Shows the verdict where the player is already looking — on the board — instead
 * of only in the sidebar. Only graded moves get one, which in practice means the
 * player's own moves; the engine's moves are explained in prose instead.
 */
export const MoveQualityBadge = memo(function MoveQualityBadge() {
  const moves = useGameStore((state) => state.moves);
  const viewingPly = useGameStore((state) => state.viewingPly);
  const orientation = useGameStore((state) => state.boardOrientation);
  const coachEnabled = useGameStore((state) => state.coachEnabled);

  /**
   * While browsing, badge the move being viewed; otherwise badge the most recent
   * graded move, so the verdict stays visible through the opponent's reply.
   *
   * Once you have played on, an earlier move's badge is gone — only the latest
   * graded move is considered, never the last *badge-worthy* one.
   */
  const target = useMemo(() => {
    if (viewingPly !== null) {
      const viewed = moves.find((move) => move.ply === viewingPly);
      return viewed?.quality && BADGED.includes(viewed.quality) ? viewed : null;
    }
    for (let index = moves.length - 1; index >= 0; index -= 1) {
      const move = moves[index];
      if (!move.quality) continue;
      return BADGED.includes(move.quality) ? move : null;
    }
    return null;
  }, [moves, viewingPly]);

  // Guard on the switch as well as on the data: a game played with the coach on
  // and then switched off would otherwise keep its badges.
  if (!coachEnabled || !target?.quality) return null;

  const style = QUALITY_STYLES[target.quality];
  const destination = target.uci.slice(2, 4);
  const { left, top } = badgeCenterOf(destination, orientation);

  return (
    <motion.div
      // Re-keying on the square makes the badge pop in again when it moves.
      key={`${target.ply}-${destination}`}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22 }}
      className="pointer-events-none absolute z-10 aspect-square -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${BADGE_SIZE_PERCENT}%`,
      }}
      aria-hidden
    >
      {/* An SVG viewBox scales the glyph with the board, so the badge stays
          legible on a phone and does not balloon on a large desktop board. */}
      <svg viewBox="0 0 24 24" className="h-full w-full">
        <circle cx="12" cy="12" r="11" fill={style.hex} stroke="#020617" strokeWidth="1.6" />
        <text
          x="12"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="13"
          fontWeight="700"
          fill="#020617"
        >
          {style.icon}
        </text>
      </svg>
    </motion.div>
  );
});

/**
 * Screen-reader announcement of the same verdict.
 *
 * The badge itself is `aria-hidden` because a coloured glyph on a square conveys
 * nothing without sight; this states the move and its grade in words.
 */
export const MoveQualityAnnouncement = memo(function MoveQualityAnnouncement() {
  const moves = useGameStore((state) => state.moves);
  const coachEnabled = useGameStore((state) => state.coachEnabled);

  const latest = useMemo(() => {
    for (let index = moves.length - 1; index >= 0; index -= 1) {
      if (moves[index].quality) return moves[index];
    }
    return null;
  }, [moves]);

  if (!coachEnabled || !latest?.quality) return null;

  return (
    <p className="sr-only" role="status" aria-live="polite">
      {latest.san}: {QUALITY_STYLES[latest.quality].label}
    </p>
  );
});

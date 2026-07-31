import { memo } from 'react';
import type { Color, PieceSymbol } from 'chess.js';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { PIECE_NAME } from '../../utils/chess';
import { GLYPH_TINT, PIECE_GLYPH } from '../../utils/pieceGlyphs';

/** Offered in descending value — queen is right the vast majority of the time. */
const CHOICES: Array<'q' | 'r' | 'b' | 'n'> = ['q', 'r', 'b', 'n'];

/** Why you might want each one, since that is the part worth teaching. */
const REASON: Record<'q' | 'r' | 'b' | 'n', string> = {
  q: 'Strongest — the right choice almost every time.',
  r: 'Avoids stalemate when a queen would leave the enemy king with no move.',
  b: 'Rarely useful, but never stalemates.',
  n: 'The one piece a queen cannot imitate — sometimes it forks or mates at once.',
};

/**
 * Piece chooser shown over the board when a pawn reaches the last rank.
 *
 * Modal on purpose: the move is held un-played until a piece is chosen, so there
 * is nothing sensible to do on the board until this is answered. Escape or the
 * backdrop cancels and returns the pawn.
 */
export const PromotionChooser = memo(function PromotionChooser() {
  const pending = useGameStore((state) => state.pendingPromotion);
  const resolvePromotion = useGameStore((state) => state.resolvePromotion);
  const playerColor = useGameStore((state) => state.playerColor);

  if (!pending) return null;

  const color: Color = playerColor === 'white' ? 'w' : 'b';

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a piece to promote to"
      onClick={() => resolvePromotion(null)}
      onKeyDown={(event) => event.key === 'Escape' && resolvePromotion(null)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16 }}
        className="mx-3 w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-center text-sm font-semibold text-slate-200">
          Promote your pawn to…
        </p>

        <div className="mt-2 grid grid-cols-4 gap-2">
          {CHOICES.map((piece) => (
            <button
              key={piece}
              type="button"
              autoFocus={piece === 'q'}
              onClick={() => resolvePromotion(piece as PieceSymbol)}
              title={REASON[piece]}
              aria-label={`Promote to ${PIECE_NAME[piece]}. ${REASON[piece]}`}
              className="grid aspect-square place-items-center rounded-xl bg-[#dfe6ee] text-3xl leading-none transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              <span className={GLYPH_TINT[color]}>{PIECE_GLYPH[piece]}</span>
            </button>
          ))}
        </div>

        <p className="mt-2 text-center text-[0.7rem] leading-relaxed text-slate-500">
          A knight is the only piece a queen cannot copy — worth a look if it forks or mates.
        </p>

        <button
          type="button"
          onClick={() => resolvePromotion(null)}
          className="mt-2 w-full rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
});

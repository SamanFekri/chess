import { memo, useState } from 'react';
import type { Color, PieceSymbol } from 'chess.js';
import { useGameStore } from '../../store/gameStore';
import { PIECE_NAME } from '../../utils/chess';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { TrashIcon } from '../ui/icons';

/** Unicode glyph for each piece, by colour. */
const GLYPH: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

/** Palette order — most-used pieces first. */
const PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p', 'k'];

/** One selectable palette entry. */
function PaletteButton({
  glyph,
  label,
  selected,
  onClick,
}: {
  glyph: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={`grid aspect-square min-h-11 place-items-center rounded-xl text-2xl leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
        selected
          ? 'bg-blue-500/90 text-white ring-2 ring-blue-300'
          : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
      }`}
    >
      {glyph}
    </button>
  );
}

/** A labelled pair of side buttons, shared by both colour choices. */
function SideChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`min-h-11 rounded-xl text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
              value === option.value
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Position editor: pick a piece, tap squares to place it, then start playing.
 *
 * Tap-to-place rather than drag-and-drop, because it is the one interaction that
 * works identically with a mouse and a thumb, and placing the same piece on
 * several squares in a row costs one tap each instead of a drag each.
 */
export const PositionEditor = memo(function PositionEditor() {
  const editFen = useGameStore((state) => state.editFen);
  const editSelection = useGameStore((state) => state.editSelection);
  const setEditSelection = useGameStore((state) => state.setEditSelection);
  const setEditTurn = useGameStore((state) => state.setEditTurn);
  const editPlayerColor = useGameStore((state) => state.editPlayerColor);
  const setEditPlayerColor = useGameStore((state) => state.setEditPlayerColor);
  const resetEditBoard = useGameStore((state) => state.resetEditBoard);
  const startFromEditPosition = useGameStore((state) => state.startFromEditPosition);
  const cancelEditMode = useGameStore((state) => state.cancelEditMode);

  const [error, setError] = useState<string | null>(null);
  const turn: Color = editFen.split(' ')[1] === 'b' ? 'b' : 'w';

  const isSelected = (color: Color, type: PieceSymbol) =>
    editSelection !== 'erase' && editSelection.color === color && editSelection.type === type;

  const start = async () => {
    const failure = await startFromEditPosition();
    setError(failure);
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden>✎</span> Set up a position
        </span>
      }
      bodyClassName="space-y-3 px-4 py-3"
    >
      <p className="text-xs leading-relaxed text-slate-400">
        Pick a piece, then tap the squares to place it. Tap the eraser to clear a square.
      </p>

      {(['w', 'b'] as Color[]).map((color) => (
        <div key={color}>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {color === 'w' ? 'White' : 'Black'}
          </p>
          <div className="mt-1 grid grid-cols-6 gap-1.5">
            {PIECES.map((type) => (
              <PaletteButton
                key={type}
                glyph={GLYPH[color][type]}
                label={`${color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[type]}`}
                selected={isSelected(color, type)}
                onClick={() => setEditSelection({ type, color })}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={editSelection === 'erase' ? 'primary' : 'ghost'}
          onClick={() => setEditSelection('erase')}
          aria-pressed={editSelection === 'erase'}
        >
          <TrashIcon /> Eraser
        </Button>
        <Button variant="ghost" onClick={() => resetEditBoard('empty')}>
          Clear
        </Button>
        <Button variant="ghost" onClick={() => resetEditBoard('start')}>
          Reset
        </Button>
      </div>

      <SideChoice
        label="Who moves first"
        value={turn}
        onChange={setEditTurn}
        options={[
          { value: 'w', label: '♔ White' },
          { value: 'b', label: '♚ Black' },
        ]}
      />

      <SideChoice
        label="You play"
        value={editPlayerColor}
        onChange={setEditPlayerColor}
        options={[
          { value: 'white', label: '♔ White' },
          { value: 'black', label: '♚ Black' },
        ]}
      />

      <p className="text-xs leading-relaxed text-slate-500">
        {editPlayerColor.charAt(0).toUpperCase() + editPlayerColor.slice(1)} at the bottom of the
        board.{' '}
        {(turn === 'w') === (editPlayerColor === 'white')
          ? 'You move first.'
          : 'The engine moves first — useful for practising a defence.'}
      </p>

      {error && (
        <p role="alert" className="text-xs leading-relaxed text-red-300">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={cancelEditMode}>
          Cancel
        </Button>
        <Button variant="success" onClick={() => void start()}>
          ▶ Start game
        </Button>
      </div>

      <p className="break-all font-mono text-[0.65rem] leading-relaxed text-slate-600">{editFen}</p>
    </Panel>
  );
});

import { AnimatePresence } from 'framer-motion';
import { ChessBoard } from './components/ChessBoard/ChessBoard';
import { ExplainOverlay } from './components/ChessBoard/ExplainOverlay';
import { CoachPanel } from './components/CoachPanel/CoachPanel';
import { Controls } from './components/Controls/Controls';
import { EvaluationBar } from './components/EvaluationBar/EvaluationBar';
import { GameReview } from './components/GameReview/GameReview';
import { Header, TurnBar } from './components/Header/Header';
import { MoveList } from './components/MoveList/MoveList';
import { PositionEditor } from './components/EditPosition/PositionEditor';
import { NewGameConfirm } from './components/Controls/NewGameConfirm';
import { QuickActions } from './components/Controls/QuickActions';
import { useEngineBoot } from './hooks/useEngineBoot';
import { useGameClock } from './hooks/useGameClock';
import { useSoundUnlock } from './hooks/useSoundUnlock';
import { useUndoShortcut } from './hooks/useUndoShortcut';
import { useGameStore } from './store/gameStore';

/**
 * The board and the controls docked beneath it.
 *
 * @param withEvaluation Whether to reserve space for the evaluation bar.
 */
function BoardColumn({ withEvaluation }: { withEvaluation: boolean }) {
  return (
    <div className="flex items-stretch gap-3">
      {withEvaluation && (
        <div className="hidden sm:block">
          <EvaluationBar orientation="vertical" />
        </div>
      )}

      <div className="mx-auto w-full max-w-[min(100%,calc(100vh-18rem))]">
        {/* Turn and your colour, immediately above the board. */}
        <div className="mb-2">
          <TurnBar />
        </div>

        {withEvaluation && (
          <div className="mb-3 sm:hidden">
            <EvaluationBar orientation="horizontal" />
          </div>
        )}

        {/* Above the board, not over it — a card that describes the position
            must not be the thing hiding it. Lives here rather than inside
            ChessBoard so it pushes the board down instead of floating on top
            of the squares. */}
        <AnimatePresence>
          <ExplainOverlay />
        </AnimatePresence>

        <ChessBoard />

        {/* Directly under the board: the controls used on every move. */}
        <div className="mt-3">
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

/**
 * Application shell and responsive layout.
 *
 * With coaching on: a single flex column on phones — board, evaluation, coach,
 * moves, controls — that becomes a two-column grid from `lg` up with the coach in
 * a sticky sidebar. Grid placement rather than duplicated markup keeps one
 * instance of each panel, so nothing subscribes to the store twice.
 *
 * With coaching off there is no sidebar, so the layout collapses to a single
 * centred column; a full-width board on a desktop would otherwise be enormous.
 */
export default function App() {
  useEngineBoot();
  useUndoShortcut();
  useGameClock();
  useSoundUnlock();
  const coachEnabled = useGameStore((state) => state.coachEnabled);
  const editMode = useGameStore((state) => state.editMode);

  // While editing, the board and the editor are the only things worth showing —
  // move list, coaching and evaluation all describe a game that is not running.
  if (editMode) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Header />

        <main className="mx-auto flex max-w-5xl flex-col gap-4 px-3 pb-10 pt-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="mx-auto w-full max-w-[min(100%,calc(100vh-14rem))]">
            <ChessBoard />
          </div>
          <PositionEditor />
        </main>

        <NewGameConfirm />
      </div>
    );
  }

  if (!coachEnabled) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Header />

        <main className="mx-auto flex max-w-3xl flex-col gap-4 px-3 pb-10 pt-4 sm:px-6">
          <BoardColumn withEvaluation={false} />

          <section className="grid gap-4 sm:grid-cols-2">
            <MoveList />
            <Controls />
          </section>
        </main>

        <GameReview />
        <NewGameConfirm />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <main className="mx-auto flex max-w-[100rem] flex-col gap-4 px-3 pb-10 pt-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="lg:col-start-1 lg:row-start-1">
          <BoardColumn withEvaluation />
        </section>

        {/* Coach — under the board on mobile, sticky sidebar on desktop. */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-4">
          <CoachPanel />
        </aside>

        <section className="grid gap-4 sm:grid-cols-2 lg:col-start-1 lg:row-start-2">
          <MoveList />
          <Controls />
        </section>
      </main>

      <GameReview />
      <NewGameConfirm />
    </div>
  );
}

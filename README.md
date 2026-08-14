# Shatranj AI

Play chess against Stockfish in your browser and get live, plain-English coaching after every
move. No backend, no API keys, no accounts — the engine runs locally in a Web Worker.

## What it does

- **Play Stockfish** at any strength from 400 Elo to full strength, set with a direct Elo slider.
- **Choose your engine** — three free, local Stockfish builds, with per-engine settings for depth,
  thinking time, candidate moves, threads and memory.
- **Explain Mode** — stop the game and draw your own arrows and circles on the board with a mouse
  or a finger. Playing on clears them.
- **Show how the coach thinks** — a separate switch that has the coach draw *its* reasoning:
  arrows for the move it wants, the line that follows and the threats against you, one step at a
  time with a sentence for each.
- **Separate coach-strength slider** (1000–3200) controlling how deep the coach looks — shallower
  means faster feedback, deeper means it catches more.
- **Danger mode** (off by default): pick up a piece and the squares where it could be captured are
  marked in red. Nested under the coach switch.
- **Installable**: add it to a phone's home screen and it runs standalone with its own icon.
- **Set up any position** by hand in edit mode, then start playing from it.
- **Material count** shown above the board (`+3` / `−2`) in conventional points.
- **Coaching after every move.** Each move is graded (Brilliant → Blunder) and explained in
  plain English: what it achieved, what it left behind, and what happens next.
- **Verdict on the board.** A coloured badge lands on the piece you just moved, and a speech
  cloud in the corner of the board gives the one-line version — so you can see whether a move was
  a blunder or excellent without looking away from the board.
- **Better options.** After a mistake, the top three engine moves are shown, each with its own
  one-line reason.
- **Opponent explanations.** Every engine move is explained — what it threatens and what to
  watch out for.
- **Hint button** that draws an arrow for the best move on the board and explains why it is
  good, without playing it.
- **Live evaluation** bar, score, search depth, best move and expected continuation.
- **Position read-out**: threats, tactical and strategic ideas, king safety, piece activity,
  centre control, pawn structure and concrete plans.
- **Post-game review**: accuracy, move breakdown, the moments worth revisiting, opening played
  and actionable advice.
- **Import/export** PGN and FEN; download the game as a PGN.
- **Coach on/off switch** in the header. Off means a plain game: no grades, hints, badges or
  evaluation — and no analysis searches are run at all, so it is lighter on the CPU too.
- **Your game is saved** to `localStorage` as you play. Close the tab and reopen it and the
  position, move list and coaching history are still there.
- **Estimated Elo**, kept in `localStorage` and shown in the header. It updates after every
  finished game and can be set manually if you already know roughly how strong you are.

## Running locally

```bash
npm install
npm run dev
```

Then open the printed URL. `npm install` fetches the Stockfish package, and a `predev` step
copies the engine into `public/stockfish/`.

```bash
npm run build      # type-check and build into dist/
npm run preview    # serve the production build
npm run typecheck  # types only
```

## Deploying to GitHub Pages

The repository ships a workflow at [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
that builds the app on every push to `main` and force-pushes the result to a **`gh-pages`**
branch. You never build locally or commit `dist/` yourself — `main` holds only source.

### Step 1 — push the code to GitHub

If the repository does not exist on GitHub yet, create it and push:

```bash
git add .
git commit -m "Shatranj AI"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

If you already have the remote set up, a plain `git push` is enough.

### Step 2 — let the workflow create the branch

Push to `main` and the workflow builds and creates the `gh-pages` branch for you. Watch it under
the **Actions** tab; the first run takes a couple of minutes, mostly downloading the Stockfish
package. To run it without pushing anything, go to **Actions** → **Deploy to GitHub Pages** →
**Run workflow**.

The `gh-pages` branch has to exist before step 3 offers it as an option, so run the workflow
first.

### Step 3 — point Pages at the branch

This is the one step that cannot be done from a file in the repository.

1. Open your repository on GitHub.
2. Go to **Settings** → **Pages** (in the left sidebar, under "Code and automation").
3. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
4. Set **Branch** to **`gh-pages`** and the folder to **`/ (root)`**, then press **Save**.

You only do this once. Every later push to `main` updates the branch and the live site follows.

### Step 4 — open the site

```
https://<user>.github.io/<repo>/
```

The URL is shown under **Settings → Pages** once the first deploy has been published. It can take
a minute or two to go live after the branch is pushed.

If you named the repository `<user>.github.io`, the site is served from the domain root at
`https://<user>.github.io/` instead.

### Why no configuration is needed for the repository name

Vite is built with `base: './'`, so every asset is referenced relatively. The same `dist/` works
from a domain root, from a project subpath such as `/chess/`, or straight off the local
filesystem — so you never have to set the repository name anywhere, and renaming the repository
does not break the build.

The Stockfish worker follows the same rule: it resolves its script URL against `document.baseURI`
and then locates its own `.wasm` sibling, so it works at any subpath too.

### If something goes wrong

- **The workflow succeeds but the site 404s** — step 3 was skipped, or Pages is pointed at `main`
  instead of `gh-pages`. Check **Settings → Pages**.
- **The push to `gh-pages` fails with a 403** — the repository has read-only workflow permissions.
  Set **Settings → Actions → General → Workflow permissions** to **Read and write**.
- **The page is blank and the console shows 404s for `/assets/…`** — this happens with an
  absolute `base`. Check that [vite.config.ts](vite.config.ts) still has `base: './'`.
- **The board appears but the engine never becomes "Ready"** — check the Network tab for
  `stockfish/stockfish-18-lite-single.wasm`. It must return `200` with content type
  `application/wasm`. If it 404s, the `prebuild` step did not run; confirm the workflow runs
  `npm run build` and not `vite build` directly.
- **Private repositories** need GitHub Pages available on your plan; otherwise the deploy job
  fails with a Pages-not-enabled error.

## Choosing an engine

The **Chess engine** selector in the Game panel picks which engine does the analysing. All three
options are free, open source, and run entirely in your browser — no position is ever sent
anywhere, which is what keeps the app free to host.

| Engine | What it is | Use it when |
| --- | --- | --- |
| **Stockfish 18 Lite** *(default)* | WebAssembly, single-threaded, ~7 MB | Always. Accurate analysis on any device. |
| **Stockfish 18 Lite (multi-core)** | WebAssembly, multi-threaded, ~7 MB | You self-host with cross-origin isolation headers. Deeper analysis in the same time. |
| **Stockfish 18 (compatibility)** | Plain JavaScript (asm.js), ~10 MB | WebAssembly is blocked — some locked-down browsers and corporate networks. |

The multi-core build needs `SharedArrayBuffer`, which the browser only grants on a page served
with `COOP`/`COEP` headers. **GitHub Pages cannot set headers**, so it reports itself unavailable
there; `npm run dev` does set them, so it works locally. That is also why the single-threaded
build is the default.

Under **Engine settings** an advanced user can pin the analysis depth, thinking time, number of
candidate moves, threads and memory. Only the settings the selected engine actually supports are
shown, and every value is clamped to what that engine accepts. Depth and thinking time default to
*Automatic*, meaning they follow the two strength sliders.

The choice and its settings are remembered in `localStorage`. If an engine fails to start, the
app falls back to the default, keeps playing, and says why on screen.

The full (non-lite) NNUE builds are deliberately absent: at ~113 MB each they exceed GitHub's
100 MB per-file limit and cannot be deployed this way.

### How the engine layer is put together

Everything above the engine — coaching, grading, hints, the review — talks to a `ChessEngine`
interface (`initialize` / `analysePosition` / `getBestMove` / `getEvaluation` / `stop` /
`destroy`) and never to a particular engine:

- [`engine/types.ts`](src/engine/types.ts) — the interface, plus each engine's capabilities and
  the bounds of every setting.
- [`engine/uci.ts`](src/engine/uci.ts) — one adapter for anything speaking UCI over a worker.
  Every engine below is this class with a different script and capability set.
- [`engine/catalogue.ts`](src/engine/catalogue.ts) — the engines themselves, as data. **Adding an
  engine is adding an entry here**; nothing else in the app knows which engine it is talking to.
- [`engine/manager.ts`](src/engine/manager.ts) — owns which engine is running, keeps exactly one
  alive, and handles switching and fallback.

One engine instance lives for the whole session and is never restarted between games; switching
destroys the old one before starting the new one, so two engines are never resident at once. All
UCI work is serialised through a queue, since UCI is a single-conversation stateful protocol.
Start-up and searches both have timeouts, so a wedged engine surfaces as an error rather than a
spinner that never stops.

The engine binaries are **not committed** — they are copied out of `node_modules` by
[scripts/sync-stockfish.mjs](scripts/sync-stockfish.mjs) on `predev`/`prebuild`, so a fresh
`npm ci` in CI reproduces them.

## Explain Mode — your own arrows

Press **✏️ Explain** under the board and the game stops and hands you the board:

- **Drag between two squares** to draw an arrow.
- **Tap a square** to ring it.
- **Repeat either gesture** to remove it — the same action undoes itself.
- **Four colours** in the strip under the board, and **Erase** to wipe everything.
- **Undo removes the last thing you drew** — the button reads **Rub out** while there is anything
  on the board, and only means "take back a move" once the board is clear of your marks.

Nothing moves while you draw: no piece can be dropped, and the engine will not slide a reply in
underneath your arrows — **including after an undo**, which takes moves back without handing the
game to the engine. Press **Done**, **Resume**, or **▶ Play on** in the bar above the board and the
board is left completely clean: your arrows, the hint arrow and the coach's arrows all go, because
they described the position you were studying rather than the one you are about to play. The coach
draws again after your next move if its switch is still on. A game you had already paused yourself
stays paused.

Drawing is built on pointer events rather than the board library's own arrow tool, which is bound
to the right mouse button and so does not exist on a phone. **This works with a mouse, a finger or
a stylus.** Nothing about it is gated: not whose turn it is, not whether a move is legal, not even
whether the game has finished. It is a pen and a board.

**A knight's arrow bends.** Two squares along the long axis, then one across — because that is the
move. A straight line from b1 to c3 draws a path no knight can take, and to anyone still learning
how the pieces move that is not a stylistic choice, it is the arrow teaching the wrong thing. Every
arrow in the app goes through one renderer, so the coach's arrows and the hint arrow bend too.

## Show how the coach thinks

A separate **Thinking** switch in the coach panel, **off by default**. Turn it on and the coach
draws *its* reasoning on the board — a short script it plays out one idea at a time:

1. **Where you stand** — material and the evaluation, in the second person.
2. **What they are threatening** — an arrow from each attacker to the piece it can take.
3. **What I would play** — the recommended move, with the coach's own reason for it.
4. **What it does to them** — the piece the move attacks, or the mate it delivers.
5. **What follows** — the main line, one move per step, arrows building up as they would on a
   demonstration board.
6. **The safe option, and the choice restated** — a defensive move when something is hanging, then
   a closing comparison: the best move again with its reason, next to the runner-up and why it is
   also good — so the last thing on screen is the whole choice, not just a second option floating
   with nothing to compare it against.

Each role has its own colour **and** its own highlight, because colour alone does not survive a
phone screen or colour blindness:

| | Meaning |
| --- | --- |
| 🟢 Green | The move to play |
| 🔵 Blue | What follows in the main line |
| 🟡 Amber | A piece you would be attacking |
| 🔴 Red | What the opponent is threatening |
| 🟣 Violet | A defensive move — safety rather than advantage |
| ⚪ Grey | A second idea worth seeing |

The card above the board carries the sentence and the transport: play/pause, step forward and
back, replay, and **✕ to wipe the drawings**. The progress dots are also a step picker, so you can
jump straight back to "what are they threatening".

Unlike drawing, this **never stops the game** — it is a display setting, so you can leave it on and
keep playing. The script is rebuilt from the same analysis that feeds the sidebar, so the arrows
and the numbers can never describe different searches, and it is tied to the FEN it was written
for. Browsing an earlier move puts the pen down; returning to the live board picks it up again. A
deepening search of the *same* position leaves your place in the script alone, so the board does
not snap back to step one while you are reading step three.

The two modes are independent: you can have the coach's arrows up and draw your own on top. Yours
are cleared when you play on; the coach's are not.

## How the coaching works

Coaching is generated locally — there is no language model involved.

1. Every position is analysed at full skill with MultiPV 3, regardless of the opponent's strength
   setting, so coaching quality never depends on how weak the opponent is.
2. A move is graded by the drop in **expected score** (win percentage) rather than raw
   centipawns. Losing 200 centipawns matters enormously at 0.00 and barely at all when you are
   already up a rook — win percentage captures that, centipawns do not.
3. The explanation comes from board geometry: development, captures, checks, threats created,
   loose pieces left behind, blocked lines, king pawn cover, centre control, pawn structure.
4. Consequences are read off the engine's own follow-up line and reported concretely — "you
   lose your queen to Nxd5" rather than a number.
5. Early moves matching the built-in opening book are labelled **Book** rather than graded,
   because a normal developing move can register as a small loss against a 16-ply search
   without being a mistake in any sense worth worrying about.

## The two strength sliders

**Opponent Elo** (400 → Max). From 1320 up, the value is passed straight to Stockfish's `UCI_Elo`
alongside a matching `Skill Level` and depth/time cap. 1320 and 3190 are the engine's own limits —
verified against the build we ship — and the **Max** position past 3190 switches
`UCI_LimitStrength` off entirely rather than setting a number.

Below 1320 Stockfish *cannot* be asked to play weaker, so that range mixes in random legal moves
instead, reaching a purely random mover at 400. The UI says so rather than implying a calibrated
rating.

**Coach strength** (1000 → Max) controls how deep the coach searches, from 4 to 20 ply. The coach
always analyses at full *skill*; depth is the only thing that genuinely trades accuracy against
speed. Lower it if feedback feels slow on a phone, raise it to catch deeper tactics — at the very
bottom it cannot see a two-move tactic and will misgrade moves, which the slider warns about.

## The end of a game

When a game ends the board keeps it to itself for a beat: the result lands, the sound plays and
the final position — the mate, the piece that finally fell — stays visible for **600 ms** before the
review appears over it. A full-screen report thrown up the same instant hides exactly the move
worth seeing. Starting a new game inside that window cancels the report rather than dropping the
previous game's result onto a fresh board.

## The rating estimate

The opponent slider is a real `UCI_Elo` figure, so the opponent's strength is a known number. Each finished game is then a rated game against that number, and the standard Elo
update applies — new estimates move fast (K=60) and settle down as games accumulate (K=20 after
twenty).

Two consequences worth knowing:

- **Losing to a much stronger opponent costs almost nothing.** That is correct Elo behaviour: at a
  850-point gap you are expected to lose, so the loss carries no information. The practical effect
  is that if you only ever play at 2500 and lose, the figure sits at its 1200 starting value
  forever — the app says so explicitly rather than presenting 1200 as a measurement.
- **It converges on the strength you can hold your own against.** Scoring 50% against a setting
  settles within about a hundred points of that setting's Elo.

Set it manually from **Game → Your rating → Set manually** if you already have a rating you trust.
Whatever you enter becomes the anchor and still moves with each finished game.

## Saved state

Two `localStorage` keys, both versioned so a format change discards old data instead of misreading
it:

The keys keep their original `ai-chess-coach:` prefix even though the app was renamed: changing
them would orphan every saved game and rating already in a player's browser, for no gain.

- `ai-chess-coach:game` — the game in progress, saved as a SAN move list plus the verdicts, the
  coaching text and both strength settings. Snapshots written before the Elo sliders existed are
  migrated from their old 1–20 level rather than discarded. The board is rebuilt by replaying the moves through chess.js rather than trusting
  a stored FEN, so a corrupted entry cannot put an illegal position on the board; anything that
  does not replay cleanly is discarded.
- `ai-chess-coach:rating` — the Elo estimate and win/draw/loss counts.

Writes are driven by a change key rather than by every store update, because the store changes many
times per second while Stockfish is searching.

## Project layout

```
src/
├── components/     ChessBoard (+ MoveQualityBadge), CoachPanel, CoachBubble, EvaluationBar,
│                   MoveList, Controls (+ QuickActions), EditPosition, Header, GameReview,
│                   ui/ (Button, Panel, Switch)
├── engine/         types.ts (ChessEngine interface), uci.ts (UCI adapter),
│                   catalogue.ts (the engines, as data), manager.ts (selection + fallback),
│                   worker.ts (Web Worker transport), strength.ts (Elo → search settings),
│                   analysis.ts (move classification, review), coach.ts (plain-English coaching),
│                   tips.ts (unprompted advice), explain.ts (the on-board script)
├── hooks/          useBoardInteraction, useEngineBoot, useGameClock, useSoundUnlock,
│                   useUndoShortcut
├── store/          gameStore.ts (Zustand; owns the game and orchestrates the engine),
│                   persistence.ts (localStorage snapshot), rating.ts (Elo estimate),
│                   preferences.ts (engine choice, sound, advice level)
├── utils/          chess.ts (board features), score.ts, openings.ts, pgn.ts, platform.ts,
│                   sound.ts (synthesised effects), notation.ts, time.ts
└── types/          shared types
```

Nothing in `engine/coach.ts` or `engine/analysis.ts` talks to Stockfish or the DOM: they take an
evaluation as input and return text. That separation is what would let a puzzle mode, an opening
trainer or a lesson mode reuse the coach without touching the engine layer.

## Tech

React 19, TypeScript, Vite, Tailwind CSS, chess.js, react-chessboard, Zustand, Framer Motion,
Stockfish 18 WASM.

## Accessibility and mobile

- Board pieces are keyboard-operable (Tab to a piece, Space to lift, arrow keys to move, Space
  to drop) in addition to drag and tap-to-move.
- ⌘Z / Ctrl+Z takes back a move. It is ignored inside text fields, where the browser's own text
  undo is what you mean.
- Undo, Hint and Flip sit directly beneath the board — the thumb zone on a phone — rather than
  below the move list. Settings you only touch between games stay in the Game panel.
- The move-quality badge is `aria-hidden` and paired with a live region that states the move and
  its grade in words, since a coloured glyph on a square conveys nothing without sight.
- All controls are at least 44px tall for touch.
- Live regions announce coaching updates and whose turn it is.
- The layout is a single column on phones and a two-column grid from `lg` up; the board never
  causes horizontal scrolling.
- `prefers-reduced-motion` is respected.

## Licence

The application code is MIT (see [LICENSE](LICENSE)). Stockfish is GPL-3.0 and is fetched from
the [`stockfish`](https://www.npmjs.com/package/stockfish) npm package at install time.

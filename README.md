# AI Chess Coach

Play chess against Stockfish in your browser and get live, plain-English coaching after every
move. No backend, no API keys, no accounts — the engine runs locally in a Web Worker.

## What it does

- **Play Stockfish** at any strength from 1320 Elo to full strength, set with a direct Elo slider.
- **Separate coach-strength slider** controlling how deep the coach looks — shallower means faster
  feedback, deeper means it catches more.
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
git commit -m "AI Chess Coach"
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

## Notes on the engine

The app ships the **single-threaded lite** Stockfish 18 WASM build, deliberately:

- **Single-threaded** means no `SharedArrayBuffer`, which means no `COOP`/`COEP` response
  headers are required. Static hosts such as GitHub Pages cannot set those headers, so a
  multi-threaded build would fail to start there.
- **Lite** is a ~7 MB net rather than ~113 MB, which keeps it under GitHub's 100 MB per-file
  limit and gives a tolerable first load. The browser caches it after that.

The engine binaries are **not committed** — they are copied out of `node_modules` by
[scripts/sync-stockfish.mjs](scripts/sync-stockfish.mjs) on `predev`/`prebuild`, so a fresh
`npm ci` in CI reproduces them.

One engine instance lives for the whole session and is never restarted between games. All UCI
work is serialised through a queue, since UCI is a single-conversation stateful protocol.

## How the coaching works

Coaching is generated locally — there is no language model involved.

1. Every position is analysed at full strength with MultiPV 3, regardless of the opponent's
   difficulty level, so coaching quality never depends on how weak the opponent is.
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

**Opponent Elo** (1320 → Max) is passed straight to Stockfish's `UCI_Elo`, alongside a matching
`Skill Level` and depth/time cap so weak settings do not burn CPU playing badly. 1320 and 3190 are
the engine's own limits — verified against the build we ship — and the **Max** position past 3190
switches `UCI_LimitStrength` off entirely rather than setting a number.

**Coach strength** (2000 → Max) controls how deep the coach searches, from 8 to 20 ply. The coach
always analyses at full *skill*; depth is the only thing that genuinely trades accuracy against
speed. Lower it if feedback feels slow on a phone, raise it to catch deeper tactics.

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
├── engine/         stockfish.ts (UCI driver), worker.ts (Web Worker transport),
│                   analysis.ts (move classification, review), coach.ts (plain-English coaching)
├── hooks/          useBoardInteraction, useEngineBoot, useUndoShortcut
├── store/          gameStore.ts (Zustand; owns the game and orchestrates the engine),
│                   persistence.ts (localStorage snapshot), rating.ts (Elo estimate)
├── utils/          chess.ts (board features), score.ts, openings.ts, pgn.ts, platform.ts
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

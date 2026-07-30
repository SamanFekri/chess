/**
 * Copies the Stockfish WASM engine out of node_modules into `public/stockfish/`
 * so Vite serves it as a static asset (dev) and copies it into `dist/` (build).
 *
 * We deliberately ship the *lite-single* build:
 *   - `single`  -> single-threaded, so it needs no SharedArrayBuffer and no
 *                  COOP/COEP response headers. Static hosts such as GitHub Pages
 *                  cannot set those headers, so a multi-threaded build would
 *                  simply fail to start there.
 *   - `lite`    -> ~7 MB net instead of ~113 MB, which keeps it under GitHub's
 *                  100 MB per-file limit and gives a tolerable first load.
 *
 * The files are gitignored; this script runs from `predev`/`prebuild` so a fresh
 * `npm ci` in CI reproduces them.
 */
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'node_modules', 'stockfish', 'bin');
const targetDir = join(root, 'public', 'stockfish');

/** Basenames of the engine build we ship, in `bin/`. */
const ENGINE_FILES = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'];

if (!existsSync(sourceDir)) {
  console.error(
    '[sync-stockfish] node_modules/stockfish/bin not found. Run `npm install` first.',
  );
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

let copied = 0;
for (const file of ENGINE_FILES) {
  const from = join(sourceDir, file);
  const to = join(targetDir, file);

  if (!existsSync(from)) {
    console.error(`[sync-stockfish] missing engine file: ${from}`);
    process.exit(1);
  }

  // Skip when the destination is already byte-identical in size — the engine
  // binary never changes within a version, and copying 7 MB on every dev boot
  // is wasted work.
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;

  copyFileSync(from, to);
  copied += 1;
}

console.log(
  copied > 0
    ? `[sync-stockfish] copied ${copied} file(s) into public/stockfish/`
    : '[sync-stockfish] engine already up to date',
);

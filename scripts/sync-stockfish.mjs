/**
 * Copies the Stockfish engine builds out of node_modules into `public/stockfish/`
 * so Vite serves them as static assets (dev) and copies them into `dist/` (build).
 *
 * Which builds, and why — this is the catalogue in `src/engine/catalogue.ts`
 * expressed as files:
 *
 *   - `lite-single` (default) -> single-threaded, so it needs no
 *                  SharedArrayBuffer and no COOP/COEP response headers. Static
 *                  hosts such as GitHub Pages cannot set those headers, which is
 *                  why this and not the threaded build is the default. ~7 MB.
 *   - `lite`    -> the same engine, multi-threaded. Only starts on a
 *                  cross-origin-isolated page, so it is offered as an option and
 *                  reported as unavailable elsewhere. ~7 MB.
 *   - `asm`     -> plain JavaScript, no WebAssembly at all. Slow, but it is the
 *                  only thing that runs where WASM is blocked. ~10 MB.
 *
 * The full (non-lite) NNUE builds are deliberately absent: at ~113 MB each they
 * are over GitHub's 100 MB per-file limit, so they cannot be deployed the way
 * this app is.
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

/** Basenames of the engine builds we ship, in `bin/`. */
const ENGINE_FILES = [
  'stockfish-18-lite-single.js',
  'stockfish-18-lite-single.wasm',
  'stockfish-18-lite.js',
  'stockfish-18-lite.wasm',
  'stockfish-18-asm.js',
];

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
  // binaries never change within a version, and copying 25 MB on every dev boot
  // is wasted work.
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;

  copyFileSync(from, to);
  copied += 1;
}

console.log(
  copied > 0
    ? `[sync-stockfish] copied ${copied} file(s) into public/stockfish/`
    : '[sync-stockfish] engines already up to date',
);

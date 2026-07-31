/**
 * Generates the app icons used when the site is installed to a phone's home
 * screen.
 *
 * Everything is rasterised here in plain JavaScript and encoded as PNG with
 * node's built-in zlib. That avoids adding an image toolchain as a dependency
 * for four small files, and — more importantly — iOS ignores SVG for
 * `apple-touch-icon`, so real PNGs are the only thing that actually works.
 *
 * Run with `npm run icons`. The output is committed, since it changes only when
 * the logo does.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');

/** Supersampling factor. Edges are averaged down, which is the anti-aliasing. */
const SS = 4;

// ── Colours ────────────────────────────────────────────────────────────────
const BG_TOP = [59, 130, 246]; // blue-500
const BG_BOTTOM = [16, 185, 129]; // emerald-500
const PIECE = [248, 250, 252]; // slate-50

/**
 * The mark: a robot head on a pawn's body — the "AI" and the "chess" halves of
 * the app in one silhouette.
 *
 * Composed from primitives rather than a single freehand polygon, because a
 * rounded rectangle and a circle are exactly right by construction, where a
 * hand-plotted outline is only ever approximately right. `sub` shapes are
 * punched out of the result.
 */
const SHAPES = [
  // Antenna.
  { op: 'add', kind: 'circle', cx: 50, cy: 6, r: 4 },
  { op: 'add', kind: 'rect', x: 47.5, y: 8, w: 5, h: 8, r: 1 },

  // Head.
  { op: 'add', kind: 'rect', x: 25, y: 14, w: 50, h: 33, r: 11 },
  // Eyes, punched out so the background gradient shows through.
  { op: 'sub', kind: 'circle', cx: 39, cy: 30, r: 6 },
  { op: 'sub', kind: 'circle', cx: 61, cy: 30, r: 6 },

  // Neck.
  { op: 'add', kind: 'rect', x: 43, y: 46, w: 14, h: 5, r: 1 },

  // The pawn's collar.
  { op: 'add', kind: 'rect', x: 31, y: 50, w: 38, h: 8, r: 4 },

  // The pawn's flared body.
  { op: 'add', kind: 'poly', points: [[38, 58], [62, 58], [71, 79], [29, 79]] },

  // The pawn's base.
  { op: 'add', kind: 'rect', x: 21, y: 78, w: 58, h: 12, r: 5 },
];

/** Whether a point lies inside a rounded rectangle. */
function inRoundedRect(px, py, { x, y, w, h, r }) {
  const radius = Math.min(r, w / 2, h / 2);
  const cx = Math.min(Math.max(px, x + radius), x + w - radius);
  const cy = Math.min(Math.max(py, y + radius), y + h - radius);
  if (px < x || px > x + w || py < y || py > y + h) return false;
  return Math.hypot(px - cx, py - cy) <= radius;
}

/** Whether a point lies on the mark, honouring the add/subtract order. */
function onMark(px, py) {
  let inside = false;
  for (const shape of SHAPES) {
    let hit = false;
    if (shape.kind === 'circle') hit = Math.hypot(px - shape.cx, py - shape.cy) <= shape.r;
    else if (shape.kind === 'rect') hit = inRoundedRect(px, py, shape);
    else hit = inPolygon(shape.points, px, py);

    if (!hit) continue;
    inside = shape.op === 'add';
  }
  return inside;
}

/** Even-odd point-in-polygon test. */
function inPolygon(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the nearest edge of a rounded rectangle. */
function insideRoundedRect(x, y, size, radius) {
  const min = radius;
  const max = size - radius;
  const cx = Math.min(Math.max(x, min), max);
  const cy = Math.min(Math.max(y, min), max);
  return Math.hypot(x - cx, y - cy) <= radius;
}

/**
 * Renders the icon at `size` pixels into an RGBA buffer.
 *
 * @param size    Output edge length in pixels.
 * @param padding Fraction of the edge kept clear around the mark. Maskable icons
 *                need a wide safe area because launchers crop them to a circle.
 * @param square  When true the background fills the whole canvas with no rounded
 *                corners, which is what a maskable icon must do.
 */
function render(size, { padding = 0.14, square = false } = {}) {
  const big = size * SS;
  const rgba = Buffer.alloc(size * size * 4);
  const radius = big * 0.22;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;

          const onCanvas = square || insideRoundedRect(px, py, big, radius);
          if (!onCanvas) continue;

          // Diagonal gradient across the tile.
          const t = Math.min(1, Math.max(0, (px / big) * 0.4 + (py / big) * 0.6));
          let pr = BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t;
          let pg = BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t;
          let pb = BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t;

          // Map the sample into the mark's 0–100 space.
          const inset = big * padding;
          const span = big - inset * 2;
          const kx = ((px - inset) / span) * 100;
          const ky = ((py - inset) / span) * 100;

          if (kx >= 0 && kx <= 100 && ky >= 0 && ky <= 100 && onMark(kx, ky)) {
            [pr, pg, pb] = PIECE;
          }

          r += pr;
          g += pg;
          b += pb;
          a += 255;
        }
      }

      const samples = SS * SS;
      const index = (y * size + x) * 4;
      const coverage = a / samples;
      // Pre-averaged colour, then alpha from coverage so the rounded corners
      // fade rather than stair-step.
      rgba[index] = Math.round(r / samples / (coverage / 255 || 1));
      rgba[index + 1] = Math.round(g / samples / (coverage / 255 || 1));
      rgba[index + 2] = Math.round(b / samples / (coverage / 255 || 1));
      rgba[index + 3] = Math.round(coverage);
    }
  }

  return rgba;
}

// ── PNG encoding ───────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes an RGBA buffer as a PNG. */
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Terminal preview, so the shape can be checked without a browser ────────
if (process.argv.includes('--preview')) {
  const size = 44;
  const rgba = render(size, { padding: 0.12 });
  const ramp = ' .:-=+*#%@';
  let out = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      if (rgba[i + 3] < 40) {
        out += ' ';
        continue;
      }
      // The piece is near-white; the background is mid-tone.
      const luminance = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
      out += ramp[Math.min(ramp.length - 1, Math.round((luminance / 255) * (ramp.length - 1)))];
    }
    out += '\n';
  }
  console.log(out);
  process.exit(0);
}

// ── Write the icon set ─────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });

const targets = [
  { name: 'icon-180.png', size: 180, options: {} },
  { name: 'icon-192.png', size: 192, options: {} },
  { name: 'icon-512.png', size: 512, options: {} },
  // Maskable: full-bleed with a generous safe area, since launchers crop it.
  { name: 'icon-maskable-512.png', size: 512, options: { padding: 0.26, square: true } },
];

for (const { name, size, options } of targets) {
  const png = encodePng(render(size, options), size);
  writeFileSync(join(outDir, name), png);
  console.log(`[icons] ${name} (${size}x${size}, ${(png.length / 1024).toFixed(1)} kB)`);
}

/**
 * Generates every app icon from one SVG description.
 *
 * The mark is a pawn whose head is a speech bubble — a chess piece that talks,
 * which is the app in one shape: you play, and the coach explains in plain
 * English. The spark inside the bubble is the AI. A bright white piece on the
 * brand's blue-to-emerald tile, with a top-left sheen and a glass rim to match
 * the Liquid Glass interface.
 *
 * Outputs (all committed, since they change only when the logo does):
 * - `icon.svg`               rounded tile, used as the browser favicon
 * - `icon-180.png`           full-bleed square: iOS rounds the corners itself,
 *                            and fills any transparency with black
 * - `icon-192/512.png`       rounded tile for Android and desktop installs
 * - `icon-maskable-512.png`  full-bleed with the mark inside the 80% safe zone
 *
 * PNGs are rasterised with `rsvg-convert` (`brew install librsvg`); it is only
 * needed to regenerate, not to build or run the app. The geometry below is the
 * same as `BrandMark` in `src/components/ui/icons.tsx` — change them together.
 *
 * Run with `npm run icons`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');

/**
 * The pawn's head: a circle (centre 50,30, r 17) and its speech tail as one
 * outline, so there is no seam where the tail joins. The arc leaves the circle
 * at 125° and rejoins it at 150°; the tail points left, clear of the collar.
 */
const BUBBLE = 'M40.25 43.93 A17 17 0 1 0 35.28 38.5 Q33 44 27 47 Q35 47.5 40.25 43.93 Z';

/**
 * The mark, in a 100-unit box. Chunky on purpose: a home-screen icon is seen at
 * 60px, and thin parts vanish at that size.
 */
const MARK = `
  <path d="${BUBBLE}"/>
  <rect x="33" y="52" width="34" height="7" rx="3.5"/>
  <path d="M40 59 H60 Q61 71 69 80 H31 Q39 71 40 59 Z"/>
  <rect x="23" y="79" width="54" height="12" rx="6"/>
`;

/** The four-point spark inside the bubble: the AI, in the tile's own colours. */
const SPARK = 'M50 19.5 Q51.8 28.2 60.5 30 Q51.8 31.8 50 40.5 Q48.2 31.8 39.5 30 Q48.2 28.2 50 19.5 Z';

/**
 * The icon as SVG text.
 *
 * @param scale  Size of the 100-unit mark as a fraction of the tile.
 * @param radius Corner radius as a fraction of the tile; 0 for full-bleed.
 */
function iconSvg({ scale = 0.8, radius = 0.225 } = {}) {
  const S = 1024;
  const r = S * radius;
  const size = S * scale;
  const offset = (S - size) / 2;
  const k = size / 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <defs>
    <!-- The brand diagonal, blue to emerald, as in the app's buttons. -->
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#10b981"/>
    </linearGradient>
    <!-- Glass sheen: light falling on the tile from the top left. -->
    <radialGradient id="sheen" cx="0.15" cy="0" r="0.6">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="piece" gradientUnits="userSpaceOnUse" x1="0" y1="13" x2="0" y2="91">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e6f0ff"/>
    </linearGradient>
    <linearGradient id="spark" gradientUnits="userSpaceOnUse" x1="39.5" y1="19.5" x2="60.5" y2="40.5">
      <stop offset="0" stop-color="#3b6cf6"/>
      <stop offset="1" stop-color="#0fb583"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="1.6"/>
    </filter>
    <clipPath id="tile"><rect width="${S}" height="${S}" rx="${r}"/></clipPath>
  </defs>

  <g clip-path="url(#tile)">
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    <rect width="${S}" height="${S}" fill="url(#sheen)"/>
    <!-- Hairline rim, brighter than the tile, as on a pane of glass. -->
    <rect x="3" y="3" width="${S - 6}" height="${S - 6}" rx="${Math.max(0, r - 3)}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="6"/>

    <g transform="translate(${offset} ${offset - S * 0.01}) scale(${k})">
      <!-- A soft shadow lifts the piece off the tile. -->
      <g fill="#0a2a66" opacity="0.32" filter="url(#soft)" transform="translate(0 2)">${MARK}</g>
      <g fill="url(#piece)">${MARK}</g>
      <path d="${SPARK}" fill="url(#spark)"/>
    </g>
  </g>
</svg>
`;
}

mkdirSync(outDir, { recursive: true });

// The favicon: rounded tile, the mark a touch larger so it reads at 16px.
const favicon = iconSvg({ scale: 0.86 });
writeFileSync(join(outDir, 'icon.svg'), favicon);
console.log('[icons] icon.svg');

const targets = [
  { name: 'icon-180.png', size: 180, svg: iconSvg({ radius: 0 }) },
  { name: 'icon-192.png', size: 192, svg: iconSvg() },
  { name: 'icon-512.png', size: 512, svg: iconSvg() },
  // Launchers crop maskable icons to as little as a centred 80% circle.
  { name: 'icon-maskable-512.png', size: 512, svg: iconSvg({ radius: 0, scale: 0.6 }) },
];

for (const { name, size, svg } of targets) {
  const png = execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-f', 'png'], {
    input: svg,
  });
  writeFileSync(join(outDir, name), png);
  console.log(`[icons] ${name} (${size}x${size}, ${(png.length / 1024).toFixed(1)} kB)`);
}

/**
 * Generates every app icon from one SVG description.
 *
 * The mark is a cute robot that is also a chess piece: a chibi robot built on a
 * pawn, with a screen face. Flat colours and a sticker outline, no gradients.
 * Wherever the platform allows transparency the character is the whole icon;
 * only the iOS home-screen and maskable icons, which must be opaque, sit it on
 * a single flat colour.
 *
 * Outputs (all committed, since they change only when the logo does):
 * - `icon.svg`               the browser favicon
 * - `icon-180.png`           iOS home screen (flat tile; iOS rounds the corners)
 * - `icon-192/512.png`       Android and desktop installs, transparent
 * - `icon-maskable-512.png`  flat tile with the character in the 80% safe zone
 *
 * PNGs are rasterised with `rsvg-convert` (`brew install librsvg`); it is only
 * needed to regenerate, not to build or run the app. The drawing is mirrored by
 * `BrandMark` in `src/components/ui/icons.tsx` — change them together.
 *
 * Run with `npm run icons`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');

/** Flat palette: no gradients, a sticker outline, one warm accent. */
const INK = '#14213d';
const SHELL = '#f8fafc';
const STEEL = '#cbd5e1';
const SCREEN = '#1b2a4a';
const GLOW = '#5eead4';
const ACCENT = '#fb923c';
const BLUSH = '#f9a8d4';
const TILE = '#3b82f6';

/**
 * The character, in a 100-unit box: a chibi robot built on a pawn.
 *
 * The pawn's ball is the robot's oversized head (big head, small body is what
 * reads as "cute"), its collar and flared body are the robot's torso, and the
 * base is its feet. The face is a dark screen with two glowing eyes, a smile and
 * blush, so it still reads as a face at favicon size.
 *
 * Drawn back to front; every part carries the same ink outline.
 */
const CHARACTER = `
  <g stroke="${INK}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">
    <!-- Antenna: stalk, then a glowing tip. -->
    <line x1="50" y1="15" x2="50" y2="7.5" fill="none"/>
    <circle cx="50" cy="6.5" r="4.2" fill="${ACCENT}"/>

    <!-- Feet: the pawn's base. -->
    <rect x="21" y="83" width="58" height="12" rx="6" fill="${STEEL}"/>
    <!-- Torso: the pawn's flared body, with a chest light. -->
    <path d="M38.5 64 H61.5 Q62.5 75 70 84 H30 Q37.5 75 38.5 64 Z" fill="${SHELL}"/>
    <circle cx="50" cy="75" r="3.2" fill="${ACCENT}" stroke-width="2.4"/>
    <!-- Collar. -->
    <rect x="32" y="59" width="36" height="8" rx="4" fill="${STEEL}"/>

    <!-- Ear bolts. -->
    <rect x="9.5" y="31" width="9" height="16" rx="4" fill="${STEEL}"/>
    <rect x="81.5" y="31" width="9" height="16" rx="4" fill="${STEEL}"/>
    <!-- Head: the pawn's ball, as a big rounded robot head. -->
    <rect x="16" y="14" width="68" height="48" rx="22" fill="${SHELL}"/>
    <!-- Face screen. -->
    <rect x="24.5" y="22.5" width="51" height="31" rx="13.5" fill="${SCREEN}"/>
  </g>

  <!-- Face, on the screen: no outline, it glows. -->
  <ellipse cx="39.5" cy="36" rx="4.6" ry="6" fill="${GLOW}"/>
  <ellipse cx="60.5" cy="36" rx="4.6" ry="6" fill="${GLOW}"/>
  <circle cx="41.2" cy="33.4" r="1.6" fill="#ffffff"/>
  <circle cx="62.2" cy="33.4" r="1.6" fill="#ffffff"/>
  <ellipse cx="31.5" cy="45" rx="3.4" ry="2" fill="${BLUSH}" opacity="0.75"/>
  <ellipse cx="68.5" cy="45" rx="3.4" ry="2" fill="${BLUSH}" opacity="0.75"/>
  <path d="M45.5 44.5 Q50 48.5 54.5 44.5" fill="none" stroke="${GLOW}" stroke-width="2.6" stroke-linecap="round"/>
`;

/**
 * The icon as SVG text.
 *
 * @param scale      Size of the 100-unit character as a fraction of the canvas.
 * @param background Whether to sit it on a flat tile. Without one the character
 *                   is the whole icon, on transparency.
 * @param radius     Corner radius of that tile as a fraction; 0 for full-bleed.
 */
function iconSvg({ scale = 0.96, background = false, radius = 0 } = {}) {
  const S = 1024;
  const size = S * scale;
  const offset = (S - size) / 2;
  const k = size / 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  ${background ? `<rect width="${S}" height="${S}" rx="${S * radius}" fill="${TILE}"/>` : ''}
  <g transform="translate(${offset} ${offset}) scale(${k})">${CHARACTER}</g>
</svg>
`;
}

mkdirSync(outDir, { recursive: true });

// The favicon: the character alone, filling the tab.
const favicon = iconSvg();
writeFileSync(join(outDir, 'icon.svg'), favicon);
console.log('[icons] icon.svg');

const targets = [
  // iOS fills transparency with black, so the home-screen icon gets a flat tile.
  { name: 'icon-180.png', size: 180, svg: iconSvg({ background: true, scale: 0.8 }) },
  // Android and desktop installs keep transparency: the character is the icon.
  { name: 'icon-192.png', size: 192, svg: iconSvg() },
  { name: 'icon-512.png', size: 512, svg: iconSvg() },
  // Launchers crop maskable icons to as little as a centred 80% circle.
  { name: 'icon-maskable-512.png', size: 512, svg: iconSvg({ background: true, scale: 0.64 }) },
];

for (const { name, size, svg } of targets) {
  const png = execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-f', 'png'], {
    input: svg,
  });
  writeFileSync(join(outDir, name), png);
  console.log(`[icons] ${name} (${size}x${size}, ${(png.length / 1024).toFixed(1)} kB)`);
}

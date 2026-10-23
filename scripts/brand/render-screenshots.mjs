import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import resvg from '@resvg/resvg-js';

const { Resvg } = resvg;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const RAW = join(ROOT, 'docs', 'release', 'store-assets', 'raw');
const OUT = join(ROOT, 'docs', 'release', 'store-assets', 'screenshots');
const FONTS = [
  join(ROOT, 'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  join(ROOT, 'node_modules/@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'),
];

export const SHOTS = [
  { raw: 'live-scoring', title: 'Score every ball in one tap', line: 'Big buttons, built for the ground' },
  { raw: 'home', title: 'Works 100% offline', line: 'No account and no internet needed' },
  { raw: 'scorecard', title: 'Full scorecards & PDF', line: 'Batting, bowling, extras and partnerships' },
  { raw: 'dashboard', title: 'Run your tournament', line: 'Pools, fixtures and knockouts' },
  { raw: 'standings', title: 'Points table with NRR', line: 'Qualification worked out for you' },
  { raw: 'edit-ball', title: 'Fix any ball safely', line: 'See what changes before you save' },
  { raw: 'charts', title: 'Charts that tell the story', line: 'Run-rate worm and Manhattan' },
  { raw: 'light-theme', title: 'Light or dark', line: 'Easy to read in bright sun' },
];

const W = 1080;
const H = 1920;
const DEVICE_H = 1540;
const DEVICE_TOP = 330;

function escape(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function frame(shot, png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const deviceW = Math.round((width * DEVICE_H) / height);
  const x = Math.round((W - deviceW) / 2);
  const data = `data:image/png;base64,${png.toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="180" cy="120" r="1100" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0D3843" stop-opacity="0.9"/>
      <stop offset="0.6" stop-color="#0D3843" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#070E12" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="900" cy="1300" r="900" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#08313A" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#070E12" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="screen"><rect x="${x}" y="${DEVICE_TOP}" width="${deviceW}" height="${DEVICE_H}" rx="40"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#070E12"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>
  <text x="${W / 2}" y="168" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="80" fill="#F2F7F9">${escape(shot.title.toUpperCase())}</text>
  <text x="${W / 2}" y="238" text-anchor="middle" font-family="Inter" font-weight="500" font-size="38" fill="#8FA7B3">${escape(shot.line)}</text>
  <image x="${x}" y="${DEVICE_TOP}" width="${deviceW}" height="${DEVICE_H}" href="${data}" xlink:href="${data}" clip-path="url(#screen)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="${x}" y="${DEVICE_TOP}" width="${deviceW}" height="${DEVICE_H}" rx="40" fill="none" stroke="#00C2E0" stroke-opacity="0.35" stroke-width="3"/>
</svg>`;
}

mkdirSync(OUT, { recursive: true });
const missing = [];
SHOTS.forEach((shot, index) => {
  const file = join(RAW, `${shot.raw}.png`);
  if (!existsSync(file)) {
    missing.push(shot.raw);
    return;
  }
  const svg = frame(shot, readFileSync(file));
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } })
    .render()
    .asPng();
  const name = `${String(index + 1).padStart(2, '0')}-${shot.raw}.png`;
  writeFileSync(join(OUT, name), png);
  console.log(name);
});
if (missing.length) {
  console.log(`missing raw captures: ${missing.join(', ')}`);
}

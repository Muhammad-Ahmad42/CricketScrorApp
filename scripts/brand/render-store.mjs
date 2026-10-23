import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import resvg from '@resvg/resvg-js';

const { Resvg } = resvg;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'docs', 'release', 'store-assets');
const FONTS = [
  join(ROOT, 'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  join(ROOT, 'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  join(ROOT, 'node_modules/@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'),
];

function render(svg, width, file) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' },
    background: '#070E12',
  })
    .render()
    .asPng();
  writeFileSync(join(OUT, file), png);
  return file;
}

function markBody() {
  const svg = readFileSync(join(HERE, 'mark.svg'), 'utf8');
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
}

function featureGraphic() {
  const scale = 0.62;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <radialGradient id="glowA" cx="170" cy="90" r="620" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0D3843" stop-opacity="0.9"/>
      <stop offset="0.6" stop-color="#0D3843" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#070E12" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="820" cy="300" r="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#08313A" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#070E12" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#00C2E0" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#00C2E0" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#00C2E0" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="#070E12"/>
  <rect width="1024" height="500" fill="url(#glowA)"/>
  <rect width="1024" height="500" fill="url(#glowB)"/>
  <g transform="translate(48 52) scale(${scale})">${markBody()}</g>
  <text x="452" y="204" font-family="Barlow Condensed" font-weight="700" font-size="78" fill="#F2F7F9" letter-spacing="1">CRICKET SCORER</text>
  <text x="454" y="262" font-family="Inter" font-weight="700" font-size="46" fill="#00C2E0">Scorebook</text>
  <rect x="454" y="292" width="480" height="2" fill="url(#rule)"/>
  <text x="454" y="342" font-family="Inter" font-weight="500" font-size="30" fill="#8FA7B3">Offline scoring &amp; tournaments</text>
</svg>`;
}

mkdirSync(OUT, { recursive: true });
const written = [
  render(readFileSync(join(HERE, 'tile-dark.svg'), 'utf8'), 512, 'play-icon-512.png'),
  render(featureGraphic(), 1024, 'feature-graphic-1024x500.png'),
];
console.log(written.join('\n'));

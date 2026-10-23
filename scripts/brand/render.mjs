import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import resvg from '@resvg/resvg-js';

const { Resvg } = resvg;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const IMAGES = join(ROOT, 'assets', 'images');
const ICON_BUNDLE = join(ROOT, 'assets', 'expo.icon');
const PREVIEW = join(HERE, 'preview');

const BRAND = {
  obsidian: '#070E12',
  cyan: '#00C2E0',
  teal: '#008BA3',
  ink: '#F2F7F9',
  ice: '#F0F5F8',
  inkTeal: '#00606F',
};

const SOURCE = { stump: '#00C2E0', flying: '#F2F7F9' };

const COLOURWAYS = {
  dark: { stump: BRAND.cyan, flying: BRAND.ink },
  light: { stump: BRAND.inkTeal, flying: BRAND.teal },
  white: { stump: '#FFFFFF', flying: '#FFFFFF' },
  black: { stump: '#000000', flying: '#000000' },
};

const MARK = { centre: 320, height: 600 };
const ADAPTIVE = { size: 432, safeRadius: 132, glyphHeight: 188 };
const SPLASH_GLYPH_HEIGHT = 900;

function read(name) {
  return readFileSync(join(HERE, name), 'utf8');
}

function body(svg) {
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
}

function recolour(content, colourway) {
  const colours = COLOURWAYS[colourway];
  return content
    .replaceAll(SOURCE.stump, colours.stump)
    .replaceAll(SOURCE.flying, colours.flying);
}

function part(content, id) {
  const match = content.match(new RegExp(`<g id="${id}"[\\s\\S]*?</g>`));
  if (!match) throw new Error(`mark part ${id} missing`);
  return match[0];
}

function place(content, cx, cy, height) {
  const scale = height / MARK.height;
  const x = cx - MARK.centre * scale;
  const y = cy - MARK.centre * scale;
  return `<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(5)})">${content}</g>`;
}

const SHEEN_DEFS = `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.24"/><stop offset="0.42" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>`;

function withSheen(content) {
  const overlay = content
    .replace(/<g id="bail-flying"[\s\S]*?<\/g>/, '')
    .replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="url(#sheen)"')
    .replace(/id="[^"]*"/g, '');
  return `${content}${overlay}`;
}

function svg(size, viewBox, content, defs = '', height = size, viewHeight = viewBox) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${viewBox} ${viewHeight}"><defs>${defs}</defs>${content}</svg>`;
}

function rasterise(source, width) {
  const rendered = new Resvg(source, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' }).render();
  return { png: rendered.asPng(), pixels: rendered.pixels, width: rendered.width, height: rendered.height };
}

function save(path, image) {
  writeFileSync(path, image.png);
  console.log(`wrote ${path.replace(ROOT, '.')} ${image.width}x${image.height}`);
}

function assertOpaque(name, image) {
  for (let index = 3; index < image.pixels.length; index += 4) {
    if (image.pixels[index] !== 255) throw new Error(`${name} has transparent pixels`);
  }
}

function assertInsideRadius(name, image, radius) {
  const centre = (image.width - 1) / 2;
  let furthest = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] > 8) {
        furthest = Math.max(furthest, Math.hypot(x - centre, y - centre));
      }
    }
  }
  if (furthest > radius) throw new Error(`${name} leaves the safe zone: ${furthest.toFixed(1)} > ${radius}`);
  console.log(`  ${name} furthest ink ${furthest.toFixed(1)}px from centre (limit ${radius})`);
}

function assertTransparentCorners(name, image) {
  const corners = [0, image.width - 1, (image.height - 1) * image.width, image.height * image.width - 1];
  for (const corner of corners) {
    if (image.pixels[corner * 4 + 3] !== 0) throw new Error(`${name} corners are not transparent`);
  }
}

const mark = body(read('mark.svg'));
const markSmall = body(read('mark-small.svg'));
const tileDark = body(read('tile-dark.svg'));
const tileLight = body(read('tile-light.svg'));

function appIcon(tile, colourway, size) {
  const content = `${tile}${place(withSheen(recolour(mark, colourway)), 512, 512, 600)}`;
  return rasterise(svg(1024, 1024, content, SHEEN_DEFS), size);
}

function adaptiveForeground(colourway) {
  const { size, glyphHeight } = ADAPTIVE;
  return rasterise(svg(size, size, place(recolour(mark, colourway), size / 2, size / 2, glyphHeight)), size);
}

function favicon(size) {
  const radius = 1024 * 0.22;
  const content = `<clipPath id="tile"><rect width="1024" height="1024" rx="${radius}"/></clipPath><g clip-path="url(#tile)">${tileDark}</g>${place(recolour(markSmall, 'dark'), 512, 512, 780)}`;
  return rasterise(svg(1024, 1024, content), size);
}

function iconLayer(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${place(content, 512, 512, 600)}</svg>\n`;
}

function hexToExtendedSrgb(hex) {
  const channels = [1, 3, 5].map((offset) => (parseInt(hex.slice(offset, offset + 2), 16) / 255).toFixed(5));
  return `extended-srgb:${channels.join(',')},1.00000`;
}

function writeIconBundle() {
  const assets = join(ICON_BUNDLE, 'Assets');
  rmSync(assets, { recursive: true, force: true });
  mkdirSync(assets, { recursive: true });
  const dark = recolour(mark, 'dark');
  writeFileSync(join(assets, 'bail-flying.svg'), iconLayer(part(dark, 'bail-flying')));
  writeFileSync(join(assets, 'bail.svg'), iconLayer(part(dark, 'bail')));
  writeFileSync(join(assets, 'stumps.svg'), iconLayer(part(dark, 'stumps')));
  const layer = (name) => ({ 'image-name': `${name}.svg`, name, position: { scale: 1, 'translation-in-points': [0, 0] } });
  const manifest = {
    fill: { solid: hexToExtendedSrgb(BRAND.obsidian) },
    groups: [
      {
        layers: [layer('bail-flying')],
        shadow: { kind: 'neutral', opacity: 0.5 },
        translucency: { enabled: true, value: 0.3 },
      },
      {
        layers: [layer('bail'), layer('stumps')],
        shadow: { kind: 'neutral', opacity: 0.5 },
        translucency: { enabled: true, value: 0.3 },
      },
    ],
    'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
  };
  writeFileSync(join(ICON_BUNDLE, 'icon.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ./assets/expo.icon (${readdirSync(assets).join(', ')})`);
}

function writePreview() {
  mkdirSync(PREVIEW, { recursive: true });
  const embed = (image, x, y, size) =>
    `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/png;base64,${Buffer.from(image.png).toString('base64')}"/>`;
  const dark = appIcon(tileDark, 'dark', 512);
  const light = appIcon(tileLight, 'light', 512);
  const background = rasterise(svg(ADAPTIVE.size, 1024, tileDark), ADAPTIVE.size);
  const foreground = adaptiveForeground('dark');
  const monochrome = adaptiveForeground('white');
  const silhouette = rasterise(svg(512, 640, recolour(mark, 'black')), 512);
  const small = [48, 32, 24].map((size) => favicon(size));
  const visible = (ADAPTIVE.size * 72) / 108;
  const offset = (ADAPTIVE.size - visible) / 2;
  const adaptiveCircle = `<svg x="560" y="40" width="288" height="288" viewBox="${offset} ${offset} ${visible} ${visible}"><clipPath id="circle"><circle cx="216" cy="216" r="${visible / 2}"/></clipPath><g clip-path="url(#circle)">${embed(background, 0, 0, 432)}${embed(foreground, 0, 0, 432)}</g></svg>`;
  const tinted = `<rect x="880" y="40" width="288" height="288" rx="86" fill="#1C3640"/>`;
  const content = [
    `<rect width="1520" height="760" fill="#11191E"/>`,
    `<clipPath id="squircle"><rect x="40" y="40" width="480" height="480" rx="108"/></clipPath><g clip-path="url(#squircle)">${embed(dark, 40, 40, 480)}</g>`,
    adaptiveCircle,
    tinted,
    `<svg x="880" y="40" width="288" height="288" viewBox="${offset} ${offset} ${visible} ${visible}">${embed(monochrome, 0, 0, 432)}</svg>`,
    `<clipPath id="lightTile"><rect x="1200" y="40" width="288" height="288" rx="64"/></clipPath><g clip-path="url(#lightTile)">${embed(light, 1200, 40, 288)}</g>`,
    `<rect x="560" y="360" width="288" height="360" rx="24" fill="#FFFFFF"/>`,
    embed(silhouette, 584, 396, 240),
    `<rect x="880" y="360" width="608" height="360" rx="24" fill="${BRAND.obsidian}"/>`,
    embed(small[0], 920, 400, 48),
    embed(small[1], 1000, 408, 32),
    embed(small[2], 1064, 412, 24),
    `<rect x="40" y="560" width="480" height="160" rx="24" fill="${BRAND.ice}"/>`,
    embed(small[0], 80, 616, 48),
    embed(small[1], 160, 624, 32),
    embed(small[2], 224, 628, 24),
    embed(foreground, 1160, 380, 320),
  ].join('');
  const image = rasterise(svg(1520, 1520, content, '', 760, 760), 1520);
  writeFileSync(join(PREVIEW, 'brand-sheet.png'), image.png);
  console.log('wrote ./scripts/brand/preview/brand-sheet.png');
}

const icon = appIcon(tileDark, 'dark', 1024);
assertOpaque('icon.png', icon);
save(join(IMAGES, 'icon.png'), icon);

const background = rasterise(svg(ADAPTIVE.size, 1024, tileDark), ADAPTIVE.size);
assertOpaque('android-icon-background.png', background);
save(join(IMAGES, 'android-icon-background.png'), background);

const foreground = adaptiveForeground('dark');
assertInsideRadius('android-icon-foreground.png', foreground, ADAPTIVE.safeRadius);
save(join(IMAGES, 'android-icon-foreground.png'), foreground);

const monochrome = adaptiveForeground('white');
assertInsideRadius('android-icon-monochrome.png', monochrome, ADAPTIVE.safeRadius);
save(join(IMAGES, 'android-icon-monochrome.png'), monochrome);

const splash = rasterise(svg(1024, 1024, place(recolour(mark, 'dark'), 512, 512, SPLASH_GLYPH_HEIGHT)), 1024);
assertTransparentCorners('splash-icon.png', splash);
save(join(IMAGES, 'splash-icon.png'), splash);

const fav = favicon(48);
assertTransparentCorners('favicon.png', fav);
save(join(IMAGES, 'favicon.png'), fav);

writeIconBundle();
writePreview();

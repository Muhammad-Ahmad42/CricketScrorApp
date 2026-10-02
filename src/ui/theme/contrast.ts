export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA_PATTERN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

function expandHex(body: string): string {
  if (body.length !== 3) {
    return body;
  }
  return body
    .split('')
    .map((ch) => ch + ch)
    .join('');
}

export function parseColor(input: string): Rgba {
  const value = input.trim();
  const hex = HEX_PATTERN.exec(value);
  if (hex) {
    const body = expandHex(hex[1]);
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
      a: body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgba = RGBA_PATTERN.exec(value);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

export function composite(foreground: Rgba, background: Rgba): Rgba {
  const a = foreground.a;
  return {
    r: foreground.r * a + background.r * (1 - a),
    g: foreground.g * a + background.g * (1 - a),
    b: foreground.b * a + background.b * (1 - a),
    a: 1,
  };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: string | Rgba): number {
  const rgba = typeof color === 'string' ? parseColor(color) : color;
  return 0.2126 * channel(rgba.r) + 0.7152 * channel(rgba.g) + 0.0722 * channel(rgba.b);
}

function ratioOf(fg: Rgba, bg: Rgba): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastRatio(foreground: string, background: string): number {
  const bg = parseColor(background);
  return ratioOf(composite(parseColor(foreground), bg), bg);
}

function solid(color: string | Rgba): Rgba {
  const rgba = typeof color === 'string' ? parseColor(color) : color;
  return { r: rgba.r, g: rgba.g, b: rgba.b, a: 1 };
}

export function compositeLayers(layers: readonly string[], backdrop: string | Rgba): Rgba {
  return layers.reduce<Rgba>((below, layer) => composite(parseColor(layer), below), solid(backdrop));
}

export function contrastOnLayers(ink: string, layers: readonly string[], backdrop: string | Rgba): number {
  const ground = compositeLayers(layers, backdrop);
  return ratioOf(composite(parseColor(ink), ground), ground);
}

export type MixSpace = 'srgb' | 'linear';

function encode(linear: number): number {
  const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, c * 255));
}

export function mixColors(from: string | Rgba, to: string | Rgba, amount: number, space: MixSpace = 'srgb'): Rgba {
  const a = solid(from);
  const b = solid(to);
  const t = Math.min(1, Math.max(0, amount));
  if (space === 'linear') {
    const mix = (x: number, y: number) => encode(channel(x) * (1 - t) + channel(y) * t);
    return { r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b), a: 1 };
  }
  return { r: a.r * (1 - t) + b.r * t, g: a.g * (1 - t) + b.g * t, b: a.b * (1 - t) + b.b * t, a: 1 };
}

export function formatRgb(color: Rgba): string {
  const byte = (value: number) => Math.round(Math.min(255, Math.max(0, value)));
  return `rgb(${byte(color.r)},${byte(color.g)},${byte(color.b)})`;
}

export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export function bandCoverage(extent: number, sigma: number): number {
  if (sigma <= 0) {
    return 1;
  }
  return erf(extent / (2 * Math.SQRT2 * sigma));
}

export function discCoverage(radius: number, sigma: number): number {
  if (sigma <= 0) {
    return 1;
  }
  return 1 - Math.exp(-(radius * radius) / (2 * sigma * sigma));
}

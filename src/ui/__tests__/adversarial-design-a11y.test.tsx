import '../testing';
import { setLiquidGlassAvailable } from '../glass/testing';
import type { ComponentProps } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text as RNText, View, useColorScheme, type TextStyle, type ViewStyle } from 'react-native';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { renderWithTheme } from '../testing';
import {
  SPACING_SCALE,
  ThemeProvider,
  createTheme,
  darkColors,
  darkGlass,
  glassRadius,
  lightColors,
  lightGlass,
  motionDuration,
  radius,
  space,
  useReducedMotion,
  useTheme,
  type ColorTokens,
  type GlassPalette,
  type ReducedMotionPreference,
} from '../theme';
import { GLASS_TINT_TEST_ID } from '../glass';
import { Text, type TextVariant } from '../typography';
import {
  Badge,
  Banner,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  SegmentedControl,
  Sheet,
  Skeleton,
  Stepper,
  Table,
  Tabs,
  TextField,
  Toast,
  switchColors,
} from '../primitives';
import {
  COLUMN_WIDTH,
  MIN_TOUCH,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  SKELETON_DELAY_MS,
  SKELETON_PULSE_MS,
  STACK_FONT_SCALE,
  STACK_LABEL_LENGTH,
  SWIPE_DISMISS_RATIO,
  TOAST_DURATION_MS,
  ToastHost,
  hitSlopFor,
  shouldDismissOnRelease,
  shouldStackActions,
  strokeFor,
  toastDurationMs,
} from '../primitives';
import {
  BallChip,
  BallPlaceholder,
  CHIP_DIMENSIONS,
  OverStrip,
  RESULT_DELAY_MS,
  ROLL_OFFSET,
  ResultLine,
  SCORE_KEY_MIN_HEIGHT,
  SIX_TINT_HOLD_MS,
  ScoreFigure,
  ScoreKey,
  ScoringPad,
  StatLine,
  type BallChipKind,
} from '../scoreboard';
import { BoundaryRule, ScreenHeader, SectionHeader, heightClassFor, layoutClassFor, scoringKeyHeight, widthClassFor } from '../layout';
import { TAB_BAR_HEIGHT, TAB_ITEMS, TabBar, navigationTheme, stackScreenOptions } from '../navigation';
import { FLASH_HOLD_MS, REDUCED_FADE_MS } from '../motion';
import { MAX_SERIES, SERIES_DASH_PATTERN, SERIES_TOKENS, WormChart } from '../charts';
import { BootstrapGate, statusBarStyleFor } from '../shell';

interface DirEntry {
  readonly name: string;
  isDirectory(): boolean;
}

interface FileSystem {
  existsSync(target: string): boolean;
  readdirSync(target: string, options: { readonly withFileTypes: true }): DirEntry[];
  readFileSync(target: string, encoding: 'utf8'): string;
}

interface PathModule {
  readonly sep: string;
  resolve(...segments: string[]): string;
  join(...segments: string[]): string;
  dirname(target: string): string;
  relative(from: string, to: string): string;
}

declare const __dirname: string;

const fs = jest.requireActual<FileSystem>('fs');
const nodePath = jest.requireActual<PathModule>('path');
const REPO = nodePath.resolve(__dirname, '..', '..', '..');

type Node = {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly parent: Node | null;
  readonly children: readonly (Node | string)[];
  queryAll(predicate: (node: Node) => boolean): Node[];
};

const CORE_TOKENS = [
  'background',
  'surface',
  'surfaceElevated',
  'textPrimary',
  'textSecondary',
  'textMuted',
  'border',
  'accent',
  'success',
  'warning',
  'danger',
  'score',
] as const;

const EXTENDED_TOKENS = [
  'surfaceSunken',
  'borderStrong',
  'accentPressed',
  'accentSubtle',
  'onAccent',
  'successSubtle',
  'warningSubtle',
  'dangerSubtle',
  'onDanger',
  'focusRing',
  'scrim',
  'inverseSurface',
  'inverseText',
  'inverseAccent',
  'chartSeries1',
  'chartSeries2',
  'chartGrid',
  'accentDeep',
  'highlight',
] as const;

const DOCUMENTED_PALETTE: Readonly<Record<string, readonly [string, string]>> = {
  background: ['#F0F5F8', '#070E12'],
  surface: ['#FFFFFF', '#0D171C'],
  surfaceElevated: ['#FFFFFF', '#132129'],
  textPrimary: ['#0B232B', '#F2F7F9'],
  textSecondary: ['#3D5864', '#8FA7B3'],
  textMuted: ['#526B77', '#7F97A3'],
  border: ['#D5E0E6', '#1A2A33'],
  accent: ['#00606F', '#00C2E0'],
  success: ['#0C7552', '#35D49A'],
  warning: ['#8A5000', '#FFB74D'],
  danger: ['#C42B2B', '#FF5252'],
  score: ['#061A20', '#F8FCFD'],
  surfaceSunken: ['#E2EBF0', '#04090C'],
  borderStrong: ['#6E848E', '#5A7482'],
  accentPressed: ['#004A56', '#00A5BF'],
  accentSubtle: ['#DCEFF3', '#0A2C36'],
  onAccent: ['#FFFFFF', '#010B0E'],
  successSubtle: ['#DDF2E9', '#0B2A22'],
  warningSubtle: ['#FBEFDA', '#2A2014'],
  dangerSubtle: ['#FCE8E8', '#2D1316'],
  onDanger: ['#FFFFFF', '#1C0506'],
  focusRing: ['#008BA3', '#28D9F2'],
  scrim: ['rgba(6,26,32,0.40)', 'rgba(2,7,9,0.64)'],
  inverseSurface: ['#0B232B', '#E3ECF0'],
  inverseText: ['#F0F5F8', '#070E12'],
  inverseAccent: ['#5ED3E8', '#00C2E0'],
  chartSeries1: ['#0A96B2', '#19A2BE'],
  chartSeries2: ['#6650B8', '#7A64D6'],
  chartGrid: ['#E1E9ED', '#16242B'],
  accentDeep: ['#007385', '#008BA3'],
  highlight: ['#008BA3', '#28D9F2'],
};

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

function parse(colour: string): Rgba {
  const value = colour.trim();
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (hex) {
    return {
      r: parseInt(hex[1].slice(0, 2), 16),
      g: parseInt(hex[1].slice(2, 4), 16),
      b: parseInt(hex[1].slice(4, 6), 16),
      a: hex[2] ? parseInt(hex[2], 16) / 255 : 1,
    };
  }
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) {
    return { r: parseInt(short[1] + short[1], 16), g: parseInt(short[2] + short[2], 16), b: parseInt(short[3] + short[3], 16), a: 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (fn) {
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: fn[4] === undefined ? 1 : Number(fn[4]) };
  }
  if (value === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  throw new Error(`not a colour: ${colour}`);
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(c: Rgba): number {
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

function over(fg: Rgba, bg: Rgba): Rgba {
  return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
}

function wcag(foreground: string, background: string): number {
  const bg = parse(background);
  const fg = over(parse(foreground), bg);
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function hueOf(colour: string): number {
  const c = parse(colour);
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const d = max - min;
  if (d === 0) {
    return 0;
  }
  const raw = max === c.r ? ((c.g - c.b) / d) % 6 : max === c.g ? (c.b - c.r) / d + 2 : (c.r - c.g) / d + 4;
  return (raw * 60 + 360) % 360;
}

function chroma(colour: string): number {
  const c = parse(colour);
  return (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
}

const THEMES: readonly (readonly ['light' | 'dark', ColorTokens])[] = [
  ['light', lightColors],
  ['dark', darkColors],
];

const OS_QUERIES = ['isBoldTextEnabled', 'isReduceMotionEnabled', 'isHighTextContrastEnabled', 'isDarkerSystemColorsEnabled', 'isScreenReaderEnabled'] as const;

afterEach(() => {
  for (const query of OS_QUERIES) {
    jest.mocked(AccessibilityInfo[query]).mockImplementation(() => Promise.resolve(false));
  }
  jest.mocked(AccessibilityInfo.addEventListener).mockImplementation((() => ({ remove: jest.fn() })) as never);
});

function flat(node: Node): ViewStyle & TextStyle {
  return (StyleSheet.flatten(node.props.style as ViewStyle) ?? {}) as ViewStyle & TextStyle;
}

function isHost(node: Node): boolean {
  return typeof node.type === 'string';
}

function hiddenFromA11y(node: Node): boolean {
  let cursor: Node | null = node;
  while (cursor) {
    const p = cursor.props;
    if (p.importantForAccessibility === 'no-hide-descendants' || p.accessibilityElementsHidden === true || p['aria-hidden'] === true) {
      return true;
    }
    cursor = cursor.parent;
  }
  return node.props.accessible === false || node.props.importantForAccessibility === 'no';
}

const INTERACTIVE_ROLES = new Set(['button', 'link', 'tab', 'radio', 'switch', 'checkbox', 'adjustable', 'togglebutton', 'menuitem', 'search']);

function isInteractive(node: Node): boolean {
  if (!isHost(node)) {
    return false;
  }
  const type = String(node.type);
  if (/ScrollView|FlatList|Modal/i.test(type)) {
    return false;
  }
  const role = String(node.props.accessibilityRole ?? node.props.role ?? '');
  return (
    INTERACTIVE_ROLES.has(role) ||
    typeof node.props.onClick === 'function' ||
    typeof node.props.onResponderRelease === 'function' ||
    type === 'TextInput' ||
    /Switch/i.test(type)
  );
}

function groupedInsideAccessibleAncestor(node: Node): boolean {
  let cursor = node.parent;
  while (cursor) {
    if (isHost(cursor) && cursor.props.accessible === true) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function slopOf(value: unknown): { top: number; bottom: number; left: number; right: number } {
  if (typeof value === 'number') {
    return { top: value, bottom: value, left: value, right: value };
  }
  const v = (value ?? {}) as Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>;
  return { top: v.top ?? 0, bottom: v.bottom ?? 0, left: v.left ?? 0, right: v.right ?? 0 };
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function target(node: Node): { width: number | 'stretch'; height: number } {
  const s = flat(node);
  const slop = slopOf(node.props.hitSlop);
  const h = Math.max(num(s.height) ?? 0, num(s.minHeight) ?? 0);
  const w = Math.max(num(s.width) ?? 0, num(s.minWidth) ?? 0);
  const stretches = w === 0 && (s.flex !== undefined || s.flexGrow !== undefined || s.alignSelf === 'stretch' || s.width === '100%');
  return { width: stretches ? 'stretch' : w + slop.left + slop.right, height: h + slop.top + slop.bottom };
}

function labelOf(node: Node): string {
  return String(node.props.accessibilityLabel ?? node.props['aria-label'] ?? '');
}

function textContent(node: Node | string): string {
  if (typeof node === 'string') {
    return node;
  }
  return node.children.map(textContent).join('');
}

function animatedNodes(root: Node): Node[] {
  return root.queryAll((n) => isHost(n) && n.props.jestAnimatedStyle !== undefined);
}

function transformIsIdentity(style: Record<string, unknown>): boolean {
  const transform = style.transform;
  if (!Array.isArray(transform)) {
    return true;
  }
  return transform.every((entry: Record<string, unknown>) =>
    Object.entries(entry).every(([key, value]) => {
      if (key.startsWith('scale')) {
        return value === 1;
      }
      if (key.startsWith('translate')) {
        return value === 0;
      }
      return true;
    }),
  );
}

function stateOf(node: Node): Record<string, unknown> {
  return (node.props.accessibilityState ?? {}) as Record<string, unknown>;
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

function walk(relativeDir: string): string[] {
  const start = nodePath.join(REPO, relativeDir);
  if (!fs.existsSync(start)) {
    return [];
  }
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'testing' || entry.name === 'node_modules') {
          continue;
        }
        visit(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
  };
  visit(start);
  return out;
}

function rel(file: string): string {
  return nodePath.relative(REPO, file).split(nodePath.sep).join('/');
}

function scan(files: readonly string[], patterns: readonly RegExp[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (patterns.some((p) => p.test(line))) {
          hits.push(`${rel(file)}:${index + 1}: ${line.trim()}`);
        }
      });
  }
  return hits;
}

const noop = () => undefined;

function glassColours(glass: GlassPalette): string[] {
  const out: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string' && /^(#|rgba?\()/.test(value)) {
      out.push(value);
    } else if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(glass);
  return out;
}

function insideGlass(node: Node): boolean {
  let cursor: Node | null = node;
  while (cursor) {
    if (String(cursor.type) === 'ViewManagerAdapter_ExpoGlassEffect' || cursor.queryAll((c) => c.props.testID === GLASS_TINT_TEST_ID).length > 0) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

describe('§71 tokens: both themes, identical keys, documented values', () => {
  it.each(THEMES)('defines every mandatory §71 token as a parseable colour in the %s theme', (_scheme, palette) => {
    for (const token of CORE_TOKENS) {
      const value = (palette as Record<string, unknown>)[token];
      expect(typeof value).toBe('string');
      expect(() => parse(value as string)).not.toThrow();
      expect(parse(value as string).a).toBe(1);
    }
  });

  it('gives light and dark exactly the same key set, including every DESIGN_SYSTEM §1.2 extended token', () => {
    const lightKeys = Object.keys(lightColors).sort();
    const darkKeys = Object.keys(darkColors).sort();
    expect(darkKeys).toEqual(lightKeys);
    for (const token of [...CORE_TOKENS, ...EXTENDED_TOKENS]) {
      expect(lightKeys).toContain(token);
    }
  });

  it('matches every documented hex value of DESIGN_SYSTEM §1.1/§1.2 in both themes', () => {
    const mismatches: string[] = [];
    for (const [token, [light, dark]] of Object.entries(DOCUMENTED_PALETTE)) {
      const actualLight = (lightColors as Record<string, string>)[token];
      const actualDark = (darkColors as Record<string, string>)[token];
      if (JSON.stringify(parse(actualLight)) !== JSON.stringify(parse(light))) {
        mismatches.push(`light.${token} ${actualLight} != ${light}`);
      }
      if (JSON.stringify(parse(actualDark)) !== JSON.stringify(parse(dark))) {
        mismatches.push(`dark.${token} ${actualDark} != ${dark}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('designs dark separately: no token is the light value, nor its RGB inversion', () => {
    const inversions: string[] = [];
    for (const token of CORE_TOKENS) {
      const l = parse(lightColors[token]);
      const d = parse(darkColors[token]);
      const distanceToInverse = Math.abs(255 - l.r - d.r) + Math.abs(255 - l.g - d.g) + Math.abs(255 - l.b - d.b);
      if (distanceToInverse < 12) {
        inversions.push(token);
      }
      expect(darkColors[token].toUpperCase()).not.toBe(lightColors[token].toUpperCase());
    }
    expect(inversions).toEqual([]);
  });

  it('avoids pure white/black canvases and ink (§68, §69) and keeps polarity per theme', () => {
    expect(lightColors.background.toUpperCase()).not.toBe('#FFFFFF');
    expect(lightColors.textPrimary.toUpperCase()).not.toBe('#000000');
    expect(darkColors.background.toUpperCase()).not.toBe('#000000');
    expect(darkColors.textPrimary.toUpperCase()).not.toBe('#FFFFFF');
    expect(luminance(parse(lightColors.background))).toBeGreaterThan(luminance(parse(lightColors.textPrimary)));
    expect(luminance(parse(darkColors.background))).toBeLessThan(luminance(parse(darkColors.textPrimary)));
    expect(luminance(parse(darkColors.surfaceElevated))).toBeGreaterThan(luminance(parse(darkColors.surface)));
    expect(luminance(parse(darkColors.surface))).toBeGreaterThan(luminance(parse(darkColors.background)));
  });

  it('has no neon: nothing is a fully saturated colour at full brightness, and only the §107 cyan identity runs above 0.7 chroma (§1, §107)', () => {
    const neon = (value: string) => {
      const c = parse(value);
      const max = Math.max(c.r, c.g, c.b);
      const min = Math.min(c.r, c.g, c.b);
      return max / 255 >= 0.98 && (max - min) / max >= 0.9;
    };
    expect(neon('#00E5FF')).toBe(true);
    expect(neon('#00FF00')).toBe(true);
    const loud: string[] = [];
    for (const [scheme, palette] of THEMES) {
      for (const [token, value] of Object.entries(palette)) {
        if (parse(value).a !== 1) {
          continue;
        }
        if (neon(value)) {
          loud.push(`${scheme}.${token} ${value} is neon`);
        }
        const h = hueOf(value);
        if (chroma(value) > 0.7 && !(h >= 180 && h <= 200)) {
          loud.push(`${scheme}.${token} ${value} chroma ${chroma(value).toFixed(2)} outside the cyan identity`);
        }
        if (chroma(value) > 0.9) {
          loud.push(`${scheme}.${token} ${value} chroma ${chroma(value).toFixed(2)}`);
        }
      }
    }
    expect(loud).toEqual([]);
    const bright = THEMES.flatMap(([, palette]) => Object.entries(palette).filter(([, value]) => parse(value).a === 1 && chroma(value) > 0.7).map(([token]) => token));
    expect([...new Set(bright)].sort()).toEqual(['accent', 'accentPressed', 'focusRing', 'highlight', 'inverseAccent']);
  });

  it('keeps the spacing scale exactly 4…48 with the documented names (§67, AC-E1-07)', () => {
    expect([...SPACING_SCALE]).toEqual([4, 8, 12, 16, 20, 24, 32, 40, 48]);
    expect(space).toEqual({ xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, '2xl': 32, '3xl': 40, '4xl': 48 });
  });

  it('keeps radius restrained: the documented steps and nothing above 10 (DESIGN_SYSTEM §4.1)', () => {
    expect(radius).toMatchObject({ none: 0, xs: 2, sm: 4, md: 6, lg: 8, xl: 10 });
    for (const value of Object.values(radius)) {
      if (typeof value === 'number') {
        expect(value).toBeLessThanOrEqual(10);
      }
    }
  });

  it('defines the §8 motion durations exactly', () => {
    expect(motionDuration).toMatchObject({ instant: 0, fast: 120, base: 200, slow: 320, exit: 160 });
  });

  it('uses no shadow at all in dark (elevation is tone) and only the one soft level-1 shadow in light', () => {
    const dark = createTheme('dark');
    const light = createTheme('light');
    for (const style of [dark.elevation.flat, dark.elevation.raised, light.elevation.flat]) {
      const s = style as Record<string, unknown>;
      expect(s.shadowOpacity ?? 0).toBe(0);
      expect(s.elevation ?? 0).toBe(0);
    }
    expect(light.elevation.raised).toMatchObject({ shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6 });
  });
});

describe('WCAG contrast recomputed independently (DESIGN_SYSTEM §1.3, AC-E11-08)', () => {
  const SURFACES = ['background', 'surface', 'surfaceElevated', 'surfaceSunken'] as const;

  it.each(THEMES)('puts every text token at ≥ 4.5:1 on every surface in the %s theme', (_scheme, palette) => {
    const failures: string[] = [];
    for (const text of ['textPrimary', 'textSecondary', 'textMuted'] as const) {
      for (const surface of SURFACES) {
        const ratio = wcag(palette[text], palette[surface]);
        if (ratio < 4.5) {
          failures.push(`${text}/${surface} ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it.each(THEMES)('makes the score ink ≥ 3:1 everywhere and the highest-contrast ink on the page in the %s theme', (_scheme, palette) => {
    for (const surface of ['background', 'surface', 'surfaceElevated'] as const) {
      expect(wcag(palette.score, palette[surface])).toBeGreaterThanOrEqual(3);
      for (const other of ['textPrimary', 'textSecondary', 'textMuted', 'accent'] as const) {
        expect(wcag(palette.score, palette[surface])).toBeGreaterThanOrEqual(wcag(palette[other], palette[surface]));
      }
    }
  });

  const TABLE: readonly (readonly [string, string, number | null, number | null, number])[] = [
    ['textPrimary', 'background', 14.83, 18, 4.5],
    ['textPrimary', 'surface', 16.29, 16.82, 4.5],
    ['textPrimary', 'surfaceElevated', 16.29, 15.23, 4.5],
    ['textPrimary', 'surfaceSunken', 13.47, 18.53, 4.5],
    ['textSecondary', 'background', 6.88, 7.72, 4.5],
    ['textSecondary', 'surface', 7.56, 7.22, 4.5],
    ['textSecondary', 'surfaceElevated', 7.56, 6.53, 4.5],
    ['textSecondary', 'surfaceSunken', 6.25, 7.95, 4.5],
    ['textMuted', 'background', 5.13, 6.35, 4.5],
    ['textMuted', 'surface', 5.63, 5.93, 4.5],
    ['textMuted', 'surfaceElevated', 5.63, 5.37, 4.5],
    ['textMuted', 'surfaceSunken', 4.66, 6.53, 4.5],
    ['score', 'background', 16.25, 18.82, 3],
    ['score', 'surface', 17.85, 17.58, 3],
    ['accent', 'background', 6.59, 9.06, 4.5],
    ['accent', 'surface', 7.23, 8.47, 4.5],
    ['accent', 'surfaceElevated', 7.23, 7.67, 4.5],
    ['accent', 'accentSubtle', 6.09, 6.87, 4.5],
    ['onAccent', 'accent', 7.23, 9.28, 4.5],
    ['onAccent', 'accentPressed', 9.93, 6.76, 4.5],
    ['onAccent', 'accentDeep', 5.54, 4.95, 4.5],
    ['textPrimary', 'accentSubtle', 13.71, 13.63, 4.5],
    ['success', 'surface', 5.7, 9.54, 4.5],
    ['success', 'successSubtle', 4.88, 8.06, 4.5],
    ['warning', 'surface', 6.51, 10.49, 4.5],
    ['warning', 'warningSubtle', 5.72, 9.23, 4.5],
    ['danger', 'surface', 5.63, 5.69, 4.5],
    ['danger', 'background', 5.13, 6.09, 4.5],
    ['danger', 'dangerSubtle', 4.79, 5.41, 4.5],
    ['onDanger', 'danger', 5.63, 6.13, 4.5],
    ['textPrimary', 'warningSubtle', 14.32, 14.79, 4.5],
    ['textPrimary', 'dangerSubtle', 13.84, 15.99, 4.5],
    ['borderStrong', 'surface', 3.92, 3.68, 3],
    ['borderStrong', 'background', 3.57, 3.94, 3],
    ['focusRing', 'background', 3.66, 11.38, 3],
    ['focusRing', 'surface', 4.02, 10.63, 3],
    ['highlight', 'background', 3.66, 11.38, 3],
    ['highlight', 'surface', 4.02, 10.63, 3],
    ['inverseText', 'inverseSurface', 14.83, null, 4.5],
    ['chartSeries1', 'surface', 3.49, 6.01, 3],
    ['chartSeries2', 'surface', 6.17, 4.0, 3],
    ['chartSeries1', 'background', 3.18, 6.43, 3],
    ['chartSeries2', 'background', 5.62, 4.28, 3],
  ];

  it.each(TABLE)('%s on %s meets its requirement and the documented ratio in both themes', (fg, bg, lightRatio, darkRatio, requirement) => {
    for (const [scheme, palette, documented] of [
      ['light', lightColors, lightRatio],
      ['dark', darkColors, darkRatio],
    ] as const) {
      if (documented === null) {
        continue;
      }
      const ratio = wcag((palette as Record<string, string>)[fg], (palette as Record<string, string>)[bg]);
      expect({ scheme, ok: ratio >= requirement }).toEqual({ scheme, ok: true });
      expect({ scheme, ratio: Math.round(ratio * 100) / 100 }).toEqual({ scheme, ratio: expect.closeTo(documented, 1) });
    }
  });

  it('keeps the toast action legible on its own background in both themes (§6.10)', () => {
    expect(wcag(lightColors.inverseAccent, lightColors.inverseSurface)).toBeGreaterThanOrEqual(4.5);
    expect(wcag(darkColors.inverseAccent, darkColors.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
    expect(wcag(darkColors.textPrimary, darkColors.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it('never lets accent read as an error or a status read as a chart series (§1.2 rule)', () => {
    for (const [, palette] of THEMES) {
      const series = [palette.chartSeries1, palette.chartSeries2].map((c) => c.toUpperCase());
      for (const status of [palette.success, palette.warning, palette.danger, palette.accent]) {
        expect(series).not.toContain(status.toUpperCase());
      }
      expect(palette.accent.toUpperCase()).not.toBe(palette.danger.toUpperCase());
      expect(palette.success.toUpperCase()).not.toBe(palette.accent.toUpperCase());
    }
  });

  it.each(['light', 'dark'] as const)('switches secondary/muted ink to primary and borders to borderStrong under OS high contrast (%s)', (scheme) => {
    const base = scheme === 'light' ? lightColors : darkColors;
    const hc = createTheme(scheme, { highContrast: true, reducedMotion: false, boldText: false });
    expect(hc.color.textSecondary).toBe(base.textPrimary);
    expect(hc.color.textMuted).toBe(base.textPrimary);
    expect(hc.color.border).toBe(base.borderStrong);
    expect(hc.borderWidth.hairline).toBeGreaterThanOrEqual(1);
    expect(wcag(hc.color.border, hc.color.surface)).toBeGreaterThanOrEqual(3);
  });
});

const CHIP_SAMPLES: readonly (readonly [BallChipKind, string, string])[] = [
  ['dot', '0', 'Dot ball'],
  ['runs', '2', 'Two runs'],
  ['four', '4', 'Four runs'],
  ['six', '6', 'Six runs'],
  ['wicket', 'W', 'Wicket, bowled'],
  ['wide', 'WD+1', 'Wide, plus one run'],
  ['no_ball', 'NB+4', 'No ball, plus four runs'],
  ['bye', 'B1', 'One bye'],
  ['leg_bye', 'LB2', 'Two leg byes'],
];

function chipBody(root: Node, height: number): Node {
  const candidates = root.queryAll((n) => isHost(n) && String(n.type) === 'View' && flat(n).height === height && typeof flat(n).borderRadius === 'number');
  expect(candidates.length).toBeGreaterThan(0);
  return candidates[0];
}

function chipInk(root: Node): string {
  const texts = root.queryAll((n) => isHost(n) && String(n.type) === 'Text');
  expect(texts.length).toBeGreaterThan(0);
  return String(flat(texts[0]).color);
}

function greyscaleShape(body: Node): string {
  const s = flat(body);
  const h = Number(s.height);
  const r = Number(s.borderRadius);
  const filled = s.backgroundColor !== undefined && parse(String(s.backgroundColor)).a > 0;
  const dashed = s.borderStyle === 'dashed';
  const bw = Number(s.borderWidth ?? 0);
  const outline = bw > 0 && s.borderColor !== undefined && parse(String(s.borderColor)).a > 0 ? bw : 0;
  let shape: string;
  if (r >= h / 2 - 0.5) {
    shape = s.width === h ? 'circle' : 'capsule';
  } else if (r <= 2) {
    shape = 'squared';
  } else {
    shape = 'rounded-rect';
  }
  return `${shape}|${filled ? 'filled' : 'open'}|${dashed ? 'dashed' : 'solid'}|${outline}`;
}

describe('BallChip: meaning by label and shape, colour only reinforces (§6.3, §78)', () => {
  it.each(CHIP_SAMPLES)('%s chip shows its token text and speaks the domain label', async (kind, text, label) => {
    await renderWithTheme(<BallChip kind={kind} text={text} accessibilityLabel={label} testID="chip" />);
    const chip = screen.getByTestId('chip') as unknown as Node;
    expect(labelOf(chip)).toBe(label);
    expect(textContent(chip)).toBe(text);
  });

  it('keeps the shape grammar readable in greyscale: circle, capsule, dashed rectangle, filled square', async () => {
    const shapes: Record<string, string> = {};
    for (const [kind, text, label] of CHIP_SAMPLES) {
      const view = await renderWithTheme(<BallChip kind={kind} text={text} accessibilityLabel={label} testID={`chip-${kind}`} />);
      shapes[kind] = greyscaleShape(chipBody(screen.getByTestId(`chip-${kind}`) as unknown as Node, 32));
      await view.unmount();
    }
    expect(shapes.wicket).toMatch(/^squared\|filled\|solid/);
    expect(shapes.wide).toMatch(/^squared\|open\|dashed\|1$/);
    expect(shapes.no_ball).toMatch(/^squared\|open\|dashed\|1$/);
    expect(shapes.bye).toMatch(/^capsule\|open\|solid\|1$/);
    expect(shapes.leg_bye).toMatch(/^capsule\|open\|solid\|1$/);
    expect(shapes.dot).toMatch(/^circle\|open\|solid/);
    expect(shapes.runs).toBe('circle|open|solid|1');
    expect(shapes.four).toBe('circle|open|solid|2');
    expect(shapes.six).toMatch(/^circle\|filled/);
    const filledSquares = Object.entries(shapes).filter(([, s]) => s.startsWith('squared|filled'));
    expect(filledSquares.map(([k]) => k)).toEqual(['wicket']);
    expect(new Set([shapes.runs, shapes.four, shapes.six, shapes.wicket, shapes.wide, shapes.bye]).size).toBe(6);
  });

  it.each(['light', 'dark'] as const)('keeps chip ink ≥ 4.5:1 on its fill (or on the page when open) and outlines ≥ 3:1 in %s', async (mode) => {
    const palette = mode === 'light' ? lightColors : darkColors;
    const failures: string[] = [];
    for (const [kind, text, label] of CHIP_SAMPLES) {
      const view = await renderWithTheme(<BallChip kind={kind} text={text} accessibilityLabel={label} testID="chip" />, { mode });
      const root = screen.getByTestId('chip') as unknown as Node;
      const body = flat(chipBody(root, 32));
      const ink = chipInk(root);
      const fill = body.backgroundColor !== undefined && parse(String(body.backgroundColor)).a > 0 ? String(body.backgroundColor) : null;
      const grounds = fill ? [fill] : [palette.surface, palette.background];
      for (const ground of grounds) {
        const r = wcag(ink, ground);
        if (r < 4.5) {
          failures.push(`${kind} ink ${ink} on ${ground}: ${r.toFixed(2)}`);
        }
        if (!fill && kind !== 'dot' && body.borderColor) {
          const b = wcag(String(body.borderColor), ground);
          if (b < 3) {
            failures.push(`${kind} outline ${String(body.borderColor)} on ${ground}: ${b.toFixed(2)}`);
          }
        }
      }
      await view.unmount();
    }
    expect(failures).toEqual([]);
  });

  it('maps the dark W chip to the wicket red fill with dark ink and the six chip to the deep teal with onAccent (THEMES §3.3)', async () => {
    const view = await renderWithTheme(<BallChip kind="wicket" text="W" accessibilityLabel="Wicket, bowled" testID="w" />, { mode: 'dark' });
    const w = screen.getByTestId('w') as unknown as Node;
    expect(String(flat(chipBody(w, 32)).backgroundColor).toUpperCase()).toBe(darkColors.danger.toUpperCase());
    expect(chipInk(w).toUpperCase()).toBe(darkColors.onDanger.toUpperCase());
    await view.unmount();
    await renderWithTheme(<BallChip kind="six" text="6" accessibilityLabel="Six runs" testID="six" />, { mode: 'dark' });
    const six = screen.getByTestId('six') as unknown as Node;
    expect(String(flat(chipBody(six, 32)).backgroundColor).toUpperCase()).toBe(darkColors.accentDeep.toUpperCase());
    expect(chipInk(six).toUpperCase()).toBe(darkColors.onAccent.toUpperCase());
  });

  it('marks a free hit in words as well as with the warning bar', async () => {
    await renderWithTheme(<BallChip kind="runs" text="1" accessibilityLabel="One run" isFreeHit testID="fh" />);
    const chip = screen.getByTestId('fh') as unknown as Node;
    expect(labelOf(chip)).toMatch(/free hit/i);
    const bars = chip.queryAll((n) => isHost(n) && flat(n).height === 2 && String(flat(n).backgroundColor).toUpperCase() === lightColors.warning.toUpperCase());
    expect(bars.length).toBe(1);
  });

  it('sets the short-run suffix as a smaller superscript in the same ink', async () => {
    await renderWithTheme(<BallChip kind="runs" text="1s" accessibilityLabel="One run, one short" testID="short" />);
    const chip = screen.getByTestId('short') as unknown as Node;
    const texts = chip.queryAll((n) => isHost(n) && String(n.type) === 'Text');
    const sizes = texts.map((t) => Number(flat(t).fontSize));
    expect(textContent(chip)).toBe('1s');
    expect(Math.min(...sizes)).toBeLessThan(Math.max(...sizes));
    expect(Math.min(...sizes) / Math.max(...sizes)).toBeCloseTo(0.7, 1);
    expect(new Set(texts.map((t) => String(flat(t).color))).size).toBe(1);
  });

  it('hides the "ball still due" placeholder from assistive tech (announced only in aggregate)', async () => {
    await renderWithTheme(<BallPlaceholder testID="ph" />);
    expect(screen.queryByTestId('ph')).toBeNull();
    const hidden = screen.getByTestId('ph', { includeHiddenElements: true }) as unknown as Node;
    expect(hiddenFromA11y(hidden)).toBe(true);
    expect(flat(hidden).borderStyle).toBe('dotted');
  });

  it('gives the tappable ball-log chip a 44 pt target although the md chip is 24', async () => {
    await renderWithTheme(<BallChip kind="four" text="4" size="md" accessibilityLabel="Over 17 ball 2: Four runs" accessibilityHint="Edit this ball" onPress={noop} testID="log" />);
    const button = screen.getByRole('button', { name: 'Over 17 ball 2: Four runs' }) as unknown as Node;
    const t = target(button);
    expect(t.height).toBeGreaterThanOrEqual(44);
    expect(t.width === 'stretch' || t.width >= 44).toBe(true);
  });
});

describe('OverStrip is one grouped, spoken sentence (ACCESSIBILITY §2)', () => {
  it('reads the chips in order, then balls left, then the runs', async () => {
    const balls = [
      { text: '1', kind: 'runs' as const, isFreeHit: false, accessibilityLabel: 'One run' },
      { text: '4', kind: 'four' as const, isFreeHit: false, accessibilityLabel: 'Four runs' },
      { text: '0', kind: 'dot' as const, isFreeHit: false, accessibilityLabel: 'Dot ball' },
      { text: 'W', kind: 'wicket' as const, isFreeHit: false, accessibilityLabel: 'Wicket, bowled' },
    ];
    await renderWithTheme(<OverStrip balls={balls} remaining={2} runs="5" testID="strip" />);
    const strip = screen.getByTestId('strip') as unknown as Node;
    const grouped = [strip, ...strip.queryAll((n) => isHost(n) && n.props.accessible === true)].find((n) => labelOf(n).length > 0);
    expect(grouped).toBeDefined();
    const spoken = labelOf(grouped as Node).toLowerCase();
    const positions = balls.map((b) => spoken.indexOf(b.accessibilityLabel.toLowerCase()));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(spoken).toContain('2 balls left');
    expect(spoken).toMatch(/5 runs/);
    expect(spoken.indexOf('2 balls left')).toBeGreaterThan(positions[positions.length - 1]);
  });

  it('shows the THIS OVER label and the RUNS caption as text, not colour', async () => {
    await renderWithTheme(<OverStrip balls={[]} remaining={6} runs="0" testID="strip" />);
    expect(screen.getByText(/this over/i, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(/runs/i, { includeHiddenElements: true })).toBeTruthy();
  });
});

function Gallery() {
  return (
    <View>
      <Button label="Start match" onPress={noop} />
      <Button label="See all" size="sm" variant="tertiary" onPress={noop} />
      <Button label="Save & exit" size="lg" variant="secondary" onPress={noop} />
      <Button label="Discard" variant="destructive" onPress={noop} />
      <Button label="Delete" variant="destructiveConfirm" onPress={noop} />
      <IconButton icon="undo-2" accessibilityLabel="Undo last ball" onPress={noop} />
      <TextField label="Team name" value="Tigers" onChangeText={noop} />
      <TextField label="Overs" value="20" numeric onChangeText={noop} error="Enter a number between 1 and 50" />
      <Stepper label="Players per side" value={11} onChange={noop} min={2} max={11} />
      <SegmentedControl
        accessibilityLabel="Toss decision"
        value="bat"
        onChange={noop}
        options={[
          { value: 'bat', label: 'Bat' },
          { value: 'bowl', label: 'Bowl' },
        ]}
      />
      <Tabs
        accessibilityLabel="Pools"
        selectedKey="a"
        onSelect={noop}
        tabs={[
          { key: 'a', label: 'Pool A' },
          { key: 'b', label: 'Pool B' },
        ]}
      />
      <ListRow title="Lions v Tigers" subtitle="12 Sep · T20" trailing={{ kind: 'chevron' }} onPress={noop} menu={{ accessibilityLabel: 'More actions for Lions v Tigers', onPress: noop }} />
      <ListRow title="Vibration" trailing={{ kind: 'switch', value: true, onValueChange: noop }} />
      <Table
        columns={[
          { key: 'team', header: 'Team', kind: 'name', value: (r: { team: string; pts: string }) => r.team },
          { key: 'pts', header: 'Pts', kind: 'numeric', value: (r: { team: string; pts: string }) => r.pts },
        ]}
        rows={[{ team: 'Tigers', pts: '6' }]}
        rowKey={(r) => r.team}
        rowAccessibilityLabel={(r) => `Position 1, ${r.team}, points ${r.pts}`}
        onRowPress={noop}
      />
      <SectionHeader title="Recent" action={{ label: 'See all', onPress: noop }} />
      <EmptyState title="No tournaments yet" body="Create a tournament." icon="trophy" action={{ label: 'Create tournament', onPress: noop }} />
      <ErrorState title="Couldn't load this tournament" onRetry={noop} secondaryAction={{ label: 'Diagnostics', onPress: noop }} />
      <Banner tone="danger" message="This match needs repair" action={{ label: 'Open ball log', onPress: noop }} />
      <Toast toast={{ id: 't', kind: 'success', message: 'Saved', action: { label: 'Undo', run: noop } }} onDismiss={noop} />
      <StatLine kind="batter" name="Ali Khan" figure="42" secondary="(24)" active accessibilityLabel="On strike: Ali Khan, 42 runs from 24 balls" onPress={noop} />
      <StatLine kind="bowler" name="Hassan Ali" figure="3.4-0-28-2" accessibilityLabel="Bowling: Hassan Ali" onPress={noop} />
      <TabBar items={TAB_ITEMS.map((t, i) => ({ key: t.route, label: t.label, icon: t.icon, selected: i === 0, onPress: noop }))} />
      <ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} />
      <RNText>end</RNText>
    </View>
  );
}

describe('every interactive element: role, label, ≥ 44 × 44 (§72, ACCESSIBILITY §2, §5)', () => {
  it('exposes an accessibilityRole and a non-empty accessibilityLabel on every focusable control', async () => {
    const view = await renderWithTheme(<Gallery />);
    const controls = (view.container as unknown as Node).queryAll((n) => isInteractive(n) && !hiddenFromA11y(n) && !groupedInsideAccessibleAncestor(n));
    expect(controls.length).toBeGreaterThan(30);
    const missing = controls
      .filter((n) => String(n.type) !== 'TextInput')
      .filter((n) => !(n.props.accessibilityRole ?? n.props.role) || labelOf(n).trim().length === 0)
      .map((n) => `${String(n.type)} role=${String(n.props.accessibilityRole ?? n.props.role)} label="${labelOf(n)}" testID=${String(n.props.testID)} text="${textContent(n)}"`);
    expect(missing).toEqual([]);
  });

  it('labels every text input with its visible field label', async () => {
    const view = await renderWithTheme(<Gallery />);
    const inputs = (view.container as unknown as Node).queryAll((n) => isHost(n) && String(n.type) === 'TextInput');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    for (const input of inputs) {
      expect(labelOf(input)).toMatch(/Team name|Overs/);
    }
  });

  it('gives every touch target (anything that takes a press) ≥ 44 pt including hit slop', async () => {
    const view = await renderWithTheme(<Gallery />);
    const controls = (view.container as unknown as Node).queryAll(
      (n) =>
        isHost(n) &&
        !/ScrollView|Modal/i.test(String(n.type)) &&
        (typeof n.props.onClick === 'function' || typeof n.props.onResponderRelease === 'function' || String(n.type) === 'TextInput'),
    );
    expect(controls.length).toBeGreaterThan(30);
    const small = controls
      .map((n) => ({ who: `${String(n.type)} "${labelOf(n) || textContent(n)}"`, size: target(n) }))
      .filter(({ size }) => size.height < 44 || (size.width !== 'stretch' && size.width < 44));
    expect(small).toEqual([]);
  });

  it('makes a small button 44 tall without relying on hit slop (web ignores it), and an icon button 44 × 44', async () => {
    await renderWithTheme(
      <View>
        <Button label="Change" size="sm" variant="tertiary" onPress={noop} />
        <IconButton icon="x" accessibilityLabel="Close" onPress={noop} />
      </View>,
    );
    const sm = screen.getByRole('button', { name: 'Change' }) as unknown as Node;
    const visible = Math.max(num(flat(sm).height) ?? 0, num(flat(sm).minHeight) ?? 0);
    expect(visible).toBe(44);
    expect(target(sm).height).toBeGreaterThanOrEqual(44);
    const icon = screen.getByRole('button', { name: 'Close' }) as unknown as Node;
    expect(target(icon)).toEqual({ width: expect.any(Number), height: expect.any(Number) });
    expect(target(icon).height).toBeGreaterThanOrEqual(44);
    expect(target(icon).width as number).toBeGreaterThanOrEqual(44);
  });
});

describe('ScoringPad and ScoreKey (DESIGN_SYSTEM §6.2, ACCESSIBILITY §2, §5)', () => {
  it('reads the eight keys in the §4 focus order with the documented labels and hints', async () => {
    await renderWithTheme(<ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} />);
    const keys = screen.getAllByRole('button') as unknown as Node[];
    expect(keys).toHaveLength(8);
    const labels = keys.map(labelOf);
    expect(labels[0]).toMatch(/^(Dot ball|Zero runs)$/);
    expect(labels.slice(1)).toEqual(['One run', 'Two runs', 'Three runs', 'Four runs, boundary', 'Six runs, boundary', 'Extras', 'Wicket']);
    expect(keys[6].props.accessibilityHint).toBe('Wide, no ball, byes, leg byes and other runs');
    expect(keys[7].props.accessibilityHint).toBe('Opens dismissal options');
  });

  it('never renders a scoring key below 56 pt, even when a caller asks for less', async () => {
    await renderWithTheme(
      <View>
        <ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} keyHeight={40} />
        <ScoreKey kind="runs" label="1" onPress={noop} accessibilityLabel="Solo key" height={30} />
      </View>,
    );
    for (const key of screen.getAllByRole('button') as unknown as Node[]) {
      expect({ key: labelOf(key), height: target(key).height >= 56 }).toEqual({ key: labelOf(key), height: true });
    }
  });

  it('uses at least the regular 64 pt key on a standard phone when no height is forced', async () => {
    await renderWithTheme(<ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} />);
    for (const key of screen.getAllByRole('button') as unknown as Node[]) {
      expect(target(key).height).toBeGreaterThanOrEqual(64);
    }
  });

  it('adds non-colour cues: FOUR/SIX captions, EXTRAS and WICKET words, and a glyph on WICKET', async () => {
    await renderWithTheme(<ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} />);
    const four = screen.getByRole('button', { name: 'Four runs, boundary' }) as unknown as Node;
    const six = screen.getByRole('button', { name: 'Six runs, boundary' }) as unknown as Node;
    const extras = screen.getByRole('button', { name: 'Extras' }) as unknown as Node;
    const wicket = screen.getByRole('button', { name: 'Wicket' }) as unknown as Node;
    expect(textContent(four).toUpperCase()).toContain('FOUR');
    expect(textContent(six).toUpperCase()).toContain('SIX');
    expect(textContent(extras).toUpperCase()).toContain('EXTRAS');
    expect(textContent(wicket).toUpperCase()).toContain('WICKET');
    const glyphs = wicket.queryAll((n) => isHost(n) && (/svg/i.test(String(n.type)) || /stumps|lucide/i.test(String(n.props.testID ?? ''))));
    expect(glyphs.length).toBeGreaterThan(0);
    const plus = extras.queryAll((n) => isHost(n) && /plus/i.test(String(n.props.testID ?? '')));
    expect(plus.length).toBeGreaterThan(0);
  });

  it('draws the WICKET key with a 2 pt danger border and run keys with 1 pt borderStrong on surface', async () => {
    await renderWithTheme(<ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} />, { mode: 'dark' });
    const wicket = flat(screen.getByRole('button', { name: 'Wicket' }) as unknown as Node);
    expect(wicket.borderWidth).toBe(2);
    expect(String(wicket.borderColor).toUpperCase()).toBe(darkColors.danger.toUpperCase());
    const one = flat(screen.getByRole('button', { name: 'One run' }) as unknown as Node);
    expect(one.borderWidth).toBe(1);
    expect(String(one.borderColor).toUpperCase()).toBe(darkColors.borderStrong.toUpperCase());
    expect(String(one.backgroundColor).toUpperCase()).toBe(darkColors.surface.toUpperCase());
  });

  it('shows • for the dot-style zero key and still speaks it in words', async () => {
    await renderWithTheme(<ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} dotStyle="dot" />);
    const zero = screen.getAllByRole('button')[0] as unknown as Node;
    expect(textContent(zero)).toContain('•');
    expect(labelOf(zero)).toMatch(/^(Dot ball|Zero runs)$/);
  });

  it('records a normal ball with exactly one tap per key (§2 speed)', async () => {
    const onRuns = jest.fn();
    const onExtras = jest.fn();
    const onWicket = jest.fn();
    await renderWithTheme(<ScoringPad onRuns={onRuns} onExtras={onExtras} onWicket={onWicket} />);
    const keys = screen.getAllByRole('button');
    for (const key of keys) {
      await fireEvent.press(key);
    }
    expect(onRuns.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3, 4, 6]);
    expect(onExtras).toHaveBeenCalledTimes(1);
    expect(onWicket).toHaveBeenCalledTimes(1);
  });
});

describe('selection and state semantics of the primitives (ACCESSIBILITY §2)', () => {
  it('SegmentedControl is a radiogroup of radios; the selected one has a state and, with two options, a check glyph', async () => {
    await renderWithTheme(
      <SegmentedControl
        accessibilityLabel="Toss decision"
        value="bowl"
        onChange={noop}
        options={[
          { value: 'bat', label: 'Bat' },
          { value: 'bowl', label: 'Bowl' },
        ]}
      />,
    );
    const groups = (screen.root as unknown as Node).queryAll((n) => isHost(n) && n.props.accessibilityRole === 'radiogroup');
    expect(groups).toHaveLength(1);
    expect(labelOf(groups[0])).toBe('Toss decision');
    const radios = screen.getAllByRole('radio') as unknown as Node[];
    expect(radios).toHaveLength(2);
    const selected = radios.map((r) => Boolean(stateOf(r).selected ?? stateOf(r).checked));
    expect(selected).toEqual([false, true]);
    const checks = radios.map((r) => r.queryAll((n) => n.props.testID === 'lucide-check').length);
    expect(checks[1]).toBeGreaterThan(0);
    expect(checks[0]).toBe(0);
  });

  it('Tabs are a tablist of tabs with a selected state and their position ("1 of 3")', async () => {
    await renderWithTheme(
      <Tabs
        accessibilityLabel="Pools"
        selectedKey="a"
        onSelect={noop}
        tabs={[
          { key: 'a', label: 'Pool A' },
          { key: 'b', label: 'Pool B' },
          { key: 'c', label: 'Pool C' },
        ]}
      />,
    );
    const lists = (screen.root as unknown as Node).queryAll((n) => isHost(n) && n.props.accessibilityRole === 'tablist');
    expect(lists).toHaveLength(1);
    expect(labelOf(lists[0])).toBe('Pools');
    const tabs = screen.getAllByRole('tab') as unknown as Node[];
    expect(tabs.map((t) => Boolean(stateOf(t).selected))).toEqual([true, false, false]);
    const spoken = `${labelOf(tabs[0])} ${String(tabs[0].props.accessibilityHint ?? '')} ${JSON.stringify(tabs[0].props.accessibilityValue ?? '')}`;
    expect(spoken).toMatch(/1 of 3/);
  });

  it('Stepper is adjustable, speaks "label, value", adjusts through accessibility actions and stops at its bound', async () => {
    const onChange = jest.fn();
    const view = await renderWithTheme(<Stepper label="Overs" value={20} onChange={onChange} min={1} max={20} />);
    const stepper = screen.getByRole('adjustable') as unknown as Node;
    const spoken = `${labelOf(stepper)} ${JSON.stringify(stepper.props.accessibilityValue ?? '')}`;
    expect(spoken).toMatch(/Overs/);
    expect(spoken).toMatch(/20/);
    const actions = ((stepper.props.accessibilityActions ?? []) as { name: string }[]).map((a) => a.name);
    expect(actions).toEqual(expect.arrayContaining(['increment', 'decrement']));
    await fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(19);
    onChange.mockClear();
    await fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange.mock.calls.filter((c) => c[0] > 20)).toEqual([]);
    const buttons = (view.container as unknown as Node).queryAll((n) => isHost(n) && n.props.accessibilityRole === 'button');
    expect(buttons.some((b) => stateOf(b).disabled === true)).toBe(true);
  });

  it('Button disabled and loading expose state and ignore presses; the loading label stays', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <View>
        <Button label="Start match" onPress={onPress} disabled />
        <Button label="Confirm result" onPress={onPress} loading />
      </View>,
    );
    const disabled = screen.getByRole('button', { name: 'Start match' }) as unknown as Node;
    const loading = screen.getByRole('button', { name: 'Confirm result' }) as unknown as Node;
    expect(stateOf(disabled).disabled).toBe(true);
    expect(stateOf(loading).busy).toBe(true);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Start match' }));
    await user.press(screen.getByRole('button', { name: 'Confirm result' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByText('Confirm result')).toBeTruthy();
  });

  it('a switch row is one accessible switch with a checked state, named by the row title, toggled by a tap', async () => {
    const onValueChange = jest.fn();
    await renderWithTheme(<ListRow title="Vibration" trailing={{ kind: 'switch', value: true, onValueChange }} />);
    const row = screen.getByRole('switch') as unknown as Node;
    expect(labelOf(row) || textContent(row)).toMatch(/Vibration/);
    expect(stateOf(row).checked).toBe(true);
    await fireEvent.press(screen.getByRole('switch'));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('a TextField error is attached to the field label and carries an icon, not only a red border', async () => {
    const view = await renderWithTheme(<TextField label="Overs" value="0" numeric onChangeText={noop} error="Enter at least 1 over" />);
    const input = screen.getByDisplayValue('0') as unknown as Node;
    expect(labelOf(input)).toContain('Overs');
    expect(labelOf(input)).toContain('Enter at least 1 over');
    expect(screen.getByText('Enter at least 1 over', { includeHiddenElements: true })).toBeTruthy();
    const alerts = (view.container as unknown as Node).queryAll((n) => n.props.testID === 'lucide-circle-alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(flat(input).borderWidth ?? flat(input.parent as Node).borderWidth).toBe(2);
  });

  it('Toast is a live region: polite for info, assertive for errors', async () => {
    const view = await renderWithTheme(
      <View>
        <Toast toast={{ id: 'a', kind: 'info', message: 'Pools drawn', action: null }} onDismiss={noop} />
        <Toast toast={{ id: 'b', kind: 'error', message: "Couldn't save this delivery.", action: null }} onDismiss={noop} />
      </View>,
    );
    const regions = (view.container as unknown as Node).queryAll((n) => isHost(n) && (n.props.accessibilityLiveRegion !== undefined || n.props['aria-live'] !== undefined));
    const politeness = regions.map((n) => String(n.props.accessibilityLiveRegion ?? n.props['aria-live']));
    expect(politeness).toEqual(expect.arrayContaining(['polite', 'assertive']));
    const errorRegion = regions.find((n) => textContent(n).includes("Couldn't save"));
    expect(String(errorRegion?.props.accessibilityLiveRegion ?? errorRegion?.props['aria-live'])).toBe('assertive');
  });

  it('a destructive Dialog puts Cancel before (left of) the destructive confirm', async () => {
    await renderWithTheme(
      <Dialog visible destructive title="Discard match?" message="This cannot be undone." confirm={{ label: 'Discard', onPress: noop }} cancel={{ label: 'Cancel', onPress: noop }} />,
    );
    const labels = (screen.getAllByRole('button') as unknown as Node[]).map((b) => labelOf(b) || textContent(b));
    expect(labels.indexOf('Cancel')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('Cancel')).toBeLessThan(labels.findIndex((l) => /discard/i.test(l)));
  });

  it('a Sheet is modal to assistive tech and has a labelled close button', async () => {
    const onClose = jest.fn();
    const view = await renderWithTheme(
      <Sheet visible title="Choose bowler" onClose={onClose}>
        <RNText>Body</RNText>
      </Sheet>,
    );
    const modal = (view.container as unknown as Node).queryAll((n) => isHost(n) && n.props.accessibilityViewIsModal === true);
    expect(modal.length).toBeGreaterThan(0);
    const close = screen.getByRole('button', { name: /close/i });
    await fireEvent.press(close);
    expect(onClose).toHaveBeenCalled();
  });

  it('every Badge carries text, and status badges carry their documented glyph (§6.18)', async () => {
    const cases: readonly (readonly [Parameters<typeof Badge>[0]['tone'], string, string | null])[] = [
      ['qualified', 'Qualified', 'lucide-check'],
      ['eliminated', 'Eliminated', 'lucide-x'],
      ['override', 'Manual Override', 'lucide-pencil-line'],
      ['repair', 'Needs repair', 'lucide-circle-alert'],
      ['paused', 'Paused', 'lucide-pause'],
      ['live', 'Live', null],
      ['provisional', 'Provisional', null],
    ];
    for (const [tone, label, icon] of cases) {
      const view = await renderWithTheme(<Badge tone={tone} label={label} testID="badge" />);
      const badge = screen.getByTestId('badge', { includeHiddenElements: true }) as unknown as Node;
      expect(textContent(badge)).toContain(label);
      if (icon) {
        expect({ tone, icon: badge.queryAll((n) => n.props.testID === icon).length > 0 }).toEqual({ tone, icon: true });
      }
      expect(animatedNodes(badge)).toEqual([]);
      await view.unmount();
    }
  });

  it('TabBar has the four documented tabs in order, as tabs with a selected state and sentence-case captions', async () => {
    expect(TAB_ITEMS.map((t) => t.label)).toEqual(['Home', 'Tournaments', 'History', 'Settings']);
    await renderWithTheme(<TabBar items={TAB_ITEMS.map((t, i) => ({ key: t.route, label: t.label, icon: t.icon, selected: i === 1, onPress: noop }))} />);
    const tabs = screen.getAllByRole('tab') as unknown as Node[];
    expect(tabs.map((t) => labelOf(t) || textContent(t))).toEqual(['Home', 'Tournaments', 'History', 'Settings']);
    expect(tabs.map((t) => Boolean(stateOf(t).selected))).toEqual([false, true, false, false]);
    const captions = screen.getAllByText(/^(Home|Tournaments|History|Settings)$/) as unknown as Node[];
    for (const caption of captions) {
      expect(flat(caption).textTransform ?? 'none').not.toBe('uppercase');
      expect(Number(flat(caption).fontSize)).toBe(12);
    }
  });

  it('the striker line shows a marker glyph (not only a tint) and hides that glyph from the reader', async () => {
    const view = await renderWithTheme(
      <StatLine kind="batter" name="Ali Khan" figure="42" secondary="(24)" active accessibilityLabel="On strike: Ali Khan, 42 runs from 24 balls" markerTestID="marker" />,
    );
    expect(screen.queryByTestId('marker')).toBeNull();
    expect(screen.getByTestId('marker', { includeHiddenElements: true })).toBeTruthy();
    const line = (view.container as unknown as Node).queryAll((n) => isHost(n) && labelOf(n) === 'On strike: Ali Khan, 42 runs from 24 balls');
    expect(line.length).toBe(1);
  });

  it('ErrorState never puts the raw technical detail on screen (§86; detail lives in Diagnostics only)', async () => {
    const raw = 'SQLITE_CORRUPT: database disk image is malformed (code 11)';
    await renderWithTheme(<ErrorState title="Couldn't open your scorebook data" onRetry={noop} details={raw} />);
    expect(screen.queryByText(new RegExp('SQLITE_CORRUPT'))).toBeNull();
    const buttons = screen.getAllByRole('button') as unknown as Node[];
    for (const button of buttons) {
      if (/try again|retry/i.test(labelOf(button) || textContent(button))) {
        continue;
      }
      await fireEvent.press(button as never);
    }
    expect(screen.queryByText(new RegExp('SQLITE_CORRUPT'), { includeHiddenElements: true })).toBeNull();
  });

  it('EmptyState uses a restrained icon (≤ 32) and no illustration', async () => {
    const view = await renderWithTheme(<EmptyState title="No matches yet" body="Start a match." icon="history" action={{ label: 'New match', onPress: noop }} />);
    const icons = (view.container as unknown as Node).queryAll((n) => isHost(n) && /^lucide-/.test(String(n.props.testID ?? '')));
    expect(icons.length).toBe(1);
    expect(Number(flat(icons[0]).width)).toBeLessThanOrEqual(32);
    const images = (view.container as unknown as Node).queryAll((n) => isHost(n) && /Image/i.test(String(n.type)));
    expect(images).toEqual([]);
  });
});

const TYPE_SCALE: readonly (readonly [TextVariant, 'barlow' | 'inter', 400 | 500 | 600 | 700, number, number, number, boolean, boolean])[] = [
  ['scoreHero', 'barlow', 600, 64, 64, 1.0, true, false],
  ['scoreLarge', 'barlow', 600, 40, 44, 1.0, true, false],
  ['scoreMedium', 'barlow', 600, 28, 32, 1.3, true, false],
  ['scoreKey', 'barlow', 600, 32, 36, 1.2, true, false],
  ['figure', 'barlow', 500, 22, 26, 1.3, true, false],
  ['figureSmall', 'barlow', 500, 17, 20, 1.3, true, false],
  ['title1', 'inter', 700, 28, 34, 1.6, false, false],
  ['title2', 'inter', 600, 22, 28, 1.6, false, false],
  ['headline', 'inter', 600, 17, 24, 1.6, false, false],
  ['body', 'inter', 400, 16, 24, 2.0, false, false],
  ['bodyStrong', 'inter', 600, 16, 24, 2.0, false, false],
  ['callout', 'inter', 400, 15, 22, 2.0, false, false],
  ['subhead', 'inter', 500, 14, 20, 2.0, false, false],
  ['footnote', 'inter', 400, 13, 18, 2.0, false, false],
  ['label', 'inter', 600, 12, 16, 1.5, false, true],
  ['tableNumeric', 'inter', 500, 15, 20, 1.5, true, false],
  ['keyLabel', 'inter', 700, 15, 18, 1.2, false, true],
];

const WEIGHT_NAME: Readonly<Record<number, RegExp>> = {
  400: /_400Regular$/,
  500: /_500Medium$/,
  600: /_600SemiBold$/,
  700: /_700Bold$/,
};

describe('typography honours dynamic type with sane caps (§78, RESPONSIVE §5, DESIGN_SYSTEM §2)', () => {
  it.each(TYPE_SCALE)('%s: %s %d, %d/%d, font-scale cap %d, tabular %s, uppercase %s', async (variant, family, weight, size, lineHeight, cap, tabular, upper) => {
    await renderWithTheme(<Text variant={variant}>Sample 142</Text>);
    const node = screen.getByText('Sample 142') as unknown as Node;
    const s = flat(node);
    expect(node.props.allowFontScaling).not.toBe(false);
    expect(node.props.maxFontSizeMultiplier).toBe(cap);
    expect(s.fontSize).toBe(size);
    expect(s.lineHeight).toBe(lineHeight);
    expect(String(s.fontFamily)).toMatch(family === 'barlow' ? /^BarlowCondensed_/ : /^Inter_/);
    expect(String(s.fontFamily)).toMatch(WEIGHT_NAME[weight]);
    expect(s.fontStyle ?? 'normal').not.toBe('italic');
    const variants = (s.fontVariant ?? []) as readonly string[];
    expect(variants.includes('tabular-nums')).toBe(tabular);
    expect((s.textTransform ?? 'none') === 'uppercase').toBe(upper);
  });

  it('never lets a variant scale without a cap, above 2×, or below 12 pt', async () => {
    for (const [variant] of TYPE_SCALE) {
      const view = await renderWithTheme(<Text variant={variant}>cap probe</Text>);
      const node = screen.getByText('cap probe') as unknown as Node;
      const cap = node.props.maxFontSizeMultiplier;
      expect({ variant, capped: typeof cap === 'number' && cap >= 1 && cap <= 2 }).toEqual({ variant, capped: true });
      expect(Number(flat(node).fontSize)).toBeGreaterThanOrEqual(12);
      await view.unmount();
    }
  });

  it('bumps Inter 400 → 500 and 600 → 700 when the OS Bold Text setting is on (ACCESSIBILITY §7)', async () => {
    jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    try {
      await render(
        <ThemeProvider mode="light" reducedMotion="off">
          <Text variant="body">Regular copy</Text>
          <Text variant="headline">Semibold copy</Text>
        </ThemeProvider>,
      );
      await waitFor(() => expect(String(flat(screen.getByText('Regular copy') as unknown as Node).fontFamily)).toBe('Inter_500Medium'));
      expect(String(flat(screen.getByText('Semibold copy') as unknown as Node).fontFamily)).toBe('Inter_700Bold');
    } finally {
      jest.restoreAllMocks();
    }
  });
});

function MotionProbe() {
  const reduced = useReducedMotion();
  const theme = useTheme();
  return <RNText testID="motion">{`${reduced ? 'reduced' : 'full'}|${theme.motion.reduced ? 'reduced' : 'full'}`}</RNText>;
}

describe('reduced motion (§75, ACCESSIBILITY §10, AC-E11-07)', () => {
  type Listener = (value: boolean) => void;
  let listeners: Map<string, Listener>;

  beforeEach(() => {
    listeners = new Map();
    jest.mocked(useColorScheme).mockReturnValue('light');
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: Listener) => {
      listeners.set(event, handler);
      return { remove: jest.fn() };
    }) as unknown as typeof AccessibilityInfo.addEventListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([
    ['on', false, 'reduced'],
    ['on', true, 'reduced'],
    ['off', true, 'full'],
    ['off', false, 'full'],
  ] as const)('preference %s with OS reduce-motion %s resolves to %s', async (preference, os, expected) => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(os);
    await render(
      <ThemeProvider mode="light" reducedMotion={preference as ReducedMotionPreference}>
        <MotionProbe />
      </ThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('motion')).toHaveTextContent(`${expected}|${expected}`);
  });

  it('follows the OS under "system", including a live reduceMotionChanged event', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(
      <ThemeProvider mode="light" reducedMotion="system">
        <MotionProbe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('motion')).toHaveTextContent('reduced|reduced'));
    const listener = listeners.get('reduceMotionChanged');
    expect(listener).toBeDefined();
    await act(async () => {
      listener?.(false);
    });
    expect(screen.getByTestId('motion')).toHaveTextContent('full|full');
  });

  it('turns native stack transitions off under reduced motion', () => {
    expect(stackScreenOptions(createTheme('light', { highContrast: false, reducedMotion: true, boldText: false })).animation).toBe('none');
    expect(stackScreenOptions(createTheme('light', { highContrast: false, reducedMotion: false, boldText: false })).animation).not.toBe('none');
  });

  it('animates boundary chips in with scale when motion is allowed (control for the next test)', async () => {
    jest.useFakeTimers();
    const view = await renderWithTheme(<BallChip kind="six" text="6" accessibilityLabel="Six runs" animateIn testID="six" />, { reducedMotion: 'off' });
    const nodes = animatedNodes(view.container as unknown as Node);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((n) => !transformIsIdentity(getAnimatedStyle(n) as Record<string, unknown>))).toBe(true);
  });

  it.each(['four', 'six', 'wicket', 'runs'] as const)('shows a %s chip instantly, with no scale and no ring, under reduced motion', async (kind) => {
    jest.useFakeTimers();
    const view = await renderWithTheme(<BallChip kind={kind} text={kind === 'wicket' ? 'W' : '4'} accessibilityLabel="x" animateIn testID="chip" />, { reducedMotion: 'on' });
    for (const n of animatedNodes(view.container as unknown as Node)) {
      const style = getAnimatedStyle(n) as Record<string, unknown>;
      expect(transformIsIdentity(style)).toBe(true);
      expect(style.opacity ?? 1).toBe(1);
    }
    const rings = (view.container as unknown as Node).queryAll((n) => isHost(n) && flat(n).position === 'absolute' && flat(n).borderWidth === 2);
    expect(rings).toEqual([]);
  });

  it.each([
    [
      'Sheet',
      () => (
        <Sheet visible title="Extras" onClose={noop}>
          <RNText>Body</RNText>
        </Sheet>
      ),
    ],
    ['Dialog', () => <Dialog visible title="Discard match?" confirm={{ label: 'Discard', onPress: noop }} cancel={{ label: 'Cancel', onPress: noop }} />],
    ['Toast', () => <Toast toast={{ id: 't', kind: 'info', message: 'Saved', action: null }} onDismiss={noop} />],
    ['OverStrip', () => <OverStrip balls={[{ text: '4', kind: 'four', isFreeHit: false, accessibilityLabel: 'Four runs' }]} remaining={5} animateLatest />],
    ['ScoreFigure', () => <ScoreFigure value="142/4" accessibilityLabel="142 for 4" flashAccent />],
  ])('%s never translates or scales, and settles opacity within 120 ms, under reduced motion', async (_name, make) => {
    jest.useFakeTimers();
    const view = await renderWithTheme(make(), { reducedMotion: 'on' });
    const root = view.container as unknown as Node;
    for (const ms of [0, 16, 60]) {
      for (const n of animatedNodes(root)) {
        expect(transformIsIdentity(getAnimatedStyle(n) as Record<string, unknown>)).toBe(true);
      }
      await advance(ms);
    }
    await advance(130);
    for (const n of animatedNodes(root)) {
      const style = getAnimatedStyle(n) as Record<string, unknown>;
      expect(transformIsIdentity(style)).toBe(true);
      const opacity = typeof style.opacity === 'number' ? style.opacity : 1;
      expect([0, 1]).toContain(Math.round(opacity * 1000) / 1000);
    }
  });

  it('swaps score digits instantly under reduced motion: no outgoing digit remains in the tree', async () => {
    jest.useFakeTimers();
    const view = await renderWithTheme(<ScoreFigure value="142/4" accessibilityLabel="142 for 4" testID="score" />, { reducedMotion: 'on' });
    await view.rerender(<ScoreFigure value="146/4" accessibilityLabel="146 for 4" testID="score" />);
    const figure = screen.getByTestId('score', { includeHiddenElements: true }) as unknown as Node;
    expect(textContent(figure)).toBe('146/4');
    expect(labelOf(figure) || labelOf(figure.parent as Node)).toContain('146 for 4');
  });

  it('keeps the skeleton static under reduced motion but pulses it otherwise; it appears only after 300 ms', async () => {
    jest.useFakeTimers();
    const reducedView = await renderWithTheme(<Skeleton rows={2} testID="sk" />, { reducedMotion: 'on' });
    const blocks = () =>
      (reducedView.container as unknown as Node).queryAll(
        (n) => isHost(n) && String(flat(n).backgroundColor ?? '').toUpperCase() === lightColors.surfaceSunken.toUpperCase(),
      );
    expect(blocks()).toEqual([]);
    await advance(310);
    expect(blocks().length).toBeGreaterThan(0);
    const loading = screen.getByLabelText('Loading') as unknown as Node;
    expect(stateOf(loading).busy).toBe(true);
    for (const step of [0, 300, 600]) {
      await advance(step);
      for (const n of animatedNodes(reducedView.container as unknown as Node)) {
        const o = (getAnimatedStyle(n) as Record<string, unknown>).opacity;
        expect(typeof o === 'number' ? o : 1).toBe(1);
      }
    }
    await reducedView.unmount();
    const fullView = await renderWithTheme(<Skeleton rows={2} testID="sk" />, { reducedMotion: 'off' });
    await advance(310);
    let dipped = false;
    for (let i = 0; i < 12; i += 1) {
      await advance(100);
      for (const n of animatedNodes(fullView.container as unknown as Node)) {
        const o = (getAnimatedStyle(n) as Record<string, unknown>).opacity;
        if (typeof o === 'number' && o < 0.9) {
          dipped = true;
        }
      }
    }
    expect(dipped).toBe(true);
  });
});

describe('source rules across src/ (G-06, G-07, DESIGN_SYSTEM §1 anti-patterns, §8)', () => {
  const COLOUR_PROPS = '(?:color|backgroundColor|border\\w*Color|tintColor|shadowColor|textShadowColor|placeholderTextColor|selectionColor|cursorColor|underlineColorAndroid|thumbColor|ios_backgroundColor|overlayColor|fill|stroke|stopColor|trackColor)';
  const NAMED = '(?:white|black|red|green|blue|gr[ae]y|yellow|orange|purple|pink|brown|cyan|magenta|silver|gold|navy|teal|maroon|olive|lime|aqua|fuchsia|indigo|violet|light(?:gr[ae]y)|dark(?:gr[ae]y))';
  const COLOUR_PATTERNS = [
    /['"`][^'"`\n]*#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b[^'"`\n]*['"`]/,
    /['"`][^'"`\n]*\b(?:rgba?|hsla?)\s*\(/,
    new RegExp(`\\b${COLOUR_PROPS}\\s*[:=]\\s*\\{?\\s*['"\`]${NAMED}['"\`]`, 'i'),
    new RegExp(`\\btrackColor\\b.*['"\`]${NAMED}['"\`]`, 'i'),
  ];

  it('finds no hex, rgb/hsl or named colour literal anywhere in src/ outside src/ui/theme (export print palette excepted, THEMES §5)', () => {
    const dirs = ['src/ui', 'src/app', 'src/features', 'src/stores', 'src/services', 'src/domain', 'src/db'];
    const files = dirs.flatMap(walk).filter((f) => !rel(f).startsWith('src/ui/theme/'));
    expect(files.length).toBeGreaterThan(40);
    expect(scan(files, COLOUR_PATTERNS)).toEqual([]);
  });

  it('the colour scan catches the literal shapes it is meant to catch', () => {
    const probe = (line: string) => COLOUR_PATTERNS.some((p) => p.test(line));
    expect(probe("borderColor: '#DDD9CE',")).toBe(true);
    expect(probe("border: '1px solid #000'")).toBe(true);
    expect(probe('const c = `rgba(${a},0,0,0.5)`;')).toBe(true);
    expect(probe('<ActivityIndicator color="white" />')).toBe(true);
    expect(probe("trackColor={{ false: 'grey' }}")).toBe(true);
    expect(probe('<Switch thumbColor={"black"} />')).toBe(true);
    expect(probe("backgroundColor: 'transparent'")).toBe(false);
    expect(probe("color: theme.color.accent")).toBe(false);
  });

  it('keeps src/ui free of domain/stores/services/db/features/app/export imports, including relative paths that escape src/ui', () => {
    const uiRoot = nodePath.join(REPO, 'src', 'ui');
    const offenders: string[] = [];
    for (const file of walk('src/ui')) {
      const text = fs.readFileSync(file, 'utf8');
      const specs = [...text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|jest\.mock\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of specs) {
        if (spec.startsWith('@/')) {
          if (!spec.startsWith('@/ui')) {
            offenders.push(`${rel(file)} -> ${spec}`);
          }
        } else if (spec.startsWith('.')) {
          const resolved = nodePath.resolve(nodePath.dirname(file), spec);
          if (!resolved.startsWith(uiRoot)) {
            offenders.push(`${rel(file)} -> ${spec}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps gradients, blur and glass inside the glass module and uses no text shadows, italics or ad-hoc shadows in src/ui (§1, §4.3, §106)', () => {
    const files = walk('src/ui').filter((f) => !rel(f).startsWith('src/ui/theme/'));
    const outsideGlass = files.filter((f) => !rel(f).startsWith('src/ui/glass/'));
    expect(files.length).toBeGreaterThan(outsideGlass.length);
    const material = scan(outsideGlass, [/LinearGradient|RadialGradient|expo-linear-gradient|BlurView|expo-blur|expo-glass-effect|GlassView|GlassContainer|backdropFilter/]);
    expect(material).toEqual([]);
    const hits = scan(files, [
      /\btextShadow\w*\s*:/,
      /\bshadow(?:Color|Opacity|Radius|Offset)\s*:/,
      /\belevation\s*:\s*\d/,
      /fontStyle\s*:\s*['"]italic['"]/,
      /\bboxShadow\b/,
    ]);
    expect(hits).toEqual([]);
  });

  it('never hard-codes a corner radius above 10 (content is never in rounded cards, §4.1)', () => {
    const files = walk('src/ui');
    const hits: string[] = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const m of line.matchAll(/\bborder\w*Radius\s*:\s*(\d+(?:\.\d+)?)\b/g)) {
            if (Number(m[1]) > 10) {
              hits.push(`${rel(file)}:${index + 1}: ${line.trim()}`);
            }
          }
        });
    }
    expect(hits).toEqual([]);
  });

  it('uses no spring (overshoot) animation anywhere, the liquid tab bar included, and loops only in loading placeholders (§8 rules, cleanup brief: no bounce)', () => {
    const files = walk('src/ui');
    const springs = scan(files, [/\bwithSpring\s*\(/, /\bAnimated\.spring\s*\(/]);
    expect(springs).toEqual([]);
    const loops = scan(files, [/\bwithRepeat\s*\(/, /\bAnimated\.loop\s*\(/]);
    const outsideLoading = loops.filter((hit) => !/src\/ui\/(primitives\/Skeleton|shell\/LoadingView)\.tsx/.test(hit));
    expect(outsideLoading).toEqual([]);
  });

  it('never sizes a UI icon above 32 (no giant icons, §5)', () => {
    const files = walk('src/ui');
    const hits: string[] = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const m of line.matchAll(/<(?:Icon|\w+Icon|\w+Glyph)\b[^>]*\bsize=\{(\d+)\}/g)) {
            if (Number(m[1]) > 32) {
              hits.push(`${rel(file)}:${index + 1}: ${line.trim()}`);
            }
          }
        });
    }
    expect(hits).toEqual([]);
  });
});

const TOKEN_ROWS: readonly { team: string; p: string; pts: string; nrr: string; mine: boolean; out: boolean }[] = [
  { team: 'Tigers', p: '3', pts: '6', nrr: '+1.234', mine: true, out: false },
  { team: 'Lions', p: '3', pts: '2', nrr: '-0.567', mine: false, out: true },
];

type StandingRow = (typeof TOKEN_ROWS)[number];

function AuditGallery() {
  return (
    <View>
      <ScreenHeader title="Scorebook" />
      <SectionHeader title="Standings" ruled action={{ label: 'Full table', onPress: noop }} />
      <BoundaryRule />
      <Button label="Start match" onPress={noop} />
      <Button label="Save & exit" variant="secondary" onPress={noop} />
      <Button label="See all" variant="tertiary" size="sm" onPress={noop} />
      <Button label="Discard" variant="destructive" onPress={noop} />
      <Button label="Delete" variant="destructiveConfirm" onPress={noop} />
      <Button label="Saving" loading onPress={noop} />
      <IconButton icon="undo-2" accessibilityLabel="Undo last ball" onPress={noop} />
      <IconButton icon="ellipsis" accessibilityLabel="More" tone="accent" onPress={noop} />
      <TextField label="Team name" value="" placeholder="e.g. Tigers" helper="Shown on the scorecard" onChangeText={noop} />
      <TextField label="Overs" value="0" numeric error="Enter at least 1 over" onChangeText={noop} />
      <Stepper label="Overs" value={20} onChange={noop} min={1} max={50} />
      <SegmentedControl
        accessibilityLabel="Theme"
        value="dark"
        onChange={noop}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'system', label: 'System' },
        ]}
      />
      <Tabs accessibilityLabel="Innings" selectedKey="1" onSelect={noop} tabs={[{ key: '1', label: '1st innings' }, { key: '2', label: '2nd innings' }]} />
      <ListRow title="Lions v Tigers" subtitle="12 Sep · T20" leading={{ monogram: 'LT' }} trailing={{ kind: 'value', text: 'Live', chevron: true }} onPress={noop} />
      <ListRow title="Vibration" trailing={{ kind: 'switch', value: false, onValueChange: noop }} />
      <ListRow title="Qualification" trailing={{ kind: 'badge', badge: { label: 'Qualified', tone: 'qualified' } }} />
      <Table
        columns={[
          { key: 'team', header: 'Team', kind: 'name', value: (r: StandingRow) => r.team },
          { key: 'p', header: 'P', kind: 'numeric', value: (r: StandingRow) => r.p },
          { key: 'pts', header: 'Pts', kind: 'numeric', value: (r: StandingRow) => r.pts },
          { key: 'nrr', header: 'NRR', kind: 'numeric', width: 64, value: (r: StandingRow) => r.nrr },
        ]}
        rows={TOKEN_ROWS}
        rowKey={(r) => r.team}
        rowAccessibilityLabel={(r, i) => `Position ${i + 1}, ${r.team}, points ${r.pts}`}
        emphasis={(r) => (r.mine ? { marker: 'striker' } : null)}
        muted={(r) => r.out}
      />
      {(['live', 'paused', 'outline', 'plain', 'qualified', 'contention', 'eliminated', 'provisional', 'override', 'repair'] as const).map((tone) => (
        <Badge key={tone} tone={tone} label={`Badge ${tone}`} />
      ))}
      {(['danger', 'warning', 'info'] as const).map((tone) => (
        <Banner key={tone} tone={tone} message={`Banner ${tone}`} action={{ label: 'Fix', onPress: noop }} />
      ))}
      <EmptyState title="No tournaments yet" body="Create a tournament and manage teams." icon="trophy" action={{ label: 'Create tournament', onPress: noop }} />
      <ErrorState title="Couldn't load this tournament" onRetry={noop} secondaryAction={{ label: 'Diagnostics', onPress: noop }} />
      <Toast toast={{ id: 'a', kind: 'success', message: 'Saved', action: { label: 'Undo', run: noop } }} onDismiss={noop} />
      <Toast toast={{ id: 'b', kind: 'error', message: "Couldn't save this delivery.", action: { label: 'Try again', run: noop } }} onDismiss={noop} />
      <ScoreFigure value="142/4" accessibilityLabel="142 for 4" />
      <ScoreFigure value="16.4" variant="large" tone="primary" accessibilityLabel="16.4 overs" />
      <OverStrip
        balls={CHIP_SAMPLES.map(([kind, text, label]) => ({ kind, text, accessibilityLabel: label, isFreeHit: kind === 'runs' }))}
        remaining={1}
        runs="19"
      />
      <StatLine kind="batter" name="Ali Khan" figure="42" secondary="(24)" active accessibilityLabel="On strike: Ali Khan" onPress={noop} />
      <StatLine kind="bowler" name="Hassan Ali" figure="3.4-0-28-2" detail="ECO 7.63" accessibilityLabel="Bowling: Hassan Ali" />
      <ResultLine text="Tigers won by 5 wickets" />
      <ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} />
      <TabBar items={TAB_ITEMS.map((t, i) => ({ key: t.route, label: t.label, icon: t.icon, selected: i === 0, onPress: noop }))} />
      <Sheet visible title="Choose bowler" subtitle="Over 18" onClose={noop} footer={<Button label="Confirm" onPress={noop} />}>
        <Text variant="body">Sheet body</Text>
      </Sheet>
      <Dialog visible destructive title="Discard match?" message="This match will be deleted." confirm={{ label: 'Discard', onPress: noop }} cancel={{ label: 'Cancel', onPress: noop }} />
    </View>
  );
}

const COLOUR_KEY = /(?:^color$|Color$)/;

function colourEntries(node: Node): { key: string; value: unknown }[] {
  const out: { key: string; value: unknown }[] = [];
  const style = flat(node) as Record<string, unknown>;
  for (const [key, value] of Object.entries(style)) {
    if (COLOUR_KEY.test(key)) {
      out.push({ key: `style.${key}`, value });
    }
  }
  for (const [key, value] of Object.entries(node.props)) {
    if (key === 'style' || key === 'children') {
      continue;
    }
    const fills = /^RNSVG(Path|Rect|Circle|Ellipse)$/.test(String(node.type));
    if (COLOUR_KEY.test(key) || (key === 'fill' && fills) || key === 'stroke') {
      out.push({ key, value });
    }
  }
  return out;
}

function toRgbKey(value: unknown): string | null {
  if (typeof value === 'string') {
    if (value === '' || value === 'transparent' || value === 'none' || value === 'currentColor') {
      return null;
    }
    const c = parse(value);
    return `${c.r},${c.g},${c.b},${Math.round(c.a * 100)}`;
  }
  if (typeof value === 'number') {
    const n = value >>> 0;
    return `${(n >>> 16) & 255},${(n >>> 8) & 255},${n & 255},${Math.round((((n >>> 24) & 255) / 255) * 100)}`;
  }
  if (value && typeof value === 'object' && 'payload' in (value as Record<string, unknown>)) {
    return toRgbKey((value as Record<string, unknown>).payload);
  }
  return null;
}

function nearestOpaqueBackground(node: Node, fallback: string): string {
  let cursor: Node | null = node.parent;
  while (cursor) {
    if (isHost(cursor)) {
      const bg = flat(cursor).backgroundColor;
      if (typeof bg === 'string' && bg !== 'transparent' && parse(bg).a === 1) {
        return bg;
      }
    }
    cursor = cursor.parent;
  }
  return fallback;
}

function inkOf(node: Node): string | null {
  let cursor: Node | null = node;
  while (cursor) {
    if (isHost(cursor) && String(cursor.type) === 'Text') {
      const color = flat(cursor).color;
      if (typeof color === 'string') {
        return color;
      }
    }
    cursor = cursor.parent;
  }
  return null;
}

function insideDisabled(node: Node): boolean {
  let cursor: Node | null = node;
  while (cursor) {
    if (stateOf(cursor).disabled === true) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

describe('rendered-tree audits of a full gallery, both themes (§71, §72, §78, §1)', () => {
  it.each(['light', 'dark'] as const)('every colour rendered in %s is a token of that palette (no ad-hoc tints, alpha suffixes or stray blacks)', async (mode) => {
    const palette = mode === 'light' ? lightColors : darkColors;
    const glass = mode === 'light' ? lightGlass : darkGlass;
    const allowed = new Set([...Object.values(palette), ...glassColours(glass)].map((v) => toRgbKey(v)));
    const view = await renderWithTheme(<AuditGallery />, { mode });
    const stray: string[] = [];
    for (const n of (view.container as unknown as Node).queryAll(isHost)) {
      for (const { key, value } of colourEntries(n)) {
        if (key === 'style.shadowColor') {
          continue;
        }
        const rgb = toRgbKey(value);
        if (rgb !== null && !allowed.has(rgb)) {
          stray.push(`${String(n.type)} ${String(n.props.testID ?? labelOf(n))} ${key}=${JSON.stringify(value)}`);
        }
      }
    }
    expect(stray).toEqual([]);
  });

  it.each(['light', 'dark'] as const)('on iOS 26 every %s glass tint handed to GlassView is a glass token, and nothing else is ad hoc (§106)', async (mode) => {
    setLiquidGlassAvailable(true);
    try {
      const palette = mode === 'light' ? lightColors : darkColors;
      const glass = mode === 'light' ? lightGlass : darkGlass;
      const allowed = new Set([...Object.values(palette), ...glassColours(glass)].map((v) => toRgbKey(v)));
      const view = await renderWithTheme(<AuditGallery />, { mode });
      const natives = (view.container as unknown as Node).queryAll((n) => String(n.type) === 'ViewManagerAdapter_ExpoGlassEffect');
      expect(natives.length).toBeGreaterThan(3);
      expect(natives.every((n) => n.props.colorScheme === mode)).toBe(true);
      const stray: string[] = [];
      for (const n of (view.container as unknown as Node).queryAll(isHost)) {
        for (const { key, value } of colourEntries(n)) {
          const rgb = key === 'style.shadowColor' ? null : toRgbKey(value);
          if (rgb !== null && !allowed.has(rgb)) {
            stray.push(`${String(n.type)} ${key}=${JSON.stringify(value)}`);
          }
        }
      }
      expect(stray).toEqual([]);
      expect((view.container as unknown as Node).queryAll((n) => String(n.type) === 'ViewManagerAdapter_ExpoBlur')).toHaveLength(0);
    } finally {
      setLiquidGlassAvailable(false);
    }
  });

  it.each(['light', 'dark'] as const)('every visible text in %s has an explicit ink with ≥ 4.5:1 (≥ 3:1 large) against what it sits on', async (mode) => {
    const palette = mode === 'light' ? lightColors : darkColors;
    const view = await renderWithTheme(<AuditGallery />, { mode });
    const failures: string[] = [];
    const texts = (view.container as unknown as Node).queryAll((n) => isHost(n) && String(n.type) === 'Text' && textContent(n).trim().length > 0);
    expect(texts.length).toBeGreaterThan(60);
    for (const t of texts) {
      if (insideDisabled(t)) {
        continue;
      }
      const ink = inkOf(t);
      if (!ink) {
        failures.push(`"${textContent(t)}" has no colour (falls back to platform black)`);
        continue;
      }
      const ground = nearestOpaqueBackground(t, palette.background);
      const s = flat(t);
      const size = Number(s.fontSize ?? 14);
      const bold = /_700Bold$/.test(String(s.fontFamily ?? ''));
      const needed = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      const ratio = wcag(ink, ground);
      if (ratio < needed) {
        failures.push(`"${textContent(t)}" ${ink} on ${ground}: ${ratio.toFixed(2)} < ${needed}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('draws no shadow or Android elevation anywhere in dark (elevation is tone only, THEMES §2.2)', async () => {
    const view = await renderWithTheme(<AuditGallery />, { mode: 'dark' });
    const shadows = (view.container as unknown as Node)
      .queryAll((n) => isHost(n) && (Number(flat(n).shadowOpacity ?? 0) > 0 || Number(flat(n).elevation ?? 0) > 0))
      .map((n) => `${String(n.type)} ${String(n.props.testID ?? '')}`);
    expect(shadows).toEqual([]);
  });

  it('puts the soft glass lift only on floating glass in light (tab bar, scrolled header, dialog, toasts), never on content (§4.3, §106)', async () => {
    const view = await renderWithTheme(<AuditGallery />, { mode: 'light' });
    const shadowed = (view.container as unknown as Node).queryAll((n) => isHost(n) && Number(flat(n).shadowOpacity ?? 0) > 0);
    expect(shadowed.length).toBeGreaterThan(0);
    for (const n of shadowed) {
      expect(Number(flat(n).shadowOpacity)).toBeLessThanOrEqual(0.1);
      expect(flat(n).shadowColor).toBe(lightGlass.shadow.shadowColor);
      expect(insideGlass(n)).toBe(true);
      expect(flat(n).backgroundColor === undefined || flat(n).backgroundColor === 'transparent').toBe(true);
    }
    expect(shadowed.length).toBeLessThanOrEqual(5);
  });

  it('caps and honours font scaling on every rendered text node, never below 12 pt, never italic, only bundled faces', async () => {
    const view = await renderWithTheme(<AuditGallery />);
    const bundled = /^(Inter_(400Regular|500Medium|600SemiBold|700Bold)|BarlowCondensed_(500Medium|600SemiBold|700Bold))$/;
    const problems: string[] = [];
    for (const t of (view.container as unknown as Node).queryAll((n) => isHost(n) && String(n.type) === 'Text')) {
      const s = flat(t);
      const cap = t.props.maxFontSizeMultiplier;
      const nested = t.parent !== null && String((t.parent as Node).type) === 'Text';
      if (!nested && (typeof cap !== 'number' || cap < 1 || cap > 2)) {
        problems.push(`"${textContent(t)}" cap=${String(cap)}`);
      }
      if (t.props.allowFontScaling === false) {
        problems.push(`"${textContent(t)}" disables font scaling`);
      }
      if (s.fontSize !== undefined && Number(s.fontSize) < 12) {
        problems.push(`"${textContent(t)}" ${String(s.fontSize)}pt`);
      }
      if (s.fontStyle === 'italic') {
        problems.push(`"${textContent(t)}" italic`);
      }
      if (s.fontFamily !== undefined && !bundled.test(String(s.fontFamily))) {
        problems.push(`"${textContent(t)}" family ${String(s.fontFamily)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('rounds content nothing beyond 10 pt unless it is a true circle; only glass chrome uses the glass radii, so there are no rounded cards', async () => {
    const view = await renderWithTheme(<AuditGallery />);
    const glassRadii = new Set<number>(Object.values(glassRadius));
    const offenders = (view.container as unknown as Node)
      .queryAll((n) => isHost(n) && Number(flat(n).borderRadius ?? 0) > 10)
      .filter((n) => {
        const s = flat(n);
        if (glassRadii.has(Number(s.borderRadius)) && insideGlass(n)) {
          return false;
        }
        return !(typeof s.height === 'number' && Number(s.borderRadius) * 2 >= s.height && (s.width === s.height || s.width === undefined));
      })
      .map((n) => `${String(n.type)} r=${String(flat(n).borderRadius)} h=${String(flat(n).height)} w=${String(flat(n).width)}`);
    expect(offenders).toEqual([]);
  });
});

function focusRingVisible(root: Node): boolean {
  const ring = darkColors.focusRing.toUpperCase();
  const nodes = [root, ...root.queryAll(isHost)];
  let cursor: Node | null = root.parent;
  while (cursor) {
    nodes.push(cursor);
    cursor = cursor.parent;
  }
  return nodes.some((n) => {
    const s = flat(n) as Record<string, unknown>;
    const colours = ['borderColor', 'outlineColor', 'borderTopColor'].map((k) => String(s[k] ?? '').toUpperCase());
    const width = Math.max(Number(s.borderWidth ?? 0), Number(s.outlineWidth ?? 0));
    return colours.includes(ring) && width >= 2;
  });
}

describe('focus-visible ring for keyboards and switch access (DESIGN_SYSTEM §4.2 border.focus, ACCESSIBILITY §13)', () => {
  it.each([
    ['Button', () => <Button label="Start match" onPress={noop} />, 'Start match'],
    ['IconButton', () => <IconButton icon="undo-2" accessibilityLabel="Undo last ball" onPress={noop} />, 'Undo last ball'],
    ['run ScoreKey', () => <ScoreKey kind="runs" label="1" accessibilityLabel="One run" onPress={noop} />, 'One run'],
    ['wicket ScoreKey', () => <ScoreKey kind="wicket" label="WICKET" accessibilityLabel="Wicket" onPress={noop} />, 'Wicket'],
    ['ListRow', () => <ListRow title="Teams" trailing={{ kind: 'chevron' }} onPress={noop} />, 'Teams'],
  ] as const)('%s shows a 2 pt focusRing outline when focused', async (_name, make, name) => {
    await renderWithTheme(make(), { mode: 'dark' });
    const control = screen.getByRole('button', { name: new RegExp(name) }) as unknown as Node;
    expect(focusRingVisible(control)).toBe(false);
    await fireEvent(screen.getByRole('button', { name: new RegExp(name) }), 'focus');
    expect(focusRingVisible(screen.getByRole('button', { name: new RegExp(name) }) as unknown as Node)).toBe(true);
  });

  it.each([
    [
      'Tabs tab',
      () => <Tabs accessibilityLabel="Pools" selectedKey="a" onSelect={noop} tabs={[{ key: 'a', label: 'Pool A' }, { key: 'b', label: 'Pool B' }]} />,
      'tab',
      'Pool B',
    ],
    [
      'SegmentedControl option',
      () => (
        <SegmentedControl
          accessibilityLabel="Theme"
          value="light"
          onChange={noop}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      ),
      'radio',
      'Dark',
    ],
    ['TabBar item', () => <TabBar items={TAB_ITEMS.map((t, i) => ({ key: t.route, label: t.label, icon: t.icon, selected: i === 0, onPress: noop }))} />, 'tab', 'History'],
    ['batter StatLine', () => <StatLine kind="batter" name="Ali" figure="42" accessibilityLabel="On strike: Ali" onPress={noop} />, 'button', 'On strike: Ali'],
    ['ball-log BallChip', () => <BallChip kind="four" text="4" size="md" accessibilityLabel="Over 17 ball 2: Four runs" onPress={noop} />, 'button', 'Over 17 ball 2: Four runs'],
    [
      'tappable Table row',
      () => (
        <Table
          columns={[{ key: 'team', header: 'Team', kind: 'name', value: (r: StandingRow) => r.team }]}
          rows={TOKEN_ROWS}
          rowKey={(r) => r.team}
          rowAccessibilityLabel={(r) => r.team}
          onRowPress={noop}
        />
      ),
      'button',
      'Lions',
    ],
  ] as const)('%s shows a 2 pt focusRing outline when focused', async (_name, make, role, name) => {
    await renderWithTheme(make(), { mode: 'dark' });
    expect(focusRingVisible(screen.getByRole(role, { name }) as unknown as Node)).toBe(false);
    await fireEvent(screen.getByRole(role, { name }), 'focus');
    expect(focusRingVisible(screen.getByRole(role, { name }) as unknown as Node)).toBe(true);
  });

  it('a TextField gains a 2 pt accent border on focus (no glow)', async () => {
    await renderWithTheme(<TextField label="Team name" value="Tigers" onChangeText={noop} />, { mode: 'dark' });
    await fireEvent(screen.getByDisplayValue('Tigers'), 'focus');
    const input = screen.getByDisplayValue('Tigers') as unknown as Node;
    const nodes = [input];
    let cursor = input.parent;
    while (cursor) {
      nodes.push(cursor);
      cursor = cursor.parent;
    }
    const outlined = nodes.some((n) => String(flat(n).borderColor ?? '').toUpperCase() === darkColors.accent.toUpperCase() && Number(flat(n).borderWidth) === 2);
    expect(outlined).toBe(true);
    expect(nodes.some((n) => Number(flat(n).shadowOpacity ?? 0) > 0)).toBe(false);
  });
});

describe('E2E selector contract for design-system parts (E2E_TEST_PLAN §2 rule 5, §3.1, §3.4)', () => {
  it('puts score-btn-* ids on the pad pressables themselves, with human labels different from the ids', async () => {
    await renderWithTheme(<ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} testIDPrefix="score-btn" />);
    const ids = ['score-btn-0', 'score-btn-1', 'score-btn-2', 'score-btn-3', 'score-btn-4', 'score-btn-6', 'score-btn-extras', 'score-btn-wicket'];
    for (const id of ids) {
      const node = screen.getByTestId(id) as unknown as Node;
      expect({ id, role: node.props.accessibilityRole }).toEqual({ id, role: 'button' });
      expect(labelOf(node)).not.toBe(id);
      expect(labelOf(node)).toMatch(/^[A-Z]/);
    }
  });

  it('gives the tab bar items tab-home/tab-tournaments/tab-history/tab-settings on the tab elements', async () => {
    await renderWithTheme(<TabBar items={TAB_ITEMS.map((t, i) => ({ key: t.route, label: t.label, icon: t.icon, selected: i === 0, testID: t.testID, onPress: noop }))} />);
    for (const id of ['tab-home', 'tab-tournaments', 'tab-history', 'tab-settings']) {
      const node = screen.getByTestId(id) as unknown as Node;
      expect(node.props.accessibilityRole).toBe('tab');
      expect(labelOf(node)).not.toBe(id);
    }
  });

  it('renders the bootstrap failure as error-screen with a human error-text-message and a working error-btn-retry, never the raw detail', async () => {
    const onRetry = jest.fn();
    await renderWithTheme(
      <BootstrapGate status="error" error={{ message: "Couldn't open your scorebook data.", detail: 'SqliteError: file is not a database (code 26)' }} onRetry={onRetry}>
        <RNText>app</RNText>
      </BootstrapGate>,
    );
    expect(screen.getByTestId('error-screen', { includeHiddenElements: true })).toBeTruthy();
    const message = screen.getByTestId('error-text-message', { includeHiddenElements: true }) as unknown as Node;
    expect(textContent(message)).not.toMatch(/sqlite|code 26|error:/i);
    expect(textContent(message).length).toBeGreaterThan(10);
    const retry = screen.getByTestId('error-btn-retry') as unknown as Node;
    expect(retry.props.accessibilityRole).toBe('button');
    await fireEvent.press(screen.getByTestId('error-btn-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/SqliteError/)).toBeNull();
    expect(screen.queryByText('app')).toBeNull();
  });

  it('exposes toast, toast-text and toast-btn-action from the toast host', async () => {
    const run = jest.fn();
    await renderWithTheme(<ToastHost toasts={[{ id: 't1', kind: 'error', message: "Couldn't save this delivery.", action: { label: 'Try again', run } }]} onDismiss={noop} />);
    expect(screen.getByTestId('toast', { includeHiddenElements: true })).toBeTruthy();
    expect(textContent(screen.getByTestId('toast-text', { includeHiddenElements: true }) as unknown as Node)).toBe("Couldn't save this delivery.");
    const action = screen.getByTestId('toast-btn-action') as unknown as Node;
    expect(action.props.accessibilityRole).toBe('button');
    expect(labelOf(action) || textContent(action)).toMatch(/try again/i);
    await fireEvent.press(screen.getByTestId('toast-btn-action'));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('renders result-text exactly as the domain string on the text element', async () => {
    await renderWithTheme(<ResultLine text="Lions won by 21 runs (par score)" />, { reducedMotion: 'on' });
    const node = screen.getByTestId('result-text', { includeHiddenElements: true }) as unknown as Node;
    expect(String(node.type)).toBe('Text');
    expect(textContent(node)).toBe('Lions won by 21 runs (par score)');
  });
});

describe('documented numbers and boundaries (DESIGN_SYSTEM §3–§8, RESPONSIVE §2, §5)', () => {
  it('stacks dialog actions only when a label is longer than 18 characters or the font scale is above 1.3', () => {
    expect(STACK_LABEL_LENGTH).toBe(18);
    expect(STACK_FONT_SCALE).toBe(1.3);
    expect(shouldStackActions(['Cancel', 'x'.repeat(18)], 1)).toBe(false);
    expect(shouldStackActions(['Cancel', 'x'.repeat(19)], 1)).toBe(true);
    expect(shouldStackActions(['Cancel', 'Delete'], 1.3)).toBe(false);
    expect(shouldStackActions(['Cancel', 'Delete'], 1.31)).toBe(true);
  });

  it('dismisses a sheet on a swipe of more than 30 % of its height only', () => {
    expect(SWIPE_DISMISS_RATIO).toBe(0.3);
    expect(shouldDismissOnRelease(0.3 * 400, 400)).toBe(false);
    expect(shouldDismissOnRelease(0.3 * 400 + 1, 400)).toBe(true);
    expect(shouldDismissOnRelease(-200, 400)).toBe(false);
  });

  it('keeps info/success toasts 4 s, toasts with an action 6 s, and errors until dismissed', () => {
    expect(TOAST_DURATION_MS).toEqual({ plain: 4000, withAction: 6000 });
    expect(toastDurationMs({ kind: 'info', action: null })).toBe(4000);
    expect(toastDurationMs({ kind: 'success', action: null })).toBe(4000);
    expect(toastDurationMs({ kind: 'success', action: { label: 'Undo', run: noop } })).toBe(6000);
    expect(toastDurationMs({ kind: 'error', action: null })).toBeNull();
    expect(toastDurationMs({ kind: 'error', action: { label: 'Try again', run: noop } })).toBeNull();
  });

  it('auto-dismisses an info toast at 4 s, not earlier, and never auto-dismisses an error', async () => {
    jest.useFakeTimers();
    try {
      const onDismiss = jest.fn();
      const first = await renderWithTheme(<ToastHost toasts={[{ id: 'i', kind: 'info', message: 'Pools drawn', action: null }]} onDismiss={onDismiss} />);
      await advance(3900);
      expect(onDismiss).not.toHaveBeenCalled();
      await advance(200);
      expect(onDismiss).toHaveBeenCalledWith('i');
      await first.unmount();
      const onError = jest.fn();
      await renderWithTheme(<ToastHost toasts={[{ id: 'e', kind: 'error', message: "Couldn't save.", action: null }]} onDismiss={onError} />);
      await advance(60000);
      expect(onError).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses lucide stroke 2 at 16 and 1.75 at 20/24', () => {
    expect(strokeFor(16)).toBe(2);
    expect(strokeFor(20)).toBe(1.75);
    expect(strokeFor(24)).toBe(1.75);
  });

  it('computes hit slop that lifts any visible size to 44 and adds none to a 44 control', () => {
    expect(MIN_TOUCH).toBe(44);
    const sm = slopOf(hitSlopFor(36));
    expect(36 + sm.top + sm.bottom).toBeGreaterThanOrEqual(44);
    const chip = slopOf(hitSlopFor(20, 20));
    expect(20 + chip.top + chip.bottom).toBeGreaterThanOrEqual(44);
    expect(20 + chip.left + chip.right).toBeGreaterThanOrEqual(44);
    const full = slopOf(hitSlopFor(44));
    expect(full.top + full.bottom + full.left + full.right).toBe(0);
  });

  it('classifies window widths and heights exactly at the RESPONSIVE §2 breakpoints', () => {
    expect([319, 359, 360, 599, 600, 767, 768, 1180].map(widthClassFor)).toEqual(['compact-s', 'compact-s', 'compact', 'compact', 'medium', 'medium', 'expanded', 'expanded']);
    expect([568, 599, 600, 800, 801, 932].map(heightClassFor)).toEqual(['short', 'short', 'regular', 'regular', 'tall', 'tall']);
    expect(layoutClassFor(390, 844, 1.3).largeText).toBe(true);
    expect(layoutClassFor(390, 844, 1.29).largeText).toBe(false);
    expect(layoutClassFor(1180, 820).isLandscape).toBe(true);
  });

  it('sizes scoring keys 56 on short or very narrow phones, 64 regular, 72 tall, 80 in the tablet pane', () => {
    expect(scoringKeyHeight(320, 568)).toBe(56);
    expect(scoringKeyHeight(330, 700)).toBe(56);
    expect(scoringKeyHeight(360, 640)).toBe(64);
    expect(scoringKeyHeight(390, 844)).toBeGreaterThanOrEqual(72);
    expect(scoringKeyHeight(390, 844)).toBeLessThanOrEqual(80);
    expect(scoringKeyHeight(820, 1180, true)).toBe(80);
    expect(SCORE_KEY_MIN_HEIGHT).toBe(56);
  });

  it('keeps the documented motion, chip, table and chrome constants', () => {
    expect(SKELETON_DELAY_MS).toBe(300);
    expect(SKELETON_PULSE_MS).toBe(1200);
    expect(RESULT_DELAY_MS).toBe(120);
    expect(SIX_TINT_HOLD_MS).toBe(400);
    expect(ROLL_OFFSET).toBe(8);
    expect(FLASH_HOLD_MS).toBe(300);
    expect(REDUCED_FADE_MS).toBe(120);
    expect(REPEAT_DELAY_MS).toBe(400);
    expect(REPEAT_INTERVAL_MS).toBe(100);
    expect(TAB_BAR_HEIGHT).toBe(56);
    expect(CHIP_DIMENSIONS.lg).toMatchObject({ size: 32, font: 17, paddingX: 8 });
    expect(CHIP_DIMENSIONS.md).toMatchObject({ size: 24, font: 14 });
    expect(CHIP_DIMENSIONS.sm).toMatchObject({ size: 20, font: 12 });
    expect(COLUMN_WIDTH).toMatchObject({ digits2: 32, digits3: 40, decimal: 56, nrr: 64, name: 120 });
  });

  it('limits charts to two dedicated series tokens, never status or accent colours, with a 6/4 dash for series 2', () => {
    expect(MAX_SERIES).toBe(2);
    expect([...SERIES_TOKENS]).toEqual(['chartSeries1', 'chartSeries2']);
    expect([...SERIES_DASH_PATTERN]).toEqual([6, 4]);
  });
});

function StandingsTable({ onRowPress, empty = false }: { readonly onRowPress?: () => void; readonly empty?: boolean }) {
  return (
    <Table
      columns={[
        { key: 'team', header: 'Team', kind: 'name', value: (r: StandingRow) => r.team },
        { key: 'pts', header: 'Pts', kind: 'numeric', value: (r: StandingRow) => r.pts },
        { key: 'nrr', header: 'NRR', kind: 'numeric', width: 64, value: (r: StandingRow) => r.nrr },
      ]}
      rows={empty ? [] : TOKEN_ROWS}
      rowKey={(r) => r.team}
      rowAccessibilityLabel={(r, i) => `Position ${i + 1}, ${r.team}, points ${r.pts}, net run rate ${r.nrr}`}
      emphasis={(r) => (r.mine ? { marker: 'striker' } : null)}
      onRowPress={onRowPress}
      emptyText="No matches played yet"
    />
  );
}

describe('tables, charts, sheets and focus management (DESIGN_SYSTEM §6.5, §6.8, THEMES §4, ACCESSIBILITY §4, §8)', () => {
  it('exposes one accessible element per row with the full sentence, and hides header cells from the reader', async () => {
    await renderWithTheme(<StandingsTable />);
    expect(screen.getByLabelText('Position 1, Tigers, points 6, net run rate +1.234')).toBeTruthy();
    expect(screen.getByLabelText('Position 2, Lions, points 2, net run rate -0.567')).toBeTruthy();
    expect(screen.queryByText('Pts')).toBeNull();
    expect(screen.getByText('Pts', { includeHiddenElements: true })).toBeTruthy();
    const row = screen.getByLabelText('Position 1, Tigers, points 6, net run rate +1.234') as unknown as Node;
    expect(row.props.accessible).toBe(true);
    expect(row.queryAll((n) => n !== row && isHost(n) && n.props.accessible === true)).toEqual([]);
  });

  it('right-aligns tabular numeric cells and left-aligns names', async () => {
    await renderWithTheme(<StandingsTable />);
    const nrr = screen.getByText('+1.234', { includeHiddenElements: true }) as unknown as Node;
    const name = screen.getByText('Tigers', { includeHiddenElements: true }) as unknown as Node;
    expect(flat(nrr).textAlign).toBe('right');
    expect((flat(nrr).fontVariant ?? []) as readonly string[]).toContain('tabular-nums');
    expect(flat(name).textAlign ?? 'left').not.toBe('right');
  });

  it('marks the emphasised row with three cues: accentSubtle tint, a 3 pt accent bar and a marker glyph', async () => {
    await renderWithTheme(<StandingsTable />, { mode: 'dark' });
    const row = screen.getByLabelText('Position 1, Tigers, points 6, net run rate +1.234') as unknown as Node;
    const all = [row, ...row.queryAll(isHost)];
    expect(all.some((n) => String(flat(n).backgroundColor ?? '').toUpperCase() === darkColors.accentSubtle.toUpperCase())).toBe(true);
    expect(
      all.some(
        (n) =>
          (Number(flat(n).width) === 3 && String(flat(n).backgroundColor ?? '').toUpperCase() === darkColors.accent.toUpperCase()) ||
          (Number(flat(n).borderLeftWidth) === 3 && String(flat(n).borderLeftColor ?? '').toUpperCase() === darkColors.accent.toUpperCase()),
      ),
    ).toBe(true);
    const plain = screen.getByLabelText('Position 2, Lions, points 2, net run rate -0.567') as unknown as Node;
    const glyphsIn = (n: Node) =>
      n.queryAll(
        (c) =>
          isHost(c) &&
          (/svg|lucide/i.test(String(c.type) + String(c.props.testID ?? '')) ||
            textContent(c) === '▶' ||
            (c.props.accessibilityElementsHidden === true && c.children.length === 0 && Number(flat(c).borderLeftWidth ?? 0) > 0)),
      ).length;
    expect(glyphsIn(row)).toBeGreaterThan(glyphsIn(plain));
  });

  it('shows the empty row text in textMuted', async () => {
    await renderWithTheme(<StandingsTable empty />);
    const empty = screen.getByText('No matches played yet', { includeHiddenElements: true }) as unknown as Node;
    expect(String(flat(empty).color).toUpperCase()).toBe(lightColors.textMuted.toUpperCase());
  });

  it('makes a tappable table row ≥ 48 tall with a button role', async () => {
    await renderWithTheme(<StandingsTable onRowPress={noop} />);
    const row = screen.getByRole('button', { name: 'Position 1, Tigers, points 6, net run rate +1.234' }) as unknown as Node;
    expect(target(row).height).toBeGreaterThanOrEqual(48);
  });

  it('gives a chart a spoken summary, a legend that differs by dash not only colour, and a "Show as table" alternative', async () => {
    const series = [
      { label: 'Tigers', points: [{ over: 1, runs: 8, wickets: 0 }, { over: 2, runs: 15, wickets: 1 }] },
      { label: 'Lions', points: [{ over: 1, runs: 5, wickets: 0 }, { over: 2, runs: 17, wickets: 0 }] },
    ];
    const gifted = jest.requireMock<{ LineChart: jest.Mock }>('react-native-gifted-charts');
    gifted.LineChart.mockClear();
    const view = await renderWithTheme(<WormChart series={series} accessibilityLabel="Worm chart. Tigers 15 for 1, Lions 17 for 0." title="Worm" />);
    expect(screen.getByLabelText('Worm chart. Tigers 15 for 1, Lions 17 for 0.')).toBeTruthy();
    const measured = (view.container as unknown as Node).queryAll((n) => isHost(n) && typeof n.props.onLayout === 'function');
    for (const n of measured) {
      await fireEvent(n as never, 'layout', { nativeEvent: { layout: { width: 358, height: 200, x: 0, y: 0 } } });
    }
    expect(gifted.LineChart.mock.calls.length).toBeGreaterThan(0);
    const props = gifted.LineChart.mock.calls[gifted.LineChart.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(props.strokeDashArray2).toEqual([6, 4]);
    expect(props.strokeDashArray1 ?? null).toBeNull();
    expect(String(props.color1 ?? props.color).toUpperCase()).toBe(lightColors.chartSeries1.toUpperCase());
    expect(String(props.color2).toUpperCase()).toBe(lightColors.chartSeries2.toUpperCase());
    const swatchPieces = (label: string) => {
      const text = screen.getByText(label, { includeHiddenElements: true }) as unknown as Node;
      const item = text.parent as Node;
      return item.queryAll((n) => isHost(n) && String(flat(n).backgroundColor ?? '').startsWith('#')).length;
    };
    expect(swatchPieces('Lions')).toBeGreaterThan(swatchPieces('Tigers'));
    const toggles = (view.container as unknown as Node).queryAll(
      (n) => isHost(n) && ['button', 'switch', 'togglebutton'].includes(String(n.props.accessibilityRole)) && /table/i.test(labelOf(n) || textContent(n)),
    );
    expect(toggles.length).toBeGreaterThan(0);
    await fireEvent.press(toggles[0] as never);
    expect(screen.getAllByText('17', { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('never closes a blocking sheet from the scrim or a close button (§6.8)', async () => {
    const onClose = jest.fn();
    const view = await renderWithTheme(
      <Sheet visible blocking title="Next batter" onClose={onClose}>
        <RNText>Pick</RNText>
      </Sheet>,
    );
    const pressables = (view.container as unknown as Node).queryAll((n) => isHost(n) && typeof n.props.onClick === 'function');
    for (const p of pressables) {
      await fireEvent.press(p as never);
    }
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('closes a non-blocking sheet from the scrim (§6.8)', async () => {
    const onClose = jest.fn();
    const view = await renderWithTheme(
      <Sheet visible title="Extras" onClose={onClose}>
        <RNText>Pick</RNText>
      </Sheet>,
    );
    const scrims = (view.container as unknown as Node).queryAll((n) => isHost(n) && typeof n.props.onClick === 'function' && n.props.accessibilityRole !== 'button');
    expect(scrims.length).toBeGreaterThan(0);
    await fireEvent.press(scrims[0] as never);
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    [
      'Sheet',
      () => (
        <Sheet visible title="Choose bowler" onClose={noop}>
          <RNText>Body</RNText>
        </Sheet>
      ),
    ],
    ['Dialog', () => <Dialog visible destructive title="Discard match?" confirm={{ label: 'Discard', onPress: noop }} cancel={{ label: 'Cancel', onPress: noop }} />],
  ])('moves screen-reader focus into a %s when it opens (ACCESSIBILITY §4)', async (_name, make) => {
    jest.useFakeTimers();
    const legacy = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(noop);
    const modern = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(noop);
    try {
      await renderWithTheme(make());
      await advance(600);
      const focusEvents = modern.mock.calls.filter((c) => c[1] === 'focus').length + legacy.mock.calls.length;
      expect(focusEvents).toBeGreaterThan(0);
    } finally {
      legacy.mockRestore();
      modern.mockRestore();
      jest.useRealTimers();
    }
  });

  it('gives the section header a header role and an uppercase label, and the screen title a header role', async () => {
    await renderWithTheme(
      <View>
        <ScreenHeader title="Tournaments" />
        <SectionHeader title="Standings" />
      </View>,
    );
    const headers = (screen.root as unknown as Node).queryAll((n) => isHost(n) && n.props.accessibilityRole === 'header');
    const spoken = headers.map((h) => labelOf(h) || textContent(h));
    expect(spoken.some((s) => /Tournaments/.test(s))).toBe(true);
    expect(spoken.some((s) => /standings/i.test(s))).toBe(true);
    const section = screen.getByText(/standings/i, { includeHiddenElements: true }) as unknown as Node;
    expect(flat(section).textTransform === 'uppercase' || textContent(section) === 'STANDINGS').toBe(true);
  });

  it('never gives a danger banner a close button (§6.16) and keeps its text next to an icon', async () => {
    const view = await renderWithTheme(<Banner tone="danger" message="This match needs repair" action={{ label: 'Open ball log', onPress: noop }} />);
    const buttons = screen.getAllByRole('button').map((b) => labelOf(b as unknown as Node) || textContent(b as unknown as Node));
    expect(buttons).toEqual(['Open ball log']);
    const icons = (view.container as unknown as Node).queryAll((n) => /^lucide-/.test(String(n.props.testID ?? '')));
    expect(icons.length).toBeGreaterThan(0);
  });

  it('keeps a compact 40 pt batter row tappable at ≥ 44 through hit slop (RESPONSIVE §3 vs §72)', async () => {
    await renderWithTheme(<StatLine kind="batter" name="Ali" figure="42" compact active accessibilityLabel="On strike: Ali" onPress={noop} />);
    const row = screen.getByRole('button', { name: 'On strike: Ali' }) as unknown as Node;
    expect(target(row).height).toBeGreaterThanOrEqual(44);
  });

  it('exposes the score figure as one element with a spoken label and keeps its digits capped and tabular', async () => {
    const view = await renderWithTheme(<ScoreFigure value="142/4" accessibilityLabel="142 for 4" testID="score" />);
    const accessible = (view.container as unknown as Node).queryAll((n) => isHost(n) && n.props.accessible === true);
    expect(accessible.map(labelOf)).toEqual(['142 for 4']);
    const digits = (view.container as unknown as Node).queryAll((n) => isHost(n) && String(n.type) === 'Text');
    expect(digits.length).toBeGreaterThan(0);
    for (const d of digits) {
      const nested = d.parent !== null && String((d.parent as Node).type) === 'Text';
      if (!nested) {
        expect(d.props.maxFontSizeMultiplier).toBe(1);
      }
      expect((flat(d).fontVariant ?? []) as readonly string[]).toContain('tabular-nums');
    }
  });
});

function up(value: unknown): string {
  return String(value ?? '').toUpperCase();
}

function selfAndDescendants(node: Node): Node[] {
  return [node, ...node.queryAll((n) => n !== node && isHost(n))];
}

function hasFill(node: Node, colour: string): boolean {
  return selfAndDescendants(node).some((n) => up(flat(n).backgroundColor) === up(colour));
}

function inkFor(node: Node, text: string): string {
  const t = node.queryAll((n) => isHost(n) && String(n.type) === 'Text' && textContent(n) === text)[0];
  expect(t).toBeDefined();
  return up(inkOf(t));
}

describe('THEMES §3 component-to-token mapping, checked in dark where every token is distinct', () => {
  it.each([
    ['primary', darkColors.accent, darkColors.onAccent, null],
    ['secondary', darkColors.surface, darkColors.textPrimary, darkColors.borderStrong],
    ['tertiary', null, darkColors.accent, null],
    ['destructive', darkColors.surface, darkColors.danger, darkColors.danger],
    ['destructiveConfirm', darkColors.danger, darkColors.onDanger, null],
  ] as const)('a %s Button uses the documented fill, label and border tokens (§6.1)', async (variant, fill, label, border) => {
    await renderWithTheme(<Button label="Label" variant={variant} onPress={noop} />, { mode: 'dark' });
    const button = screen.getByRole('button', { name: 'Label' }) as unknown as Node;
    const s = flat(button);
    if (fill) {
      expect(up(s.backgroundColor)).toBe(up(fill));
    } else {
      expect(s.backgroundColor === undefined || s.backgroundColor === 'transparent').toBe(true);
    }
    expect(inkFor(button, 'Label')).toBe(up(label));
    if (border) {
      expect(Number(s.borderWidth)).toBe(1);
      expect(up(s.borderColor)).toBe(up(border));
    } else {
      expect(Number(s.borderWidth ?? 0) === 0 || s.borderColor === 'transparent').toBe(true);
    }
  });

  it('a disabled filled Button sits on a raised charcoal, never a near-black hole, with a textMuted label and no border (§6.1 states, §107)', async () => {
    await renderWithTheme(<Button label="Start match" disabled onPress={noop} />, { mode: 'dark' });
    const button = screen.getByRole('button', { name: 'Start match' }) as unknown as Node;
    expect(up(flat(button).backgroundColor)).toBe(up(darkColors.surfaceElevated));
    expect(up(flat(button).backgroundColor)).not.toBe(up(darkColors.surfaceSunken));
    expect(inkFor(button, 'Start match')).toBe(up(darkColors.textMuted));
    expect(Number(flat(button).borderWidth ?? 0) === 0 || flat(button).borderColor === 'transparent').toBe(true);
  });

  it('a disabled outlined Button keeps a quiet outline and a disabled text Button stays text, so neither looks more pressable than when enabled (§6.1)', async () => {
    await renderWithTheme(
      <View>
        <Button label="Skip" variant="secondary" disabled onPress={noop} />
        <Button label="Move down" variant="tertiary" size="sm" disabled onPress={noop} />
      </View>,
      { mode: 'dark' },
    );
    const outlined = screen.getByRole('button', { name: 'Skip' }) as unknown as Node;
    expect(flat(outlined).backgroundColor).toBe('transparent');
    expect(up(flat(outlined).borderColor)).toBe(up(darkColors.border));
    const text = screen.getByRole('button', { name: 'Move down' }) as unknown as Node;
    expect(flat(text).backgroundColor).toBe('transparent');
    expect(Number(flat(text).borderWidth ?? 0)).toBe(0);
    expect(inkFor(text, 'Move down')).toBe(up(darkColors.textMuted));
  });

  it.each([
    ['lg', 56],
    ['md', 48],
    ['sm', 44],
  ] as const)('a %s Button is %d tall and uses the 6 pt radius', async (size, height) => {
    await renderWithTheme(<Button label="Go" size={size} onPress={noop} />);
    const s = flat(screen.getByRole('button', { name: 'Go' }) as unknown as Node);
    expect(Math.max(Number(s.height ?? 0), Number(s.minHeight ?? 0))).toBe(height);
    expect(s.borderRadius).toBe(6);
  });

  it.each([
    ['qualified', darkColors.successSubtle, darkColors.success, 'lucide-check'],
    ['override', darkColors.warningSubtle, darkColors.warning, 'lucide-pencil-line'],
    ['repair', darkColors.dangerSubtle, darkColors.danger, 'lucide-circle-alert'],
    ['live', darkColors.accentSubtle, darkColors.accent, null],
    ['paused', darkColors.warningSubtle, darkColors.warning, 'lucide-pause'],
  ] as const)('a %s Badge is %s with %s text (§6.18, THEMES §3.6)', async (tone, bg, ink, icon) => {
    await renderWithTheme(<Badge tone={tone} label="Status" testID="badge" />, { mode: 'dark' });
    const badge = screen.getByTestId('badge', { includeHiddenElements: true }) as unknown as Node;
    expect(hasFill(badge, bg)).toBe(true);
    expect(inkFor(badge, 'Status')).toBe(up(ink));
    if (icon) {
      expect(badge.queryAll((n) => n.props.testID === icon).length).toBeGreaterThan(0);
    }
  });

  it('keeps badges 24 tall, radius 2, 12 pt 600 and sentence case (§6.18)', async () => {
    await renderWithTheme(<Badge tone="qualified" label="Qualified" testID="badge" />);
    const badge = screen.getByTestId('badge', { includeHiddenElements: true }) as unknown as Node;
    const box = selfAndDescendants(badge).find((n) => up(flat(n).backgroundColor) === up(lightColors.successSubtle)) as Node;
    expect(Math.max(Number(flat(box).height ?? 0), Number(flat(box).minHeight ?? 0))).toBe(24);
    expect(flat(box).borderRadius).toBe(2);
    const label = badge.queryAll((n) => isHost(n) && String(n.type) === 'Text' && textContent(n) === 'Qualified')[0];
    expect(flat(label).fontSize).toBe(12);
    expect(String(flat(label).fontFamily)).toMatch(/600SemiBold$/);
    expect(flat(label).textTransform ?? 'none').not.toBe('uppercase');
  });

  it('draws the provisional badge with a dashed borderStrong outline and the neutral badge with a solid one', async () => {
    await renderWithTheme(
      <View>
        <Badge tone="provisional" label="Provisional" testID="prov" />
        <Badge tone="contention" label="In contention" testID="cont" />
      </View>,
      { mode: 'dark' },
    );
    const prov = selfAndDescendants(screen.getByTestId('prov', { includeHiddenElements: true }) as unknown as Node);
    const cont = selfAndDescendants(screen.getByTestId('cont', { includeHiddenElements: true }) as unknown as Node);
    expect(prov.some((n) => flat(n).borderStyle === 'dashed' && up(flat(n).borderColor) === up(darkColors.borderStrong))).toBe(true);
    expect(cont.some((n) => flat(n).borderStyle !== 'dashed' && Number(flat(n).borderWidth) === 1 && up(flat(n).borderColor) === up(darkColors.borderStrong))).toBe(true);
  });

  it.each([
    ['danger', darkColors.dangerSubtle, darkColors.danger],
    ['warning', darkColors.warningSubtle, darkColors.warning],
  ] as const)('a %s Banner is full-bleed subtle fill with a 3 pt leading bar and textPrimary copy (§6.16, THEMES §3.5)', async (tone, bg, bar) => {
    await renderWithTheme(<Banner tone={tone} message="Retirement due" testID="banner" />, { mode: 'dark' });
    const banner = screen.getByTestId('banner', { includeHiddenElements: true }) as unknown as Node;
    const all = selfAndDescendants(banner);
    expect(all.some((n) => up(flat(n).backgroundColor) === up(bg))).toBe(true);
    expect(
      all.some(
        (n) =>
          (Number(flat(n).width) === 3 && up(flat(n).backgroundColor) === up(bar)) ||
          (Number(flat(n).borderLeftWidth) === 3 && up(flat(n).borderLeftColor) === up(bar)),
      ),
    ).toBe(true);
    expect(inkFor(banner, 'Retirement due')).toBe(up(darkColors.textPrimary));
    expect(all.every((n) => Number(flat(n).borderRadius ?? 0) === 0)).toBe(true);
  });

  it.each([
    ['light', lightGlass, lightColors],
    ['dark', darkGlass, darkColors],
  ] as const)('a %s toast is popover glass with radius 16, textPrimary copy and an accent action (§6.10, §106)', async (mode, glass, palette) => {
    await renderWithTheme(<Toast toast={{ id: 't', kind: 'success', message: 'Ball saved', action: { label: 'Undo', run: noop } }} onDismiss={noop} />, { mode });
    const root = screen.root as unknown as Node;
    expect(root.queryAll((n) => isHost(n) && up(flat(n).backgroundColor) === up(glass.level.popover.tint))).toHaveLength(1);
    const box = flat(screen.getByTestId('toast') as unknown as Node);
    expect(box.borderRadius).toBe(glassRadius.popover);
    expect(Math.max(Number(box.minHeight ?? 0), Number(box.height ?? 0))).toBeGreaterThanOrEqual(48);
    expect(root.queryAll((n) => isHost(n) && up(flat(n).borderTopColor) === up(glass.rim.top))).toHaveLength(1);
    expect(inkFor(root, 'Ball saved')).toBe(up(palette.textPrimary));
    expect(inkFor(root, 'Undo')).toBe(up(palette.accent));
  });

  it('marks the selected tab with a 3 pt accent underline and heavier weight, not colour alone (§6.6)', async () => {
    await renderWithTheme(<Tabs accessibilityLabel="Pools" selectedKey="a" onSelect={noop} tabs={[{ key: 'a', label: 'Pool A' }, { key: 'b', label: 'Pool B' }]} />, { mode: 'dark' });
    const [selected, other] = screen.getAllByRole('tab') as unknown as Node[];
    const underline = (n: Node) => selfAndDescendants(n).some((c) => Number(flat(c).height) === 3 && up(flat(c).backgroundColor) === up(darkGlass.ink.accent));
    expect(underline(selected)).toBe(true);
    expect(underline(other)).toBe(false);
    const face = (n: Node, label: string) => String(flat(n.queryAll((c) => isHost(c) && String(c.type) === 'Text' && textContent(c) === label)[0]).fontFamily);
    expect(face(selected, 'Pool A')).toMatch(/600SemiBold$/);
    expect(face(other, 'Pool B')).toMatch(/500Medium$/);
    expect(inkFor(selected, 'Pool A')).toBe(up(darkColors.textPrimary));
    expect(inkFor(other, 'Pool B')).toBe(up(darkGlass.ink.secondary));
  });

  it('draws the selected segment as a glass selection lens with a 1.5 pt accent outline and a check, on a glass control track, 44 tall (§6.7, §78, §106)', async () => {
    const view = await renderWithTheme(
      <SegmentedControl
        accessibilityLabel="Dot style"
        value="zero"
        onChange={noop}
        options={[
          { value: 'zero', label: '0' },
          { value: 'dot', label: '•' },
          { value: 'blank', label: 'Blank' },
        ]}
      />,
      { mode: 'dark' },
    );
    const track = (view.container as unknown as Node).queryAll((n) => isHost(n) && n.props.accessibilityRole === 'radiogroup')[0];
    expect(track.queryAll((n) => isHost(n) && up(flat(n).backgroundColor) === up(darkGlass.level.control.tint))).toHaveLength(1);
    expect(track.queryAll((n) => String(n.type) === 'ViewManagerAdapter_ExpoBlur')).toHaveLength(0);
    expect(Math.max(Number(flat(track).height ?? 0), Number(flat(track).minHeight ?? 0))).toBe(44);
    expect(flat(track).borderRadius).toBe(glassRadius.control);
    const [selected, other] = screen.getAllByRole('radio') as unknown as Node[];
    expect(up(flat(selected).backgroundColor)).toBe(up(darkGlass.selection));
    expect(Number(flat(selected).borderWidth)).toBe(1.5);
    expect(up(flat(selected).borderColor)).toBe(up(darkGlass.ink.accent));
    expect(selected.queryAll((c) => String(c.props.testID ?? '') === 'lucide-check')).toHaveLength(1);
    expect(flat(other).backgroundColor === undefined || flat(other).backgroundColor === 'transparent').toBe(true);
    expect(flat(other).borderColor).toBe('transparent');
    expect(other.queryAll((c) => String(c.props.testID ?? '') === 'lucide-check')).toHaveLength(0);
  });

  it('shows the selected bottom tab in the liquid with the liquid ink, an accent heavier caption; others textSecondary, never onAccent (§6.6, §106, §108, cleanup brief)', async () => {
    await renderWithTheme(<TabBar items={TAB_ITEMS.map((t, i) => ({ key: t.route, label: t.label, icon: t.icon, selected: i === 0, onPress: noop }))} />, { mode: 'dark' });
    const [home, tournaments] = screen.getAllByRole('tab') as unknown as Node[];
    const captions = (n: Node, label: string) => n.queryAll((c) => isHost(c) && String(c.type) === 'Text' && textContent(c) === label);
    const shown = (text: Node) => {
      let cursor: Node | null = text;
      while (cursor && !(isHost(cursor) && cursor.props.jestAnimatedStyle !== undefined)) {
        cursor = cursor.parent;
      }
      expect(cursor).not.toBeNull();
      return Number((getAnimatedStyle(cursor as never) as { opacity?: number }).opacity ?? 1);
    };
    const visibleCaption = (n: Node, label: string) => {
      const layers = captions(n, label);
      expect(layers).toHaveLength(2);
      const visible = layers.filter((layer) => shown(layer) === 1);
      expect(visible).toHaveLength(1);
      return visible[0];
    };
    expect(inkFor(home, 'Home')).toBe(up(darkGlass.ink.accent));
    expect(up(inkOf(visibleCaption(home, 'Home')))).toBe(up(darkGlass.ink.accent));
    expect(up(inkOf(visibleCaption(tournaments, 'Tournaments')))).toBe(up(darkGlass.ink.secondary));
    const lens = (n: Node) => up(flat(n).backgroundColor) === up(darkGlass.selection);
    expect(lens(home)).toBe(false);
    expect(lens(tournaments)).toBe(false);
    expect(String(flat(visibleCaption(home, 'Home')).fontFamily)).toMatch(/600SemiBold$/);
    expect(String(flat(visibleCaption(tournaments, 'Tournaments')).fontFamily)).toMatch(/500Medium$/);
    const glyphs = (n: Node) => n.queryAll((c) => /^lucide-|-lit-icon$/.test(String(c.props.testID ?? '')));
    const inks = glyphs(home).map((g) => up(flat(g).borderColor));
    expect(inks).toEqual(expect.arrayContaining([up(darkColors[darkGlass.liquid.ink]), up(darkGlass.ink.secondary)]));
    expect(inks).not.toContain(up(darkColors.onAccent));
    for (const glyph of glyphs(home)) {
      expect(Number(flat(glyph).width)).toBe(24);
    }
  });

  it('docks the 56 pt tab row on one edge-to-edge glass surface that runs into the home indicator area (§106, cleanup brief)', async () => {
    const view = await renderWithTheme(
      <TabBar bottomInset={34} items={TAB_ITEMS.map((t, i) => ({ key: t.route, label: t.label, icon: t.icon, selected: i === 0, onPress: noop }))} />,
      { mode: 'dark' },
    );
    const root = view.container as unknown as Node;
    const row = root.queryAll((n) => isHost(n) && n.props.accessibilityRole === 'tablist')[0];
    expect(flat(row).height).toBe(TAB_BAR_HEIGHT);
    const surface = row.parent as Node;
    expect(flat(surface).borderRadius ?? 0).toBe(0);
    expect(Number(flat(surface).paddingBottom)).toBe(34);
    expect(surface.queryAll((n) => isHost(n) && up(flat(n).backgroundColor) === up(darkGlass.level.bar.tint))).toHaveLength(1);
    const dock = flat(surface.parent as Node);
    expect(dock.position).toBe('absolute');
    expect([Number(dock.left), Number(dock.right), Number(dock.bottom)]).toEqual([0, 0, 0]);
    for (const tab of screen.getAllByRole('tab') as unknown as Node[]) {
      expect(Math.max(Number(flat(tab).height ?? 0), Number(flat(tab).minHeight ?? 0))).toBe(TAB_BAR_HEIGHT);
    }
  });

  it('builds the sheet as near-solid sheet glass with 24 pt top corners and a hidden 36 × 4 grabber (§6.8, §106)', async () => {
    const view = await renderWithTheme(
      <Sheet visible title="Extras" onClose={noop}>
        <RNText>Body</RNText>
      </Sheet>,
      { mode: 'dark' },
    );
    const root = view.container as unknown as Node;
    expect(root.queryAll((n) => isHost(n) && up(flat(n).backgroundColor) === up(darkGlass.level.sheet.tint))).toHaveLength(1);
    const panel = root.queryAll((n) => isHost(n) && n.props.accessibilityViewIsModal === true);
    expect(panel.length).toBeGreaterThan(0);
    const s = flat(panel[0]);
    expect(s.borderTopLeftRadius ?? s.borderRadius).toBe(glassRadius.sheet);
    expect(s.borderTopRightRadius ?? s.borderRadius).toBe(glassRadius.sheet);
    expect(s.borderBottomLeftRadius ?? 0).toBe(0);
    const grabber = root.queryAll((n) => isHost(n) && flat(n).width === 36 && flat(n).height === 4);
    expect(grabber).toHaveLength(1);
    expect(up(flat(grabber[0]).backgroundColor)).toBe(up(darkColors.borderStrong));
    expect(hiddenFromA11y(grabber[0])).toBe(true);
    const scrim = root.queryAll((n) => isHost(n) && up(flat(n).backgroundColor) === up(darkGlass.scrim.color));
    expect(scrim.length).toBeGreaterThan(0);
  });

  it('builds the dialog as sheet glass, radius 22, padding 24, at most 400 wide (§6.9, §106)', async () => {
    const view = await renderWithTheme(<Dialog visible title="Discard match?" message="Gone for good." confirm={{ label: 'Discard', onPress: noop }} cancel={{ label: 'Cancel', onPress: noop }} />, {
      mode: 'dark',
    });
    const root = view.container as unknown as Node;
    expect(root.queryAll((n) => isHost(n) && up(flat(n).backgroundColor) === up(darkGlass.level.sheet.tint))).toHaveLength(1);
    const panel = root.queryAll((n) => isHost(n) && n.props.accessibilityViewIsModal === true)[0];
    expect(panel).toBeDefined();
    const s = flat(panel);
    expect(s.borderRadius).toBe(glassRadius.dialog);
    expect(s.padding ?? s.paddingHorizontal).toBe(24);
    expect(Number(s.maxWidth ?? s.width)).toBeLessThanOrEqual(400);
    const title = screen.getByText('Discard match?', { includeHiddenElements: true }) as unknown as Node;
    expect(flat(title).fontSize).toBe(22);
    expect(inkOf(screen.getByText('Gone for good.', { includeHiddenElements: true }) as unknown as Node)?.toUpperCase()).toBe(up(darkColors.textSecondary));
  });

  it('draws the band rule as 2 pt deep teal, 2 pt gap, 1 pt border and the section rule as a single border hairline, hidden from the reader (§4.2)', async () => {
    const section = await renderWithTheme(<BoundaryRule testID="section" />, { mode: 'dark' });
    const sectionNodes = (section.container as unknown as Node).queryAll(isHost);
    expect(sectionNodes.filter((n) => Number(flat(n).height) === 2)).toHaveLength(0);
    expect(sectionNodes.filter((n) => up(flat(n).backgroundColor) === up(darkColors.textPrimary))).toHaveLength(0);
    const view = await renderWithTheme(<BoundaryRule tone="band" testID="rule" />, { mode: 'dark' });
    const nodes = (view.container as unknown as Node).queryAll(isHost);
    const heavy = nodes.filter((n) => flat(n).height === 2 && up(flat(n).backgroundColor) === up(darkColors.accentDeep));
    const light = nodes.filter((n) => flat(n).height === 1 && up(flat(n).backgroundColor) === up(darkColors.border));
    expect(heavy).toHaveLength(1);
    expect(light).toHaveLength(1);
    const rule = screen.getByTestId('rule', { includeHiddenElements: true }) as unknown as Node;
    expect(hiddenFromA11y(rule)).toBe(true);
    expect(Number(flat(rule).height ?? 5)).toBe(5);
  });

  it('places the input placeholder in textMuted and the helper in textMuted footnote (§6.11)', async () => {
    await renderWithTheme(<TextField label="Team name" value="" placeholder="e.g. Tigers" helper="Shown on the scorecard" onChangeText={noop} />, { mode: 'dark' });
    const input = screen.getByPlaceholderText('e.g. Tigers') as unknown as Node;
    expect(up(input.props.placeholderTextColor)).toBe(up(darkColors.textMuted));
    const helper = screen.getByText('Shown on the scorecard', { includeHiddenElements: true }) as unknown as Node;
    expect(up(inkOf(helper))).toBe(up(darkColors.textMuted));
    expect(flat(helper).fontSize).toBe(13);
    const field = [input, input.parent as Node].find((n) => Number(flat(n).height ?? flat(n).minHeight ?? 0) >= 48);
    expect(field).toBeDefined();
  });
});

describe('system chrome follows the effective theme (THEMES §1)', () => {
  it('uses dark status bar content on light and light content on dark', () => {
    expect(statusBarStyleFor('light')).toBe('dark');
    expect(statusBarStyleFor('dark')).toBe('light');
  });

  it.each(['light', 'dark'] as const)('paints stack and navigation backgrounds with the %s background token', (scheme) => {
    const theme = createTheme(scheme);
    const palette = scheme === 'light' ? lightColors : darkColors;
    expect(up((stackScreenOptions(theme).contentStyle as ViewStyle).backgroundColor)).toBe(up(palette.background));
    const nav = navigationTheme(theme);
    expect(nav.dark).toBe(scheme === 'dark');
    expect(up(nav.colors.background)).toBe(up(palette.background));
    expect(up(nav.colors.text)).toBe(up(palette.textPrimary));
    expect(up(nav.colors.primary)).toBe(up(palette.accent));
    expect(up(nav.colors.border)).toBe(up(palette.border));
  });
});

describe('OS high contrast and bold text flow through the provider (ACCESSIBILITY §7)', () => {
  function Probe() {
    const theme = useTheme();
    return <RNText testID="hc">{`${theme.color.textMuted}|${theme.color.border}|${theme.highContrast ? 'hc' : 'normal'}`}</RNText>;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('switches muted ink and borders when iOS Increase Contrast is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'isHighTextContrastEnabled').mockResolvedValue(true);
    await render(
      <ThemeProvider mode="dark" reducedMotion="off">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hc')).toHaveTextContent(`${darkColors.textPrimary}|${darkColors.borderStrong}|hc`));
  });

  it('switches muted ink and borders when Android high-contrast text is on', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isHighTextContrastEnabled').mockResolvedValue(true);
    await render(
      <ThemeProvider mode="light" reducedMotion="off">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hc')).toHaveTextContent(`${lightColors.textPrimary}|${lightColors.borderStrong}|hc`));
  });
});

type RequiredKey<T, K extends keyof T> = Partial<Pick<T, K>> extends Pick<T, K> ? false : true;

function hostAncestors(node: Node): Node[] {
  const out: Node[] = [];
  let cursor = node.parent;
  while (cursor) {
    if (isHost(cursor)) {
      out.push(cursor);
    }
    cursor = cursor.parent;
  }
  return out;
}

function hostChildToward(ancestor: Node, node: Node): Node {
  let child = node;
  for (const parent of hostAncestors(node)) {
    if (parent === ancestor) {
      return child;
    }
    child = parent;
  }
  throw new Error('not a descendant');
}

function sideMargin(style: Record<string, unknown>, side: 'Left' | 'Right' | 'Top' | 'Bottom'): number {
  const axis = side === 'Left' || side === 'Right' ? 'marginHorizontal' : 'marginVertical';
  return num(style[`margin${side}`]) ?? num(style[axis]) ?? num(style.margin) ?? 0;
}

function clearSpacing(a: Node, b: Node, axis: 'row' | 'column'): number {
  const chainB = new Set([b, ...hostAncestors(b)]);
  const lca = [a, ...hostAncestors(a)].find((n) => chainB.has(n));
  if (!lca) {
    throw new Error('no common ancestor');
  }
  const parent = flat(lca) as Record<string, unknown>;
  const gap = axis === 'row' ? Math.max(num(parent.gap) ?? 0, num(parent.columnGap) ?? 0) : Math.max(num(parent.gap) ?? 0, num(parent.rowGap) ?? 0);
  const first = flat(hostChildToward(lca, a)) as Record<string, unknown>;
  const second = flat(hostChildToward(lca, b)) as Record<string, unknown>;
  const margins = axis === 'row' ? sideMargin(first, 'Right') + sideMargin(second, 'Left') : sideMargin(first, 'Bottom') + sideMargin(second, 'Top');
  const slopA = slopOf(a.props.hitSlop);
  const slopB = slopOf(b.props.hitSlop);
  const slop = axis === 'row' ? slopA.right + slopB.left : slopA.bottom + slopB.top;
  return gap + margins - slop;
}

function weightOf(family: unknown): number {
  const match = /_(\d)00/.exec(String(family ?? ''));
  return match ? Number(match[1]) * 100 : 0;
}

function elementText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(elementText).join('');
  }
  if (value && typeof value === 'object' && 'props' in value) {
    const props = (value as { props: Record<string, unknown> }).props;
    if (props.accessible === true || typeof props.accessibilityRole === 'string') {
      return String(props.accessibilityLabel ?? elementText(props.children));
    }
    return elementText(props.children);
  }
  return '';
}

function topLevelTexts(root: Node): Node[] {
  return root.queryAll((n) => isHost(n) && String(n.type) === 'Text' && String((n.parent as Node | null)?.type) !== 'Text');
}

describe('adversarial extras: per-component caps, target spacing, compile-time labels, grouped controls', () => {
  it('caps scoring-pad digits and key words at ≤ 1.2 and the FOUR/SIX captions at ≤ 1.5 (RESPONSIVE §5)', async () => {
    const view = await renderWithTheme(<ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} />);
    const texts = topLevelTexts(view.container as unknown as Node);
    expect(texts.length).toBeGreaterThanOrEqual(8);
    const problems: string[] = [];
    for (const t of texts) {
      const content = textContent(t);
      const cap = t.props.maxFontSizeMultiplier;
      const limit = /^(four|six)$/i.test(content) ? 1.5 : 1.2;
      if (typeof cap !== 'number' || cap < 1 || cap > limit) {
        problems.push(`"${content}" cap=${String(cap)} limit=${limit}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.each(CHIP_SAMPLES.map(([kind, text, label]) => [kind, text, label] as const))(
    'caps %s ball-chip text at ≤ 1.3 so chips never balloon (RESPONSIVE §5)',
    async (kind, text, label) => {
      const view = await renderWithTheme(<BallChip kind={kind} text={text} accessibilityLabel={label} size="lg" />);
      const texts = topLevelTexts(view.container as unknown as Node);
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) {
        const cap = t.props.maxFontSizeMultiplier;
        expect({ text: textContent(t), ok: typeof cap === 'number' && cap >= 1 && cap <= 1.3 }).toEqual({ text: textContent(t), ok: true });
      }
    },
  );

  it('caps the bottom tab captions at ≤ 1.5 (RESPONSIVE §5: tab bar labels stay at 12 × 1.5 max)', async () => {
    await renderWithTheme(<TabBar items={TAB_ITEMS.map((t, i) => ({ key: t.route, label: t.label, icon: t.icon, selected: i === 0, onPress: noop }))} />);
    const captions = screen.getAllByText(/^(Home|Tournaments|History|Settings)$/, { includeHiddenElements: true }) as unknown as Node[];
    expect(captions.length).toBe(8);
    expect(screen.getAllByText(/^(Home|Tournaments|History|Settings)$/)).toHaveLength(4);
    for (const caption of captions) {
      const cap = caption.props.maxFontSizeMultiplier;
      expect(typeof cap === 'number' && cap >= 1 && cap <= 1.5).toBe(true);
    }
  });

  it('keeps ≥ 8 pt of clear space between adjacent scoring keys, hit slop included (ACCESSIBILITY §5, DESIGN_SYSTEM §6.2)', async () => {
    await renderWithTheme(<ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} />);
    const key = (name: RegExp) => screen.getByRole('button', { name }) as unknown as Node;
    const zero = key(/^(Dot ball|Zero runs)$/);
    const one = key(/^One run$/);
    const two = key(/^Two runs$/);
    const three = key(/^Three runs$/);
    const four = key(/^Four runs, boundary$/);
    const six = key(/^Six runs, boundary$/);
    const extras = key(/^Extras$/);
    const wicket = key(/^Wicket$/);
    const horizontal: readonly (readonly [Node, Node, string])[] = [
      [zero, one, '0|1'],
      [one, two, '1|2'],
      [two, three, '2|3'],
      [four, six, '4|6'],
      [six, extras, '6|EXTRAS'],
      [extras, wicket, 'EXTRAS|WICKET'],
    ];
    const vertical: readonly (readonly [Node, Node, string])[] = [
      [zero, four, '0/4'],
      [one, six, '1/6'],
      [two, extras, '2/EXTRAS'],
      [three, wicket, '3/WICKET'],
    ];
    const tight = [
      ...horizontal.map(([a, b, pair]) => [pair, clearSpacing(a, b, 'row')] as const),
      ...vertical.map(([a, b, pair]) => [pair, clearSpacing(a, b, 'column')] as const),
    ].filter(([, spacing]) => spacing < 8);
    expect(tight).toEqual([]);
  });

  it('makes accessibilityLabel a required IconButton prop, so an unlabelled icon button does not compile (ACCESSIBILITY §2, §13)', () => {
    const required: RequiredKey<ComponentProps<typeof IconButton>, 'accessibilityLabel'> = true;
    expect(required).toBe(true);
  });

  it('exposes a disabled IconButton (Undo with nothing to undo) as disabled and ignores presses (ACCESSIBILITY §2)', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<IconButton icon="undo-2" accessibilityLabel="Undo last ball" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Undo last ball' });
    expect(stateOf(button as unknown as Node).disabled).toBe(true);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(THEMES)('tints a settings switch with the token switch colours, the knob at 3:1 or more against its track (%s, DESIGN_SYSTEM §6.19, THEMES §3.4)', async (scheme, palette) => {
    const view = await renderWithTheme(
      <View>
        <ListRow title="Vibration" trailing={{ kind: 'switch', value: true, onValueChange: noop }} />
        <ListRow title="Sound effects" trailing={{ kind: 'switch', value: false, onValueChange: noop }} />
      </View>,
      { mode: scheme },
    );
    const switches = (view.container as unknown as Node).queryAll((n) => n.props.trackColor !== undefined || n.props.onTintColor !== undefined);
    expect(switches.length).toBeGreaterThan(0);
    for (const sw of switches) {
      const track = (sw.props.trackColor ?? {}) as { true?: unknown; false?: unknown };
      const on = track.true ?? sw.props.onTintColor;
      const off = track.false ?? sw.props.tintColor;
      const colors = switchColors(createTheme(scheme));
      expect(up(on)).toBe(up(colors.trackOn));
      expect(up(off)).toBe(up(palette.borderStrong));
      expect(up(on)).toBe(up(scheme === 'dark' ? palette.accentDeep : palette.accent));
      const thumb = String(sw.props.thumbTintColor ?? sw.props.thumbColor ?? '');
      expect([up(colors.thumbOn), up(colors.thumbOff)]).toContain(up(thumb));
      expect(up(thumb)).not.toBe('#009688');
      expect(wcag(colors.thumbOn, colors.trackOn)).toBeGreaterThanOrEqual(3);
      expect(wcag(colors.thumbOff, colors.trackOff)).toBeGreaterThanOrEqual(3);
      expect(wcag(colors.trackOn, palette.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps a ListRow overflow menu as its own labelled ≥ 44 pt button, outside the row element so screen readers can reach it (§6.13)', async () => {
    await renderWithTheme(
      <ListRow title="Lions v Tigers" subtitle="12 Sep · T20" onPress={noop} menu={{ accessibilityLabel: 'More actions for Lions v Tigers', onPress: noop }} />,
    );
    const menu = screen.getByRole('button', { name: 'More actions for Lions v Tigers' }) as unknown as Node;
    const buttons = screen.getAllByRole('button') as unknown as Node[];
    expect(buttons.length).toBe(2);
    expect(groupedInsideAccessibleAncestor(menu)).toBe(false);
    const size = target(menu);
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(size.width === 'stretch' || size.width >= 44).toBe(true);
  });

  it('marks the striker by a heavier name and a 3 pt accent leading bar as well as the tint, and the bowler by a hidden marker (ACCESSIBILITY §6)', async () => {
    const view = await renderWithTheme(
      <View>
        <StatLine kind="batter" name="Ali Khan" figure="42" active accessibilityLabel="On strike: Ali Khan" testID="striker" />
        <StatLine kind="batter" name="Ahmed Shah" figure="31" accessibilityLabel="Non-striker: Ahmed Shah" testID="non-striker" />
        <StatLine kind="bowler" name="Hassan Ali" figure="3.4-0-28-2" accessibilityLabel="Bowling: Hassan Ali" markerTestID="bowler-marker" />
      </View>,
      { mode: 'dark' },
    );
    const face = (name: string) => flat(screen.getByText(name, { includeHiddenElements: true }) as unknown as Node).fontFamily;
    expect(weightOf(face('Ali Khan'))).toBeGreaterThan(weightOf(face('Ahmed Shah')));
    const bars = (root: Node) => root.queryAll((n) => isHost(n) && flat(n).width === 3 && up(flat(n).backgroundColor) === up(darkColors.accent));
    expect(bars(screen.getByTestId('striker', { includeHiddenElements: true }) as unknown as Node).length).toBe(1);
    expect(bars(screen.getByTestId('non-striker', { includeHiddenElements: true }) as unknown as Node).length).toBe(0);
    expect(screen.queryByTestId('bowler-marker')).toBeNull();
    expect(screen.getByTestId('bowler-marker', { includeHiddenElements: true })).toBeTruthy();
    expect((view.container as unknown as Node).queryAll((n) => isHost(n) && labelOf(n) === 'Bowling: Hassan Ali').length).toBe(1);
  });

  it('announces a skeleton once as Loading with a busy state and draws its blocks as radius-2 surfaceSunken after 300 ms (§6.17)', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderWithTheme(<Skeleton rows={2} testID="skeleton" />, { mode: 'dark', reducedMotion: 'on' });
      const root = screen.getByTestId('skeleton') as unknown as Node;
      expect(labelOf(root)).toBe('Loading');
      expect(stateOf(root).busy).toBe(true);
      expect(root.props.accessible).toBe(true);
      await advance(300);
      const blocks = (view.container as unknown as Node).queryAll((n) => isHost(n) && up(flat(n).backgroundColor) === up(darkColors.surfaceSunken));
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(Number(flat(block).borderRadius ?? 0)).toBeLessThanOrEqual(2);
      }
      expect(screen.getAllByLabelText('Loading').length).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('puts initial screen-reader focus on Cancel, never on the destructive confirm, in a destructive dialog (DESIGN_SYSTEM §6.9, ACCESSIBILITY §4)', async () => {
    jest.useFakeTimers();
    const legacy = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(noop);
    const modern = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(noop);
    try {
      await renderWithTheme(
        <Dialog visible destructive title="Discard match?" message="This match will be deleted." confirm={{ label: 'Discard', onPress: noop }} cancel={{ label: 'Cancel', onPress: noop }} />,
      );
      await advance(600);
      const targets = [...modern.mock.calls.filter((c) => c[1] === 'focus').map((c) => c[0] as unknown), ...legacy.mock.calls.map((c) => c[0] as unknown)];
      expect(targets.length).toBeGreaterThan(0);
      const focused = targets.map((t) => ((t as { props?: Record<string, unknown> } | null)?.props ?? {}) as Record<string, unknown>);
      const isAccessibilityElement = (p: Record<string, unknown>) => p.accessible === true || typeof p.accessibilityRole === 'string' || typeof p.role === 'string';
      const spoken = (p: Record<string, unknown>) => String(p.accessibilityLabel ?? p['aria-label'] ?? elementText(p.children));
      expect(focused.map((p) => ({ element: isAccessibilityElement(p), cancel: /^\s*cancel\s*$/i.test(spoken(p)) }))).toContainEqual({ element: true, cancel: true });
    } finally {
      legacy.mockRestore();
      modern.mockRestore();
      jest.useRealTimers();
    }
  });
});

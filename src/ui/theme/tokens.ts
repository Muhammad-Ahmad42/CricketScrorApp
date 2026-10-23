import { StyleSheet } from 'react-native';

export const CORE_COLOR_TOKENS = [
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

export const EXTENDED_COLOR_TOKENS = [
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

export type CoreColorToken = (typeof CORE_COLOR_TOKENS)[number];
export type ExtendedColorToken = (typeof EXTENDED_COLOR_TOKENS)[number];
export type ColorToken = CoreColorToken | ExtendedColorToken;
export type ColorTokens = { readonly [K in ColorToken]: string };

export const lightColors: ColorTokens = {
  background: '#F0F5F8',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#0B232B',
  textSecondary: '#3D5864',
  textMuted: '#526B77',
  border: '#D5E0E6',
  accent: '#00606F',
  success: '#0C7552',
  warning: '#8A5000',
  danger: '#C42B2B',
  score: '#061A20',
  surfaceSunken: '#E2EBF0',
  borderStrong: '#6E848E',
  accentPressed: '#004A56',
  accentSubtle: '#DCEFF3',
  onAccent: '#FFFFFF',
  successSubtle: '#DDF2E9',
  warningSubtle: '#FBEFDA',
  dangerSubtle: '#FCE8E8',
  onDanger: '#FFFFFF',
  focusRing: '#008BA3',
  scrim: 'rgba(6,26,32,0.40)',
  inverseSurface: '#0B232B',
  inverseText: '#F0F5F8',
  inverseAccent: '#5ED3E8',
  chartSeries1: '#0A96B2',
  chartSeries2: '#6650B8',
  chartGrid: '#E1E9ED',
  accentDeep: '#007385',
  highlight: '#008BA3',
};

export const darkColors: ColorTokens = {
  background: '#070E12',
  surface: '#0D171C',
  surfaceElevated: '#132129',
  textPrimary: '#F2F7F9',
  textSecondary: '#8FA7B3',
  textMuted: '#7F97A3',
  border: '#1A2A33',
  accent: '#00C2E0',
  success: '#35D49A',
  warning: '#FFB74D',
  danger: '#FF5252',
  score: '#F8FCFD',
  surfaceSunken: '#04090C',
  borderStrong: '#5A7482',
  accentPressed: '#00A5BF',
  accentSubtle: '#0A2C36',
  onAccent: '#010B0E',
  successSubtle: '#0B2A22',
  warningSubtle: '#2A2014',
  dangerSubtle: '#2D1316',
  onDanger: '#1C0506',
  focusRing: '#28D9F2',
  scrim: 'rgba(2,7,9,0.64)',
  inverseSurface: '#E3ECF0',
  inverseText: '#070E12',
  inverseAccent: '#00C2E0',
  chartSeries1: '#19A2BE',
  chartSeries2: '#7A64D6',
  chartGrid: '#16242B',
  accentDeep: '#008BA3',
  highlight: '#28D9F2',
};

export const BRAND_SPLASH_COLOR = '#070E12';

export const SPACING_SCALE = [4, 8, 12, 16, 20, 24, 32, 40, 48] as const;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

export type SpaceToken = keyof typeof space;

export const radius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 10,
} as const;

export type RadiusToken = keyof typeof radius;

export const borderWidth = {
  hairline: StyleSheet.hairlineWidth,
  control: 1,
  emphasis: 2,
  focus: 2,
  bar: 3,
} as const;

export const boundaryRule = {
  heavy: 2,
  gap: 2,
  light: 1,
} as const;

export const size = {
  minTouch: 44,
  iconInline: 16,
  icon: 20,
  iconLarge: 24,
  iconEmpty: 32,
  buttonLg: 56,
  buttonMd: 48,
  buttonSm: 44,
  field: 48,
  fieldMultiline: 96,
  row: 56,
  rowCompact: 48,
  tableHeader: 36,
  tableRow: 44,
  tableRowPressable: 48,
  tabBar: 56,
  topTabs: 44,
  segmented: 44,
  badge: 24,
  sheetChoice: 56,
  sheetHeader: 56,
  chipLarge: 32,
  chipMedium: 24,
  chipSmall: 20,
  statLine: 44,
  statLineCompact: 40,
  overStrip: 48,
} as const;

export const lightShadow = {
  shadowColor: '#06222B',
  shadowOpacity: 0.1,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
} as const;

export const motionDuration = {
  instant: 0,
  fast: 120,
  base: 200,
  slow: 320,
  exit: 160,
} as const;

export type MotionDurationToken = keyof typeof motionDuration;

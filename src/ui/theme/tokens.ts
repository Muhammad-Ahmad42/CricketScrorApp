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
] as const;

export type CoreColorToken = (typeof CORE_COLOR_TOKENS)[number];
export type ExtendedColorToken = (typeof EXTENDED_COLOR_TOKENS)[number];
export type ColorToken = CoreColorToken | ExtendedColorToken;
export type ColorTokens = { readonly [K in ColorToken]: string };

export const lightColors: ColorTokens = {
  background: '#F5F3EC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#1A1C19',
  textSecondary: '#474E49',
  textMuted: '#646A65',
  border: '#DDD9CE',
  accent: '#1F5C3A',
  success: '#276A3E',
  warning: '#8A5300',
  danger: '#B3261E',
  score: '#111310',
  surfaceSunken: '#ECE9E0',
  borderStrong: '#8A877C',
  accentPressed: '#174A2D',
  accentSubtle: '#E2ECE4',
  onAccent: '#FFFFFF',
  successSubtle: '#E3EFE6',
  warningSubtle: '#FAEFD9',
  dangerSubtle: '#FBE8E6',
  onDanger: '#FFFFFF',
  focusRing: '#1F5C3A',
  scrim: 'rgba(17,19,16,0.40)',
  inverseSurface: '#1A1C19',
  inverseText: '#F5F3EC',
  inverseAccent: '#9AD3AF',
  chartSeries1: '#2A7F50',
  chartSeries2: '#4A6FC0',
  chartGrid: '#E7E4DA',
};

export const darkColors: ColorTokens = {
  background: '#111412',
  surface: '#181C19',
  surfaceElevated: '#212622',
  textPrimary: '#ECEEE9',
  textSecondary: '#B4BBB4',
  textMuted: '#8E968F',
  border: '#2B312D',
  accent: '#72BE90',
  success: '#7CC49A',
  warning: '#E3B55E',
  danger: '#EE8A7F',
  score: '#F6F7F3',
  surfaceSunken: '#0B0D0C',
  borderStrong: '#646E66',
  accentPressed: '#5FA87C',
  accentSubtle: '#1C3326',
  onAccent: '#0A1A10',
  successSubtle: '#1A3023',
  warningSubtle: '#33291A',
  dangerSubtle: '#3A1E1B',
  onDanger: '#240907',
  focusRing: '#9AD3AF',
  scrim: 'rgba(0,0,0,0.60)',
  inverseSurface: '#ECEEE9',
  inverseText: '#111412',
  inverseAccent: '#72BE90',
  chartSeries1: '#55A877',
  chartSeries2: '#7792DA',
  chartGrid: '#252A26',
};

export const BRAND_SPLASH_COLOR = '#1F5C3A';

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
  buttonSm: 36,
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
  shadowColor: '#000000',
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

import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { space, useTheme, type SpaceToken } from '../theme';
import { BREAKPOINTS, widthClassFor, type WidthClass } from './layoutClass';

export const GUTTERS: { readonly [K in WidthClass]: number } = {
  'compact-s': space.sm,
  compact: space.md,
  medium: space.xl,
  expanded: space['2xl'],
};

export const SHEET_GUTTER = space.md;

export function gutterFor(width: WidthClass): number {
  return GUTTERS[width];
}

const GutterContext = createContext<number | null>(null);

export interface GutterProviderProps {
  readonly value: number;
  readonly children: ReactNode;
}

export function GutterProvider({ value, children }: GutterProviderProps) {
  return <GutterContext.Provider value={value}>{children}</GutterContext.Provider>;
}

export function useGutter(): number {
  const own = useContext(GutterContext);
  const { width } = useWindowDimensions();
  return own ?? gutterFor(widthClassFor(width));
}

const BleedContext = createContext(0);

export interface RowBleedProviderProps {
  readonly value: number;
  readonly children: ReactNode;
}

export function RowBleedProvider({ value, children }: RowBleedProviderProps) {
  return <BleedContext.Provider value={value}>{children}</BleedContext.Provider>;
}

export function useRowBleed(): number {
  return useContext(BleedContext);
}

export interface InsetProps {
  readonly children: ReactNode;
  readonly top?: SpaceToken;
  readonly bottom?: SpaceToken;
  readonly gap?: SpaceToken;
  readonly direction?: 'column' | 'row';
  readonly testID?: string;
}

export function Inset({ children, top, bottom, gap, direction = 'column', testID }: InsetProps) {
  const gutter = useGutter();
  return (
    <View
      testID={testID}
      style={[
        styles.inset,
        {
          flexDirection: direction,
          paddingHorizontal: gutter,
          paddingTop: top === undefined ? 0 : space[top],
          paddingBottom: bottom === undefined ? 0 : space[bottom],
          gap: gap === undefined ? 0 : space[gap],
        },
      ]}
    >
      {children}
    </View>
  );
}

export const TWO_PANE_MIN_WIDTH = BREAKPOINTS.expanded;
export const PANE_MIN_WIDTH = 320;

export type PaneCollapse = 'stack' | 'primary';

export function usesTwoPanes(windowWidth: number): boolean {
  return widthClassFor(windowWidth) === 'expanded';
}

export function useTwoPane(): boolean {
  const { width } = useWindowDimensions();
  return usesTwoPanes(width);
}

export interface TwoPaneProps {
  readonly primary: ReactNode;
  readonly secondary: ReactNode;
  readonly ratio?: number;
  readonly collapse?: PaneCollapse;
  readonly divider?: boolean;
  readonly testID?: string;
}

export function TwoPane({ primary, secondary, ratio = 0.5, collapse = 'stack', divider = false, testID }: TwoPaneProps) {
  const split = useTwoPane();
  const gutter = useGutter();
  const theme = useTheme();
  if (!split) {
    return (
      <View testID={testID} style={styles.stack}>
        <View testID={testID ? `${testID}-primary` : undefined}>{primary}</View>
        {collapse === 'stack' ? <View testID={testID ? `${testID}-secondary` : undefined}>{secondary}</View> : null}
      </View>
    );
  }
  const clamped = Math.min(0.8, Math.max(0.2, ratio));
  return (
    <View testID={testID} style={[styles.row, { gap: gutter }]}>
      <View testID={testID ? `${testID}-primary` : undefined} style={[styles.pane, { flexGrow: clamped, flexBasis: 0 }]}>
        {primary}
      </View>
      {divider ? <View style={[styles.divider, { backgroundColor: theme.color.border }]} accessible={false} importantForAccessibility="no" /> : null}
      <View testID={testID ? `${testID}-secondary` : undefined} style={[styles.pane, { flexGrow: 1 - clamped, flexBasis: 0 }]}>
        {secondary}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inset: { alignSelf: 'stretch', minWidth: 0 },
  stack: { alignSelf: 'stretch', gap: space.xl },
  row: { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'stretch' },
  pane: { minWidth: PANE_MIN_WIDTH, flexShrink: 1 },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});

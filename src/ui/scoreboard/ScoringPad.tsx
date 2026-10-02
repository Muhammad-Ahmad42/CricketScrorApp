import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { scoringKeyHeight, widthClassFor } from '../layout/layoutClass';
import { useInsets } from '../layout/useInsets';
import { space, useTheme } from '../theme';
import { ScoreKey } from './ScoreKey';

export type PadRuns = 0 | 1 | 2 | 3 | 4 | 6;
export type DotStyle = 'zero' | 'dot';

export interface ScoringPadProps {
  readonly onRuns: (runs: PadRuns) => void;
  readonly onExtras: () => void;
  readonly onWicket: () => void;
  readonly dotStyle?: DotStyle;
  readonly keyHeight?: number;
  readonly tabletPane?: boolean;
  readonly showCaptions?: boolean;
  readonly bottomInset?: boolean;
  readonly well?: boolean;
  readonly testIDPrefix?: string;
}

export interface RunKeySpec {
  readonly runs: PadRuns;
  readonly label: string;
  readonly caption: string | null;
  readonly accessibilityLabel: string;
}

const RUN_WORDS: { readonly [K in PadRuns]: string } = {
  0: 'Zero runs',
  1: 'One run',
  2: 'Two runs',
  3: 'Three runs',
  4: 'Four runs, boundary',
  6: 'Six runs, boundary',
};

export const EXTRAS_HINT = 'Wide, no ball, byes, leg byes and other runs';
export const WICKET_HINT = 'Opens dismissal options';

export function runKeySpec(runs: PadRuns, dotStyle: DotStyle): RunKeySpec {
  if (runs === 0) {
    return {
      runs,
      label: dotStyle === 'dot' ? '•' : '0',
      caption: null,
      accessibilityLabel: dotStyle === 'dot' ? 'Dot ball' : RUN_WORDS[0],
    };
  }
  return {
    runs,
    label: String(runs),
    caption: runs === 4 ? 'FOUR' : runs === 6 ? 'SIX' : null,
    accessibilityLabel: RUN_WORDS[runs],
  };
}

const TOP_ROW: readonly PadRuns[] = [0, 1, 2, 3];

export function ScoringPad({
  onRuns,
  onExtras,
  onWicket,
  dotStyle = 'zero',
  keyHeight,
  tabletPane = false,
  showCaptions,
  bottomInset = true,
  well = true,
  testIDPrefix = 'score-btn',
}: ScoringPadProps) {
  const theme = useTheme();
  const insets = useInsets();
  const window = useWindowDimensions();
  const compact = widthClassFor(window.width) === 'compact-s';
  const height = keyHeight ?? scoringKeyHeight(window.width, window.height, tabletPane);
  const captions = showCaptions ?? !compact;

  const runKey = (runs: PadRuns) => {
    const spec = runKeySpec(runs, dotStyle);
    return (
      <ScoreKey
        key={runs}
        kind="runs"
        label={spec.label}
        caption={captions ? spec.caption : null}
        accessibilityLabel={spec.accessibilityLabel}
        height={height}
        onPress={() => onRuns(runs)}
        testID={`${testIDPrefix}-${runs}`}
      />
    );
  };

  return (
    <View
      style={[
        styles.pad,
        {
          backgroundColor: well ? theme.color.surfaceSunken : undefined,
          paddingBottom: space.sm + (bottomInset ? insets.bottom : 0),
          maxWidth: tabletPane ? 104 * 4 + space.xs * 3 + space.md * 2 : undefined,
        },
      ]}
    >
      <View style={styles.row}>{TOP_ROW.map(runKey)}</View>
      <View style={styles.row}>
        {runKey(4)}
        {runKey(6)}
        <ScoreKey
          kind="extras"
          label="EXTRAS"
          accessibilityLabel="Extras"
          accessibilityHint={EXTRAS_HINT}
          height={height}
          compactLabel={compact}
          onPress={onExtras}
          testID={`${testIDPrefix}-extras`}
        />
        <ScoreKey
          kind="wicket"
          label="WICKET"
          accessibilityLabel="Wicket"
          accessibilityHint={WICKET_HINT}
          height={height}
          compactLabel={compact}
          onPress={onWicket}
          testID={`${testIDPrefix}-wicket`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    alignSelf: 'stretch',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.xs,
  },
  row: { flexDirection: 'row', gap: space.xs },
});

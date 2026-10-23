import { StyleSheet, View } from 'react-native';
import { Text, space, useGutter, useTheme } from '@/ui';
import type { InningsSummaryVM } from '../selectors/scoreboard';

export interface InningsSummaryProps {
  readonly vm: InningsSummaryVM;
}

export function InningsSummary({ vm }: InningsSummaryProps) {
  const theme = useTheme();
  const gutter = useGutter();
  return (
    <View testID="score-innings-summary" style={styles.root}>
      {vm.innings.map((line) => (
        <View
          key={line.key}
          accessible
          accessibilityLabel={line.accessibilityLabel}
          testID={`score-innings-summary-${line.key}`}
          style={[styles.block, { paddingHorizontal: gutter, borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border }]}
        >
          <View style={styles.headline}>
            <Text variant="subhead" tone="secondary" style={styles.flex}>
              {line.team}
            </Text>
            <Text variant="scoreMedium" tone="score">
              {line.score}
            </Text>
            <Text variant="subhead" tone="secondary">
              {line.overs}
            </Text>
          </View>
          {line.batters ? <Text variant="footnote">{line.batters}</Text> : null}
          {line.bowlers ? (
            <Text variant="footnote" tone="secondary">
              {line.bowlers}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space.xs },
  block: { paddingVertical: space.sm, gap: space.xxs },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
});

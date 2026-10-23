import { StyleSheet, View } from 'react-native';
import { Icon, Text, space } from '@/ui';
import type { ScorelineVM } from '../selectors/fixtures';

export interface ScorelineProps {
  readonly scoreline: ScorelineVM;
  readonly size?: 'compact' | 'hero';
  readonly testID?: string;
}

export function Scoreline({ scoreline, size = 'compact', testID }: ScorelineProps) {
  if (size === 'hero') {
    return (
      <View style={styles.hero} accessible accessibilityRole="text" accessibilityLabel={scoreline.spoken} testID={testID}>
        {scoreline.sides.map((side) => (
          <View key={side.teamId} style={styles.heroLine}>
            <View style={styles.heroTeam}>
              <Text variant="headline" tone={side.winner ? 'primary' : 'secondary'} weight={side.winner ? 'bold' : undefined} style={styles.heroName}>
                {side.name}
              </Text>
              {side.winner ? <Icon name="check" size={16} color="success" /> : null}
            </View>
            <Text variant="figure" tone={side.winner ? 'primary' : 'secondary'}>
              {side.score}
            </Text>
            <Text variant="footnote" tone="secondary" style={styles.overs}>
              {`(${side.overs})`}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.compact} accessible accessibilityRole="text" accessibilityLabel={scoreline.spoken} testID={testID}>
      {scoreline.sides.map((side, position) => (
        <View key={side.teamId} style={styles.compactSide}>
          {position > 0 ? (
            <Text variant="footnote" tone="muted">
              ·
            </Text>
          ) : null}
          <Text variant="footnote" tone="secondary" weight={side.winner ? 'semibold' : undefined}>
            {side.short}
          </Text>
          <Text variant="figureSmall" tone={side.winner ? 'primary' : 'secondary'}>
            {side.score}
          </Text>
          <Text variant="footnote" tone="secondary">
            {`(${side.overs})`}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.xs, rowGap: space.xxs },
  compactSide: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
  hero: { gap: space.xs },
  heroLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  heroTeam: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  heroName: { flexShrink: 1 },
  overs: { minWidth: 44 },
});

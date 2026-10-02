import { StyleSheet, View } from 'react-native';
import { Separator, StatLine, Text, space } from '@/ui';
import type { BatterVM, BowlerVM, CreaseVM } from '../selectors/scoreboard';

export interface BatterRowProps {
  readonly batter: BatterVM;
  readonly compact?: boolean;
  readonly onPress?: () => void;
}

export function BatterRow({ batter, compact = false, onPress }: BatterRowProps) {
  return (
    <StatLine
      kind="batter"
      name={batter.name}
      figure={batter.figure}
      secondary={batter.balls}
      detail={batter.detail}
      active={batter.isStriker}
      compact={compact}
      accessibilityLabel={batter.accessibilityLabel}
      onPress={onPress}
      testID={batter.isStriker ? 'score-row-striker' : 'score-row-non-striker'}
      markerTestID={batter.isStriker ? 'score-marker-striker' : undefined}
    />
  );
}

export interface CreasePanelProps {
  readonly crease: CreaseVM;
  readonly bowler: BowlerVM | null;
  readonly compact?: boolean;
  readonly onPressBatter?: () => void;
  readonly onPressBowler?: () => void;
}

export function CreasePanel({ crease, bowler, compact = false, onPressBatter, onPressBowler }: CreasePanelProps) {
  return (
    <View testID="score-crease">
      {crease.striker ? <BatterRow batter={crease.striker} compact={compact} onPress={onPressBatter} /> : null}
      {crease.nonStriker ? <BatterRow batter={crease.nonStriker} compact={compact} onPress={onPressBatter} /> : null}
      {crease.striker !== null && crease.nonStriker === null ? (
        <Text variant="footnote" tone="secondary" style={styles.alone}>
          Batting alone (last man stands)
        </Text>
      ) : null}
      <Separator />
      {bowler ? (
        <StatLine
          kind="bowler"
          name={bowler.name}
          figure={bowler.figures}
          secondary={compact ? null : bowler.economy}
          secondaryLabel="ECO"
          detail={compact ? null : bowler.detail}
          compact={compact}
          accessibilityLabel={bowler.accessibilityLabel}
          onPress={onPressBowler}
          testID="score-row-bowler"
          markerTestID="score-marker-bowler"
        />
      ) : null}
      <Separator />
    </View>
  );
}

const styles = StyleSheet.create({
  alone: { paddingHorizontal: space.md, paddingBottom: space.xxs },
});

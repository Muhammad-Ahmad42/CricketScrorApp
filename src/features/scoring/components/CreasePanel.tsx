import { View, useWindowDimensions } from 'react-native';
import { Inset, Separator, StatLine, Text } from '@/ui';
import type { BatterVM, BowlerVM, CreaseVM } from '../selectors/scoreboard';

export interface BatterRowProps {
  readonly batter: BatterVM;
  readonly compact?: boolean;
  readonly lean?: boolean;
  readonly onPress?: () => void;
}

export function BatterRow({ batter, compact = false, lean = false, onPress }: BatterRowProps) {
  return (
    <StatLine
      kind="batter"
      name={batter.name}
      figure={batter.figure}
      secondary={batter.balls}
      detail={lean ? null : batter.detail}
      active={batter.isStriker}
      compact={compact}
      accessibilityLabel={batter.accessibilityLabel}
      onPress={onPress}
      testID={batter.isStriker ? 'score-row-striker' : 'score-row-non-striker'}
      markerTestID={batter.isStriker ? 'score-marker-striker' : undefined}
    />
  );
}

export const LEAN_FONT_SCALE = 1.15;

export function showsEconomy(compact: boolean, fontScale: number): boolean {
  return !compact || fontScale <= LEAN_FONT_SCALE;
}

export interface CreasePanelProps {
  readonly crease: CreaseVM;
  readonly bowler: BowlerVM | null;
  readonly compact?: boolean;
  readonly lean?: boolean;
  readonly onPressBatter?: () => void;
  readonly onPressBowler?: () => void;
}

export function CreasePanel({ crease, bowler, compact = false, lean = false, onPressBatter, onPressBowler }: CreasePanelProps) {
  const { fontScale } = useWindowDimensions();
  const economy = showsEconomy(compact, fontScale);
  return (
    <View testID="score-crease">
      {crease.striker ? <BatterRow batter={crease.striker} compact={compact || lean} lean={lean} onPress={onPressBatter} /> : null}
      {crease.nonStriker ? <BatterRow batter={crease.nonStriker} compact={compact || lean} lean={lean} onPress={onPressBatter} /> : null}
      {crease.striker !== null && crease.nonStriker === null ? (
        <Inset bottom="xxs">
          <Text variant="footnote" tone="secondary">
            Batting alone (last man stands)
          </Text>
        </Inset>
      ) : null}
      <Separator />
      {bowler ? (
        <StatLine
          kind="bowler"
          name={bowler.name}
          figure={bowler.figures}
          secondary={economy ? bowler.economy : null}
          secondaryLabel={economy ? 'ECON' : null}
          detail={compact || lean ? null : bowler.detail}
          compact={compact || lean}
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

import { StyleSheet, View } from 'react-native';
import { Icon, PressableRow, Text, space } from '@/ui';
import type { TournamentRowVM } from '../selectors/list';
import { ProgressRule } from './ProgressRule';

export interface TournamentRowProps {
  readonly row: TournamentRowVM;
  readonly position: number;
  readonly onPress: () => void;
}

export function TournamentRow({ row, position, onPress }: TournamentRowProps) {
  return (
    <PressableRow
      testID={`tournaments-row-${position}`}
      accessibilityLabel={row.accessibilityLabel}
      accessibilityHint={row.draft ? 'Continues the setup where you left off' : 'Opens the tournament'}
      onPress={onPress}
      chevron
    >
      <View style={styles.main}>
        <Text variant="headline">{row.name}</Text>
        <Text variant="footnote" tone="secondary">
          {row.meta}
        </Text>
        <View style={styles.statusLine}>
          <Text variant="subhead" tone="secondary" testID={`tournaments-text-status-${position}`}>
            {row.statusLabel}
          </Text>
          {row.progressText ? (
            <Text variant="subhead" tone="secondary">
              {`· ${row.progressText}`}
            </Text>
          ) : null}
        </View>
        {row.champion ? (
          <View style={styles.statusLine}>
            <Icon name="trophy" size={16} color="textSecondary" />
            <Text variant="subhead" weight="semibold" testID={`tournaments-text-champion-${position}`}>
              {row.champion}
            </Text>
          </View>
        ) : null}
        {row.progressText ? <ProgressRule ratio={row.progressRatio} /> : null}
      </View>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1, minWidth: 0, gap: space.xxs },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, flexWrap: 'wrap' },
});

import type { MatchId } from '@/domain/types';
import { ListRow, SectionHeader, Text, space, useTheme } from '@/ui';
import { StyleSheet, View } from 'react-native';
import type { RepairVM } from '../selectors/diagnostics';

export interface RepairListProps {
  readonly repairs: readonly RepairVM[];
  readonly onOpen: (matchId: MatchId) => void;
}

export function RepairList({ repairs, onOpen }: RepairListProps) {
  const theme = useTheme();
  return (
    <>
      <SectionHeader title="Matches that need repair" />
      {repairs.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.color.surface }]}>
          <Text variant="body" tone="secondary" testID="diag-text-no-repairs">
            No matches need repair.
          </Text>
        </View>
      ) : (
        repairs.map((repair) => (
          <ListRow
            key={repair.matchId}
            title={repair.title}
            subtitle={repair.detail}
            leading={{ icon: 'circle-alert' }}
            trailing={{ kind: 'chevron' }}
            onPress={() => onOpen(repair.matchId)}
            accessibilityHint="Opens the ball log of this match"
            testID={repair.testID}
          />
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: space.md, paddingVertical: space.sm },
});

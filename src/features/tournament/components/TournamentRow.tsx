import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Separator, Text, space, useTheme } from '@/ui';
import type { TournamentRowVM } from '../selectors/list';
import { ProgressRule } from './ProgressRule';

export interface TournamentRowProps {
  readonly row: TournamentRowVM;
  readonly position: number;
  readonly onPress: () => void;
}

export function TournamentRow({ row, position, onPress }: TournamentRowProps) {
  const theme = useTheme();
  return (
    <View>
      <Pressable
        testID={`tournaments-row-${position}`}
        accessibilityRole="button"
        accessibilityLabel={row.accessibilityLabel}
        accessibilityHint={row.draft ? 'Continues the setup where you left off' : 'Opens the tournament'}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.color.surfaceSunken : theme.color.surface }]}
      >
        <View style={styles.text}>
          <Text variant="headline" numberOfLines={2}>
            {row.name}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
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
              <Text variant="subhead">Champion:</Text>
              <Text variant="subhead" weight="semibold" testID={`tournaments-text-champion-${position}`}>
                {row.champion}
              </Text>
            </View>
          ) : null}
          {row.progressText ? <ProgressRule ratio={row.progressRatio} /> : null}
          {row.draft ? (
            <Text variant="footnote" tone="accent">
              Continue setup
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-right" size={20} color="textMuted" />
      </Pressable>
      <Separator />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
    minHeight: 72,
  },
  text: { flex: 1, gap: space.xxs },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, flexWrap: 'wrap' },
});

import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, space, useTheme } from '@/ui';
import type { TournamentRowVM } from '../selectors/tournaments';

export interface TournamentRowProps {
  readonly vm: TournamentRowVM;
  readonly onPress: () => void;
  readonly testID?: string;
}

export function TournamentRow({ vm, onPress, testID }: TournamentRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={vm.accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border },
        pressed ? { backgroundColor: theme.color.surfaceSunken } : null,
      ]}
    >
      <View style={styles.text}>
        <View style={styles.line}>
          <Text variant="headline" numberOfLines={1} style={styles.flex}>
            {vm.name}
          </Text>
          <Text variant="subhead" tone="secondary" style={styles.numbers}>
            {vm.status}
          </Text>
        </View>
        {vm.detail ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {vm.detail}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={20} color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56 },
  text: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  numbers: { fontVariant: ['tabular-nums'] },
});

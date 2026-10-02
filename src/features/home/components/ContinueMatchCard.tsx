import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Text, space, useTheme } from '@/ui';
import type { ContinueVM } from '@/features/history/selectors/matchCard';

export interface ContinueMatchCardProps {
  readonly vm: ContinueVM;
  readonly onResume: () => void;
}

export function ContinueMatchCard({ vm, onResume }: ContinueMatchCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={`home-continue-${vm.id}`}
      accessibilityRole="button"
      accessibilityLabel={vm.accessibilityLabel}
      accessibilityHint="Opens live scoring"
      onPress={onResume}
      style={({ pressed }) => [
        styles.root,
        { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border },
        pressed ? { backgroundColor: theme.color.surfaceSunken } : null,
      ]}
    >
      <View style={styles.line}>
        <Text variant="headline" numberOfLines={1} style={styles.flex}>
          {vm.title}
        </Text>
        <Badge label={vm.badge} tone={vm.paused ? 'paused' : 'live'} />
      </View>
      <View style={styles.line}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {vm.battingTeam}
        </Text>
        <Text variant="scoreLarge" tone="score">
          {vm.score}
        </Text>
        <Text variant="subhead" tone="secondary" style={styles.flex}>
          {vm.overs}
        </Text>
        <Button label="Resume" variant="secondary" size="sm" onPress={onResume} testID={`home-continue-${vm.id}-resume`} />
      </View>
      <Text variant="footnote" tone="secondary">
        {vm.other}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xxs, minHeight: 56 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});

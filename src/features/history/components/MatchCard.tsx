import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, IconButton, Text, space, useTheme } from '@/ui';
import type { MatchCardVM } from '../selectors/matchCard';

export interface MatchCardProps {
  readonly vm: MatchCardVM;
  readonly onPress: () => void;
  readonly onMenu?: () => void;
  readonly testID?: string;
}

export function MatchCard({ vm, onPress, onMenu, testID }: MatchCardProps) {
  const theme = useTheme();
  return (
    <View style={[styles.line, { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface }]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={vm.accessibilityLabel}
        accessibilityHint={vm.inPlay ? 'Opens live scoring' : 'Opens the scorecard'}
        onPress={onPress}
        style={({ pressed }) => [styles.body, pressed ? { backgroundColor: theme.color.surfaceSunken } : null]}
      >
        <View style={styles.titleLine}>
          <Text variant="headline" numberOfLines={1} style={styles.flex}>
            {vm.title}
          </Text>
          {vm.dateLabel ? (
            <Text variant="footnote" tone="secondary">
              {vm.dateLabel}
            </Text>
          ) : null}
        </View>
        {vm.inPlay ? (
          <View style={styles.statusLine}>
            <Badge label={vm.statusLabel} tone={vm.paused ? 'paused' : 'live'} />
          </View>
        ) : vm.resultLine ? (
          <Text variant="callout">{vm.resultLine}</Text>
        ) : (
          <Text variant="callout" tone="secondary">
            {vm.statusLabel}
          </Text>
        )}
        {vm.scoreLine ? (
          <Text variant="subhead" tone="secondary" style={styles.numbers}>
            {vm.scoreLine}
          </Text>
        ) : null}
        {vm.footer ? (
          <Text variant="footnote" tone="muted">
            {vm.footer}
          </Text>
        ) : null}
      </Pressable>
      {onMenu ? (
        <View style={styles.menu}>
          <IconButton icon="ellipsis" accessibilityLabel={`Options for ${vm.title}`} onPress={onMenu} testID={testID ? `${testID}-menu` : undefined} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'stretch' },
  body: { flex: 1, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2, minHeight: 56 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  numbers: { fontVariant: ['tabular-nums'] },
  menu: { justifyContent: 'center', paddingRight: space.xxs },
});

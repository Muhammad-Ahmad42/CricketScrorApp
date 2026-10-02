import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Icon, Text, space, useTheme } from '@/ui';

export interface SquadRowProps {
  readonly name: string;
  readonly order: number | null;
  readonly tags: string;
  readonly selected: boolean;
  readonly substitute: boolean;
  readonly onToggle: () => void;
  readonly onToggleSubstitute?: () => void;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
  readonly testID: string;
}

export function SquadRow({ name, order, tags, selected, substitute, onToggle, onToggleSubstitute, onMoveUp, onMoveDown, testID }: SquadRowProps) {
  const theme = useTheme();
  const label = `${name}${tags ? `, ${tags}` : ''}${selected ? `, batting at ${order ?? ''}` : substitute ? ', substitute fielder' : ', not selected'}`;
  return (
    <View style={[styles.line, { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border }]}>
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected }}
        onPress={onToggle}
        style={({ pressed }) => [styles.row, pressed ? { backgroundColor: theme.color.surfaceSunken } : null]}
      >
        <View
          style={[
            styles.box,
            {
              borderRadius: theme.radius.sm,
              borderWidth: theme.borderWidth.emphasis,
              borderColor: selected ? theme.color.accent : theme.color.borderStrong,
              backgroundColor: selected ? theme.color.accent : 'transparent',
            },
          ]}
        >
          {selected ? <Icon name="check" size={16} color="onAccent" /> : null}
        </View>
        <Text variant="tableNumeric" tone="muted" style={styles.order}>
          {selected && order !== null ? `${order}` : ''}
        </Text>
        <Text variant="body" numberOfLines={1} style={styles.flex}>
          {name}
        </Text>
        {tags ? (
          <Text variant="footnote" weight="semibold" tone="secondary">
            {tags}
          </Text>
        ) : null}
      </Pressable>
      {selected && onMoveUp && onMoveDown ? (
        <View style={styles.moves}>
          <Button label="Up" variant="tertiary" size="sm" accessibilityLabel={`Move ${name} up the order`} onPress={onMoveUp} testID={`${testID}-up`} />
          <Button label="Down" variant="tertiary" size="sm" accessibilityLabel={`Move ${name} down the order`} onPress={onMoveDown} testID={`${testID}-down`} />
        </View>
      ) : null}
      {!selected && onToggleSubstitute ? (
        <Pressable
          testID={`${testID}-sub`}
          accessibilityRole="switch"
          accessibilityLabel={`${name} as substitute fielder`}
          accessibilityState={{ checked: substitute }}
          onPress={onToggleSubstitute}
          style={[styles.sub, { borderRadius: theme.radius.sm, borderColor: substitute ? theme.color.accent : theme.color.borderStrong, borderWidth: theme.borderWidth.control }]}
        >
          <Text variant="footnote" weight="semibold" tone={substitute ? 'accent' : 'secondary'}>
            sub
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', paddingRight: space.xs },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.md },
  box: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  order: { width: 20 },
  flex: { flex: 1 },
  moves: { flexDirection: 'row' },
  sub: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, BallChip, Text, space, useTheme } from '@/ui';
import type { OverGroupVM } from '../selectors/ballLog';

export interface OverGroupProps {
  readonly group: OverGroupVM;
  readonly onBall?: (seq: number) => void;
}

export function OverGroup({ group, onBall }: OverGroupProps) {
  const theme = useTheme();
  return (
    <View
      testID={`balls-over-${group.key}`}
      style={[styles.root, { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border }]}
    >
      <View style={styles.heading}>
        <Text variant="label" tone="secondary" style={styles.flex} numberOfLines={1}>
          {group.heading}
        </Text>
        {group.isCurrent ? <Badge label="Live" tone="live" /> : null}
        <Text variant="tableNumeric" tone="secondary">
          {group.summary}
        </Text>
      </View>
      <View style={styles.cells}>
        {group.cells.map((cell) => (
          <Pressable
            key={cell.key}
            testID={`balls-cell-${cell.seq}`}
            accessibilityRole={onBall ? 'button' : 'text'}
            accessibilityLabel={cell.accessibilityLabel}
            accessibilityHint={onBall ? 'Opens this ball to edit it' : undefined}
            disabled={onBall === undefined}
            onPress={() => onBall?.(cell.seq)}
            style={({ pressed }) => [
              styles.cell,
              {
                borderRadius: theme.radius.sm,
                borderWidth: theme.borderWidth.hairline,
                borderColor: theme.color.border,
                backgroundColor: pressed ? theme.color.surfaceSunken : theme.color.surface,
              },
            ]}
          >
            <BallChip text={cell.chip.text} kind={cell.chip.kind} isFreeHit={cell.chip.isFreeHit} accessibilityLabel={cell.chip.accessibilityLabel} size="md" />
            <Text variant="footnote" tone="muted">
              {cell.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {group.notes.map((note, index) => (
        <Text key={`${group.key}-note-${index}`} variant="footnote" tone="secondary" style={styles.note}>
          {note}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xs },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs },
  cell: { width: 48, height: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  note: { paddingLeft: space.xs },
});

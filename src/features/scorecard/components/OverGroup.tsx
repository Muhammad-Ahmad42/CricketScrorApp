import { StyleSheet, View } from 'react-native';
import { Badge, BallChip, PressableArea, Text, space, useGutter, useTheme } from '@/ui';
import type { OverGroupVM } from '../selectors/ballLog';

export interface OverGroupProps {
  readonly group: OverGroupVM;
  readonly onBall?: (seq: number) => void;
}

export function OverGroup({ group, onBall }: OverGroupProps) {
  const theme = useTheme();
  const gutter = useGutter();
  return (
    <View
      testID={`balls-over-${group.key}`}
      style={[styles.root, { paddingHorizontal: gutter, borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border }]}
    >
      <View style={styles.heading}>
        <Text variant="label" tone="secondary" style={styles.flex}>
          {group.heading}
        </Text>
        {group.isCurrent ? <Badge label="Live" tone="live" /> : null}
        <Text variant="tableNumeric" tone="secondary">
          {group.summary}
        </Text>
      </View>
      {group.lead.map((note, index) => (
        <Text key={`${group.key}-lead-${index}`} variant="footnote" tone="secondary" style={styles.note}>
          {note}
        </Text>
      ))}
      <View style={styles.cells}>
        {group.cells.map((cell) => (
          <PressableArea
            key={cell.key}
            testID={`balls-cell-${cell.seq}`}
            accessibilityLabel={cell.accessibilityLabel}
            accessibilityHint="Opens this ball to edit it"
            onPress={onBall === undefined ? undefined : () => onBall(cell.seq)}
          >
            <View
              style={[
                styles.cell,
                { borderRadius: theme.radius.sm, borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border, backgroundColor: theme.color.surface },
              ]}
            >
              <BallChip text={cell.chip.text} kind={cell.chip.kind} isFreeHit={cell.chip.isFreeHit} accessibilityLabel={cell.chip.accessibilityLabel} size="md" />
              <Text variant="footnote" tone="muted">
                {cell.label}
              </Text>
            </View>
          </PressableArea>
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
  root: { paddingVertical: space.sm, gap: space.xs },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs },
  cell: { minWidth: 44, minHeight: 56, paddingHorizontal: space.xxs, alignItems: 'center', justifyContent: 'center', gap: space.xxs },
  note: { paddingLeft: space.xs },
});

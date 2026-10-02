import { StyleSheet, View } from 'react-native';
import { IconButton, space } from '@/ui';

export interface ActionRowProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canSwap: boolean;
  readonly showRedo?: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onSwap: () => void;
  readonly onMore: () => void;
}

export function ActionRow({ canUndo, canRedo, canSwap, showRedo = true, onUndo, onRedo, onSwap, onMore }: ActionRowProps) {
  return (
    <View testID="score-row-actions" style={styles.row}>
      <View style={styles.cell}>
        <IconButton
          icon="undo-2"
          label="Undo"
          accessibilityLabel="Undo last action"
          accessibilityHint={canUndo ? undefined : 'Nothing to undo'}
          disabled={!canUndo}
          onPress={onUndo}
          testID="score-btn-undo"
        />
      </View>
      {showRedo ? (
        <View style={styles.cell}>
          {canRedo ? <IconButton icon="redo-2" label="Redo" accessibilityLabel="Redo" onPress={onRedo} testID="score-btn-redo" /> : null}
        </View>
      ) : null}
      <View style={styles.cell}>
        <IconButton
          icon="arrow-left-right"
          label="Swap"
          accessibilityLabel="Swap strike"
          accessibilityHint={canSwap ? undefined : 'Only one batter at the crease'}
          disabled={!canSwap}
          onPress={onSwap}
          testID="score-btn-swap"
        />
      </View>
      <View style={styles.cell}>
        <IconButton icon="ellipsis" label="More" accessibilityLabel="More actions" onPress={onMore} testID="score-btn-more" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, paddingTop: space.xxs, minHeight: 48 },
  cell: { flex: 1, alignItems: 'center' },
});

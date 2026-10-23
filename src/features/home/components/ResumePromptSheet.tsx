import { StyleSheet, View } from 'react-native';
import { Badge, Button, Sheet, Text, space } from '@/ui';
import type { ContinueVM } from '@/features/history/selectors/matchCard';

export interface ResumePromptItem {
  readonly vm: ContinueVM;
  readonly savedAt: string | null;
  readonly needsRepair: boolean;
}

export interface ResumePromptSheetProps {
  readonly visible: boolean;
  readonly items: readonly ResumePromptItem[];
  readonly onResume: (matchId: string) => void;
  readonly onSaveExit: () => void;
  readonly onDiscard: (matchId: string) => void;
}

export function ResumePromptSheet({ visible, items, onResume, onSaveExit, onDiscard }: ResumePromptSheetProps) {
  const single = items.length === 1 ? items[0] : null;
  return (
    <Sheet
      visible={visible}
      blocking
      title={single === null ? 'Matches in progress' : 'Match in progress'}
      testID="sheet-resume"
      footer={
        single !== null ? (
          <View style={styles.actions}>
            <Button label="Resume" icon="play" size="lg" fullWidth onPress={() => onResume(single.vm.id)} testID="resume-btn-resume" />
            <Button label="Save & exit" variant="secondary" size="lg" fullWidth onPress={onSaveExit} testID="resume-btn-save-exit" />
            {single.vm.tournamentId === null ? (
              <Button label="Discard" variant="destructive" size="lg" fullWidth onPress={() => onDiscard(single.vm.id)} testID="resume-btn-discard" />
            ) : (
              <Text variant="footnote" tone="secondary" testID="resume-text-tournament">
                {"Tournament matches can't be discarded"}
              </Text>
            )}
          </View>
        ) : (
          <Button label="Save & exit" variant="secondary" size="lg" fullWidth onPress={onSaveExit} testID="resume-btn-save-exit" />
        )
      }
    >
      <View style={styles.list}>
        {items.map((item) => (
          <View key={item.vm.id} style={styles.item} testID={`resume-item-${item.vm.id}`}>
            <View style={styles.line}>
              <Text variant="body" style={styles.flex}>
                {item.vm.battingTeam}
              </Text>
              <Text variant="scoreLarge" tone="score">
                {item.vm.score}
              </Text>
            </View>
            {item.needsRepair ? (
              <View style={styles.badge}>
                <Badge label="Needs repair" tone="repair" />
              </View>
            ) : null}
            <Text variant="subhead" tone="secondary">
              {`v ${item.vm.opponent} · ${item.vm.oversOf}`}
            </Text>
            {item.savedAt ? (
              <Text variant="footnote" tone="secondary">{`Last ball saved at ${item.savedAt}`}</Text>
            ) : null}
            {single === null ? (
              <View style={styles.badge}>
                <Button label="Resume" icon="play" variant="secondary" size="sm" onPress={() => onResume(item.vm.id)} testID={`resume-item-${item.vm.id}-resume`} />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  item: { gap: space.xxs },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  flex: { flex: 1 },
  badge: { alignItems: 'flex-start' },
  actions: { gap: space.xs },
});

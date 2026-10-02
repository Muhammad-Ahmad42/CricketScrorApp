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
      title="Match in progress"
      testID="sheet-resume"
      footer={
        single !== null ? (
          <View style={styles.actions}>
            <Button label="RESUME" caps size="lg" fullWidth onPress={() => onResume(single.vm.id)} testID="resume-btn-resume" />
            <Button label="SAVE & EXIT" caps variant="secondary" size="lg" fullWidth onPress={onSaveExit} testID="resume-btn-save-exit" />
            {single.vm.tournamentId === null ? (
              <Button label="DISCARD" caps variant="destructive" size="lg" fullWidth onPress={() => onDiscard(single.vm.id)} testID="resume-btn-discard" />
            ) : (
              <Text variant="footnote" tone="secondary" testID="resume-text-tournament">
                {"Tournament matches can't be discarded. End or abandon it in Match settings."}
              </Text>
            )}
          </View>
        ) : (
          <Button label="SAVE & EXIT" caps variant="secondary" size="lg" fullWidth onPress={onSaveExit} testID="resume-btn-save-exit" />
        )
      }
    >
      <View style={styles.list}>
        {items.map((item) => (
          <View key={item.vm.id} style={styles.item} testID={`resume-item-${item.vm.id}`}>
            <View style={styles.line}>
              <Text variant="headline">{item.vm.battingTeam}</Text>
              <Text variant="scoreMedium" tone="score">
                {item.vm.score}
              </Text>
              {item.needsRepair ? <Badge label="Needs repair" tone="repair" /> : null}
            </View>
            <Text variant="subhead" tone="secondary">
              {`${item.vm.oversText} · ${item.vm.title}`}
            </Text>
            {item.savedAt ? (
              <Text variant="footnote" tone="muted">{`Last ball saved ${item.savedAt}`}</Text>
            ) : null}
            {single === null ? (
              <Button label="Resume" variant="secondary" size="sm" onPress={() => onResume(item.vm.id)} testID={`resume-item-${item.vm.id}-resume`} />
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
  actions: { gap: space.xs },
});

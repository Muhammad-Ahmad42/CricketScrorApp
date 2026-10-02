import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SuspensionReason } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, Sheet, TextField, space } from '@/ui';
import { OptionButton } from '../components/common/OptionButton';
import { SUSPENSION_REASONS, SUSPENSION_TEXT } from '../selectors/labels';

export interface SuspendSheetProps {
  readonly visible: boolean;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

export function SuspendSheet({ visible, onSubmit, onClose }: SuspendSheetProps) {
  const [reason, setReason] = useState<SuspensionReason>('rain');
  const [note, setNote] = useState('');
  return (
    <Sheet
      visible={visible}
      title="Suspend play"
      onClose={onClose}
      testID="sheet-suspend"
      footer={
        <Button
          label="Suspend play"
          size="lg"
          fullWidth
          onPress={() => onSubmit({ type: 'suspend_play', reason, note: note.trim() === '' ? null : note.trim() })}
          testID="suspend-submit"
        />
      }
    >
      <View style={styles.body}>
        <View style={styles.grid}>
          {SUSPENSION_REASONS.map((value) => (
            <View key={value} style={styles.cell}>
              <OptionButton
                label={SUSPENSION_TEXT[value]}
                selected={reason === value}
                compact
                onPress={() => setReason(value)}
                testID={`suspend-reason-${value}`}
              />
            </View>
          ))}
        </View>
        <TextField label="Note (optional)" value={note} onChangeText={setNote} testID="suspend-note" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cell: { flexBasis: '48%', flexGrow: 1 },
});

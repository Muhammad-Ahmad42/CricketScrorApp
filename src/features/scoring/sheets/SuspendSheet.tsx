import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SuspensionReason } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, RadioList, Sheet, TextField, space } from '@/ui';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import { SUSPENSION_REASONS, SUSPENSION_TEXT } from '../selectors/labels';

export interface SuspendSheetProps {
  readonly visible: boolean;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

export function SuspendSheet({ visible, onSubmit, onClose }: SuspendSheetProps) {
  const [reason, setReason] = useState<SuspensionReason>('rain');
  const [note, setNote] = useState('');
  const guard = useDiscardGuard(note.trim() !== '', onClose);
  const submit = () => onSubmit({ type: 'suspend_play', reason, note: note.trim() === '' ? null : note.trim() });
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Suspend play"
        onClose={guard.requestClose}
        testID="sheet-suspend"
        footer={<Button label="Suspend play" size="lg" fullWidth onPress={submit} testID="suspend-submit" />}
      >
        <View style={styles.body}>
          <RadioList
            accessibilityLabel="Reason"
            value={reason}
            onChange={setReason}
            choices={SUSPENSION_REASONS.map((value) => ({ value, label: SUSPENSION_TEXT[value], testID: `suspend-reason-${value}` }))}
          />
          <TextField label="Note (optional)" value={note} onChangeText={setNote} autoCapitalize="sentences" returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={submit} testID="suspend-note" />
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});

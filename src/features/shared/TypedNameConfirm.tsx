import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, ListRow, Text, TextField, space } from '@/ui';
import { plural } from './text';

export interface DeleteFootprint {
  readonly matches: number;
  readonly completedMatches: number;
  readonly events: number;
}

export interface TypedNameConfirmation {
  readonly typedName: string;
  readonly deleteCompletedMatches: boolean;
}

export interface TypedNameConfirmProps {
  readonly visible: boolean;
  readonly expected: string;
  readonly footprint: DeleteFootprint;
  readonly busy?: boolean;
  readonly title?: string;
  readonly confirmLabel?: string;
  readonly onCancel: () => void;
  readonly onConfirm: (confirmation: TypedNameConfirmation) => void;
  readonly onBackup?: () => void;
}

export function footprintText(footprint: DeleteFootprint): string {
  const parts = [
    plural(footprint.matches, 'match', 'matches'),
    `${footprint.completedMatches} completed`,
    plural(footprint.events, 'ball'),
  ];
  return `${parts.join(', ')} will be deleted.`;
}

export function canConfirmTypedName(expected: string, typed: string, footprint: DeleteFootprint, deleteCompleted: boolean): boolean {
  const nameMatches = typed.trim() === expected.trim();
  const completedOk = footprint.completedMatches === 0 || deleteCompleted;
  return nameMatches && completedOk;
}

export function TypedNameConfirm({
  visible,
  expected,
  footprint,
  busy = false,
  title = 'Delete tournament?',
  confirmLabel = 'Delete tournament',
  onCancel,
  onConfirm,
  onBackup,
}: TypedNameConfirmProps) {
  const [typed, setTyped] = useState('');
  const [deleteCompleted, setDeleteCompleted] = useState(false);
  const enabled = canConfirmTypedName(expected, typed, footprint, deleteCompleted);
  return (
    <Dialog
      visible={visible}
      title={title}
      message={footprintText(footprint)}
      destructive
      onRequestClose={onCancel}
      cancel={{ label: 'Cancel', onPress: onCancel, testID: 'typed-btn-cancel' }}
      confirm={{
        label: confirmLabel,
        onPress: () => onConfirm({ typedName: typed.trim(), deleteCompletedMatches: deleteCompleted }),
        disabled: !enabled,
        loading: busy,
        testID: 'typed-btn-confirm',
      }}
      testID="dialog-typed-name"
    >
      <View style={styles.body}>
        {onBackup ? <Button label="Back up first" variant="secondary" icon="hard-drive-download" onPress={onBackup} testID="typed-btn-backup" /> : null}
        <TextField
          label={`Type "${expected}" to confirm`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          testID="typed-input-name"
        />
        {footprint.completedMatches > 0 ? (
          <ListRow
            title={`Also delete ${plural(footprint.completedMatches, 'completed match', 'completed matches')}`}
            trailing={{ kind: 'switch', value: deleteCompleted, onValueChange: setDeleteCompleted }}
            separator={false}
            testID="typed-toggle-completed"
          />
        ) : null}
        <Text variant="footnote" tone="secondary">
          This can't be undone.
        </Text>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

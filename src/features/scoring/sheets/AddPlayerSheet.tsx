import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NewPlayerInput } from '@/domain/types';
import { Button, ListRow, Sheet, TextField, space } from '@/ui';

export interface AddPlayerSheetProps {
  readonly visible: boolean;
  readonly teamName: string;
  readonly allowSubstitute?: boolean;
  readonly busy?: boolean;
  readonly onSubmit: (player: NewPlayerInput, isSubstitute: boolean) => void;
  readonly onClose: () => void;
}

export function parseJersey(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function AddPlayerSheet({ visible, teamName, allowSubstitute = false, busy = false, onSubmit, onClose }: AddPlayerSheetProps) {
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [substitute, setSubstitute] = useState(false);
  const valid = name.trim().length > 0;
  const submit = () => {
    if (!valid) {
      return;
    }
    onSubmit({ name: name.trim(), jerseyNumber: parseJersey(jersey) }, substitute);
    setName('');
    setJersey('');
    setSubstitute(false);
  };
  return (
    <Sheet
      visible={visible}
      title="Add player"
      subtitle={teamName}
      onClose={onClose}
      testID="sheet-add-player"
      footer={<Button label="Add player" size="lg" fullWidth disabled={!valid} loading={busy} onPress={submit} testID="add-player-submit" />}
    >
      <View style={styles.body}>
        <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" autoFocus testID="add-player-name" />
        <TextField label="Shirt number (optional)" value={jersey} onChangeText={setJersey} numeric testID="add-player-jersey" />
        {allowSubstitute ? (
          <ListRow
            title="Substitute fielder"
            subtitle="Fields only. Doesn't bat or bowl."
            trailing={{ kind: 'switch', value: substitute, onValueChange: setSubstitute }}
            testID="add-player-substitute"
          />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});

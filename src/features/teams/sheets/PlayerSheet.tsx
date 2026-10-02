import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PlayerRole } from '@/domain/types';
import { Button, Sheet, Text, TextField, space } from '@/ui';
import { OptionButton } from '@/features/scoring/components/common/OptionButton';
import { parseJersey } from '@/features/scoring/sheets/AddPlayerSheet';
import { ROLE_OPTIONS } from '../selectors';

export interface PlayerValues {
  readonly name: string;
  readonly jerseyNumber: number | null;
  readonly role: PlayerRole;
}

export interface PlayerSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly initial: PlayerValues;
  readonly busy: boolean;
  readonly onSubmit: (values: PlayerValues) => void;
  readonly onArchive?: () => void;
  readonly onClose: () => void;
}

export function PlayerSheet({ visible, title, initial, busy, onSubmit, onArchive, onClose }: PlayerSheetProps) {
  const [name, setName] = useState(initial.name);
  const [jersey, setJersey] = useState(initial.jerseyNumber === null ? '' : `${initial.jerseyNumber}`);
  const [role, setRole] = useState<PlayerRole>(initial.role);
  const valid = name.trim().length > 0;
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      testID="sheet-player"
      footer={
        <View style={styles.footer}>
          <Button
            label="Save player"
            size="lg"
            fullWidth
            disabled={!valid}
            loading={busy}
            onPress={() => onSubmit({ name: name.trim(), jerseyNumber: parseJersey(jersey), role })}
            testID="player-submit"
          />
          {onArchive ? <Button label="Archive player" variant="destructive" fullWidth onPress={onArchive} testID="player-archive" /> : null}
        </View>
      }
    >
      <View style={styles.body}>
        <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" testID="player-name" />
        <TextField label="Shirt number (optional)" value={jersey} onChangeText={setJersey} numeric testID="player-jersey" />
        <Text variant="subhead" tone="secondary">
          Role
        </Text>
        <View style={styles.grid}>
          {ROLE_OPTIONS.map((option) => (
            <View key={option.value} style={styles.cell}>
              <OptionButton label={option.label} compact selected={role === option.value} onPress={() => setRole(option.value)} testID={`player-role-${option.value}`} />
            </View>
          ))}
        </View>
        {onArchive ? (
          <Text variant="footnote" tone="secondary">
            Archived players stay in past scorecards.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  footer: { gap: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cell: { flexBasis: '48%', flexGrow: 1 },
});

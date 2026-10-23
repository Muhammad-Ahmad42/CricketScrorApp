import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PlayerRole } from '@/domain/types';
import { Button, ChipGroup, Sheet, Text, TextField, space, useFormChain } from '@/ui';
import { parseJersey } from '@/features/scoring/sheets/AddPlayerSheet';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
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
  readonly progress?: string | null;
  readonly onSubmit: (values: PlayerValues) => void;
  readonly onSubmitAnother?: (values: PlayerValues) => Promise<boolean>;
  readonly onArchive?: () => void;
  readonly onClose: () => void;
}

const FIELDS = ['name', 'jersey'] as const;

export function PlayerSheet({ visible, title, initial, busy, progress = null, onSubmit, onSubmitAnother, onArchive, onClose }: PlayerSheetProps) {
  const [name, setName] = useState(initial.name);
  const [jersey, setJersey] = useState(initial.jerseyNumber === null ? '' : `${initial.jerseyNumber}`);
  const [role, setRole] = useState<PlayerRole>(initial.role);
  const [saving, setSaving] = useState(false);
  const [entry, setEntry] = useState(0);
  const [baseline, setBaseline] = useState({ name: initial.name, jersey: initial.jerseyNumber === null ? '' : `${initial.jerseyNumber}`, role: initial.role });
  const valid = name.trim().length > 0;
  const values = (): PlayerValues => ({ name: name.trim(), jerseyNumber: parseJersey(jersey), role });
  const another = async () => {
    if (onSubmitAnother === undefined || !valid || saving) {
      return;
    }
    setSaving(true);
    const ok = await onSubmitAnother(values());
    setSaving(false);
    if (ok) {
      setName('');
      setJersey('');
      setBaseline({ name: '', jersey: '', role });
      setEntry((count) => count + 1);
    }
  };
  const submitFromKeyboard = () => {
    if (!valid || saving || busy) {
      return;
    }
    if (onSubmitAnother !== undefined) {
      void another();
      return;
    }
    onSubmit(values());
  };
  const chain = useFormChain(FIELDS, { onSubmit: submitFromKeyboard, lastReturnKey: onSubmitAnother !== undefined ? 'next' : 'done' });
  useEffect(() => {
    if (entry > 0) {
      chain.focus('name');
    }
  }, [entry]);
  const dirty = name.trim() !== baseline.name.trim() || jersey.trim() !== baseline.jersey || role !== baseline.role;
  const guard = useDiscardGuard(dirty, onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title={title}
        subtitle={progress ?? undefined}
        onClose={guard.requestClose}
        testID="sheet-player"
        footer={
          <View style={styles.footer}>
            {onSubmitAnother ? (
              <Button
                label="Save & add another"
                icon="plus"
                variant="secondary"
                size="lg"
                fullWidth
                disabled={!valid}
                loading={saving}
                onPress={() => void another()}
                testID="player-submit-another"
              />
            ) : null}
            <Button label="Save player" size="lg" fullWidth disabled={!valid || saving} loading={busy && !saving} onPress={() => onSubmit(values())} testID="player-submit" />
            {onArchive ? <Button label="Archive player" variant="destructive" fullWidth onPress={onArchive} testID="player-archive" /> : null}
          </View>
        }
      >
        <View style={styles.body}>
          <TextField
            key={`name-${entry}`}
            {...chain.field('name')}
            label="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus={onSubmitAnother !== undefined}
            testID="player-name"
          />
          <TextField {...chain.field('jersey')} label="Shirt number (optional)" value={jersey} onChangeText={setJersey} numeric maxLength={3} testID="player-jersey" />
          <Text variant="subhead" tone="secondary">
            Role
          </Text>
          <ChipGroup
            accessibilityLabel="Role"
            value={role}
            onChange={setRole}
            options={ROLE_OPTIONS.map((option) => ({ value: option.value, label: option.label, testID: `player-role-${option.value}` }))}
          />
          {onArchive ? (
            <Text variant="footnote" tone="secondary">
              Archived players stay in past scorecards
            </Text>
          ) : null}
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  footer: { gap: space.xs },
});

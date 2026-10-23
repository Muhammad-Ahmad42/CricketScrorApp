import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Player } from '@/domain/types';
import { Button, RadioList, Sheet, Text, TextField, space, useFormChain } from '@/ui';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { SHORT_NAME_HELPER, SHORT_NAME_MAX, shortNameError, suggestShortName } from '../selectors';

export interface TeamValues {
  readonly name: string;
  readonly shortName: string;
  readonly captainId: string | null;
}

export interface TeamSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly initial: TeamValues;
  readonly players?: readonly Player[];
  readonly busy: boolean;
  readonly submitLabel: string;
  readonly onSubmit: (values: TeamValues) => void;
  readonly onClose: () => void;
}

const FIELDS = ['name', 'shortName'] as const;
const NO_CAPTAIN = '__none__';

export function TeamSheet({ visible, title, initial, players = [], busy, submitLabel, onSubmit, onClose }: TeamSheetProps) {
  const [name, setName] = useState(initial.name);
  const [shortName, setShortName] = useState(initial.shortName);
  const [touchedShort, setTouchedShort] = useState(initial.shortName !== '');
  const [captainId, setCaptainId] = useState<string | null>(initial.captainId);
  const shown = touchedShort ? shortName : suggestShortName(name);
  const error = name.trim() === '' ? null : shortNameError(shown);
  const valid = name.trim().length > 0 && error === null;
  const ordered = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const submit = () => {
    if (valid && !busy) {
      onSubmit({ name: name.trim(), shortName: shown.trim().toUpperCase(), captainId });
    }
  };
  const chain = useFormChain(FIELDS, { onSubmit: submit });
  const dirty = name.trim() !== initial.name.trim() || (touchedShort && shortName.trim() !== initial.shortName.trim()) || captainId !== initial.captainId;
  const guard = useDiscardGuard(dirty, onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title={title}
        onClose={guard.requestClose}
        testID="sheet-team"
        footer={<Button label={submitLabel} size="lg" fullWidth disabled={!valid} loading={busy} onPress={submit} testID="team-submit" />}
      >
        <View style={styles.body}>
          <TextField {...chain.field('name')} label="Team name" value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false} testID="team-name" />
          <TextField
            {...chain.field('shortName')}
            label="Short name"
            value={shown}
            onChangeText={(text) => {
              setTouchedShort(true);
              setShortName(text.toUpperCase());
            }}
            autoCapitalize="characters"
            maxLength={SHORT_NAME_MAX}
            helper={SHORT_NAME_HELPER}
            error={error}
            testID="team-short-name"
          />
          {players.length > 0 ? (
            <View>
              <Text variant="subhead" tone="secondary" style={styles.caption}>
                Captain
              </Text>
              <RadioList
                accessibilityLabel="Captain"
                value={captainId ?? NO_CAPTAIN}
                onChange={(value) => setCaptainId(value === NO_CAPTAIN ? null : value)}
                choices={[
                  { value: NO_CAPTAIN, label: 'No captain', testID: 'team-captain-none' },
                  ...ordered.map((player) => ({
                    value: player.id,
                    label: player.name,
                    meta: player.jerseyNumber === null ? undefined : `#${player.jerseyNumber}`,
                    testID: `team-captain-${player.id}`,
                  })),
                ]}
              />
            </View>
          ) : null}
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  caption: { paddingBottom: space.xxs },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Player } from '@/domain/types';
import { Button, Sheet, Text, TextField, space } from '@/ui';
import { OptionButton } from '@/features/scoring/components/common/OptionButton';
import { shortNameError, suggestShortName } from '../selectors';

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

export function TeamSheet({ visible, title, initial, players = [], busy, submitLabel, onSubmit, onClose }: TeamSheetProps) {
  const [name, setName] = useState(initial.name);
  const [shortName, setShortName] = useState(initial.shortName);
  const [touchedShort, setTouchedShort] = useState(initial.shortName !== '');
  const [captainId, setCaptainId] = useState<string | null>(initial.captainId);
  const shown = touchedShort ? shortName : suggestShortName(name);
  const error = name.trim() === '' ? null : shortNameError(shown);
  const valid = name.trim().length > 0 && error === null;
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      testID="sheet-team"
      footer={
        <Button
          label={submitLabel}
          size="lg"
          fullWidth
          disabled={!valid}
          loading={busy}
          onPress={() => onSubmit({ name: name.trim(), shortName: shown.trim().toUpperCase(), captainId })}
          testID="team-submit"
        />
      }
    >
      <View style={styles.body}>
        <TextField label="Team name" value={name} onChangeText={setName} autoCapitalize="words" testID="team-name" />
        <TextField
          label="Short name"
          value={shown}
          onChangeText={(text) => {
            setTouchedShort(true);
            setShortName(text.toUpperCase());
          }}
          autoCapitalize="characters"
          maxLength={4}
          helper="2 to 4 letters, shown on the scoreboard"
          error={error}
          testID="team-short-name"
        />
        {players.length > 0 ? (
          <>
            <Text variant="subhead" tone="secondary">
              Captain
            </Text>
            <OptionButton label="No captain" compact selected={captainId === null} onPress={() => setCaptainId(null)} testID="team-captain-none" />
            {players.map((player) => (
              <OptionButton key={player.id} label={player.name} compact selected={captainId === player.id} onPress={() => setCaptainId(player.id)} testID={`team-captain-${player.id}`} />
            ))}
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

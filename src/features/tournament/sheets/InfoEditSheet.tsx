import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Tournament } from '@/domain/types';
import { trimmedOrNull } from '@/features/shared';
import type { TournamentInfoPatch } from '@/services/contracts';
import { Button, Sheet, TextField, space } from '@/ui';
import { infoErrors } from '../wizard/validation';

export interface InfoEditSheetProps {
  readonly tournament: Tournament;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (patch: TournamentInfoPatch) => void;
}

export function InfoEditSheet({ tournament, busy, onClose, onSubmit }: InfoEditSheetProps) {
  const [name, setName] = useState(tournament.name);
  const [season, setSeason] = useState(tournament.season ?? '');
  const [organizer, setOrganizer] = useState(tournament.organizer ?? '');
  const [startDate, setStartDate] = useState(tournament.startDate ?? '');
  const [endDate, setEndDate] = useState(tournament.endDate ?? '');
  const [description, setDescription] = useState(tournament.description ?? '');
  const errors = infoErrors({
    name,
    season: null,
    description: null,
    organizer: null,
    startDate: trimmedOrNull(startDate),
    endDate: trimmedOrNull(endDate),
    venueIds: [],
    structureKind: tournament.structureKind,
    templateId: null,
  });
  const valid = errors.name === null && errors.startDate === null && errors.endDate === null;
  return (
    <Sheet
      visible
      title="Tournament details"
      onClose={onClose}
      testID="sheet-info"
      footer={
        <Button
          label="Save"
          disabled={!valid}
          loading={busy}
          onPress={() =>
            onSubmit({
              name: name.trim(),
              season: trimmedOrNull(season),
              organizer: trimmedOrNull(organizer),
              startDate: trimmedOrNull(startDate),
              endDate: trimmedOrNull(endDate),
              description: trimmedOrNull(description),
            })
          }
          fullWidth
          testID="info-btn-save"
        />
      }
    >
      <View style={styles.body}>
        <TextField label="Name" value={name} onChangeText={setName} error={errors.name} testID="info-input-name" />
        <TextField label="Season (optional)" value={season} onChangeText={setSeason} testID="info-input-season" />
        <TextField label="Organizer (optional)" value={organizer} onChangeText={setOrganizer} testID="info-input-organizer" />
        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField label="Starts" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" error={errors.startDate} testID="info-input-start" />
          </View>
          <View style={styles.flex}>
            <TextField label="Ends" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" error={errors.endDate} testID="info-input-end" />
          </View>
        </View>
        <TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline testID="info-input-description" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  pair: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});

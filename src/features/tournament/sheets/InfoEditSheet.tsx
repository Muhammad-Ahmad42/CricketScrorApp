import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Tournament } from '@/domain/types';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { trimmedOrNull } from '@/features/shared';
import type { TournamentInfoPatch } from '@/services/contracts';
import { Button, DateField, Sheet, TextField, space, useFormChain } from '@/ui';
import { infoErrors } from '../wizard/validation';

export interface InfoEditSheetProps {
  readonly tournament: Tournament;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (patch: TournamentInfoPatch) => void;
}

type InfoEditField = 'name' | 'season' | 'organizer';

const FIELDS: readonly InfoEditField[] = ['name', 'season', 'organizer'];

export function InfoEditSheet({ tournament, busy, onClose, onSubmit }: InfoEditSheetProps) {
  const [name, setName] = useState(tournament.name);
  const [season, setSeason] = useState(tournament.season ?? '');
  const [organizer, setOrganizer] = useState(tournament.organizer ?? '');
  const [startDate, setStartDate] = useState<string | null>(tournament.startDate);
  const [endDate, setEndDate] = useState<string | null>(tournament.endDate);
  const [description, setDescription] = useState(tournament.description ?? '');
  const chain = useFormChain(FIELDS);
  const errors = infoErrors({
    name,
    season: null,
    description: null,
    organizer: null,
    startDate,
    endDate,
    venueIds: [],
    structureKind: tournament.structureKind,
    templateId: null,
  });
  const valid = errors.name === null && errors.startDate === null && errors.endDate === null;
  const dirty =
    name !== tournament.name ||
    season !== (tournament.season ?? '') ||
    organizer !== (tournament.organizer ?? '') ||
    startDate !== tournament.startDate ||
    endDate !== tournament.endDate ||
    description !== (tournament.description ?? '');
  const guard = useDiscardGuard(dirty, onClose);
  return (
    <>
      <Sheet
        visible={!guard.asking}
        title="Tournament details"
        onClose={guard.requestClose}
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
                startDate,
                endDate,
                description: trimmedOrNull(description),
              })
            }
            fullWidth
            testID="info-btn-save"
          />
        }
      >
        <View style={styles.body}>
          <TextField label="Name" value={name} onChangeText={setName} error={errors.name} autoCapitalize="words" {...chain.field('name')} testID="info-input-name" />
          <TextField label="Season (optional)" value={season} onChangeText={setSeason} {...chain.field('season')} testID="info-input-season" />
          <TextField label="Organizer (optional)" value={organizer} onChangeText={setOrganizer} autoCapitalize="words" {...chain.field('organizer')} testID="info-input-organizer" />
          <DateField label="Starts" value={startDate} onChange={setStartDate} optional error={errors.startDate} testID="info-input-start" />
          <DateField label="Ends" value={endDate} onChange={setEndDate} minimumDate={startDate} optional error={errors.endDate} testID="info-input-end" />
          <TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline testID="info-input-description" />
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});

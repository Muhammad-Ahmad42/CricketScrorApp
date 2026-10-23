import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Venue } from '@/domain/types';
import type { MatchDetailsPatch } from '@/services/contracts';
import { Button, DateField, RadioList, Sheet, Text, TextField, TimeField, space, useFormChain } from '@/ui';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';

export interface DetailsValues {
  readonly title: string;
  readonly venueId: string | null;
  readonly scheduledDate: string | null;
  readonly scheduledTime: string | null;
}

export interface DetailsSheetProps {
  readonly visible: boolean;
  readonly values: DetailsValues;
  readonly venues: readonly Venue[];
  readonly busy: boolean;
  readonly onSubmit: (patch: MatchDetailsPatch) => void;
  readonly onClose: () => void;
}

const NO_VENUE = '__none__';

export function DetailsSheet({ visible, values, venues, busy, onSubmit, onClose }: DetailsSheetProps) {
  const [title, setTitle] = useState(values.title);
  const [date, setDate] = useState<string | null>(values.scheduledDate);
  const [time, setTime] = useState<string | null>(values.scheduledTime);
  const [venueId, setVenueId] = useState<string | null>(values.venueId);
  const valid = title.trim().length > 0;
  const save = () => {
    if (valid) {
      onSubmit({ title: title.trim(), venueId, scheduledDate: date, scheduledTime: time });
    }
  };
  const chain = useFormChain(['title'] as const, { onSubmit: save });
  const dirty = title.trim() !== values.title.trim() || date !== values.scheduledDate || time !== values.scheduledTime || venueId !== values.venueId;
  const guard = useDiscardGuard(dirty, onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Match details"
        onClose={guard.requestClose}
        testID="sheet-details"
        footer={<Button label="Save details" size="lg" fullWidth disabled={!valid} loading={busy} onPress={save} testID="details-save" />}
      >
        <View style={styles.body}>
          <TextField {...chain.field('title')} label="Title" value={title} onChangeText={setTitle} autoCapitalize="sentences" testID="details-title" />
          <View style={styles.when}>
            <View style={styles.whenField}>
              <DateField label="Date" value={date} optional onChange={setDate} testID="details-date" />
            </View>
            <View style={styles.whenField}>
              <TimeField label="Start time" value={time} optional onChange={setTime} testID="details-time" />
            </View>
          </View>
          <Text variant="subhead" tone="secondary">
            Venue
          </Text>
          <RadioList
            accessibilityLabel="Venue"
            value={venueId ?? NO_VENUE}
            onChange={(value) => setVenueId(value === NO_VENUE ? null : value)}
            choices={[
              { value: NO_VENUE, label: 'No venue', testID: 'details-venue-none' },
              ...venues.map((venue) => ({ value: venue.id, label: venue.name, description: venue.location ?? undefined, testID: `details-venue-${venue.id}` })),
            ]}
          />
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  when: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  whenField: { flexGrow: 1, flexBasis: 160, minWidth: 0 },
});

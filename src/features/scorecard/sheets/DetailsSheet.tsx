import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Venue } from '@/domain/types';
import type { MatchDetailsPatch } from '@/services/contracts';
import { Button, Sheet, Text, TextField, space } from '@/ui';
import { OptionButton } from '@/features/scoring/components/common/OptionButton';

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function dateError(text: string): string | null {
  return text.trim() === '' || DATE.test(text.trim()) ? null : 'Use the form 2026-09-12';
}

export function timeError(text: string): string | null {
  return text.trim() === '' || TIME.test(text.trim()) ? null : 'Use the 24-hour form 14:30';
}

export function DetailsSheet({ visible, values, venues, busy, onSubmit, onClose }: DetailsSheetProps) {
  const [title, setTitle] = useState(values.title);
  const [date, setDate] = useState(values.scheduledDate ?? '');
  const [time, setTime] = useState(values.scheduledTime ?? '');
  const [venueId, setVenueId] = useState<string | null>(values.venueId);
  const errors = { date: dateError(date), time: timeError(time) };
  const valid = title.trim().length > 0 && errors.date === null && errors.time === null;
  return (
    <Sheet
      visible={visible}
      title="Match details"
      onClose={onClose}
      testID="sheet-details"
      footer={
        <Button
          label="Save details"
          size="lg"
          fullWidth
          disabled={!valid}
          loading={busy}
          onPress={() =>
            onSubmit({
              title: title.trim(),
              venueId,
              scheduledDate: date.trim() === '' ? null : date.trim(),
              scheduledTime: time.trim() === '' ? null : time.trim(),
            })
          }
          testID="details-save"
        />
      }
    >
      <View style={styles.body}>
        <TextField label="Title" value={title} onChangeText={setTitle} testID="details-title" />
        <TextField label="Date (optional)" value={date} onChangeText={setDate} placeholder="2026-09-12" error={errors.date} testID="details-date" />
        <TextField label="Time (optional)" value={time} onChangeText={setTime} placeholder="14:30" error={errors.time} testID="details-time" />
        <Text variant="subhead" tone="secondary">
          Venue
        </Text>
        <OptionButton label="No venue" compact selected={venueId === null} onPress={() => setVenueId(null)} testID="details-venue-none" />
        {venues.map((venue) => (
          <OptionButton
            key={venue.id}
            label={venue.name}
            detail={venue.location}
            compact
            selected={venueId === venue.id}
            onPress={() => setVenueId(venue.id)}
            testID={`details-venue-${venue.id}`}
          />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

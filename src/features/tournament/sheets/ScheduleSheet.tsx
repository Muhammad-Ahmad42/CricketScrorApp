import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Venue } from '@/domain/types';
import { ChoiceList, ReasonField, reasonReady, trimmedOrNull } from '@/features/shared';
import { Button, Sheet, TextField, space } from '@/ui';
import { isValidIsoDate, isValidLocalTime } from '../selectors/dates';

export interface ScheduleValues {
  readonly scheduledDate: string | null;
  readonly scheduledTime: string | null;
  readonly venueId: string | null;
  readonly notes: string | null;
  readonly label: string | null;
}

export interface ScheduleSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly initial: ScheduleValues;
  readonly venues: readonly Venue[];
  readonly confirmLabel: string;
  readonly showDetails?: boolean;
  readonly requireDate?: boolean;
  readonly reason?: 'none' | 'optional' | 'required';
  readonly busy?: boolean;
  readonly extra?: ReactNode;
  readonly onClose: () => void;
  readonly onSubmit: (values: ScheduleValues, reason: string | null) => void;
}

const NO_VENUE = '__none__';

export function scheduleErrors(date: string, time: string, requireDate: boolean): { readonly date: string | null; readonly time: string | null } {
  const dateText = date.trim();
  const timeText = time.trim();
  return {
    date: dateText.length === 0 ? (requireDate ? 'Choose the new date.' : null) : isValidIsoDate(dateText) ? null : 'Use the format YYYY-MM-DD, for example 2026-09-14.',
    time: timeText.length === 0 || isValidLocalTime(timeText) ? null : 'Use 24-hour time, for example 14:30.',
  };
}

export function ScheduleSheet({
  visible,
  title,
  initial,
  venues,
  confirmLabel,
  showDetails = true,
  requireDate = false,
  reason = 'none',
  busy = false,
  extra,
  onClose,
  onSubmit,
}: ScheduleSheetProps) {
  const [date, setDate] = useState(initial.scheduledDate ?? '');
  const [time, setTime] = useState(initial.scheduledTime ?? '');
  const [venueId, setVenueId] = useState(initial.venueId ?? NO_VENUE);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [label, setLabel] = useState(initial.label ?? '');
  const [reasonText, setReasonText] = useState('');
  const errors = scheduleErrors(date, time, requireDate);
  const valid = errors.date === null && errors.time === null && (reason !== 'required' || reasonReady(reasonText));
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      testID="sheet-schedule"
      footer={
        <Button
          label={confirmLabel}
          disabled={!valid}
          loading={busy}
          fullWidth
          onPress={() =>
            onSubmit(
              {
                scheduledDate: trimmedOrNull(date),
                scheduledTime: trimmedOrNull(time),
                venueId: venueId === NO_VENUE ? null : venueId,
                notes: trimmedOrNull(notes),
                label: trimmedOrNull(label),
              },
              trimmedOrNull(reasonText),
            )
          }
          testID="schedule-btn-save"
        />
      }
    >
      <View style={styles.body}>
        {extra}
        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={errors.date} autoCapitalize="none" testID="schedule-input-date" />
          </View>
          <View style={styles.flex}>
            <TextField label="Time" value={time} onChangeText={setTime} placeholder="HH:MM" error={errors.time} autoCapitalize="none" testID="schedule-input-time" />
          </View>
        </View>
        {showDetails ? (
          <>
            <ChoiceList
              choices={[{ value: NO_VENUE, label: 'No venue', testID: 'schedule-chip-venue-none' }, ...venues.map((venue) => ({ value: venue.id, label: venue.name, description: venue.location ?? undefined }))]}
              value={venueId}
              onChange={setVenueId}
              accessibilityLabel="Venue"
            />
            <TextField label="Label (optional)" value={label} onChangeText={setLabel} placeholder="e.g. Eliminator" testID="schedule-input-label" />
            <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline testID="schedule-input-notes" />
          </>
        ) : null}
        {reason !== 'none' ? <ReasonField required={reason === 'required'} value={reasonText} onChange={setReasonText} testID="schedule-input-reason" /> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  pair: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});

import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Venue } from '@/domain/types';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { ReasonField, reasonReady, trimmedOrNull } from '@/features/shared';
import { Button, DateField, RadioList, Sheet, Text, TextField, TimeField, space, useFormChain } from '@/ui';
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
  readonly subtitle?: string;
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

const DETAIL_FIELDS = ['label', 'notes'] as const;

export function scheduleErrors(date: string, time: string, requireDate: boolean): { readonly date: string | null; readonly time: string | null } {
  const dateText = date.trim();
  const timeText = time.trim();
  return {
    date: dateText.length === 0 ? (requireDate ? 'Choose the new date.' : null) : isValidIsoDate(dateText) ? null : 'Choose a valid date.',
    time: timeText.length === 0 || isValidLocalTime(timeText) ? null : 'Choose a valid time.',
  };
}

export function ScheduleSheet({
  visible,
  title,
  subtitle,
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
  const chain = useFormChain(DETAIL_FIELDS);
  const errors = scheduleErrors(date, time, requireDate);
  const valid = errors.date === null && errors.time === null && (reason !== 'required' || reasonReady(reasonText));
  const dirty =
    date !== (initial.scheduledDate ?? '') ||
    time !== (initial.scheduledTime ?? '') ||
    venueId !== (initial.venueId ?? NO_VENUE) ||
    notes !== (initial.notes ?? '') ||
    label !== (initial.label ?? '') ||
    reasonText.trim() !== '';
  const guard = useDiscardGuard(dirty, onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title={title}
        subtitle={subtitle}
        onClose={guard.requestClose}
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
          <DateField label="Date" value={date || null} onChange={(next) => setDate(next ?? '')} optional={!requireDate} error={errors.date} testID="schedule-input-date" />
          <TimeField label="Time" value={time || null} onChange={(next) => setTime(next ?? '')} optional minuteInterval={5} error={errors.time} testID="schedule-input-time" />
          {showDetails ? (
            <>
              {venues.length > 0 ? (
                <View style={styles.group}>
                  <Text variant="label" tone="secondary" accessibilityRole="header">
                    Venue
                  </Text>
                  <RadioList
                    choices={[
                      { value: NO_VENUE, label: 'No venue', testID: 'schedule-chip-venue-none' },
                      ...venues.map((venue) => ({ value: venue.id, label: venue.name, description: venue.location ?? undefined })),
                    ]}
                    value={venueId}
                    onChange={setVenueId}
                    accessibilityLabel="Venue"
                  />
                </View>
              ) : null}
              <TextField label="Label (optional)" value={label} onChangeText={setLabel} placeholder="e.g. Eliminator" {...chain.field('label')} testID="schedule-input-label" />
              <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline ref={chain.field('notes').ref} testID="schedule-input-notes" />
            </>
          ) : null}
          {reason !== 'none' ? <ReasonField required={reason === 'required'} value={reasonText} onChange={setReasonText} testID="schedule-input-reason" /> : null}
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  group: { gap: space.xs },
});

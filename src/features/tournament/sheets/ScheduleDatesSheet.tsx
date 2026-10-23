import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { Button, DateField, IconButton, Sheet, Stepper, Text, TimeField, space } from '@/ui';
import { isValidIsoDate } from '../selectors/dates';

export interface ScheduleDatesSheetProps {
  readonly visible: boolean;
  readonly initialStart: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (value: { readonly startDate: string; readonly matchesPerDay: number; readonly times: readonly string[] }) => void;
}

export const DEFAULT_START_TIMES: readonly string[] = ['10:00', '14:00'];
const MAX_TIMES = 6;
const DEFAULT_PER_DAY = 2;

export function nextStartTime(times: readonly string[]): string {
  const last = times[times.length - 1];
  if (last === undefined) {
    return DEFAULT_START_TIMES[0];
  }
  const hours = Math.min(23, Number(last.slice(0, 2)) + 4);
  return `${String(hours).padStart(2, '0')}:${last.slice(3, 5)}`;
}

export function ScheduleDatesSheet({ visible, initialStart, onClose, onSubmit }: ScheduleDatesSheetProps) {
  const [start, setStart] = useState<string | null>(initialStart);
  const [perDay, setPerDay] = useState(DEFAULT_PER_DAY);
  const [times, setTimes] = useState<readonly string[]>(DEFAULT_START_TIMES);
  const startValid = start !== null && isValidIsoDate(start);
  const ordered = [...new Set(times)].sort();
  const dirty = start !== initialStart || perDay !== DEFAULT_PER_DAY || times.join(',') !== DEFAULT_START_TIMES.join(',');
  const guard = useDiscardGuard(dirty, onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Schedule dates"
        onClose={guard.requestClose}
        testID="sheet-schedule-dates"
        footer={
          <Button
            label="Fill dates"
            disabled={!startValid || ordered.length === 0}
            onPress={() => {
              if (start !== null) {
                onSubmit({ startDate: start, matchesPerDay: perDay, times: ordered });
              }
            }}
            fullWidth
            testID="twiz-btn-fill-dates"
          />
        }
      >
        <View style={styles.body}>
          <DateField label="First match day" value={start} onChange={setStart} testID="twiz-input-schedule-start" />
          <Stepper label="Matches a day" value={perDay} onChange={setPerDay} min={1} max={12} testID="twiz-input-per-day" />
          <View style={styles.group}>
            <Text variant="label" tone="secondary" accessibilityRole="header">
              Start times
            </Text>
            {times.map((time, position) => (
              <View key={`${position}`} style={styles.timeLine}>
                <View style={styles.flex}>
                  <TimeField
                    label={`Start time ${position + 1}`}
                    hideLabel
                    value={time}
                    onChange={(next) => {
                      if (next !== null) {
                        setTimes(times.map((entry, index) => (index === position ? next : entry)));
                      }
                    }}
                    minuteInterval={5}
                    testID={`twiz-input-time-${position + 1}`}
                  />
                </View>
                <IconButton
                  icon="x"
                  accessibilityLabel={`Remove ${time}`}
                  disabled={times.length <= 1}
                  onPress={() => setTimes(times.filter((_, index) => index !== position))}
                  testID={`twiz-btn-remove-time-${position + 1}`}
                />
              </View>
            ))}
            {times.length < MAX_TIMES ? (
              <View style={styles.start}>
                <Button label="Add time" icon="plus" variant="tertiary" size="sm" onPress={() => setTimes([...times, nextStartTime(times)])} testID="twiz-btn-add-time" />
              </View>
            ) : null}
          </View>
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  group: { gap: space.xs },
  timeLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
  start: { alignSelf: 'flex-start' },
});

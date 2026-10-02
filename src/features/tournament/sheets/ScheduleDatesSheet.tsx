import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet, Stepper, Text, TextField, space } from '@/ui';
import { isValidIsoDate } from '../selectors/dates';
import { parseTimes } from '../selectors/planPreview';

export interface ScheduleDatesSheetProps {
  readonly visible: boolean;
  readonly initialStart: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (value: { readonly startDate: string; readonly matchesPerDay: number; readonly times: readonly string[] }) => void;
}

export function ScheduleDatesSheet({ visible, initialStart, onClose, onSubmit }: ScheduleDatesSheetProps) {
  const [start, setStart] = useState(initialStart ?? '');
  const [perDay, setPerDay] = useState(2);
  const [timesText, setTimesText] = useState('10:00, 14:00');
  const times = parseTimes(timesText);
  const startValid = isValidIsoDate(start.trim());
  return (
    <Sheet
      visible={visible}
      title="Schedule dates"
      subtitle="Dates are filled in order without double-booking a team on a day."
      onClose={onClose}
      testID="sheet-schedule-dates"
      footer={
        <Button
          label="Fill dates"
          disabled={!startValid || times === null}
          onPress={() => {
            if (times) {
              onSubmit({ startDate: start.trim(), matchesPerDay: perDay, times });
            }
          }}
          fullWidth
          testID="twiz-btn-fill-dates"
        />
      }
    >
      <View style={styles.body}>
        <TextField
          label="First match day"
          value={start}
          onChangeText={setStart}
          placeholder="YYYY-MM-DD"
          error={start.length > 0 && !startValid ? 'Use the format YYYY-MM-DD.' : null}
          autoCapitalize="none"
          testID="twiz-input-schedule-start"
        />
        <Stepper label="Matches a day" value={perDay} onChange={setPerDay} min={1} max={12} testID="twiz-input-per-day" />
        <TextField
          label="Start times"
          value={timesText}
          onChangeText={setTimesText}
          helper="Separate times with commas, for example 10:00, 14:00."
          error={times === null ? 'Use 24-hour times such as 10:00.' : null}
          autoCapitalize="none"
          testID="twiz-input-times"
        />
        <Text variant="footnote" tone="secondary">
          You can still change any single match afterwards.
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});

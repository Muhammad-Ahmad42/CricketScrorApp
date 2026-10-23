import '../../testing';
import { useState } from 'react';
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { renderWithTheme, withPlatform } from '../../testing';
import { lightColors } from '../../theme';
import {
  DATE_PLACEHOLDER,
  DateField,
  TIME_PLACEHOLDER,
  TimeField,
  clampDate,
  formatDayLabel,
  formatTimeLabel,
  isoDateToLocal,
  localToIsoDate,
  localToTime,
  parseIsoDate,
  parseLocalTime,
  pickerFieldLabel,
  spokenDayLabel,
  timeToLocal,
} from '..';

const NOW = new Date(2026, 9, 5, 9, 0);

describe('date and time helpers', () => {
  it('parses only real calendar dates and 24 h times', () => {
    expect(parseIsoDate('2026-10-02')).toEqual({ year: 2026, month: 9, day: 2 });
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('02/10/2026')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseLocalTime('14:30')).toEqual({ hours: 14, minutes: 30 });
    expect(parseLocalTime('24:00')).toBeNull();
    expect(parseLocalTime('9:30')).toBeNull();
  });

  it('formats "Fri 2 Oct" in the current year, adds the year otherwise, and speaks the full date', () => {
    expect(formatDayLabel('2026-10-02', NOW)).toBe('Fri 2 Oct');
    expect(formatDayLabel('2027-01-15', NOW)).toBe('Fri 15 Jan 2027');
    expect(formatDayLabel('nope', NOW)).toBeNull();
    expect(spokenDayLabel('2026-10-02')).toBe('Friday 2 October 2026');
    expect(formatTimeLabel('14:30')).toBe('14:30');
    expect(formatTimeLabel('07:05')).toBe('07:05');
  });

  it('round-trips local dates and times without a time-zone shift', () => {
    const date = isoDateToLocal('2026-12-31');
    expect(date).not.toBeNull();
    expect(localToIsoDate(date as Date)).toBe('2026-12-31');
    expect(localToTime(new Date(2026, 0, 1, 18, 5))).toBe('18:05');
    const time = timeToLocal('06:45', NOW);
    expect(time?.getHours()).toBe(6);
    expect(time?.getMinutes()).toBe(45);
    const low = new Date(2026, 0, 10);
    const high = new Date(2026, 0, 20);
    expect(clampDate(new Date(2026, 0, 1), low, high)).toBe(low);
    expect(clampDate(new Date(2026, 0, 30), low, high)).toBe(high);
    expect(pickerFieldLabel('Starts', null, null)).toBe('Starts, not set');
    expect(pickerFieldLabel('Starts', 'Friday 2 October 2026', 'Must be after today')).toBe('Starts, Friday 2 October 2026, Must be after today');
  });
});

function DateHarness({ optional = false, initial = null }: { readonly optional?: boolean; readonly initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return <DateField label="Starts" value={value} onChange={setValue} optional={optional} minimumDate="2026-01-01" testID="starts" />;
}

describe('DateField', () => {
  it('reads as a labelled button that shows the friendly date, never an ISO text box', async () => {
    await renderWithTheme(<DateHarness initial="2026-10-02" />);
    const field = screen.getByRole('button', { name: 'Starts, Friday 2 October 2026' });
    expect(field.props.accessibilityHint).toBe('Opens a date picker');
    expect(screen.getByTestId('starts-value')).toHaveTextContent(formatDayLabel('2026-10-02') ?? '');
    expect(screen.queryByDisplayValue('2026-10-02')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear Starts' })).toBeNull();
  });

  it('shows a muted placeholder when empty', async () => {
    await renderWithTheme(<DateHarness />);
    expect(screen.getByRole('button', { name: 'Starts, not set' })).toBeTruthy();
    expect(screen.getByText(DATE_PLACEHOLDER)).toHaveStyle({ color: lightColors.textMuted });
  });

  it('on iOS opens the inline calendar in a sheet and commits as the user picks', async () => {
    const user = userEvent.setup();
    await withPlatform('ios', async () => {
      await renderWithTheme(<DateHarness initial="2026-10-02" />);
      await user.press(screen.getByRole('button', { name: /^Starts/ }));
      const picker = screen.getByTestId('starts-sheet-picker');
      expect(picker.props.displayIOS).toBe('inline');
      await act(async () => {
        fireEvent(picker, 'change', { nativeEvent: { timestamp: new Date(2026, 9, 9, 12).getTime() } });
      });
      expect(screen.getByRole('button', { name: 'Starts, Friday 9 October 2026' })).toBeTruthy();
      await user.press(screen.getByTestId('starts-sheet-done'));
      expect(screen.getByTestId('starts-value')).toHaveTextContent(formatDayLabel('2026-10-09') ?? '');
    });
  });

  it('on iOS commits the shown date when Done is pressed on an empty field', async () => {
    const user = userEvent.setup();
    await withPlatform('ios', async () => {
      await renderWithTheme(<DateHarness />);
      await user.press(screen.getByRole('button', { name: 'Starts, not set' }));
      await user.press(screen.getByTestId('starts-sheet-done'));
      expect(screen.queryByText(DATE_PLACEHOLDER)).toBeNull();
    });
  });

  it('on Android opens the system date dialog and keeps the value when it is dismissed', async () => {
    const open = jest.spyOn(DateTimePickerAndroid, 'open').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await withPlatform('android', async () => {
      await renderWithTheme(<DateHarness initial="2026-10-02" />);
      await user.press(screen.getByRole('button', { name: /^Starts/ }));
      expect(open).toHaveBeenCalledTimes(1);
      const options = open.mock.calls[0][0];
      expect(options.mode).toBe('date');
      expect(localToIsoDate(options.value)).toBe('2026-10-02');
      expect(localToIsoDate(options.minimumDate as Date)).toBe('2026-01-01');
      expect(screen.queryByTestId('starts-sheet')).toBeNull();
      await act(async () => {
        options.onValueChange?.({ nativeEvent: { timestamp: 0, utcOffset: 0 } }, new Date(2026, 10, 1, 12));
      });
      expect(screen.getByRole('button', { name: 'Starts, Sunday 1 November 2026' })).toBeTruthy();
    });
    open.mockRestore();
  });

  it('can be cleared when optional', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<DateHarness optional initial="2026-10-02" />);
    await user.press(screen.getByRole('button', { name: 'Clear Starts' }));
    expect(screen.getByRole('button', { name: 'Starts, not set' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear Starts' })).toBeNull();
  });

  it('shows an error with an icon and folds it into the spoken label', async () => {
    await renderWithTheme(<DateField label="Ends" value="2026-10-01" onChange={jest.fn()} error="Ends before it starts" testID="ends" />);
    expect(screen.getByRole('button', { name: 'Ends, Thursday 1 October 2026, Ends before it starts' })).toBeTruthy();
    expect(screen.getByText('Ends before it starts', { includeHiddenElements: true })).toHaveStyle({ color: lightColors.danger });
    expect(screen.getByTestId('lucide-circle-alert', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Ends before it starts')).toBeNull();
  });
});

describe('TimeField', () => {
  function TimeHarness() {
    const [value, setValue] = useState<string | null>('14:30');
    return <TimeField label="Start time" value={value} onChange={setValue} optional minuteInterval={5} testID="time" />;
  }

  it('shows 24 h local time and uses the spinner on iOS', async () => {
    const user = userEvent.setup();
    await withPlatform('ios', async () => {
      await renderWithTheme(<TimeHarness />);
      expect(screen.getByRole('button', { name: 'Start time, 14:30' })).toBeTruthy();
      await user.press(screen.getByRole('button', { name: 'Start time, 14:30' }));
      const picker = screen.getByTestId('time-sheet-picker');
      expect(picker.props.displayIOS).toBe('spinner');
      expect(picker.props.mode).toBe('time');
      await act(async () => {
        fireEvent(picker, 'change', { nativeEvent: { timestamp: new Date(2026, 9, 5, 18, 5).getTime() } });
      });
      expect(screen.getByRole('button', { name: 'Start time, 18:05' })).toBeTruthy();
      await user.press(screen.getByTestId('time-sheet-clear'));
      expect(screen.getByText(TIME_PLACEHOLDER)).toBeTruthy();
    });
  });

  it('asks Android for a 24 h clock dialog', async () => {
    const open = jest.spyOn(DateTimePickerAndroid, 'open').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await withPlatform('android', async () => {
      await renderWithTheme(<TimeHarness />);
      await user.press(screen.getByRole('button', { name: 'Start time, 14:30' }));
      const options = open.mock.calls[0][0];
      expect(options).toMatchObject({ mode: 'time', is24Hour: true, minuteInterval: 5 });
      expect(localToTime(options.value)).toBe('14:30');
    });
    open.mockRestore();
  });
});

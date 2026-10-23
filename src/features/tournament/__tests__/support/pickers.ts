import { act, fireEvent, screen } from '@testing-library/react-native';

async function choose(testID: string, when: Date): Promise<void> {
  await fireEvent.press(screen.getByTestId(testID));
  await act(async () => {
    fireEvent(screen.getByTestId(`${testID}-sheet-picker`), 'change', { nativeEvent: { timestamp: when.getTime() } });
  });
  await fireEvent.press(screen.getByTestId(`${testID}-sheet-done`));
}

export async function pickDate(testID: string, isoDate: string): Promise<void> {
  const [year, month, day] = isoDate.split('-').map(Number);
  await choose(testID, new Date(year, month - 1, day, 12));
}

export async function pickTime(testID: string, time: string): Promise<void> {
  const [hours, minutes] = time.split(':').map(Number);
  await choose(testID, new Date(2026, 0, 1, hours, minutes));
}

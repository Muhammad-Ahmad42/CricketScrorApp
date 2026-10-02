import '@/ui/testing';
import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import { PresetsScreen } from '../screens/PresetsScreen';
import { resetFakeStores, useFakeSettingsStore } from './support/fakeStores';
import { mockRouter, resetRouter } from './support/router';

jest.mock('@/stores', () => jest.requireActual('./support/fakeStores').fakeStoresModule);
jest.mock('expo-router', () => jest.requireActual('./support/router').routerModule);

beforeEach(() => {
  resetFakeStores();
  resetRouter();
});

describe('PresetsScreen (W-X2, §8)', () => {
  it('lists the built-in presets with their rules in one line and marks the default', async () => {
    await renderWithTheme(<PresetsScreen />);
    expect(screen.getByTestId('screen-presets')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Built-in' })).toBeOnTheScreen();
    for (const id of ['t5', 't10', 't20', 't30', 't40', 't50']) {
      expect(screen.getByTestId(`presets-row-${id}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('presets-row-t20')).toHaveAccessibleName('T20, 20 overs · 11 a side · powerplay 1–6, Default');
    expect(screen.getByTestId('presets-row-t50')).toHaveAccessibleName('T50, 50 overs · 11 a side · 3 powerplays');
    expect(screen.getByTestId('presets-text-note')).toHaveTextContent('Changing a preset never changes past matches.');
    expect(screen.getByTestId('presets-text-user-unavailable')).toBeOnTheScreen();
  });

  it('opens a built-in read-only and makes it the default for new matches', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PresetsScreen />);
    await user.press(screen.getByTestId('presets-row-t10'));
    const sheet = screen.getByTestId('sheet-preset');
    expect(within(sheet).getByText('10 overs a side · Built-in, read-only')).toBeOnTheScreen();
    expect(within(sheet).getByLabelText('Overs per innings, 10')).toBeOnTheScreen();
    expect(within(sheet).getByLabelText('No-balls, 1 run penalty, bowled again, free hit')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /duplicate|edit|delete/i })).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('presets-btn-make-default'));
    expect(useFakeSettingsStore.getState().update).toHaveBeenCalledWith({ defaultFormatId: 'T10' });
    await waitFor(() => expect(screen.getByTestId('presets-badge-default')).toBeOnTheScreen());
    expect(screen.queryByTestId('presets-btn-make-default')).not.toBeOnTheScreen();
    expect(screen.getByTestId('presets-row-t10')).toHaveAccessibleName(/, Default$/);
  });

  it('shows the default badge instead of the button for the current default', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PresetsScreen />);
    await user.press(screen.getByTestId('presets-row-t20'));
    expect(screen.getByTestId('presets-badge-default')).toBeOnTheScreen();
    expect(screen.queryByTestId('presets-btn-make-default')).not.toBeOnTheScreen();
  });

  it('closes the preset sheet', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PresetsScreen />);
    await user.press(screen.getByTestId('presets-row-t5'));
    await user.press(screen.getByTestId('sheet-preset-btn-close'));
    await waitFor(() => expect(screen.queryByTestId('sheet-preset')).not.toBeOnTheScreen());
  });

  it('goes back with the header button', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PresetsScreen />);
    await user.press(screen.getByTestId('nav-btn-back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

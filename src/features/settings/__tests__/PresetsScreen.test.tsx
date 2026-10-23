import '@/ui/testing';
import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import { PresetsScreen } from '../screens/PresetsScreen';
import { resetFakeStores, useFakeSettingsStore } from './support/fakeStores';
import { mockRouter, resetRouter } from './support/router';
import { rowSeparatorCount } from './support/separators';

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
    expect(screen.getByTestId('screen-presets-ambient', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Built-in' })).toBeOnTheScreen();
    for (const id of ['t5', 't10', 't20', 't30', 't40', 't50']) {
      expect(screen.getByTestId(`presets-row-${id}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('presets-row-t20')).toHaveAccessibleName('T20, 20 overs · 11 a side · powerplay 1–6, Default');
    expect(screen.getByTestId('presets-row-t50')).toHaveAccessibleName('T50, 50 overs · 11 a side · 3 powerplays');
  });

  it('shows the list without an intro, an empty "Yours" section or a footnote (CLEANUP_BRIEF)', async () => {
    await renderWithTheme(<PresetsScreen />);
    expect(screen.queryByTestId('presets-text-intro')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('presets-text-note')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('presets-text-user-unavailable')).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Yours' })).not.toBeOnTheScreen();
  });

  it('keeps the chevron on the default preset, after its badge, so every row reads as tappable', async () => {
    await renderWithTheme(<PresetsScreen />);
    for (const id of ['t5', 't10', 't20', 't30', 't40', 't50']) {
      expect(within(screen.getByTestId(`presets-row-${id}`)).getByTestId('lucide-chevron-right', { includeHiddenElements: true })).toBeOnTheScreen();
    }
    expect(within(screen.getByTestId('presets-row-t20')).getByText('Default', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(within(screen.getByTestId('presets-row-t10')).queryByText('Default', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });

  it('opens a built-in read-only and makes it the default for new matches', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PresetsScreen />);
    await user.press(screen.getByTestId('presets-row-t10'));
    const sheet = screen.getByTestId('sheet-preset');
    expect(within(sheet).getByRole('header', { name: 'T10' })).toBeOnTheScreen();
    expect(within(sheet).queryByText(/read-only|Presets only fill/)).not.toBeOnTheScreen();
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

  it('rules the presets apart without a hairline under the last one', async () => {
    await renderWithTheme(<PresetsScreen />);
    expect(rowSeparatorCount()).toBe(5);
  });

  it('labels the make-default action in three words and marks the current default with the same badge as the list', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PresetsScreen />);
    await user.press(screen.getByTestId('presets-row-t10'));
    expect(screen.getByTestId('presets-btn-make-default')).toHaveAccessibleName('Set as default');
    await user.press(screen.getByTestId('presets-btn-make-default'));
    await waitFor(() => expect(screen.getByTestId('presets-badge-default')).toHaveTextContent('Default'));
  });
});

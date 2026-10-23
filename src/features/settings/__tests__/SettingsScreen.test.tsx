import '@/ui/testing';
import { AccessibilityInfo } from 'react-native';
import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { AppSettings } from '@/domain/types';
import type { Toast } from '@/stores';
import { createTheme, switchColors } from '@/ui';
import { renderWithTheme, touchTargetSize } from '@/ui/testing';
import { SettingsScreen } from '../screens/SettingsScreen';
import { appSettings } from './support/fixtures';
import { resetFakeStores, useFakeSettingsStore, useFakeToastStore } from './support/fakeStores';
import { mockRouter, resetRouter } from './support/router';
import { rowSeparatorCount } from './support/separators';

jest.mock('@/stores', () => jest.requireActual('./support/fakeStores').fakeStoresModule);
jest.mock('expo-router', () => jest.requireActual('./support/router').routerModule);
jest.mock('../platform/appInfo', () => ({ readAppInfo: () => ({ version: '1.0.0', platform: 'android 35' }) }));

const SCORING = appSettings().scoring;

interface HostNode {
  readonly type: unknown;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children?: readonly unknown[];
}

function switchIn(node: unknown): HostNode | null {
  if (!node || typeof node !== 'object') {
    return null;
  }
  const host = node as HostNode;
  if (host.type === 'RCTSwitch') {
    return host;
  }
  for (const child of host.children ?? []) {
    const found = switchIn(child);
    if (found) {
      return found;
    }
  }
  return null;
}

function textsIn(node: { readonly children: readonly unknown[]; readonly type: unknown; readonly props: Readonly<Record<string, unknown>> }): string[] {
  const out: string[] = [];
  const visit = (current: unknown) => {
    if (typeof current === 'string') {
      out.push(current);
      return;
    }
    if (!current || typeof current !== 'object') {
      return;
    }
    for (const child of (current as { readonly children?: readonly unknown[] }).children ?? []) {
      visit(child);
    }
  };
  visit(node);
  return out.map((line) => line.trim()).filter((line) => line.length > 0);
}

beforeEach(() => {
  resetFakeStores();
  resetRouter();
});

function settings(): AppSettings {
  return useFakeSettingsStore.getState().settings;
}

describe('SettingsScreen (W-G1, §5, §70, §76–§78)', () => {
  it('shows every group with the stored values', async () => {
    await renderWithTheme(<SettingsScreen />);
    expect(screen.getByTestId('screen-settings')).toBeOnTheScreen();
    for (const title of ['Appearance', 'Scoring', 'Feedback', 'Library', 'Data', 'About']) {
      expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    }
    expect(screen.getByTestId('settings-chip-theme-system')).toBeSelected();
    expect(screen.getByTestId('settings-chip-theme-dark')).not.toBeSelected();
    expect(screen.getByTestId('settings-chip-motion-system')).toBeSelected();
    expect(screen.getByTestId('settings-chip-dot-zero')).toBeSelected();
    expect(screen.getByTestId('settings-chip-pad-right')).toBeSelected();
    expect(screen.getByTestId('settings-toggle-haptics')).toBeChecked();
    expect(screen.getByTestId('settings-toggle-bowler-prompt')).toBeChecked();
    expect(screen.getByTestId('settings-toggle-confirm-innings')).not.toBeChecked();
    expect(screen.getByTestId('settings-toggle-keep-awake')).toBeChecked();
    expect(screen.getByTestId('settings-toggle-transparency')).not.toBeChecked();
    expect(screen.getByText('Use solid backgrounds instead of glass effects.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Default format, T20' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'About & privacy, version 1.0.0' })).toBeOnTheScreen();
    expect(within(screen.getByTestId('settings-btn-about')).getByText('1.0.0')).toBeOnTheScreen();
  });

  it('keeps settings to a title and a control, with one short helper only where it is needed (CLEANUP_BRIEF)', async () => {
    await renderWithTheme(<SettingsScreen />);
    const shown = textsIn(screen.getByTestId('screen-settings-scroll'));
    expect(shown).toEqual(
      expect.arrayContaining(['Theme', 'Reduce transparency', 'Default format', 'Show dot balls as', 'Scoring pad layout', 'Ask for next bowler', 'Confirm innings end', 'Keep screen awake', 'Vibration', 'Reduce motion']),
    );
    for (const line of shown) {
      expect(line.length).toBeLessThanOrEqual(60);
      expect(line).not.toMatch(/tab bar|frosted|rendered|component|System follows|WICKET key|Light for runs|Short local sounds|Save your data|Your data stays/);
    }
    const helpers = shown.filter((line) => line.split(' ').length > 4);
    expect(helpers).toEqual(['Use solid backgrounds instead of glass effects.']);
  });

  it('rules rows apart inside a section but never under its last row (DESIGN_SYSTEM separators)', async () => {
    await renderWithTheme(<SettingsScreen />);
    expect(rowSeparatorCount()).toBe(9);
  });

  it('scrolls beneath a glass status bar with a compact title and explains reduce transparency (§106)', async () => {
    await renderWithTheme(<SettingsScreen />);
    expect(screen.getByTestId('screen-settings-scroll')).toBeOnTheScreen();
    expect(screen.getByTestId('screen-settings-ambient', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
    expect(screen.queryByTestId('settings-text-transparency-note')).not.toBeOnTheScreen();
  });

  it("shows Reduce transparency on and locked while the phone's setting is on, keeping the stored value (§106)", async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    try {
      const user = userEvent.setup();
      await renderWithTheme(<SettingsScreen />);
      await waitFor(() => expect(screen.getByTestId('settings-toggle-transparency')).toBeChecked());
      const row = screen.getByTestId('settings-toggle-transparency');
      expect(row).toBeDisabled();
      expect(within(row).getByText("On in your phone's settings.")).toBeOnTheScreen();
      await user.press(row);
      expect(useFakeSettingsStore.getState().update).not.toHaveBeenCalled();
      expect(settings().reduceTransparency).toBeUndefined();
    } finally {
      spy.mockResolvedValue(false);
    }
  });

  it('applies the theme through the store at once (§70)', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByRole('radio', { name: 'Dark theme' }));
    expect(useFakeSettingsStore.getState().update).toHaveBeenCalledWith({ theme: 'dark' });
    await waitFor(() => expect(screen.getByTestId('settings-chip-theme-dark')).toBeSelected());
    expect(settings().theme).toBe('dark');
    await user.press(screen.getByRole('radio', { name: 'Light theme' }));
    expect(settings().theme).toBe('light');
  });

  it.each([
    ['settings-toggle-haptics', { hapticsEnabled: false }, false],
    ['settings-toggle-bowler-prompt', { scoring: { ...SCORING, autoPromptBowler: false } }, false],
    ['settings-toggle-confirm-innings', { scoring: { ...SCORING, confirmInningsEnd: true } }, true],
    ['settings-toggle-keep-awake', { scoring: { ...SCORING, keepAwake: false } }, false],
    ['settings-toggle-transparency', { reduceTransparency: true }, true],
  ] as const)('persists the %s switch through the settings store', async (testID, patch, checked) => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId(testID));
    expect(useFakeSettingsStore.getState().update).toHaveBeenCalledTimes(1);
    expect(useFakeSettingsStore.getState().update).toHaveBeenCalledWith(patch);
    expect(settings()).toEqual({ ...appSettings(), ...patch });
    await waitFor(() => expect(screen.getByTestId(testID).props.accessibilityState.checked).toBe(checked));
  });

  it.each([
    ['settings-chip-dot-dot', { scoring: { ...SCORING, dotStyle: 'dot' } }],
    ['settings-chip-pad-left', { scoring: { ...SCORING, padHand: 'left' } }],
    ['settings-chip-motion-on', { reducedMotion: 'on' }],
    ['settings-chip-motion-off', { reducedMotion: 'off' }],
  ] as const)('persists the %s choice through the settings store', async (testID, patch) => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId(testID));
    expect(useFakeSettingsStore.getState().update).toHaveBeenCalledTimes(1);
    expect(useFakeSettingsStore.getState().update).toHaveBeenCalledWith(patch);
    expect(settings()).toEqual({ ...appSettings(), ...patch });
    await waitFor(() => expect(screen.getByTestId(testID)).toBeSelected());
  });

  it('keeps the other scoring preferences when two change in a row', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId('settings-chip-dot-dot'));
    await user.press(screen.getByTestId('settings-chip-pad-left'));
    expect(settings().scoring).toEqual({ ...SCORING, dotStyle: 'dot', padHand: 'left' });
  });

  it('shows no placeholder row for sound effects while the feature is missing (§77, G-13)', async () => {
    await renderWithTheme(<SettingsScreen />);
    expect(screen.queryByTestId('settings-toggle-sound')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Sound effects|Not available in this version/)).not.toBeOnTheScreen();
  });

  it('picks the default format from the presets', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId('settings-row-default-format'));
    expect(screen.getByTestId('sheet-default-format')).toBeOnTheScreen();
    expect(screen.getByTestId('format-chip-t20')).toBeChecked();
    for (const id of ['t5', 't10', 't30', 't40', 't50']) {
      expect(screen.getByTestId(`format-chip-${id}`)).not.toBeChecked();
    }
    await user.press(screen.getByTestId('format-chip-t20'));
    expect(useFakeSettingsStore.getState().update).not.toHaveBeenCalled();
    await user.press(screen.getByRole('radio', { name: /^T10\. 10 overs/ }));
    expect(useFakeSettingsStore.getState().update).toHaveBeenCalledWith({ defaultFormatId: 'T10' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Default format, T10' })).toBeOnTheScreen());
  });

  it('tells the scorer when a setting could not be saved and offers to try again (§86)', async () => {
    const update = jest.fn(async () => false);
    useFakeSettingsStore.setState({ update });
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId('settings-toggle-haptics'));
    const show = jest.mocked(useFakeToastStore.getState().show);
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    const toast = show.mock.calls[0][0] as Omit<Toast, 'id'>;
    expect(toast).toMatchObject({ kind: 'error', message: "Couldn't save this setting." });
    expect(toast.action?.label).toBe('Try again');
    toast.action?.run();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenLastCalledWith({ hapticsEnabled: false });
  });

  it('loads the settings when the store has not loaded them yet', async () => {
    useFakeSettingsStore.setState({ loaded: false });
    await renderWithTheme(<SettingsScreen />);
    await waitFor(() => expect(useFakeSettingsStore.getState().load).toHaveBeenCalledTimes(1));
  });

  it('does not reload settings that are already loaded', async () => {
    await renderWithTheme(<SettingsScreen />);
    expect(useFakeSettingsStore.getState().load).not.toHaveBeenCalled();
  });

  it.each([
    ['settings-btn-backup', '/settings/backup'],
    ['settings-btn-presets', '/settings/presets'],
    ['settings-btn-diagnostics', '/settings/diagnostics'],
    ['settings-btn-teams', '/teams'],
    ['settings-btn-about', '/settings/about'],
  ])('opens %s', async (testID, route) => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId(testID));
    expect(mockRouter.push).toHaveBeenCalledWith(route);
  });

  it('keeps every control at least 44 pt tall (§72)', async () => {
    await renderWithTheme(<SettingsScreen />);
    const controls = [
      ...screen.getAllByRole('radio'),
      ...screen.getAllByRole('switch'),
      ...screen.getAllByRole('button'),
    ];
    expect(controls.length).toBeGreaterThan(20);
    for (const control of controls) {
      expect(touchTargetSize(control).height).toBeGreaterThanOrEqual(44);
      expect(String(control.props.accessibilityLabel ?? '').length).toBeGreaterThan(0);
    }
  });

  it.each(['light', 'dark'] as const)('themes every switch from the palette tokens in %s, never the platform default teal-green thumb (§107)', async (mode) => {
    useFakeSettingsStore.setState({ settings: appSettings({ theme: mode }) });
    await renderWithTheme(<SettingsScreen />, { mode });
    const colors = switchColors(createTheme(mode));
    for (const id of ['settings-toggle-haptics', 'settings-toggle-confirm-innings', 'settings-toggle-keep-awake', 'settings-toggle-transparency']) {
      const host = switchIn(screen.getByTestId(id));
      expect(host).not.toBeNull();
      const on = host?.props.value === true;
      expect(host?.props.thumbTintColor).toBe(on ? colors.thumbOn : colors.thumbOff);
      expect(host?.props.onTintColor).toBe(colors.trackOn);
    }
  });

  it('renders in the dark theme too', async () => {
    useFakeSettingsStore.setState({ settings: appSettings({ theme: 'dark' }) });
    await renderWithTheme(<SettingsScreen />, { mode: 'dark' });
    expect(screen.getByTestId('settings-chip-theme-dark')).toBeSelected();
  });
});

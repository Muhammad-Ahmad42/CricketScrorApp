import '../../testing';
import { screen, userEvent } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { renderWithTheme, touchTargetSize } from '../../testing';
import { createTheme, darkColors, darkGlass, glassRadius, lightColors } from '../../theme';
import { useChromeInsets, useContentInsets } from '../../glass';
import {
  TAB_BAR_HEIGHT,
  TAB_ITEMS,
  TabBar,
  TabChrome,
  WIZARD_ROUTES,
  floatingTabBarMetrics,
  navigationTheme,
  stackScreenOptions,
  tabBarItems,
  tabChromeBottom,
  tabScreenOptions,
  wizardScreenOptions,
} from '..';

type Navigation = BottomTabBarProps['navigation'];
type State = BottomTabBarProps['state'];

function fakeTabs(index: number, prevent = false) {
  const routes = TAB_ITEMS.map((tab) => ({ key: `${tab.route}-key`, name: tab.route, params: undefined }));
  const state = { index, routes, key: 'tabs', routeNames: routes.map((r) => r.name), type: 'tab', stale: false, history: [] } as unknown as State;
  const emit = jest.fn(() => ({ defaultPrevented: prevent }));
  const navigate = jest.fn();
  const navigation = { emit, navigate } as unknown as Navigation;
  return { state, navigation, emit, navigate, descriptors: {} as BottomTabBarProps['descriptors'] };
}

describe('tab configuration', () => {
  it('orders the four tabs Home · Tournaments · History · Settings with their E2E ids and icons', () => {
    expect(TAB_ITEMS.map((t) => [t.route, t.label, t.icon, t.testID])).toEqual([
      ['index', 'Home', 'house', 'tab-home'],
      ['tournaments', 'Tournaments', 'trophy', 'tab-tournaments'],
      ['history', 'History', 'history', 'tab-history'],
      ['settings', 'Settings', 'settings', 'tab-settings'],
    ]);
  });
});

describe('TabBar', () => {
  it('renders tabs with selected state, labels and 44 pt targets on the surface', async () => {
    const tabs = fakeTabs(1);
    await renderWithTheme(<TabBar items={tabBarItems(tabs)} />);
    const selected = screen.getByRole('tab', { name: 'Tournaments' });
    expect(selected).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Home' })).not.toBeSelected();
    expect(screen.getByTestId('tab-history')).toHaveProp('accessibilityHint', '3 of 4');
    for (const tab of screen.getAllByRole('tab')) {
      expect(touchTargetSize(tab).height).toBeGreaterThanOrEqual(44);
    }
    expect(screen.getByText('Tournaments')).toHaveStyle({ color: lightColors.accent, fontSize: 12, textTransform: 'none' });
    expect(screen.getByText('Home')).toHaveStyle({ color: lightColors.textSecondary });
  });

  it('floats a 56 pt row in a glass capsule that clears the home indicator', async () => {
    const tabs = fakeTabs(0);
    const view = await renderWithTheme(<TabBar items={tabBarItems(tabs)} bottomInset={34} />, { mode: 'dark' });
    const bar = view.container.queryAll((node) => node.props.accessibilityRole === 'tablist')[0];
    expect(bar).toHaveStyle({ height: TAB_BAR_HEIGHT + 8, padding: 4, borderRadius: glassRadius.pill, maxWidth: 520 });
    expect(bar.parent).toHaveStyle({ position: 'absolute', bottom: 0, paddingBottom: 22, paddingHorizontal: 16 });
    expect(bar.props.tintColor ?? darkGlass.level.bar.tint).toBe(darkGlass.level.bar.tint);
    expect(screen.getByText('Home')).toHaveStyle({ color: darkColors.accent });
  });

  it('places the capsule from the safe area and reports the footprint content must clear', () => {
    expect(floatingTabBarMetrics(34)).toEqual({ height: 64, bottom: 22, side: 16, footprint: 94 });
    expect(floatingTabBarMetrics(0)).toEqual({ height: 64, bottom: 12, side: 16, footprint: 84 });
    expect(floatingTabBarMetrics(16)).toMatchObject({ bottom: 8 });
    expect(tabChromeBottom(34)).toBe(60);
    expect(tabChromeBottom(0)).toBe(84);
  });

  it('gives tab scenes the capsule as bottom chrome so lists scroll beneath it', async () => {
    const seen: number[] = [];
    function Probe() {
      seen.push(useChromeInsets().bottom, useContentInsets().bottom);
      return null;
    }
    await renderWithTheme(
      <TabChrome>
        <Probe />
      </TabChrome>,
    );
    expect(seen.slice(-2)).toEqual([60, 94]);
  });

  it('navigates on press unless the tab is focused or the press is prevented', async () => {
    const user = userEvent.setup();
    const tabs = fakeTabs(0);
    await renderWithTheme(<TabBar items={tabBarItems(tabs)} />);
    await user.press(screen.getByRole('tab', { name: 'History' }));
    expect(tabs.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'history-key', canPreventDefault: true });
    expect(tabs.navigate).toHaveBeenCalledWith('history', undefined);
    await user.press(screen.getByRole('tab', { name: 'Home' }));
    expect(tabs.navigate).toHaveBeenCalledTimes(1);
  });

  it('respects a prevented tab press', async () => {
    const user = userEvent.setup();
    const tabs = fakeTabs(0, true);
    await renderWithTheme(<TabBar items={tabBarItems(tabs)} />);
    await user.press(screen.getByRole('tab', { name: 'Settings' }));
    expect(tabs.navigate).not.toHaveBeenCalled();
  });

  it('ignores routes that are not tabs', () => {
    const tabs = fakeTabs(0);
    const extra = { ...tabs, state: { ...tabs.state, routes: [...tabs.state.routes, { key: 'x', name: 'hidden', params: undefined }] } as unknown as State };
    expect(tabBarItems(extra)).toHaveLength(4);
  });
});

describe('navigator options', () => {
  it('builds a navigation theme from the tokens so no screen flashes white', () => {
    const nav = navigationTheme(createTheme('dark'));
    expect(nav.dark).toBe(true);
    expect(nav.colors.background).toBe(darkColors.background);
    expect(nav.colors.card).toBe(darkColors.surface);
    expect(nav.colors.primary).toBe(darkColors.accent);
  });

  it('hides headers, paints scenes with the background and drops stack animations with reduced motion', () => {
    const reduced = createTheme('light', { highContrast: false, reducedMotion: true, boldText: false });
    expect(stackScreenOptions(reduced)).toMatchObject({ headerShown: false, animation: 'none', contentStyle: { backgroundColor: lightColors.background } });
    expect(stackScreenOptions(createTheme('light')).animation).toBe('default');
    expect(tabScreenOptions(createTheme('dark'))).toMatchObject({ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: darkColors.background } });
  });

  it('presents both setup wizards modally from the bottom, without motion when reduced (INFORMATION_ARCHITECTURE §2)', () => {
    expect(WIZARD_ROUTES).toEqual(['match/new', 'tournament/new']);
    expect(wizardScreenOptions(createTheme('light'))).toEqual({ presentation: 'modal', animation: 'slide_from_bottom' });
    expect(wizardScreenOptions(createTheme('light', { highContrast: false, reducedMotion: true, boldText: false })).animation).toBe('none');
  });
});

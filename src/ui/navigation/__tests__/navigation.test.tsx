import '../../testing';
import { setLiquidGlassAvailable } from '../../glass/testing';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import { act, fireEvent, screen, userEvent, within } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { hideKeyboard, renderWithTheme, showKeyboard, touchTargetSize, withPlatform } from '../../testing';
import { createTheme, darkColors, darkGlass, lightColors, lightGlass } from '../../theme';
import { useChromeInsets, useContentInsets } from '../../glass';
import {
  LIQUID_TEST_ID,
  POCKET_TEST_ID,
  TAB_BAR_HEIGHT,
  TAB_BAR_TOP,
  TAB_EDGE_TEST_ID,
  TAB_ITEMS,
  TAB_LABEL_MAX_SCALE,
  TabBar,
  TabChrome,
  WIZARD_ROUTES,
  floatingTabBarMetrics,
  liquidGeometry,
  liquidHalfWidth,
  liquidPaths,
  narrowestSlot,
  navigationTheme,
  slotCenter,
  stackScreenOptions,
  tabBarItems,
  tabBarMetrics,
  tabBarTucked,
  tabChromeBottom,
  tabPressedStyle,
  tabScreenOptions,
  wizardScreenOptions,
  type TabBarItem,
} from '..';

type Navigation = BottomTabBarProps['navigation'];
type State = BottomTabBarProps['state'];

interface HostNode {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly parent: HostNode | null;
}

interface Container {
  readonly container: { queryAll: (predicate: (node: HostNode) => boolean) => HostNode[] };
}

function fakeTabs(index: number, prevent = false) {
  const routes = TAB_ITEMS.map((tab) => ({ key: `${tab.route}-key`, name: tab.route, params: undefined }));
  const state = { index, routes, key: 'tabs', routeNames: routes.map((r) => r.name), type: 'tab', stale: false, history: [] } as unknown as State;
  const emit = jest.fn(() => ({ defaultPrevented: prevent }));
  const navigate = jest.fn();
  const navigation = { emit, navigate } as unknown as Navigation;
  return { state, navigation, emit, navigate, descriptors: {} as BottomTabBarProps['descriptors'] };
}

function itemsFor(selected: number): TabBarItem[] {
  return TAB_ITEMS.map((tab, index) => ({ key: tab.route, label: tab.label, icon: tab.icon, selected: index === selected, testID: tab.testID, onPress: jest.fn() }));
}

function flat(node: { readonly props: Record<string, unknown> }): ViewStyle {
  return (StyleSheet.flatten(node.props.style as ViewStyle) ?? {}) as ViewStyle;
}

function tablist(view: Container): HostNode {
  return view.container.queryAll((node) => node.props.accessibilityRole === 'tablist')[0];
}

function all(view: Container, predicate: (node: HostNode) => boolean): HostNode[] {
  return view.container.queryAll(predicate);
}

async function measureBar(list: HostNode, width = 390, rowX = 16) {
  const surface = list.parent as HostNode;
  await fireEvent(surface as never, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 94 } } });
  await fireEvent(list as never, 'layout', { nativeEvent: { layout: { x: rowX, y: TAB_BAR_TOP, width: width - 2 * rowX, height: TAB_BAR_HEIGHT } } });
  const slot = (width - 2 * rowX) / TAB_ITEMS.length;
  for (const [index, tab] of TAB_ITEMS.entries()) {
    await fireEvent(screen.getByTestId(tab.testID), 'layout', { nativeEvent: { layout: { x: index * slot, y: 0, width: slot, height: TAB_BAR_HEIGHT } } });
  }
}

function lit(testID: string): number {
  return Math.round(Number(getAnimatedStyle(screen.getByTestId(`${testID}-lit`) as never).opacity) * 100) / 100;
}

function litAll(): number[] {
  return TAB_ITEMS.map((tab) => lit(tab.testID));
}

function captionLit(testID: string): number {
  return Math.round(Number(getAnimatedStyle(screen.getByTestId(`${testID}-caption-lit`) as never).opacity) * 100) / 100;
}

function captionPlain(testID: string): number {
  return Math.round(Number(getAnimatedStyle(screen.getByTestId(`${testID}-caption-plain`, { includeHiddenElements: true }) as never).opacity) * 100) / 100;
}

beforeEach(() => {
  setLiquidGlassAvailable(false);
});

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
    expect(screen.getByText('Tournaments')).toHaveStyle({ color: lightGlass.ink.accent, fontSize: 12, textTransform: 'none' });
    const plainHome = within(screen.getByTestId('tab-home-caption-plain', { includeHiddenElements: true })).getByText('Home', { includeHiddenElements: true });
    expect(plainHome).toHaveStyle({ color: lightGlass.ink.secondary });
    expect(screen.getByTestId('tab-home-caption-plain', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
    expect([captionLit('tab-home'), captionPlain('tab-home')]).toEqual([0, 1]);
    expect([captionLit('tab-tournaments'), captionPlain('tab-tournaments')]).toEqual([1, 0]);
    expect(lightColors.accent).not.toBe(lightGlass.ink.accent);
  });

  it('presses a tab with a subtle dim of its content, never a grey rectangle (Android QA)', async () => {
    expect(tabPressedStyle(true, false)).toEqual({ opacity: expect.any(Number) });
    expect((tabPressedStyle(true, false) as { opacity: number }).opacity).toBeGreaterThan(0.5);
    expect(tabPressedStyle(true, true)).toBeNull();
    expect(tabPressedStyle(false, false)).toBeNull();
    const tabs = fakeTabs(1);
    await renderWithTheme(<TabBar items={tabBarItems(tabs)} />);
    for (const tab of screen.getAllByRole('tab')) {
      expect(flat(tab).backgroundColor).toBeUndefined();
    }
  });

  it('sizes each tab to its label and never ellipsizes one, even at 320 wide (§74)', async () => {
    const tabs = fakeTabs(1);
    await renderWithTheme(<TabBar items={tabBarItems(tabs)} />);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveStyle({ flexGrow: 1, flexShrink: 1, flexBasis: 'auto' });
    }
    const label = screen.getByText('Tournaments');
    expect(label.props.ellipsizeMode).toBe('clip');
    expect(label.props.maxFontSizeMultiplier).toBe(TAB_LABEL_MAX_SCALE);
    expect(TAB_LABEL_MAX_SCALE).toBe(1.5);
    expect(tabBarMetrics(0, 320).side).toBe(8);
    expect(tabBarMetrics(0, 390).side).toBe(16);
  });

  it('docks one edge-to-edge glass surface: no capsule, no gap below, the row centred above the safe area', async () => {
    const tabs = fakeTabs(0);
    const view = await renderWithTheme(<TabBar items={tabBarItems(tabs)} bottomInset={34} />, { mode: 'dark' });
    const list = tablist(view);
    expect(flat(list)).toMatchObject({ height: TAB_BAR_HEIGHT, maxWidth: 520, alignSelf: 'center' });
    const surface = list.parent as HostNode;
    expect(flat(surface)).toMatchObject({ paddingTop: TAB_BAR_TOP, paddingBottom: 34, paddingHorizontal: 16 });
    expect(flat(surface).borderRadius ?? 0).toBe(0);
    expect(screen.getByTestId('tab-bar')).toHaveStyle({ position: 'absolute', left: 0, right: 0, bottom: 0 });
    expect(all(view, (node) => flat(node).backgroundColor === darkGlass.level.bar.tint)).toHaveLength(1);
    expect(all(view, (node) => Number(flat(node).borderTopWidth ?? 0) > 0)).toHaveLength(0);
    expect(screen.getByText('Home')).toHaveStyle({ color: darkGlass.ink.accent });
    expect(darkColors.accent).not.toBe(darkGlass.ink.accent);
  });

  it('keeps an opaque top edge and still shows the liquid under Reduce Transparency, without the soft edge line', async () => {
    const view = await renderWithTheme(<TabBar items={itemsFor(0)} bottomInset={34} />, { mode: 'dark', reduceTransparency: true });
    await measureBar(tablist(view));
    expect(all(view, (node) => flat(node).backgroundColor === darkGlass.level.bar.opaque)).toHaveLength(1);
    expect(all(view, (node) => Number(flat(node).borderTopWidth ?? 0) > 0).length).toBeGreaterThan(0);
    expect(screen.getByTestId(LIQUID_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId(POCKET_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId(TAB_EDGE_TEST_ID, { includeHiddenElements: true })).toBeNull();
  });

  it('reserves the same height for gesture, 3-button and no-inset navigation, and grows the glass into the system bar', () => {
    expect(tabBarMetrics(34)).toEqual({ height: 60, bottom: 34, side: 16, footprint: 94 });
    expect(tabBarMetrics(24)).toEqual({ height: 60, bottom: 24, side: 16, footprint: 84 });
    expect(tabBarMetrics(48)).toEqual({ height: 60, bottom: 48, side: 16, footprint: 108 });
    expect(tabBarMetrics(0)).toEqual({ height: 60, bottom: 8, side: 16, footprint: 68 });
    expect(floatingTabBarMetrics).toBe(tabBarMetrics);
    expect(tabChromeBottom(34)).toBe(60);
    expect(tabChromeBottom(24)).toBe(60);
    expect(tabChromeBottom(48)).toBe(60);
    expect(tabChromeBottom(0)).toBe(68);
  });

  it('gives tab scenes the bar as bottom chrome so the last list item scrolls clear of it', async () => {
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
    expect(seen.slice(-2)).toEqual([60, tabBarMetrics(34).footprint]);
  });

  it('draws the liquid only once the bar is measured, across the whole surface, lighting the selected icon', async () => {
    const view = await renderWithTheme(<TabBar items={itemsFor(1)} bottomInset={34} />, { reducedMotion: 'on' });
    expect(screen.queryByTestId(LIQUID_TEST_ID, { includeHiddenElements: true })).toBeNull();
    expect(litAll()).toEqual([0, 1, 0, 0]);
    await measureBar(tablist(view));
    const canvas = screen.getByTestId(LIQUID_TEST_ID, { includeHiddenElements: true });
    expect(canvas).toHaveStyle({ position: 'absolute', left: 0, top: 0, width: 390, height: tabBarMetrics(34).height });
    expect(canvas.props.pointerEvents).toBe('none');
    expect(canvas.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByTestId(TAB_EDGE_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
    expect(litAll()).toEqual([0, 1, 0, 0]);
  });

  it('flows the liquid from the old tab to the new one without overshoot, lighting the icons it passes', async () => {
    jest.useFakeTimers();
    try {
      const feedback = jest.fn();
      const view = await renderWithTheme(<TabBar items={itemsFor(0)} bottomInset={34} onSelectionChange={feedback} />);
      await measureBar(tablist(view));
      expect(litAll()).toEqual([1, 0, 0, 0]);
      await view.rerender(<TabBar items={itemsFor(3)} bottomInset={34} onSelectionChange={feedback} />);
      expect(feedback).toHaveBeenCalledTimes(1);
      expect([captionLit('tab-home'), captionLit('tab-settings')]).toEqual([1, 0]);
      await act(async () => {
        jest.advanceTimersByTime(150);
      });
      expect(captionLit('tab-tournaments')).toBe(lit('tab-tournaments'));
      expect(lit('tab-tournaments')).toBe(1);
      expect(lit('tab-history')).toBe(1);
      const frames: number[] = [];
      for (let step = 0; step < 12; step += 1) {
        await act(async () => {
          jest.advanceTimersByTime(50);
        });
        frames.push(lit('tab-settings'));
        expect(captionLit('tab-settings')).toBe(lit('tab-settings'));
        expect(captionPlain('tab-settings')).toBeCloseTo(1 - lit('tab-settings'), 1);
      }
      expect(frames.every((value, index) => index === 0 || value >= frames[index - 1])).toBe(true);
      expect(litAll()).toEqual([0, 0, 0, 1]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-renders the resting liquid at the new tab once a flow ends, so a later React commit cannot pull it back (Android)', async () => {
    jest.useFakeTimers();
    try {
      const pocketPath = () => screen.getByTestId(POCKET_TEST_ID, { includeHiddenElements: true }).props.d as string;
      const view = await renderWithTheme(<TabBar items={itemsFor(2)} bottomInset={34} />);
      await measureBar(tablist(view));
      const start = pocketPath();
      await view.rerender(<TabBar items={itemsFor(3)} bottomInset={34} />);
      expect(pocketPath()).toBe(start);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      const rest = pocketPath();
      expect(rest).not.toBe(start);
      const slot = (390 - 2 * 16) / TAB_ITEMS.length;
      const slots = TAB_ITEMS.map((_, index) => ({ x: index * slot, width: slot }));
      const center = slotCenter(slots[3], 16) ?? 0;
      const geometry = liquidGeometry(390, tabBarMetrics(34).height, liquidHalfWidth(narrowestSlot(slots)));
      expect(rest).toBe(liquidPaths(center, center, geometry).body);
    } finally {
      jest.useRealTimers();
    }
  });

  it('moves with the layout instead of flowing when the window changes size', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderWithTheme(<TabBar items={itemsFor(0)} bottomInset={34} />);
      await measureBar(tablist(view));
      expect(litAll()).toEqual([1, 0, 0, 0]);
      await measureBar(tablist(view), 1024, 252);
      await act(async () => {
        jest.advanceTimersByTime(16);
      });
      expect(litAll()).toEqual([1, 0, 0, 0]);
      expect(screen.getByTestId(LIQUID_TEST_ID, { includeHiddenElements: true })).toHaveStyle({ width: 1024 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('jumps straight to the new tab with reduced motion', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderWithTheme(<TabBar items={itemsFor(0)} bottomInset={34} />, { reducedMotion: 'on' });
      await measureBar(tablist(view));
      await view.rerender(<TabBar items={itemsFor(3)} bottomInset={34} />);
      await act(async () => {
        jest.advanceTimersByTime(16);
      });
      expect(litAll()).toEqual([0, 0, 0, 1]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stays put when the keyboard opens: hidden behind the Android keyboard, untouched on iOS, same height either way', async () => {
    expect(tabBarTucked('android', 300)).toBe(true);
    expect(tabBarTucked('android', 0)).toBe(false);
    expect(tabBarTucked('ios', 300)).toBe(false);
    await withPlatform('android', async () => {
      const view = await renderWithTheme(<TabBar items={itemsFor(0)} bottomInset={48} />);
      const before = flat(tablist(view).parent as HostNode);
      await showKeyboard(300, 'android');
      const dock = screen.getByTestId('tab-bar', { includeHiddenElements: true });
      expect(dock).toHaveStyle({ opacity: 0, position: 'absolute', bottom: 0 });
      expect(dock.props.pointerEvents).toBe('none');
      expect(dock.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(flat(tablist(view).parent as HostNode)).toEqual(before);
      await hideKeyboard('android');
      expect(screen.getByTestId('tab-bar')).not.toHaveStyle({ opacity: 0 });
      expect(screen.getByTestId('tab-bar').props.pointerEvents).toBe('box-none');
    });
    expect(Platform.OS).toBe('ios');
    await renderWithTheme(<TabBar items={itemsFor(0)} bottomInset={34} />);
    await showKeyboard(300, 'ios');
    expect(screen.getByTestId('tab-bar').props.pointerEvents).toBe('box-none');
    await hideKeyboard('ios');
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

import '../testing';
import type { ReactElement, ReactNode } from 'react';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { renderWithTheme } from '../testing';
import { darkColors, lightColors } from '../theme';
import RootLayout from '@/app/_layout';
import TabsLayout from '@/app/(tabs)/_layout';
import { createSqlJsDatabase } from '@/db/testing';
import { createTestApp, type TestApp } from '@/services/testing';
import { useAppStore, useHomeStore, useSettingsStore, useToastStore } from '@/stores';
import { clearAppServices, setAppServices } from '@/stores/services';
import { resetStores } from '@/stores/__tests__/support/harness';

interface ScreenElementProps {
  readonly name: string;
  readonly options?: { readonly title?: string; readonly tabBarButtonTestID?: string };
}

const navigated: string[] = [];

jest.mock('expo-router', () => {
  const native: typeof import('react-native') = jest.requireActual('react-native');
  const react: typeof import('react') = jest.requireActual('react');
  return {
    Stack: Object.assign(
      jest.fn((props: { screenOptions?: { contentStyle?: import('react-native').ViewStyle; animation?: string }; children?: ReactNode }) =>
        react.createElement(native.View, { testID: 'root-stack', style: props.screenOptions?.contentStyle, ...({ screenOptions: props.screenOptions } as object) }, props.children),
      ),
      {
        Screen: (props: { name: string; options?: object }) =>
          react.createElement(native.View, { testID: `stack-screen-${props.name}`, ...({ options: props.options } as object) }),
      },
    ),
    ThemeProvider: jest.fn((props: { children: ReactNode }) => props.children),
  };
});

jest.mock('expo-router/js-tabs', () => {
  const react: typeof import('react') = jest.requireActual('react');
  const TabsScreen = () => null;
  const Tabs = (props: { tabBar: (p: unknown) => ReactNode; children: ReactNode }) => {
    const screens = react.Children.toArray(props.children).filter(react.isValidElement) as ReactElement<ScreenElementProps>[];
    const routes = screens.map((s) => ({ key: `${s.props.name}-key`, name: s.props.name, params: undefined }));
    const descriptors = Object.fromEntries(screens.map((s) => [`${s.props.name}-key`, { options: s.props.options ?? {} }]));
    return props.tabBar({
      state: { index: 0, routes },
      descriptors,
      insets: { top: 0, bottom: 34, left: 0, right: 0 },
      navigation: {
        emit: () => ({ defaultPrevented: false }),
        navigate: (name: string) => navigated.push(name),
      },
    });
  };
  Tabs.Screen = TabsScreen;
  return { Tabs };
});

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));

jest.setTimeout(30000);

let app: TestApp;

async function bootedServices(): Promise<TestApp> {
  resetStores();
  clearAppServices();
  const created = createTestApp(await createSqlJsDatabase());
  setAppServices(created);
  return created;
}

async function settled(): Promise<void> {
  await waitFor(() => expect(useHomeStore.getState().status).toBe('ready'));
}

describe('root layout', () => {
  beforeEach(async () => {
    app = await bootedServices();
  });

  it('holds the splash at import time and renders the themed stack once fonts and data are ready', async () => {
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
    await renderWithTheme(<RootLayout />);
    expect(await screen.findByTestId('root-stack')).toHaveStyle({ backgroundColor: lightColors.background });
    expect(useAppStore.getState().status).toBe('ready');
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    await settled();
  });

  it('keeps the splash while the bundled fonts load', async () => {
    jest.mocked(useFonts).mockReturnValue([false, null]);
    try {
      await renderWithTheme(<RootLayout />);
      await waitFor(() => expect(useAppStore.getState().status).toBe('ready'));
      expect(screen.queryByTestId('root-stack')).not.toBeOnTheScreen();
      expect(screen.getByTestId('bootstrap-splash')).toBeOnTheScreen();
    } finally {
      jest.mocked(useFonts).mockReturnValue([true, null]);
    }
    await settled();
  });

  it('paints the stored theme and follows a change at once (§70)', async () => {
    await app.bootstrap();
    await app.settings.update({ theme: 'dark' });
    await renderWithTheme(<RootLayout />);
    const stack = await screen.findByTestId('root-stack');
    await waitFor(() => expect(stack).toHaveStyle({ backgroundColor: darkColors.background }));
    await act(async () => {
      await useSettingsStore.getState().update({ theme: 'light' });
    });
    expect(screen.getByTestId('root-stack')).toHaveStyle({ backgroundColor: lightColors.background });
    await settled();
  });

  it('turns stack transitions off when reduced motion is On (§78, ACCESSIBILITY §10)', async () => {
    await renderWithTheme(<RootLayout />);
    const animation = () => (screen.getByTestId('root-stack').props.screenOptions as { readonly animation?: string }).animation;
    await screen.findByTestId('root-stack');
    expect(animation()).toBe('default');
    await act(async () => {
      await useSettingsStore.getState().update({ reducedMotion: 'on' });
    });
    expect(animation()).toBe('none');
    await settled();
  });

  it('presents the match and tournament wizards as modals (INFORMATION_ARCHITECTURE §2)', async () => {
    await renderWithTheme(<RootLayout />);
    await screen.findByTestId('root-stack');
    for (const name of ['match/new', 'tournament/new']) {
      expect(screen.getByTestId(`stack-screen-${name}`).props.options).toEqual({ presentation: 'modal', animation: 'slide_from_bottom' });
    }
    await settled();
  });

  it('mounts the toast host, so a failed save offers Try again (§86)', async () => {
    const retry = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<RootLayout />);
    await screen.findByTestId('root-stack');
    await act(async () => {
      useToastStore.getState().show({ kind: 'error', message: "Couldn't save this setting. Your other settings are unchanged.", action: { label: 'Try again', run: retry } });
    });
    expect(await screen.findByTestId('toast-text')).toHaveTextContent("Couldn't save this setting. Your other settings are unchanged.");
    await user.press(screen.getByTestId('toast-btn-action'));
    expect(retry).toHaveBeenCalledTimes(1);
    await settled();
  });
});

describe('tabs layout', () => {
  it('declares Home · Tournaments · History · Settings and renders the design-system tab bar', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<TabsLayout />);
    expect(screen.getAllByRole('tab').map((tab) => tab.props.testID)).toEqual(['tab-home', 'tab-tournaments', 'tab-history', 'tab-settings']);
    expect(screen.getByRole('tab', { name: 'Home' })).toBeSelected();
    await user.press(screen.getByRole('tab', { name: 'History' }));
    expect(navigated).toEqual(['history']);
  });
});

import '@/ui/testing';
import { Children, isValidElement, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { createSqlJsDatabase } from '@/db/testing';
import { createTestApp, type TestApp } from '@/services/testing';
import type { AppServices } from '@/services/contracts';
import { darkColors } from '@/ui';
import { renderWithTheme } from '@/ui/testing';
import RootLayout from '@/app/_layout';
import { useAppStore, useHomeStore, useToastStore } from '@/stores';
import { setAppServices } from '@/stores/services';
import { resetStores } from './support/harness';

jest.mock('expo-router', () => {
  const native: typeof import('react-native') = jest.requireActual('react-native');
  const react: typeof import('react') = jest.requireActual('react');
  return {
    Stack: Object.assign(
      jest.fn((props: { screenOptions?: { contentStyle?: import('react-native').ViewStyle } }) =>
        react.createElement(native.View, { testID: 'root-stack', style: props.screenOptions?.contentStyle }),
      ),
      { Screen: () => null },
    ),
    ThemeProvider: jest.fn((props: { children: import('react').ReactNode }) => props.children),
  };
});

jest.mock('expo-font', () => ({ useFonts: jest.fn(() => [true, null]) }));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(() => Promise.resolve()) }));

jest.setTimeout(30000);

let app: TestApp;

function declaredRootScreens(): readonly string[] {
  const props = jest.mocked(Stack).mock.calls.at(-1)?.[0] as { readonly children?: ReactNode } | undefined;
  return Children.toArray(props?.children)
    .filter(isValidElement)
    .map((child) => (child.props as { readonly name: string }).name);
}

beforeEach(async () => {
  resetStores();
  app = createTestApp(await createSqlJsDatabase());
  setAppServices(app);
});

afterEach(async () => {
  await waitFor(() => expect(useHomeStore.getState().status).toBe('ready'));
});

describe('root layout composition (§70, §86)', () => {
  it('waits for fonts and bootstrap, then renders the stack and loads Home', async () => {
    await renderWithTheme(<RootLayout />);
    expect(await screen.findByTestId('root-stack')).toBeOnTheScreen();
    expect(useAppStore.getState().status).toBe('ready');
    await waitFor(() => expect(useHomeStore.getState().status).toBe('ready'));
  });

  it('follows the theme preference from the settings store', async () => {
    const services: AppServices = app;
    await services.bootstrap();
    await services.settings.update({ theme: 'dark' });
    await renderWithTheme(<RootLayout />);
    const stack = await screen.findByTestId('root-stack');
    await waitFor(() => expect(stack).toHaveStyle({ backgroundColor: darkColors.background }));
  });

  it('shows a friendly error and retries the bootstrap', async () => {
    let attempts = 0;
    setAppServices({
      ...app,
      bootstrap: async () => {
        attempts += 1;
        return attempts === 1
          ? { ok: false, error: { code: 'STORAGE', message: "Couldn't open your scorebook data. Nothing has been changed.", domainCode: null, detail: 'SQLITE_CORRUPT' } }
          : app.bootstrap();
      },
    });
    const user = userEvent.setup();
    await renderWithTheme(<RootLayout />);
    expect(await screen.findByTestId('error-screen')).toBeOnTheScreen();
    expect(screen.getByText("Scorebook couldn't open your data")).toBeOnTheScreen();
    expect(screen.getByTestId('error-text-message')).toHaveTextContent('Nothing has been changed.');
    expect(screen.queryByText(/Couldn't open your scorebook data/)).toBeNull();
    expect(screen.queryByText('SQLITE_CORRUPT')).toBeNull();
    await user.press(screen.getByTestId('error-btn-retry'));
    expect(await screen.findByTestId('root-stack')).toBeOnTheScreen();
    expect(attempts).toBe(2);
  });

  it('declares the tabs group first, so a launch without a path opens Home', async () => {
    await renderWithTheme(<RootLayout />);
    await screen.findByTestId('root-stack');
    expect(declaredRootScreens()).toEqual(['(tabs)', 'match/new', 'tournament/new']);
  });

  it('mounts the toast host', async () => {
    await renderWithTheme(<RootLayout />);
    await screen.findByTestId('root-stack');
    await act(async () => {
      useToastStore.getState().show({ kind: 'error', message: "Couldn't save this delivery.", action: null });
    });
    expect(await screen.findByTestId('toast-text')).toHaveTextContent("Couldn't save this delivery.");
  });
});

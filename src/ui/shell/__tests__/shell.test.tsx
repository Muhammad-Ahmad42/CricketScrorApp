import '../../testing';
import { Text as RNText } from 'react-native';
import { act, screen, userEvent } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { renderWithTheme } from '../../testing';
import { darkColors, lightColors } from '../../theme';
import {
  BOOTSTRAP_ERROR_TITLE,
  BOOTSTRAP_SLOW_MS,
  BootstrapGate,
  LoadingView,
  SystemChrome,
  gatePhase,
  holdSplashScreen,
  statusBarStyleFor,
} from '..';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: jest.fn(() => null),
}));

describe('gate phases', () => {
  it('keeps the native splash while loading, then shows the in-app loading frame when slow', () => {
    expect(gatePhase('loading', false)).toBe('splash');
    expect(gatePhase('idle', false)).toBe('splash');
    expect(gatePhase('loading', true)).toBe('loading');
    expect(gatePhase('ready', false)).toBe('ready');
    expect(gatePhase('saving', true)).toBe('ready');
    expect(gatePhase('error', false)).toBe('error');
  });
});

describe('BootstrapGate', () => {
  it('holds the splash once, then renders the app when ready and releases the splash once', async () => {
    holdSplashScreen();
    holdSplashScreen();
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
    const view = await renderWithTheme(
      <BootstrapGate status="loading">
        <RNText>App</RNText>
      </BootstrapGate>,
    );
    expect(screen.queryByText('App')).not.toBeOnTheScreen();
    expect(screen.getByTestId('bootstrap-splash')).toHaveStyle({ backgroundColor: lightColors.background });
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    await view.rerender(
      <BootstrapGate status="ready">
        <RNText>App</RNText>
      </BootstrapGate>,
    );
    expect(screen.getByText('App')).toBeOnTheScreen();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    await view.rerender(
      <BootstrapGate status="saving">
        <RNText>App</RNText>
      </BootstrapGate>,
    );
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('shows "Preparing your matches…" only when bootstrap takes longer than 1.5 s', async () => {
    jest.useFakeTimers();
    try {
      await renderWithTheme(
        <BootstrapGate status="loading">
          <RNText>App</RNText>
        </BootstrapGate>,
      );
      expect(screen.queryByTestId('bootstrap-loading')).not.toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(BOOTSTRAP_SLOW_MS);
      });
      expect(screen.getByTestId('bootstrap-loading')).toHaveAccessibleName('Scorebook. Preparing your matches…');
      expect(screen.getByTestId('bootstrap-loading')).toBeBusy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows a recoverable error with a human message, retry and technical details', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <BootstrapGate status="error" error={{ message: 'Nothing has been changed. Close other apps and try again.', detail: 'migration 1 failed: disk I/O error' }} onRetry={onRetry}>
        <RNText>App</RNText>
      </BootstrapGate>,
      { mode: 'dark' },
    );
    expect(screen.getByTestId('error-screen')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: BOOTSTRAP_ERROR_TITLE })).toBeOnTheScreen();
    expect(screen.getByTestId('error-text-message')).toHaveTextContent('Nothing has been changed. Close other apps and try again.');
    expect(screen.queryByText('migration 1 failed: disk I/O error')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('error-btn-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('App')).not.toBeOnTheScreen();
  });
});

describe('LoadingView', () => {
  it('shows the progress rule with motion and text only with reduced motion', async () => {
    const view = await renderWithTheme(<LoadingView />);
    expect(screen.getByTestId('bootstrap-loading-progress', { includeHiddenElements: true })).toBeTruthy();
    await view.unmount();
    await renderWithTheme(<LoadingView />, { reducedMotion: 'on' });
    expect(screen.queryByTestId('bootstrap-loading-progress', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('Preparing your matches…', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('SystemChrome', () => {
  it('sets the status bar from the effective theme and paints the root background', async () => {
    expect(statusBarStyleFor('light')).toBe('dark');
    expect(statusBarStyleFor('dark')).toBe('light');
    await renderWithTheme(<SystemChrome />, { mode: 'dark' });
    expect(jest.mocked(StatusBar).mock.calls[0][0]).toMatchObject({ style: 'light' });
    expect(SystemUI.setBackgroundColorAsync).toHaveBeenCalledWith(darkColors.background);
  });
});

import '../../testing';
import { useEffect } from 'react';
import { AccessibilityInfo, Platform, View, useColorScheme } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import {
  ThemeProvider,
  createTheme,
  darkColors,
  lightColors,
  resolveReducedMotion,
  resolveScheme,
  useReducedMotion,
  useTheme,
  type ReducedMotionPreference,
  type ThemeMode,
} from '..';

type Listener = (value: boolean) => void;

const listeners = new Map<string, Listener>();

function captureListeners() {
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: Listener) => {
    listeners.set(event, handler);
    return { remove: jest.fn() };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
}

function Probe({ onMount }: { readonly onMount: () => void }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  useEffect(() => {
    onMount();
  }, [onMount]);
  return (
    <View
      testID="probe"
      accessibilityLabel={`${theme.scheme} ${reduced ? 'reduced' : 'full'} ${theme.highContrast ? 'hc' : 'normal'}`}
      style={{ backgroundColor: theme.color.background }}
    />
  );
}

function Harness({ mode, reducedMotion, child }: { readonly mode: ThemeMode; readonly reducedMotion?: ReducedMotionPreference; readonly child: React.ReactElement }) {
  return (
    <ThemeProvider mode={mode} reducedMotion={reducedMotion}>
      {child}
    </ThemeProvider>
  );
}

beforeEach(() => {
  listeners.clear();
  jest.mocked(useColorScheme).mockReturnValue('light');
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isHighTextContrastEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(false);
  captureListeners();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ThemeProvider', () => {
  it('provides the light palette for the light preference', async () => {
    await render(<Harness mode="light" child={<Probe onMount={jest.fn()} />} />);
    expect(screen.getByTestId('probe')).toHaveStyle({ backgroundColor: lightColors.background });
  });

  it('provides the dark palette for the dark preference regardless of the OS', async () => {
    await render(<Harness mode="dark" child={<Probe onMount={jest.fn()} />} />);
    expect(screen.getByTestId('probe')).toHaveStyle({ backgroundColor: darkColors.background });
  });

  it('follows the OS scheme when set to system and changes live', async () => {
    const mounts = jest.fn();
    const child = <Probe onMount={mounts} />;
    jest.mocked(useColorScheme).mockReturnValue('dark');
    const view = await render(<Harness mode="system" child={child} />);
    expect(screen.getByTestId('probe')).toHaveStyle({ backgroundColor: darkColors.background });
    jest.mocked(useColorScheme).mockReturnValue('light');
    await view.rerender(<Harness mode="system" child={child} />);
    expect(screen.getByTestId('probe')).toHaveStyle({ backgroundColor: lightColors.background });
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('switches theme without remounting the screens below it', async () => {
    const mounts = jest.fn();
    const child = <Probe onMount={mounts} />;
    const view = await render(<Harness mode="light" child={child} />);
    await view.rerender(<Harness mode="dark" child={child} />);
    await view.rerender(<Harness mode="system" child={child} />);
    await view.rerender(<Harness mode="dark" child={child} />);
    expect(screen.getByTestId('probe')).toHaveStyle({ backgroundColor: darkColors.background });
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('falls back to the light theme when no provider is mounted', async () => {
    await render(<Probe onMount={jest.fn()} />);
    expect(screen.getByTestId('probe')).toHaveStyle({ backgroundColor: lightColors.background });
    expect(screen.getByTestId('probe')).toHaveAccessibleName('light full normal');
  });
});

describe('reduced motion', () => {
  it('is on when the setting is on, even if the OS allows motion', async () => {
    await render(<Harness mode="light" reducedMotion="on" child={<Probe onMount={jest.fn()} />} />);
    expect(screen.getByTestId('probe')).toHaveAccessibleName('light reduced normal');
  });

  it('is off when the setting is off, even if the OS asks for reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<Harness mode="light" reducedMotion="off" child={<Probe onMount={jest.fn()} />} />);
    await act(async () => undefined);
    expect(screen.getByTestId('probe')).toHaveAccessibleName('light full normal');
  });

  it('follows the OS setting when set to system, including live changes', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<Harness mode="light" reducedMotion="system" child={<Probe onMount={jest.fn()} />} />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveAccessibleName('light reduced normal'));
    const listener = listeners.get('reduceMotionChanged');
    expect(listener).toBeDefined();
    await act(async () => listener?.(false));
    expect(screen.getByTestId('probe')).toHaveAccessibleName('light full normal');
  });
});

describe('high contrast', () => {
  it('uses the OS increase-contrast setting on iOS', async () => {
    expect(Platform.OS).toBe('ios');
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true);
    await render(<Harness mode="dark" child={<Probe onMount={jest.fn()} />} />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveAccessibleName('dark full hc'));
  });
});

describe('theme resolution helpers', () => {
  it('resolves the scheme for every mode', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
  });

  it('resolves reduced motion per preference', () => {
    expect(resolveReducedMotion('on', false)).toBe(true);
    expect(resolveReducedMotion('off', true)).toBe(false);
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
  });

  it('caches themes so context consumers see stable objects', () => {
    const options = { highContrast: false, reducedMotion: true, boldText: false };
    expect(createTheme('dark', options)).toBe(createTheme('dark', { ...options }));
    expect(createTheme('dark', options)).not.toBe(createTheme('light', options));
  });

  it('elevates light surfaces with a soft shadow and dark surfaces with tone and a top edge only', () => {
    expect(createTheme('light').elevation.raised).toMatchObject({ shadowOpacity: 0.1, shadowRadius: 16, elevation: 6 });
    const dark = createTheme('dark').elevation.raised;
    expect(dark).not.toHaveProperty('shadowOpacity');
    expect(dark).toMatchObject({ borderTopWidth: 1, borderTopColor: darkColors.border });
  });
});

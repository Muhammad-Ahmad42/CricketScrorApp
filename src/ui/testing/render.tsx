import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider, type ReducedMotionPreference, type ThemeMode } from '../theme';

export const TEST_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export interface ThemedRenderOptions {
  readonly mode?: ThemeMode;
  readonly reducedMotion?: ReducedMotionPreference;
  readonly metrics?: Metrics;
}

export function themedWrapper({ mode = 'light', reducedMotion = 'off', metrics = TEST_METRICS }: ThemedRenderOptions = {}) {
  return function ThemedTestProviders({ children }: { readonly children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider mode={mode} reducedMotion={reducedMotion}>
          {children}
        </ThemeProvider>
      </SafeAreaProvider>
    );
  };
}

export function renderWithTheme(ui: ReactElement, options: ThemedRenderOptions = {}) {
  return render(ui, { wrapper: themedWrapper(options) });
}

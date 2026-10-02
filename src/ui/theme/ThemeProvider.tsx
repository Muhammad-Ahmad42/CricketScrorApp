import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  createTheme,
  resolveReducedMotion,
  resolveScheme,
  type ReducedMotionPreference,
  type Theme,
  type ThemeMode,
} from './theme';
import type { GlassTokens } from './glass';
import { useSystemAccessibility } from './useSystemAccessibility';

const ThemeContext = createContext<Theme>(createTheme('light'));

export interface ThemeProviderProps {
  readonly mode: ThemeMode;
  readonly reducedMotion?: ReducedMotionPreference;
  readonly reduceTransparency?: boolean;
  readonly children: ReactNode;
}

export function ThemeProvider({ mode, reducedMotion = 'system', reduceTransparency = false, children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const systemReducedMotion = useSystemAccessibility('reduceMotion');
  const highContrast = useSystemAccessibility('highContrast');
  const boldText = useSystemAccessibility('boldText');
  const systemReduceTransparency = useSystemAccessibility('reduceTransparency');
  const theme = createTheme(resolveScheme(mode, systemScheme), {
    highContrast,
    reducedMotion: resolveReducedMotion(reducedMotion, systemReducedMotion),
    boldText,
    reduceTransparency: reduceTransparency || systemReduceTransparency,
  });
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useReducedMotion(): boolean {
  return useContext(ThemeContext).motion.reduced;
}

export function useGlass(): GlassTokens {
  return useContext(ThemeContext).glass;
}

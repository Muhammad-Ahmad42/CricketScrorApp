import type { ReactNode } from 'react';
import { isGlassInkLevel, type GlassLevel } from './glass';
import { glassInkTheme } from './theme';
import { ThemeScope, useTheme } from './ThemeProvider';

export interface GlassInkScopeProps {
  readonly level: GlassLevel;
  readonly children?: ReactNode;
}

export function GlassInkScope({ level, children }: GlassInkScopeProps) {
  const theme = useTheme();
  if (!isGlassInkLevel(level)) {
    return <>{children}</>;
  }
  return <ThemeScope theme={glassInkTheme(theme)}>{children}</ThemeScope>;
}

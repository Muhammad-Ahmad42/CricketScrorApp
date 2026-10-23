import { createContext, useContext, type ReactNode } from 'react';
import type { Theme } from './theme';
import { useTheme } from './ThemeProvider';

export type SurfaceLevel = 'base' | 'raised';

const SurfaceLevelContext = createContext<SurfaceLevel>('base');

export interface SurfaceLevelScopeProps {
  readonly level: SurfaceLevel;
  readonly children?: ReactNode;
}

export function SurfaceLevelScope({ level, children }: SurfaceLevelScopeProps) {
  return <SurfaceLevelContext.Provider value={level}>{children}</SurfaceLevelContext.Provider>;
}

export function contentSurface(theme: Theme, level: SurfaceLevel): string {
  return level === 'raised' ? theme.color.surfaceElevated : theme.color.surface;
}

export function useSurfaceLevel(): SurfaceLevel {
  return useContext(SurfaceLevelContext);
}

export function useContentSurface(): string {
  return contentSurface(useTheme(), useContext(SurfaceLevelContext));
}

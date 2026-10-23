import type { ReactNode } from 'react';
import { ChromeInsetsProvider } from '../glass/chromeInsets';
import { useToastAnchor } from '../layout/toastAnchor';
import { useInsets } from '../layout/useInsets';
import { space } from '../theme';
import { tabBarMetrics } from './TabBar';

export interface TabChromeProps {
  readonly children: ReactNode;
}

export function tabChromeBottom(bottomInset: number): number {
  return Math.max(0, tabBarMetrics(bottomInset).footprint - bottomInset);
}

export function TabChrome({ children }: TabChromeProps) {
  const insets = useInsets();
  const bottom = tabChromeBottom(insets.bottom);
  useToastAnchor({ edge: 'bottom', offset: insets.bottom + bottom + space.md });
  return <ChromeInsetsProvider bottom={bottom}>{children}</ChromeInsetsProvider>;
}

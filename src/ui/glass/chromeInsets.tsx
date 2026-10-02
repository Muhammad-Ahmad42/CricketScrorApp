import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useInsets } from '../layout/useInsets';

export interface ChromeInsets {
  readonly top: number;
  readonly bottom: number;
}

const NO_CHROME: ChromeInsets = { top: 0, bottom: 0 };

const ChromeInsetsContext = createContext<ChromeInsets>(NO_CHROME);

export interface ChromeInsetsProviderProps {
  readonly top?: number;
  readonly bottom?: number;
  readonly children: ReactNode;
}

export function ChromeInsetsProvider({ top = 0, bottom = 0, children }: ChromeInsetsProviderProps) {
  const parent = useContext(ChromeInsetsContext);
  const nextTop = parent.top + Math.max(0, top);
  const nextBottom = parent.bottom + Math.max(0, bottom);
  const value = useMemo(() => ({ top: nextTop, bottom: nextBottom }), [nextTop, nextBottom]);
  return <ChromeInsetsContext.Provider value={value}>{children}</ChromeInsetsContext.Provider>;
}

export function useChromeInsets(): ChromeInsets {
  return useContext(ChromeInsetsContext);
}

export function useContentInsets(): EdgeInsets {
  const safe = useInsets();
  const chrome = useChromeInsets();
  return { top: safe.top + chrome.top, bottom: safe.bottom + chrome.bottom, left: safe.left, right: safe.right };
}

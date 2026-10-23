import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const OverlayReadyContext = createContext<boolean | null>(null);

export interface OverlayReadyProviderProps {
  readonly ready: boolean;
  readonly children: ReactNode;
}

export function OverlayReadyProvider({ ready, children }: OverlayReadyProviderProps) {
  return <OverlayReadyContext.Provider value={ready}>{children}</OverlayReadyContext.Provider>;
}

export function useOverlayReady(): boolean | null {
  return useContext(OverlayReadyContext);
}

export function useOverlaySettled(visible: boolean, settleMs: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const timer = setTimeout(() => setSettled(true), settleMs);
    return () => {
      clearTimeout(timer);
      setSettled(false);
    };
  }, [visible, settleMs]);
  return settled;
}

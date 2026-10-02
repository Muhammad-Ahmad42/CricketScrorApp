import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastEdge = 'top' | 'bottom';

export interface ToastAnchor {
  readonly edge: ToastEdge;
  readonly offset: number;
}

interface ToastAnchorRegistry {
  readonly set: (id: number, anchor: ToastAnchor) => void;
  readonly clear: (id: number) => void;
}

const NO_REGISTRY: ToastAnchorRegistry = { set: () => undefined, clear: () => undefined };

const RegistryContext = createContext<ToastAnchorRegistry>(NO_REGISTRY);
const ActiveContext = createContext<ToastAnchor | null>(null);

let nextAnchorId = 0;

export function latestToastAnchor(anchors: ReadonlyMap<number, ToastAnchor>): ToastAnchor | null {
  let best: { readonly id: number; readonly anchor: ToastAnchor } | null = null;
  for (const [id, anchor] of anchors) {
    if (best === null || id > best.id) {
      best = { id, anchor };
    }
  }
  return best === null ? null : best.anchor;
}

function sameAnchor(a: ToastAnchor | null, b: ToastAnchor | null): boolean {
  return a === b || (a !== null && b !== null && a.edge === b.edge && a.offset === b.offset);
}

export interface ToastAnchorProviderProps {
  readonly children: ReactNode;
}

export function ToastAnchorProvider({ children }: ToastAnchorProviderProps) {
  const anchors = useRef(new Map<number, ToastAnchor>());
  const [active, setActive] = useState<ToastAnchor | null>(null);
  const refresh = useCallback(() => {
    const next = latestToastAnchor(anchors.current);
    setActive((current) => (sameAnchor(current, next) ? current : next));
  }, []);
  const registry = useMemo<ToastAnchorRegistry>(
    () => ({
      set: (id, anchor) => {
        anchors.current.set(id, anchor);
        refresh();
      },
      clear: (id) => {
        anchors.current.delete(id);
        refresh();
      },
    }),
    [refresh],
  );
  return (
    <RegistryContext.Provider value={registry}>
      <ActiveContext.Provider value={active}>{children}</ActiveContext.Provider>
    </RegistryContext.Provider>
  );
}

export function useToastAnchor(anchor: ToastAnchor | null): void {
  const registry = useContext(RegistryContext);
  const [id] = useState(() => {
    nextAnchorId += 1;
    return nextAnchorId;
  });
  const edge = anchor?.edge ?? null;
  const offset = anchor === null ? null : Math.max(0, Math.round(anchor.offset));
  useEffect(() => {
    if (edge === null || offset === null) {
      return undefined;
    }
    registry.set(id, { edge, offset });
    return () => registry.clear(id);
  }, [registry, id, edge, offset]);
}

export function useActiveToastAnchor(): ToastAnchor | null {
  return useContext(ActiveContext);
}

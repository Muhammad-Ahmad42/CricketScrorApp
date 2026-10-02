import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import { BlurTargetView } from 'expo-blur';

interface BackdropScope {
  readonly target: RefObject<View | null>;
  readonly ready: boolean;
  readonly markReady: () => void;
}

const ScopeContext = createContext<BackdropScope | null>(null);
const InsideTargetContext = createContext(false);

export interface GlassBackdropScopeProps {
  readonly children: ReactNode;
}

export function GlassBackdropScope({ children }: GlassBackdropScopeProps) {
  const target = useRef<View>(null);
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  const value = useMemo(() => ({ target, ready, markReady }), [ready, markReady]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export interface GlassBackdropProps extends ViewProps {
  readonly children?: ReactNode;
}

export function GlassBackdrop({ children, onLayout, ...rest }: GlassBackdropProps) {
  const scope = useContext(ScopeContext);
  if (Platform.OS !== 'android' || scope === null) {
    return (
      <View {...rest} onLayout={onLayout}>
        {children}
      </View>
    );
  }
  const handleLayout = (event: LayoutChangeEvent) => {
    scope.markReady();
    onLayout?.(event);
  };
  return (
    <BlurTargetView {...rest} ref={scope.target} onLayout={handleLayout}>
      <InsideTargetContext.Provider value>{children}</InsideTargetContext.Provider>
    </BlurTargetView>
  );
}

export function useBlurTarget(): RefObject<View | null> | undefined {
  const scope = useContext(ScopeContext);
  const inside = useContext(InsideTargetContext);
  if (Platform.OS !== 'android' || scope === null || inside || !scope.ready) {
    return undefined;
  }
  return scope.target;
}

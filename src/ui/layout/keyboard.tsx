import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Dimensions, Keyboard, Platform, View, type KeyboardEvent, type KeyboardEventName, type StyleProp, type ViewStyle } from 'react-native';
import { space, useReducedMotion } from '../theme';
import { useInsets } from './useInsets';

export const KEYBOARD_REVEAL_MARGIN = space.xl;

export interface KeyboardEventNames {
  readonly show: readonly KeyboardEventName[];
  readonly hide: readonly KeyboardEventName[];
}

export function keyboardEventNames(os: string): KeyboardEventNames {
  if (os === 'ios') {
    return { show: ['keyboardWillShow', 'keyboardWillChangeFrame'], hide: ['keyboardWillHide'] };
  }
  if (os === 'android') {
    return { show: ['keyboardDidShow'], hide: ['keyboardDidHide'] };
  }
  return { show: [], hide: [] };
}

export type KeyboardInsetsMode = 'auto' | 'padding';

export function keyboardInsetsMode(os: string): KeyboardInsetsMode {
  return os === 'ios' ? 'auto' : 'padding';
}

export interface KeyboardEndFrame {
  readonly height: number;
  readonly screenY: number;
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function keyboardOverlap(end: KeyboardEndFrame | null | undefined, windowHeight: number, os: string = Platform.OS, bottomInset: number = 0): number {
  if (end === null || end === undefined) {
    return 0;
  }
  const height = Math.max(0, finite(end.height));
  const screenY = finite(end.screenY);
  const frame = screenY > 0 && windowHeight > 0 ? Math.max(0, windowHeight - screenY) : null;
  const ime = height > 0 ? height + Math.max(0, finite(bottomInset)) : 0;
  const raw = os === 'ios' ? (frame ?? height) : Math.max(ime, frame ?? 0);
  const capped = windowHeight > 0 ? Math.min(raw, windowHeight) : raw;
  return Math.round(capped);
}

function initialFrame(): KeyboardEndFrame | null {
  if (!Keyboard.isVisible()) {
    return null;
  }
  return Keyboard.metrics() ?? null;
}

function sameFrame(a: KeyboardEndFrame | null, b: KeyboardEndFrame | null): boolean {
  return a === b || (a !== null && b !== null && a.height === b.height && a.screenY === b.screenY);
}

export function useKeyboardOverlap(): number {
  const reduced = useReducedMotion();
  const insets = useInsets();
  const [end, setEnd] = useState<KeyboardEndFrame | null>(initialFrame);
  useEffect(() => {
    const names = keyboardEventNames(Platform.OS);
    const animate = (event: KeyboardEvent | undefined) => {
      if (!reduced && event !== undefined && event !== null && typeof event.duration === 'number' && event.duration > 0) {
        Keyboard.scheduleLayoutAnimation(event);
      }
    };
    const update = (next: KeyboardEndFrame | null) => {
      setEnd((current) => (sameFrame(current, next) ? current : next));
    };
    const subscriptions = [
      ...names.show.map((name) =>
        Keyboard.addListener(name, (event: KeyboardEvent) => {
          animate(event);
          const coordinates = event?.endCoordinates;
          update(coordinates ? { height: coordinates.height, screenY: coordinates.screenY } : null);
        }),
      ),
      ...names.hide.map((name) =>
        Keyboard.addListener(name, (event: KeyboardEvent) => {
          animate(event);
          update(null);
        }),
      ),
    ];
    return () => {
      for (const subscription of subscriptions) {
        subscription.remove();
      }
    };
  }, [reduced]);
  return keyboardOverlap(end, Dimensions.get('window').height, Platform.OS, insets.bottom);
}

export interface RevealInput {
  readonly top: number;
  readonly bottom: number;
  readonly scrollY: number;
  readonly visibleTop: number;
  readonly visibleBottom: number;
  readonly margin?: number;
}

export function revealScrollOffset({ top, bottom, scrollY, visibleTop, visibleBottom, margin = 0 }: RevealInput): number | null {
  const height = bottom - top;
  const room = visibleBottom - visibleTop;
  const gap = Math.max(0, Math.min(margin, (room - height) / 2));
  const low = visibleTop + gap;
  const high = visibleBottom - gap;
  let delta = 0;
  if (height > high - low) {
    delta = top - low;
  } else if (bottom > high) {
    delta = bottom - high;
  } else if (top < low) {
    delta = top - low;
  }
  if (delta === 0) {
    return null;
  }
  return Math.max(0, Math.round(scrollY + delta));
}

export interface RevealFrame {
  readonly top: number;
  readonly bottom: number;
}

export function revealFrame(frames: readonly RevealFrame[], room: number): RevealFrame | null {
  if (frames.length === 0) {
    return null;
  }
  return frames.find((frame) => frame.bottom - frame.top <= room) ?? frames[frames.length - 1];
}

export interface KeyboardTarget {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}

export interface KeyboardScope {
  readonly focus: (target: KeyboardTarget, fallbacks?: readonly KeyboardTarget[]) => void;
  readonly blur: (target: KeyboardTarget) => void;
}

const KeyboardScopeContext = createContext<KeyboardScope | null>(null);

export interface KeyboardScopeProviderProps {
  readonly value: KeyboardScope;
  readonly children: ReactNode;
}

export function KeyboardScopeProvider({ value, children }: KeyboardScopeProviderProps) {
  return <KeyboardScopeContext.Provider value={value}>{children}</KeyboardScopeContext.Provider>;
}

export function useKeyboardScope(): KeyboardScope | null {
  return useContext(KeyboardScopeContext);
}

export interface ScrollableTarget {
  scrollTo(options: { readonly x?: number; readonly y?: number; readonly animated?: boolean }): void;
}

export interface KeyboardRevealOptions {
  readonly scrollRef: RefObject<ScrollableTarget | null>;
  readonly enabled: boolean;
  readonly overlap: number;
  readonly visibleTop: number;
  readonly obscuredBottom: number;
  readonly animated: boolean;
}

export interface KeyboardReveal {
  readonly scope: KeyboardScope;
  readonly trackScroll: (offsetY: number) => void;
  readonly reveal: () => void;
}

function measureAll(targets: readonly KeyboardTarget[], done: (frames: readonly RevealFrame[]) => void): void {
  const frames: RevealFrame[] = [];
  const step = (index: number) => {
    if (index >= targets.length) {
      done(frames);
      return;
    }
    targets[index].measureInWindow((_x, y, _width, height) => {
      if (Number.isFinite(y) && Number.isFinite(height)) {
        frames.push({ top: y, bottom: y + height });
      }
      step(index + 1);
    });
  };
  step(0);
}

export function useKeyboardReveal(options: KeyboardRevealOptions): KeyboardReveal {
  const focused = useRef<readonly KeyboardTarget[] | null>(null);
  const scrollY = useRef(0);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const reveal = useCallback(() => {
    const targets = focused.current;
    const current = latest.current;
    if (targets === null || !current.enabled || current.overlap <= 0) {
      return;
    }
    measureAll(targets, (frames) => {
      const now = latest.current;
      const visibleTop = now.visibleTop;
      const visibleBottom = Dimensions.get('window').height - now.obscuredBottom;
      const frame = revealFrame(frames, visibleBottom - visibleTop);
      if (frame === null) {
        return;
      }
      const offset = revealScrollOffset({ ...frame, scrollY: scrollY.current, visibleTop, visibleBottom, margin: KEYBOARD_REVEAL_MARGIN });
      if (offset !== null) {
        now.scrollRef.current?.scrollTo({ y: offset, animated: now.animated });
      }
    });
  }, []);
  useEffect(() => {
    if (options.overlap > 0) {
      reveal();
    }
  }, [options.overlap, options.obscuredBottom, reveal]);
  const scope = useMemo<KeyboardScope>(
    () => ({
      focus: (target, fallbacks = []) => {
        focused.current = [target, ...fallbacks];
        reveal();
      },
      blur: (target) => {
        if (focused.current !== null && focused.current.includes(target)) {
          focused.current = null;
        }
      },
    }),
    [reveal],
  );
  const trackScroll = useCallback((offsetY: number) => {
    scrollY.current = offsetY;
  }, []);
  return { scope, trackScroll, reveal };
}

export interface KeyboardGroupProps {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function KeyboardGroup({ children, style, testID }: KeyboardGroupProps) {
  const parent = useKeyboardScope();
  const ref = useRef<View>(null);
  const scope = useMemo<KeyboardScope | null>(
    () =>
      parent === null
        ? null
        : {
            focus: (target, fallbacks = []) => {
              const group = ref.current;
              if (group === null) {
                parent.focus(target, fallbacks);
                return;
              }
              parent.focus(group, [target, ...fallbacks]);
            },
            blur: (target) => parent.blur(target),
          },
    [parent],
  );
  return (
    <View ref={ref} style={style} testID={testID} collapsable={false}>
      {scope === null ? children : <KeyboardScopeProvider value={scope}>{children}</KeyboardScopeProvider>}
    </View>
  );
}

export interface KeyboardField<T extends KeyboardTarget> {
  readonly ref: RefObject<T | null>;
  readonly coreRef: RefObject<T | null>;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
}

export function useKeyboardField<T extends KeyboardTarget>(): KeyboardField<T> {
  const scope = useKeyboardScope();
  const ref = useRef<T | null>(null);
  const coreRef = useRef<T | null>(null);
  const onFocus = useCallback(() => {
    if (scope !== null && ref.current !== null) {
      const core = coreRef.current;
      scope.focus(ref.current, core !== null && core !== ref.current ? [core] : []);
    }
  }, [scope]);
  const onBlur = useCallback(() => {
    if (scope !== null && ref.current !== null) {
      scope.blur(ref.current);
    }
  }, [scope]);
  return { ref, coreRef, onFocus, onBlur };
}

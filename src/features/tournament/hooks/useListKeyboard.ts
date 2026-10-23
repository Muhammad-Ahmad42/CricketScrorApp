import { useRef, type RefObject } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { SCREEN_END_SPACE, useKeyboardOverlap, useKeyboardReveal, useScreenList, useTheme, type KeyboardScope, type ScrollableTarget } from '@/ui';

export interface ListKeyboard {
  readonly scope: KeyboardScope;
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function listObscuredBottom(paddingBottom: number): number {
  return Math.max(0, paddingBottom - SCREEN_END_SPACE);
}

export function useListKeyboard<T>(listRef: RefObject<FlatList<T> | null>): ListKeyboard {
  const theme = useTheme();
  const list = useScreenList();
  const overlap = useKeyboardOverlap();
  const target = useRef<ScrollableTarget>({
    scrollTo: ({ y, animated }) => listRef.current?.scrollToOffset({ offset: y ?? 0, animated }),
  });
  const reveal = useKeyboardReveal({
    scrollRef: target,
    enabled: true,
    overlap,
    visibleTop: list.contentInset.paddingTop,
    obscuredBottom: listObscuredBottom(list.contentInset.paddingBottom),
    animated: !theme.motion.reduced,
  });
  return {
    scope: reveal.scope,
    onScroll: (event) => {
      reveal.trackScroll(event.nativeEvent.contentOffset.y);
      list.onScroll(event);
    },
  };
}

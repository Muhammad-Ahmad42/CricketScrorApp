import { useCallback, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export function useMeasuredHeight(initial = 0): readonly [number, (event: LayoutChangeEvent) => void] {
  const [height, setHeight] = useState(initial);
  const last = useRef(initial);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next !== last.current) {
      last.current = next;
      setHeight(next);
    }
  }, []);
  return [height, onLayout] as const;
}

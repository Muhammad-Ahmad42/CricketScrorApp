import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { EDGE_FADE_WIDTH, EdgeFades, type RowOverflow } from '../glass/EdgeFades';
import { space, useTheme } from '../theme';

export interface ScrollRowProps {
  readonly children: ReactNode;
  readonly activeIndex?: number;
  readonly fadeColor?: string;
  readonly gap?: number;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly accessibilityRole?: 'tablist' | 'radiogroup' | 'list' | 'toolbar';
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export const SCROLL_ROW_FADE = EDGE_FADE_WIDTH;
export const SCROLL_ROW_EDGE = 2;

export interface RowSpan {
  readonly x: number;
  readonly width: number;
}

export type { RowOverflow };

export function rowOverflow(offset: number, viewport: number, content: number): RowOverflow {
  if (viewport <= 0 || content <= viewport + SCROLL_ROW_EDGE) {
    return { start: false, end: false };
  }
  return { start: offset > SCROLL_ROW_EDGE, end: offset + viewport < content - SCROLL_ROW_EDGE };
}

export function revealOffset(span: RowSpan, offset: number, viewport: number, content: number): number | null {
  if (viewport <= 0) {
    return null;
  }
  const max = Math.max(0, content - viewport);
  if (span.x - SCROLL_ROW_FADE < offset) {
    return Math.max(0, Math.min(max, span.x - SCROLL_ROW_FADE));
  }
  if (span.x + span.width + SCROLL_ROW_FADE > offset + viewport) {
    return Math.max(0, Math.min(max, span.x + span.width + SCROLL_ROW_FADE - viewport));
  }
  return null;
}

export function ScrollRow({
  children,
  activeIndex,
  fadeColor,
  gap = 0,
  contentStyle,
  accessibilityRole,
  accessibilityLabel,
  testID,
}: ScrollRowProps) {
  const theme = useTheme();
  const scroll = useRef<ScrollView>(null);
  const spans = useRef(new Map<number, RowSpan>());
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const fade = fadeColor ?? theme.color.surface;
  const overflow = rowOverflow(offset, viewport, content);

  const reveal = useCallback(
    (index: number | undefined, animated: boolean) => {
      if (index === undefined) {
        return;
      }
      const span = spans.current.get(index);
      if (span === undefined) {
        return;
      }
      const next = revealOffset(span, offsetRef.current, viewport, content);
      if (next !== null) {
        scroll.current?.scrollTo({ x: next, animated });
      }
    },
    [viewport, content],
  );

  useEffect(() => {
    reveal(activeIndex, !theme.motion.reduced);
  }, [activeIndex, reveal, theme.motion.reduced]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    offsetRef.current = x;
    setOffset(x);
  };

  const items = Children.toArray(children);
  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID={testID}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        onLayout={(event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.width)}
        onContentSizeChange={(width: number) => setContent(width)}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, { gap }, contentStyle]}
      >
        {items.map((child, index) => (
          <View
            key={index}
            onLayout={(event: LayoutChangeEvent) => {
              const { x, width } = event.nativeEvent.layout;
              spans.current.set(index, { x, width });
              if (index === activeIndex) {
                reveal(index, false);
              }
            }}
          >
            {child}
          </View>
        ))}
      </ScrollView>
      <EdgeFades overflow={overflow} color={fade} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs },
});

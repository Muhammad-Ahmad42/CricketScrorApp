import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { AmbientBackground } from '../glass/AmbientBackground';
import { ChromeInsetsProvider, useChromeInsets, useContentInsets } from '../glass/chromeInsets';
import { GlassBackdrop, GlassBackdropScope } from '../glass/GlassBackdrop';
import { GlassBar } from '../glass/GlassBar';
import { GlassDock } from '../glass/GlassDock';
import { GLASS_SCROLL_THROTTLE, useGlassScroll, type GlassScrollHandler } from '../glass/useGlassScroll';
import { useMaterialProgress } from '../glass/useMaterialProgress';
import { useMeasuredHeight } from '../glass/useMeasuredHeight';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { GutterProvider, gutterFor, useGutter } from './gutter';
import { KeyboardScopeProvider, keyboardInsetsMode, useKeyboardOverlap, useKeyboardReveal, type KeyboardInsetsMode } from './keyboard';
import { useLayoutClass } from './layoutClass';
import { useToastAnchor } from './toastAnchor';
import { useInsets } from './useInsets';

export const COLUMN_MAX_WIDTH = 640;
export const WIDE_MAX_WIDTH = 1200;
export const SCREEN_BAR_TITLE_HEIGHT = 44;
export const SCREEN_HEADER_GAP = space.xs;

export interface ScreenScroll {
  readonly onScroll: GlassScrollHandler;
  readonly scrollEventThrottle: number;
}

const NO_SCROLL: ScreenScroll = { onScroll: () => undefined, scrollEventThrottle: GLASS_SCROLL_THROTTLE };

const ScreenScrollContext = createContext<ScreenScroll>(NO_SCROLL);

export function useScreenScroll(): ScreenScroll {
  return useContext(ScreenScrollContext);
}

export interface ScreenListInsets {
  readonly contentInset: { readonly paddingTop: number; readonly paddingBottom: number };
  readonly scrollIndicatorInsets: { readonly top: number; readonly bottom: number };
}

export interface ScreenList extends ScreenScroll, ScreenListInsets {}

const ScreenListContext = createContext<ScreenListInsets | null>(null);

export const SCREEN_END_SPACE = space['4xl'];

export function useScreenList(): ScreenList {
  const scroll = useContext(ScreenScrollContext);
  const own = useContext(ScreenListContext);
  const content = useContentInsets();
  const safe = useInsets();
  const insets = own ?? {
    contentInset: { paddingTop: content.top, paddingBottom: content.bottom + SCREEN_END_SPACE },
    scrollIndicatorInsets: { top: content.top - safe.top, bottom: content.bottom - safe.bottom },
  };
  return { onScroll: scroll.onScroll, scrollEventThrottle: scroll.scrollEventThrottle, ...insets };
}

export interface ScreenProps {
  readonly testID: string;
  readonly children: ReactNode;
  readonly scroll?: boolean;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly topInset?: boolean;
  readonly fullWidth?: boolean;
  readonly wide?: boolean;
  readonly inset?: boolean;
  readonly ambient?: boolean;
  readonly flat?: boolean;
  readonly barTitle?: string;
  readonly footerPadding?: ScreenFooterPadding;
  readonly onScrolledChange?: (scrolled: boolean) => void;
}

export type ScreenFooterPadding = 'comfortable' | 'flush';

export interface ScreenChromeInput {
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly parentBottom: number;
  readonly headerHeight: number | null;
  readonly footerHeight: number | null;
  readonly footerPadding?: ScreenFooterPadding;
  readonly keyboard?: number;
  readonly keyboardInsets?: KeyboardInsetsMode;
}

export interface ScreenChrome {
  readonly contentTop: number;
  readonly contentBottom: number;
  readonly addedTop: number;
  readonly addedBottom: number;
  readonly footerOffset: number;
  readonly footerPadding: number;
  readonly obscuredBottom: number;
}

export function screenChrome({
  safeTop,
  safeBottom,
  parentBottom,
  headerHeight,
  footerHeight,
  footerPadding: padding = 'comfortable',
  keyboard = 0,
  keyboardInsets = 'padding',
}: ScreenChromeInput): ScreenChrome {
  const occupied = safeBottom + parentBottom;
  const gap = padding === 'flush' ? 0 : space.md;
  const contentTop = headerHeight === null ? safeTop : Math.max(safeTop, headerHeight);
  const restingOffset = footerHeight !== null && parentBottom > 0 ? occupied : 0;
  const resting = footerHeight === null ? occupied : Math.max(occupied, restingOffset + footerHeight);
  const addedTop = contentTop - safeTop;
  const addedBottom = resting - occupied;
  if (keyboard > 0) {
    const obscuredBottom = keyboard + (footerHeight ?? 0);
    return {
      contentTop,
      contentBottom: keyboardInsets === 'padding' ? Math.max(resting, obscuredBottom) : resting,
      addedTop,
      addedBottom,
      footerOffset: footerHeight === null ? 0 : keyboard,
      footerPadding: gap,
      obscuredBottom,
    };
  }
  return {
    contentTop,
    contentBottom: resting,
    addedTop,
    addedBottom,
    footerOffset: restingOffset,
    footerPadding: parentBottom > 0 ? gap : gap + safeBottom,
    obscuredBottom: resting,
  };
}

interface ScrollableNodeMetrics {
  readonly offsetWidth?: unknown;
  readonly clientWidth?: unknown;
}

export function scrollbarGutter(node: ScrollableNodeMetrics | null | undefined): number {
  if (node === null || node === undefined || typeof node.offsetWidth !== 'number' || typeof node.clientWidth !== 'number') {
    return 0;
  }
  return Math.max(0, node.offsetWidth - node.clientWidth);
}

function useScrollbarGutter() {
  const ref = useRef<ScrollView>(null);
  const [gutter, setGutter] = useState(0);
  const measure = () => {
    if (Platform.OS !== 'web') {
      return;
    }
    const node = ref.current?.getScrollableNode?.() as ScrollableNodeMetrics | null | undefined;
    const next = scrollbarGutter(node);
    setGutter((current) => (current === next ? current : next));
  };
  return { ref, gutter, measure };
}

interface StatusBarGlassProps {
  readonly scrolled: boolean;
  readonly height: number;
  readonly title?: string;
}

function StatusBarGlass({ scrolled, height, title }: StatusBarGlassProps) {
  const fade = useMaterialProgress(scrolled);
  if (height <= 0 && !title) {
    return null;
  }
  return (
    <GlassBar floating scrolled={scrolled} rest={0} safeArea={false} pointerEvents="none" style={{ height: height + (title ? SCREEN_BAR_TITLE_HEIGHT : 0), paddingTop: height }}>
      {title ? (
        <Animated.View style={[styles.barTitle, fade]} accessible={false} importantForAccessibility="no-hide-descendants">
          <Text variant="headline" numberOfLines={1} align="center">
            {title}
          </Text>
        </Animated.View>
      ) : null}
    </GlassBar>
  );
}

export function Screen({
  testID,
  children,
  scroll = true,
  header,
  footer,
  topInset = true,
  fullWidth = false,
  wide = false,
  inset = false,
  flat = false,
  barTitle,
  footerPadding = 'comfortable',
  onScrolledChange,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useInsets();
  const parent = useChromeInsets();
  const layout = useLayoutClass();
  const glassScroll = useGlassScroll();
  const scrollbar = useScrollbarGutter();
  const keyboard = useKeyboardOverlap();
  const gutter = gutterFor(layout.width);
  const gutterStyle = scrollbar.gutter > 0 ? { paddingRight: scrollbar.gutter } : null;
  useEffect(() => {
    onScrolledChange?.(glassScroll.scrolled);
  }, [glassScroll.scrolled, onScrolledChange]);
  const [headerHeight, onHeaderLayout] = useMeasuredHeight();
  const [footerHeight, onFooterLayout] = useMeasuredHeight();
  const centred = !fullWidth && (layout.width === 'medium' || layout.width === 'expanded');
  const column = centred ? (wide ? styles.wideColumn : styles.column) : styles.stretch;
  const safeTop = topInset ? insets.top : 0;
  const hasHeader = header !== undefined && header !== null;
  const hasFooter = footer !== undefined && footer !== null;
  const chrome = screenChrome({
    safeTop,
    safeBottom: insets.bottom,
    parentBottom: parent.bottom,
    headerHeight: hasHeader ? headerHeight : null,
    footerHeight: hasFooter ? footerHeight : null,
    footerPadding,
    keyboard,
    keyboardInsets: scroll ? keyboardInsetsMode(Platform.OS) : 'padding',
  });
  const padsOwnTop = !scroll && !hasHeader;
  const listInsets: ScreenListInsets = {
    contentInset: { paddingTop: padsOwnTop ? 0 : chrome.contentTop, paddingBottom: chrome.contentBottom + SCREEN_END_SPACE },
    scrollIndicatorInsets: { top: padsOwnTop ? 0 : chrome.addedTop, bottom: chrome.contentBottom - insets.bottom },
  };
  useToastAnchor({ edge: 'bottom', offset: chrome.obscuredBottom + space.md });
  const keyboardReveal = useKeyboardReveal({
    scrollRef: scrollbar.ref,
    enabled: scroll,
    overlap: keyboard,
    visibleTop: chrome.contentTop,
    obscuredBottom: chrome.obscuredBottom,
    animated: !theme.motion.reduced,
  });
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    keyboardReveal.trackScroll(event.nativeEvent.contentOffset.y);
    glassScroll.onScroll(event);
  };
  const insetStyle = inset ? { paddingHorizontal: gutter } : null;

  const body = scroll ? (
    <ScrollView
      ref={scrollbar.ref}
      testID={`${testID}-scroll`}
      style={styles.root}
      onLayout={scrollbar.measure}
      onContentSizeChange={scrollbar.measure}
      contentContainerStyle={[column, styles.scrollContent, listInsets.contentInset, insetStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      onScroll={onScroll}
      scrollEventThrottle={glassScroll.scrollEventThrottle}
      scrollIndicatorInsets={listInsets.scrollIndicatorInsets}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.root, column, insetStyle]}>{children}</View>
  );

  return (
    <View testID={testID} style={[styles.root, { backgroundColor: theme.color.background, paddingTop: padsOwnTop ? safeTop : 0 }]}>
      <GutterProvider value={gutter}>
        <KeyboardScopeProvider value={keyboardReveal.scope}>
          <ChromeInsetsProvider top={chrome.addedTop} bottom={chrome.addedBottom}>
            <ScreenScrollContext.Provider value={glassScroll}>
              <ScreenListContext.Provider value={listInsets}>
                <GlassBackdropScope>
                  {hasHeader ? (
                    <GlassBar
                      floating
                      scrolled={glassScroll.scrolled}
                      safeArea={topInset}
                      onLayout={onHeaderLayout}
                      testID={`${testID}-header`}
                      style={[styles.headerBar, gutterStyle]}
                    >
                      <View style={column}>{header}</View>
                    </GlassBar>
                  ) : null}
                  <GlassBackdrop style={[styles.root, { backgroundColor: theme.color.background }]}>
                    {flat ? null : <AmbientBackground testID={`${testID}-ambient`} />}
                    {body}
                  </GlassBackdrop>
                  {!hasHeader && scroll ? <StatusBarGlass scrolled={glassScroll.scrolled} height={safeTop} title={barTitle} /> : null}
                  {hasFooter ? (
                    <GlassDock
                      floating
                      safeArea={false}
                      offset={chrome.footerOffset}
                      onLayout={onFooterLayout}
                      testID={`${testID}-footer`}
                      style={[
                        footerPadding === 'flush' ? null : [styles.footer, { paddingHorizontal: gutter }],
                        { paddingBottom: chrome.footerPadding },
                        scrollbar.gutter > 0 ? { marginRight: scrollbar.gutter } : null,
                      ]}
                    >
                      <View style={column}>{footer}</View>
                    </GlassDock>
                  ) : null}
                </GlassBackdropScope>
              </ScreenListContext.Provider>
            </ScreenScrollContext.Provider>
          </ChromeInsetsProvider>
        </KeyboardScopeProvider>
      </GutterProvider>
    </View>
  );
}

export interface ScreenHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly level?: 'root' | 'stack';
  readonly trailing?: ReactNode;
  readonly testID?: string;
}

export function ScreenHeader({ title, subtitle, level = 'root', trailing, testID }: ScreenHeaderProps) {
  const gutter = useGutter();
  return (
    <View style={[styles.header, { paddingHorizontal: gutter }]} testID={testID}>
      <View style={styles.headerText}>
        <Text variant={level === 'root' ? 'title1' : 'title2'} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  column: { alignSelf: 'center', width: '100%', maxWidth: COLUMN_MAX_WIDTH },
  wideColumn: { alignSelf: 'center', width: '100%', maxWidth: WIDE_MAX_WIDTH },
  scrollContent: { paddingBottom: space['4xl'] },
  footer: { paddingTop: space.md },
  headerBar: { paddingBottom: SCREEN_HEADER_GAP },
  barTitle: { height: SCREEN_BAR_TITLE_HEIGHT, justifyContent: 'center', paddingHorizontal: space['4xl'] },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: space.md,
    paddingBottom: space.xs,
    gap: space.sm,
  },
  headerText: { flex: 1, gap: space.xxs },
});

import { createContext, useContext, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { useLayoutClass } from './layoutClass';
import { useToastAnchor } from './toastAnchor';
import { useInsets } from './useInsets';

export const COLUMN_MAX_WIDTH = 640;
export const SCREEN_BAR_TITLE_HEIGHT = 44;

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
  readonly ambient?: boolean;
  readonly barTitle?: string;
  readonly footerPadding?: ScreenFooterPadding;
}

export type ScreenFooterPadding = 'comfortable' | 'flush';

export interface ScreenChromeInput {
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly parentBottom: number;
  readonly headerHeight: number | null;
  readonly footerHeight: number | null;
  readonly footerPadding?: ScreenFooterPadding;
}

export interface ScreenChrome {
  readonly contentTop: number;
  readonly contentBottom: number;
  readonly addedTop: number;
  readonly addedBottom: number;
  readonly footerOffset: number;
  readonly footerPadding: number;
}

export function screenChrome({
  safeTop,
  safeBottom,
  parentBottom,
  headerHeight,
  footerHeight,
  footerPadding: padding = 'comfortable',
}: ScreenChromeInput): ScreenChrome {
  const occupied = safeBottom + parentBottom;
  const footerOffset = footerHeight !== null && parentBottom > 0 ? occupied : 0;
  const gap = padding === 'flush' ? 0 : space.md;
  const footerPadding = parentBottom > 0 ? gap : gap + safeBottom;
  const contentBottom = footerHeight === null ? occupied : Math.max(occupied, footerOffset + footerHeight);
  const contentTop = headerHeight === null ? safeTop : Math.max(safeTop, headerHeight);
  return {
    contentTop,
    contentBottom,
    addedTop: contentTop - safeTop,
    addedBottom: contentBottom - occupied,
    footerOffset,
    footerPadding,
  };
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
    <GlassBar floating scrolled={scrolled} safeArea={false} pointerEvents="none" style={{ height: height + (title ? SCREEN_BAR_TITLE_HEIGHT : 0), paddingTop: height }}>
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
  ambient = false,
  barTitle,
  footerPadding = 'comfortable',
}: ScreenProps) {
  const theme = useTheme();
  const insets = useInsets();
  const parent = useChromeInsets();
  const layout = useLayoutClass();
  const glassScroll = useGlassScroll();
  const [headerHeight, onHeaderLayout] = useMeasuredHeight();
  const [footerHeight, onFooterLayout] = useMeasuredHeight();
  const centred = !fullWidth && (layout.width === 'medium' || layout.width === 'expanded');
  const column = centred ? styles.column : styles.stretch;
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
  });
  const padsOwnTop = !scroll && !hasHeader;
  const listInsets: ScreenListInsets = {
    contentInset: { paddingTop: padsOwnTop ? 0 : chrome.contentTop, paddingBottom: chrome.contentBottom + SCREEN_END_SPACE },
    scrollIndicatorInsets: { top: padsOwnTop ? 0 : chrome.addedTop, bottom: chrome.contentBottom - insets.bottom },
  };
  useToastAnchor({ edge: 'bottom', offset: chrome.contentBottom + space.md });

  const body = scroll ? (
    <ScrollView
      testID={`${testID}-scroll`}
      style={styles.root}
      contentContainerStyle={[column, styles.scrollContent, listInsets.contentInset]}
      keyboardShouldPersistTaps="handled"
      onScroll={glassScroll.onScroll}
      scrollEventThrottle={glassScroll.scrollEventThrottle}
      scrollIndicatorInsets={listInsets.scrollIndicatorInsets}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.root, column]}>{children}</View>
  );

  return (
    <View testID={testID} style={[styles.root, { backgroundColor: theme.color.background, paddingTop: padsOwnTop ? safeTop : 0 }]}>
      <ChromeInsetsProvider top={chrome.addedTop} bottom={chrome.addedBottom}>
        <ScreenScrollContext.Provider value={glassScroll}>
          <ScreenListContext.Provider value={listInsets}>
            <GlassBackdropScope>
              {hasHeader ? (
                <GlassBar floating scrolled={glassScroll.scrolled} safeArea={topInset} onLayout={onHeaderLayout} testID={`${testID}-header`}>
                  <View style={column}>{header}</View>
                </GlassBar>
              ) : null}
              <GlassBackdrop style={[styles.root, { backgroundColor: theme.color.background }]}>
                {ambient ? <AmbientBackground testID={`${testID}-ambient`} /> : null}
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
                  style={[footerPadding === 'flush' ? null : styles.footer, { paddingBottom: chrome.footerPadding }]}
                >
                  <View style={column}>{footer}</View>
                </GlassDock>
              ) : null}
            </GlassBackdropScope>
          </ScreenListContext.Provider>
        </ScreenScrollContext.Provider>
      </ChromeInsetsProvider>
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
  return (
    <View style={styles.header} testID={testID}>
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
  scrollContent: { paddingBottom: space['4xl'] },
  footer: { paddingTop: space.md, paddingHorizontal: space.md },
  barTitle: { height: SCREEN_BAR_TITLE_HEIGHT, justifyContent: 'center', paddingHorizontal: space['4xl'] },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xs,
    gap: space.sm,
  },
  headerText: { flex: 1, gap: space.xxs },
});

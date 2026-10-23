import '../../testing';
import { Text as RNText } from 'react-native';
import { act, screen, userEvent } from '@testing-library/react-native';
import { renderWithTheme } from '../../testing';
import { darkColors, lightColors } from '../../theme';
import { ChromeInsetsProvider, useContentInsets } from '../../glass';
import {
  BoundaryRule,
  SCREEN_HEADER_GAP,
  Screen,
  ScreenHeader,
  SectionHeader,
  Separator,
  heightClassFor,
  layoutClassFor,
  screenChrome,
  scrollbarGutter,
  snapHairline,
  useScreenList,
  useScreenScroll,
  widthClassFor,
  type ScreenList,
} from '..';

describe('layout classes', () => {
  it('uses the RESPONSIVE §2 width breakpoints', () => {
    expect(widthClassFor(320)).toBe('compact-s');
    expect(widthClassFor(359)).toBe('compact-s');
    expect(widthClassFor(360)).toBe('compact');
    expect(widthClassFor(599)).toBe('compact');
    expect(widthClassFor(600)).toBe('medium');
    expect(widthClassFor(767)).toBe('medium');
    expect(widthClassFor(768)).toBe('expanded');
    expect(widthClassFor(1180)).toBe('expanded');
  });

  it('uses the height classes of the live scoring screen', () => {
    expect(heightClassFor(568)).toBe('short');
    expect(heightClassFor(640)).toBe('regular');
    expect(heightClassFor(800)).toBe('regular');
    expect(heightClassFor(844)).toBe('tall');
  });

  it('reports landscape and large text', () => {
    expect(layoutClassFor(1180, 820, 1)).toEqual({ width: 'expanded', height: 'tall', isLandscape: true, largeText: false });
    expect(layoutClassFor(390, 844, 1.3).largeText).toBe(true);
    expect(layoutClassFor(411, 914, 1.2999999523).largeText).toBe(true);
    expect(layoutClassFor(411, 914, 1.29).largeText).toBe(false);
  });
});

describe('Screen', () => {
  it('measures a classic web scrollbar so the floating header and dock line up with the scrolled column', () => {
    expect(scrollbarGutter({ offsetWidth: 1024, clientWidth: 1008 })).toBe(16);
    expect(scrollbarGutter({ offsetWidth: 390, clientWidth: 390 })).toBe(0);
    expect(scrollbarGutter(null)).toBe(0);
    expect(scrollbarGutter({ offsetWidth: 'x', clientWidth: 1 })).toBe(0);
  });

  it('reports when content scrolls under the header', async () => {
    const onScrolledChange = jest.fn();
    await renderWithTheme(
      <Screen testID="s" onScrolledChange={onScrolledChange}>
        <RNText>Body</RNText>
      </Screen>,
    );
    expect(onScrolledChange).toHaveBeenLastCalledWith(false);
    await act(async () => {
      screen.getByTestId('s-scroll').props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 120 } } });
    });
    expect(onScrolledChange).toHaveBeenLastCalledWith(true);
  });

  it('paints the theme background and exposes the screen root test id', async () => {
    await renderWithTheme(
      <Screen testID="screen-home">
        <ScreenHeader title="Scorebook" subtitle="Good evening" />
      </Screen>,
      { mode: 'dark' },
    );
    expect(screen.getByTestId('screen-home')).toHaveStyle({ backgroundColor: darkColors.background });
    expect(screen.getByRole('header', { name: 'Scorebook' })).toHaveStyle({ fontSize: 28 });
    expect(screen.getByText('Good evening')).toHaveStyle({ color: darkColors.textSecondary });
    const scroller = screen.getByTestId('screen-home-scroll');
    expect(scroller.props.contentContainerStyle).toEqual(expect.arrayContaining([expect.objectContaining({ paddingTop: 47, paddingBottom: 34 + 48 })]));
  });

  it('docks a sticky footer on glass above the safe area and lets content scroll beneath it', async () => {
    await renderWithTheme(
      <Screen testID="screen-wizard" footer={<RNText>Next</RNText>}>
        <RNText>Body</RNText>
      </Screen>,
    );
    const footer = screen.getByTestId('screen-wizard-footer');
    expect(footer).toHaveStyle({ position: 'absolute', bottom: 0, paddingBottom: 16 + 34, borderTopLeftRadius: 24 });
    await act(async () => {
      footer.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 120 } } });
    });
    const scroller = screen.getByTestId('screen-wizard-scroll');
    expect(scroller.props.contentContainerStyle).toEqual(expect.arrayContaining([expect.objectContaining({ paddingBottom: 120 + 48 })]));
  });

  it('docks a flush footer so a scoring pad sits straight on the glass and still clears the home indicator', async () => {
    await renderWithTheme(
      <Screen testID="screen-score" scroll={false} footer={<RNText>Pad</RNText>} footerPadding="flush">
        <RNText>Body</RNText>
      </Screen>,
    );
    const footer = screen.getByTestId('screen-score-footer');
    expect(footer).toHaveStyle({ position: 'absolute', bottom: 0, paddingBottom: 34 });
    expect(footer).not.toHaveStyle({ paddingTop: 16 });
    expect(footer).not.toHaveStyle({ paddingHorizontal: 16 });
  });

  it('reads the floating header before the content and the footer after it, while drawing the glass on top', async () => {
    const view = await renderWithTheme(
      <Screen testID="screen-order" header={<ScreenHeader title="Fixtures" />} footer={<RNText>Save</RNText>}>
        <RNText>Row</RNText>
      </Screen>,
    );
    const order = view.container.queryAll((node) => typeof node.props.testID === 'string' && String(node.props.testID).startsWith('screen-order-')).map((node) => node.props.testID);
    expect(order).toEqual(['screen-order-header', 'screen-order-ambient', 'screen-order-scroll', 'screen-order-footer']);
    expect(screen.getByTestId('screen-order-header')).toHaveStyle({ position: 'absolute', zIndex: 1 });
    expect(screen.getByTestId('screen-order-footer')).toHaveStyle({ position: 'absolute', zIndex: 1 });
    const texts = screen.getAllByText(/Fixtures|Row|Save/).map((node) => node.props.children);
    expect(texts).toEqual(['Fixtures', 'Row', 'Save']);
  });

  it('pins a header in a glass bar that rests as glass and strengthens when content scrolls under it', async () => {
    await renderWithTheme(
      <Screen testID="screen-history" header={<ScreenHeader title="History" />}>
        <RNText>Row</RNText>
      </Screen>,
    );
    const header = screen.getByTestId('screen-history-header');
    expect(header).toHaveStyle({ position: 'absolute', top: 0, paddingTop: 47, paddingBottom: SCREEN_HEADER_GAP });
    expect(header.props.glassEffectStyle).toMatchObject({ style: 'regular' });
    await act(async () => {
      header.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 120 } } });
    });
    const scroller = screen.getByTestId('screen-history-scroll');
    expect(scroller.props.contentContainerStyle).toEqual(expect.arrayContaining([expect.objectContaining({ paddingTop: 120 })]));
    await act(async () => {
      scroller.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 30 } } });
    });
    expect(screen.getByTestId('screen-history-header').props.glassEffectStyle).toMatchObject({ style: 'regular' });
  });

  it('paints the §107 ambient atmosphere behind every screen by default, with an explicit opt-out', async () => {
    const view = await renderWithTheme(
      <Screen testID="screen-home">
        <RNText>Body</RNText>
      </Screen>,
    );
    expect(screen.getByTestId('screen-home-ambient', { includeHiddenElements: true })).toBeTruthy();
    await view.rerender(
      <Screen testID="screen-home" ambient={false}>
        <RNText>Body</RNText>
      </Screen>,
    );
    expect(screen.getByTestId('screen-home-ambient', { includeHiddenElements: true })).toBeTruthy();
    await view.rerender(
      <Screen testID="screen-home" flat>
        <RNText>Body</RNText>
      </Screen>,
    );
    expect(screen.queryByTestId('screen-home-ambient', { includeHiddenElements: true })).toBeNull();
  });

  it('hands lists in a non-scrolling screen the chrome insets and the glass scroll handler', async () => {
    const seen: { top?: number; bottom?: number; throttle?: number } = {};
    function List() {
      const insets = useContentInsets();
      const scroll = useScreenScroll();
      seen.top = insets.top;
      seen.bottom = insets.bottom;
      seen.throttle = scroll.scrollEventThrottle;
      return null;
    }
    await renderWithTheme(
      <ChromeInsetsProvider bottom={60}>
        <Screen testID="screen-list" scroll={false} header={<ScreenHeader title="Tournaments" />}>
          <List />
        </Screen>
      </ChromeInsetsProvider>,
    );
    await act(async () => {
      screen.getByTestId('screen-list-header').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 100 } } });
    });
    expect(seen).toEqual({ top: 100, bottom: 34 + 60, throttle: 16 });
  });

  it('hands a FlatList everything it needs to scroll beneath the glass header and tab bar in one hook', async () => {
    const seen: { list?: ScreenList } = {};
    function List() {
      seen.list = useScreenList();
      return null;
    }
    await renderWithTheme(
      <ChromeInsetsProvider bottom={60}>
        <Screen testID="screen-feed" scroll={false} header={<ScreenHeader title="History" />}>
          <List />
        </Screen>
      </ChromeInsetsProvider>,
    );
    await act(async () => {
      screen.getByTestId('screen-feed-header').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 110 } } });
    });
    expect(seen.list?.contentInset).toEqual({ paddingTop: 110, paddingBottom: 34 + 60 + 48 });
    expect(seen.list?.scrollIndicatorInsets).toEqual({ top: 110 - 47, bottom: 60 });
    expect(seen.list?.scrollEventThrottle).toBe(16);
    expect(screen.getByTestId('screen-feed-header').props.glassEffectStyle).toMatchObject({ style: 'regular' });
    await act(async () => {
      seen.list?.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 40 } } } as Parameters<ScreenList['onScroll']>[0]);
    });
    expect(screen.getByTestId('screen-feed-header').props.glassEffectStyle).toMatchObject({ style: 'regular' });
  });

  it('does not pad the top twice when a non-scrolling screen without a header already sits below the status bar', async () => {
    const seen: { list?: ScreenList; outside?: ScreenList } = {};
    function List() {
      seen.list = useScreenList();
      return null;
    }
    function Outside() {
      seen.outside = useScreenList();
      return null;
    }
    await renderWithTheme(
      <>
        <Screen testID="screen-plain" scroll={false}>
          <List />
        </Screen>
        <Outside />
      </>,
    );
    expect(screen.getByTestId('screen-plain')).toHaveStyle({ paddingTop: 47 });
    expect(seen.list?.contentInset).toEqual({ paddingTop: 0, paddingBottom: 34 + 48 });
    expect(seen.outside?.contentInset).toEqual({ paddingTop: 47, paddingBottom: 34 + 48 });
    expect(seen.outside?.scrollIndicatorInsets).toEqual({ top: 0, bottom: 0 });
  });

  it('computes chrome so the footer floats above a tab bar and content clears both', () => {
    expect(screenChrome({ safeTop: 47, safeBottom: 34, parentBottom: 0, headerHeight: null, footerHeight: null })).toEqual({
      contentTop: 47,
      contentBottom: 34,
      addedTop: 0,
      addedBottom: 0,
      footerOffset: 0,
      footerPadding: 16 + 34,
      obscuredBottom: 34,
    });
    expect(screenChrome({ safeTop: 47, safeBottom: 34, parentBottom: 60, headerHeight: 110, footerHeight: 80 })).toEqual({
      contentTop: 110,
      contentBottom: 94 + 80,
      addedTop: 63,
      addedBottom: 80,
      footerOffset: 94,
      footerPadding: 16,
      obscuredBottom: 94 + 80,
    });
    expect(screenChrome({ safeTop: 47, safeBottom: 34, parentBottom: 0, headerHeight: null, footerHeight: 200, footerPadding: 'flush' })).toMatchObject({
      contentBottom: 200,
      footerOffset: 0,
      footerPadding: 34,
    });
    expect(screenChrome({ safeTop: 47, safeBottom: 34, parentBottom: 60, headerHeight: null, footerHeight: 200, footerPadding: 'flush' }).footerPadding).toBe(0);
  });

  it('uses the stack title size below the tab roots', async () => {
    await renderWithTheme(<ScreenHeader title="New match" level="stack" />);
    expect(screen.getByRole('header', { name: 'New match' })).toHaveStyle({ fontSize: 22 });
  });
});

describe('section structure', () => {
  it('renders an uppercase section header with an optional action', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<SectionHeader title="Recent" action={{ label: 'See all', onPress }} ruled />);
    expect(screen.getByRole('header', { name: 'Recent' })).toHaveStyle({ textTransform: 'uppercase', color: lightColors.textSecondary });
    await user.press(screen.getByRole('button', { name: 'See all' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('draws the section rule as one quiet hairline in the border token, hidden from screen readers', async () => {
    await renderWithTheme(<BoundaryRule testID="rule" />);
    expect(screen.queryByTestId('rule')).not.toBeOnTheScreen();
    const rule = screen.getByTestId('rule', { includeHiddenElements: true });
    const lines = rule.children as unknown as { props: { style: unknown } }[];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveStyle({ backgroundColor: lightColors.border });
    expect(lines[0]).not.toHaveStyle({ backgroundColor: lightColors.textPrimary });
  });

  it('keeps the heavy 2 px rule for the live score band only, in deep teal rather than ink', async () => {
    await renderWithTheme(<BoundaryRule tone="band" testID="rule" />, { mode: 'dark' });
    const lines = screen.getByTestId('rule', { includeHiddenElements: true }).children as unknown as { props: { style: unknown } }[];
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveStyle({ height: 2, backgroundColor: darkColors.accentDeep });
    expect(lines[2]).toHaveStyle({ height: 1, backgroundColor: darkColors.border });
  });

  it('snaps every hairline to a whole device pixel so no row is ruled heavier than its neighbour', () => {
    expect(snapHairline(0.5, 2)).toBe(0.5);
    expect(snapHairline(1 / 3, 3)).toBeCloseTo(1 / 3, 6);
    expect(snapHairline(0.4, 3)).toBeCloseTo(1 / 3, 6);
    expect(snapHairline(1, 1)).toBe(1);
    expect(snapHairline(0.2, 1)).toBe(1);
  });

  it('insets separators under the text', async () => {
    const view = await renderWithTheme(<Separator inset={16} />);
    const line = view.container.queryAll((node) => node.type === 'View').pop();
    expect(line).toHaveStyle({ marginLeft: 16, backgroundColor: lightColors.border });
  });
});

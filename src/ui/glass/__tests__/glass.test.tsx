import '../../testing';
import { setLiquidGlassAvailable } from '../testing';
import { AccessibilityInfo, Platform, StyleSheet, Text as RNText, View, type ViewStyle } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TEST_METRICS, renderWithTheme } from '../../testing';
import { ThemeProvider, darkColors, darkGlass, lightColors, lightGlass, type ThemeMode } from '../../theme';
import {
  AmbientBackground,
  ChromeInsetsProvider,
  GLASS_TINT_TEST_ID,
  GlassBackdrop,
  GlassBackdropScope,
  GlassBar,
  GlassDock,
  GlassGroup,
  GlassMaterial,
  GlassSurface,
  ANDROID_BLUR_MIN_API,
  ANDROID_BLUR_REDUCTION,
  backdropBlurAvailable,
  blurViewLook,
  cssBackdropFilterSupported,
  glassTintFor,
  isScrolledUnder,
  resolveGlassRenderer,
  useChromeInsets,
  useContentInsets,
  useGlassRenderer,
  useGlassScroll,
  useMeasuredHeight,
} from '..';

interface HostNode {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: unknown[];
}

function flat(node: { readonly props: Record<string, unknown> }): ViewStyle {
  return (StyleSheet.flatten(node.props.style as ViewStyle) ?? {}) as ViewStyle;
}

function hosts(root: { queryAll: (predicate: (node: HostNode) => boolean) => HostNode[] }, type: string): HostNode[] {
  return root.queryAll((node) => String(node.type) === type);
}

function Providers({
  children,
  mode = 'light',
  reduceTransparency = false,
  reducedMotion = 'off',
}: {
  readonly children: ReactNode;
  readonly mode?: ThemeMode;
  readonly reduceTransparency?: boolean;
  readonly reducedMotion?: 'on' | 'off';
}) {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <ThemeProvider mode={mode} reducedMotion={reducedMotion} reduceTransparency={reduceTransparency}>
        {children}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const listeners = new Map<string, (value: boolean) => void>();

beforeEach(() => {
  setLiquidGlassAvailable(false);
  listeners.clear();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: (value: boolean) => void) => {
    listeners.set(event, handler);
    return { remove: jest.fn() };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
});

describe('renderer resolution (§106 platforms)', () => {
  it('uses native Liquid Glass only on iOS 26+, frosted blur elsewhere, and opaque when transparency is reduced', () => {
    expect(resolveGlassRenderer({ os: 'ios', liquidAvailable: true, reduced: false })).toBe('liquid');
    expect(resolveGlassRenderer({ os: 'ios', liquidAvailable: false, reduced: false })).toBe('blur');
    expect(resolveGlassRenderer({ os: 'android', liquidAvailable: true, reduced: false })).toBe('blur');
    expect(resolveGlassRenderer({ os: 'web', liquidAvailable: false, reduced: false })).toBe('blur');
    expect(resolveGlassRenderer({ os: 'ios', liquidAvailable: true, reduced: true })).toBe('opaque');
    expect(resolveGlassRenderer({ os: 'android', liquidAvailable: false, reduced: true })).toBe('opaque');
  });

  it('falls back to the denser unblurred tint wherever nothing can blur the backdrop', () => {
    expect(resolveGlassRenderer({ os: 'android', liquidAvailable: false, reduced: false, blurAvailable: false })).toBe('unblurred');
    expect(resolveGlassRenderer({ os: 'web', liquidAvailable: false, reduced: false, blurAvailable: false })).toBe('unblurred');
    expect(resolveGlassRenderer({ os: 'android', liquidAvailable: false, reduced: true, blurAvailable: false })).toBe('opaque');
    expect(resolveGlassRenderer({ os: 'ios', liquidAvailable: true, reduced: false, blurAvailable: false })).toBe('liquid');
    expect(backdropBlurAvailable({ os: 'android', version: ANDROID_BLUR_MIN_API, hasBlurTarget: true })).toBe(true);
    expect(backdropBlurAvailable({ os: 'android', version: ANDROID_BLUR_MIN_API - 1, hasBlurTarget: true })).toBe(false);
    expect(backdropBlurAvailable({ os: 'android', version: 35, hasBlurTarget: false })).toBe(false);
    expect(backdropBlurAvailable({ os: 'web', hasBlurTarget: false, cssBackdropFilter: true })).toBe(true);
    expect(backdropBlurAvailable({ os: 'web', hasBlurTarget: false, cssBackdropFilter: false })).toBe(false);
    expect(backdropBlurAvailable({ os: 'ios', version: '18.0', hasBlurTarget: false })).toBe(true);
  });

  it('detects CSS backdrop-filter support on web, prefixed or not', () => {
    const holder = globalThis as { CSS?: unknown };
    const before = holder.CSS;
    try {
      holder.CSS = undefined;
      expect(cssBackdropFilterSupported()).toBe(false);
      holder.CSS = { supports: (property: string) => property === '-webkit-backdrop-filter' };
      expect(cssBackdropFilterSupported()).toBe(true);
      holder.CSS = { supports: () => false };
      expect(cssBackdropFilterSupported()).toBe(false);
      holder.CSS = {
        supports: () => {
          throw new Error('no');
        },
      };
      expect(cssBackdropFilterSupported()).toBe(false);
    } finally {
      holder.CSS = before;
    }
  });

  it('uses the thinnest platform blur so the level tint carries the colour, and halves the Android veil at the same radius', () => {
    expect(blurViewLook('ios', 'light', 70)).toEqual({ tint: 'systemUltraThinMaterialLight', intensity: 70 });
    expect(blurViewLook('ios', 'dark', 70)).toEqual({ tint: 'systemUltraThinMaterialDark', intensity: 70 });
    expect(blurViewLook('web', 'light', 70)).toEqual({ tint: 'default', intensity: 70 });
    expect(blurViewLook('web', 'dark', 80)).toEqual({ tint: 'systemUltraThinMaterialDark', intensity: 80 });
    const android = blurViewLook('android', 'light', 70);
    expect(android).toEqual({ tint: 'default', intensity: 70 / ANDROID_BLUR_REDUCTION, blurReductionFactor: ANDROID_BLUR_REDUCTION });
    expect(android.intensity / (android.blurReductionFactor ?? 1)).toBeCloseTo(70 / 4, 10);
  });

  it('picks the tint per renderer: blurred tint, unblurred tint for floating glass that cannot blur, opaque twin', () => {
    const bar = lightGlass.level.bar;
    expect(glassTintFor(bar, 'blur')).toBe(bar.tint);
    expect(glassTintFor(bar, 'liquid')).toBe(bar.tint);
    expect(glassTintFor(bar, 'unblurred')).toBe(bar.unblurred);
    expect(glassTintFor(bar, 'unblurred', true)).toBe(bar.tint);
    expect(glassTintFor(bar, 'opaque')).toBe(bar.opaque);
    expect(glassTintFor(bar, 'opaque', true)).toBe(bar.opaque);
  });

  it('reads availability through expo-glass-effect and the theme', async () => {
    const seen: string[] = [];
    function Probe() {
      seen.push(useGlassRenderer());
      return null;
    }
    setLiquidGlassAvailable(true);
    await render(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(seen[seen.length - 1]).toBe('liquid');
    setLiquidGlassAvailable(false);
    await render(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(seen[seen.length - 1]).toBe('blur');
  });
});

describe('GlassSurface: frosted blur fallback (iOS < 26, Android, web)', () => {
  it('layers blur, the level tint, a specular sheen and a near-white rim under the children in light', async () => {
    const view = await renderWithTheme(
      <GlassSurface level="bar" radius={20} elevated testID="surface">
        <RNText>Inside</RNText>
      </GlassSurface>,
    );
    expect(screen.getByText('Inside')).toBeOnTheScreen();
    const blur = hosts(view.container, 'ViewManagerAdapter_ExpoBlur');
    expect(blur).toHaveLength(1);
    expect(blur[0].props).toMatchObject({ tint: 'systemUltraThinMaterialLight', intensity: lightGlass.level.bar.blur, blurMethod: 'none' });
    const tint = screen.getByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true });
    expect(tint).toHaveStyle({ backgroundColor: lightGlass.level.bar.tint });
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoLinearGradient')).toHaveLength(1);
    const rims = view.container.queryAll((node) => flat(node).borderTopColor === lightGlass.rim.top);
    expect(rims.length).toBe(1);
    expect(flat(rims[0])).toMatchObject({ borderWidth: 1, borderColor: lightGlass.rim.color });
    expect(screen.getByTestId('surface')).toHaveStyle({ borderRadius: 20, shadowOpacity: lightGlass.shadow.shadowOpacity });
  });

  it('uses the deep tinted dark material with a coloured rim and no shadow in dark', async () => {
    const view = await renderWithTheme(
      <GlassSurface level="dock" elevated testID="surface">
        <RNText>Inside</RNText>
      </GlassSurface>,
      { mode: 'dark' },
    );
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoBlur')[0].props).toMatchObject({ tint: 'systemUltraThinMaterialDark', intensity: darkGlass.level.dock.blur });
    expect(screen.getByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })).toHaveStyle({ backgroundColor: darkGlass.level.dock.tint });
    expect(view.container.queryAll((node) => flat(node).borderTopColor === darkGlass.rim.top)).toHaveLength(1);
    expect(flat(screen.getByTestId('surface')).shadowOpacity).toBeUndefined();
  });

  it('skips the blur for inline controls and the sheen where the level has none', async () => {
    const view = await renderWithTheme(<GlassSurface level="popover" blur={false} />, { mode: 'dark' });
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoBlur')).toHaveLength(0);
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoLinearGradient')).toHaveLength(0);
  });

  it('hides the material from assistive technology and lets touches through it', async () => {
    await renderWithTheme(<GlassMaterial testID="material" />);
    expect(screen.queryByTestId('material')).not.toBeOnTheScreen();
    const material = screen.getByTestId('material', { includeHiddenElements: true });
    expect(material).toHaveProp('pointerEvents', 'none');
    expect(material).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  });
});

describe('GlassSurface: native Liquid Glass (iOS 26+)', () => {
  it('renders GlassView with the app tint and colour scheme, interactive only when motion is allowed', async () => {
    setLiquidGlassAvailable(true);
    const view = await render(
      <Providers mode="dark">
        <GlassSurface level="bar" interactive testID="surface">
          <RNText>Inside</RNText>
        </GlassSurface>
      </Providers>,
    );
    const glass = screen.getByTestId('surface');
    expect(String(glass.type)).toBe('ViewManagerAdapter_ExpoGlassEffect');
    expect(glass.props).toMatchObject({ tintColor: darkGlass.level.bar.tint, colorScheme: 'dark', isInteractive: true });
    expect(glass.props.glassEffectStyle).toMatchObject({ style: 'regular', animate: true });
    expect(screen.getByText('Inside')).toBeOnTheScreen();
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoBlur')).toHaveLength(0);
    await view.rerender(
      <Providers mode="dark" reducedMotion="on">
        <GlassSurface level="bar" interactive active={false} testID="surface" />
      </Providers>,
    );
    expect(screen.getByTestId('surface').props).toMatchObject({ isInteractive: false });
    expect(screen.getByTestId('surface').props.glassEffectStyle).toMatchObject({ style: 'none', animate: false });
  });

  it('merges neighbouring glass in a GlassContainer on iOS 26 and is a plain view elsewhere', async () => {
    setLiquidGlassAvailable(true);
    await render(
      <Providers>
        <GlassGroup spacing={12} testID="group" />
      </Providers>,
    );
    expect(screen.getByTestId('group').props).toMatchObject({ spacing: 12 });
    expect(String(screen.getByTestId('group').type)).toBe('ViewManagerAdapter_ExpoGlassEffect');
    setLiquidGlassAvailable(false);
    await renderWithTheme(<GlassGroup spacing={12} testID="plain" />);
    expect(String(screen.getByTestId('plain').type)).toBe('View');
  });
});

describe('Reduce Transparency (§106 accessibility)', () => {
  it('replaces the glass with an opaque surface of the same tint when the in-app setting is on', async () => {
    setLiquidGlassAvailable(true);
    const view = await render(
      <Providers reduceTransparency>
        <GlassSurface level="sheet" testID="surface" />
      </Providers>,
    );
    expect(String(screen.getByTestId('surface').type)).toBe('View');
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoBlur')).toHaveLength(0);
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoLinearGradient')).toHaveLength(0);
    expect(screen.getByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })).toHaveStyle({ backgroundColor: lightGlass.level.sheet.opaque });
    expect(view.container.queryAll((node) => flat(node).borderColor === lightColors.border)).toHaveLength(1);
  });

  it('follows the system Reduce Transparency switch and its change events', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    await renderWithTheme(<GlassSurface level="bar" />, { mode: 'dark' });
    await waitFor(() =>
      expect(screen.getByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })).toHaveStyle({ backgroundColor: darkGlass.level.bar.opaque }),
    );
    await act(async () => listeners.get('reduceTransparencyChanged')?.(false));
    expect(screen.getByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })).toHaveStyle({ backgroundColor: darkGlass.level.bar.tint });
  });

  it('uses opaque glass with strong edges under the system high-contrast setting', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true);
    const view = await renderWithTheme(<GlassSurface level="bar" />, { mode: 'dark' });
    await waitFor(() =>
      expect(screen.getByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })).toHaveStyle({ backgroundColor: darkGlass.level.bar.opaque }),
    );
    expect(view.container.queryAll((node) => flat(node).borderColor === darkColors.borderStrong)).toHaveLength(1);
  });

  it('drops the ambient wash when transparency is reduced', async () => {
    const view = await render(
      <Providers reduceTransparency>
        <AmbientBackground testID="ambient" />
      </Providers>,
    );
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoLinearGradient')).toHaveLength(0);
  });
});

describe('GlassBar, GlassDock and the ambient wash', () => {
  it('keeps the top bar clear at rest and turns it to glass once content scrolls under it', async () => {
    const view = await renderWithTheme(
      <GlassBar scrolled={false} floating testID="bar">
        <RNText>Title</RNText>
      </GlassBar>,
    );
    const bar = screen.getByTestId('bar');
    expect(bar).toHaveStyle({ position: 'absolute', top: 0, paddingTop: TEST_METRICS.insets.top });
    const material = view.container.queryAll((node) => node.props.pointerEvents === 'none' && flat(node).position === 'absolute')[0];
    expect(flat(material).opacity).toBe(0);
    await view.rerender(
      <GlassBar scrolled floating testID="bar">
        <RNText>Title</RNText>
      </GlassBar>,
    );
    expect(view.container.queryAll((node) => flat(node).borderBottomColor === lightGlass.edge.color).length).toBeGreaterThan(0);
  });

  it('switches instantly when motion is reduced', async () => {
    const view = await render(
      <Providers reducedMotion="on">
        <GlassBar scrolled testID="bar" />
      </Providers>,
    );
    const material = view.container.queryAll((node) => node.props.pointerEvents === 'none' && flat(node).position === 'absolute')[0];
    expect(flat(material).opacity).toBe(1);
  });

  it('docks to the bottom with rounded top corners, a lit top rim and the safe area', async () => {
    const view = await renderWithTheme(
      <GlassDock floating offset={10} testID="dock">
        <RNText>Keys</RNText>
      </GlassDock>,
    );
    expect(screen.getByTestId('dock')).toHaveStyle({
      position: 'absolute',
      bottom: 10,
      paddingBottom: TEST_METRICS.insets.bottom,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    });
    expect(view.container.queryAll((node) => flat(node).borderTopColor === lightGlass.rim.top && flat(node).borderTopWidth === 1)).toHaveLength(1);
  });

  it('paints two whisper-quiet gradients for glass to refract', async () => {
    const view = await renderWithTheme(<AmbientBackground testID="ambient" />, { mode: 'dark' });
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoLinearGradient')).toHaveLength(2);
    expect(screen.getByTestId('ambient', { includeHiddenElements: true })).toHaveProp('pointerEvents', 'none');
  });
});

describe('content insets for glass chrome', () => {
  it('adds nested chrome to the safe area so lists scroll beneath glass and still reach their last row', async () => {
    const seen: { chrome?: { top: number; bottom: number }; content?: { top: number; bottom: number } } = {};
    function Probe() {
      seen.chrome = useChromeInsets();
      const content = useContentInsets();
      seen.content = { top: content.top, bottom: content.bottom };
      return null;
    }
    await renderWithTheme(
      <ChromeInsetsProvider bottom={60}>
        <ChromeInsetsProvider top={44} bottom={20}>
          <Probe />
        </ChromeInsetsProvider>
      </ChromeInsetsProvider>,
    );
    expect(seen.chrome).toEqual({ top: 44, bottom: 80 });
    expect(seen.content).toEqual({ top: TEST_METRICS.insets.top + 44, bottom: TEST_METRICS.insets.bottom + 80 });
  });

  it('reports scroll-under only when crossing the threshold', async () => {
    expect(isScrolledUnder(0)).toBe(false);
    expect(isScrolledUnder(2)).toBe(false);
    expect(isScrolledUnder(3)).toBe(true);
    const states: boolean[] = [];
    let handler: ReturnType<typeof useGlassScroll>['onScroll'] | undefined;
    function Probe() {
      const scroll = useGlassScroll();
      handler = scroll.onScroll;
      states.push(scroll.scrolled);
      return null;
    }
    await renderWithTheme(<Probe />);
    const at = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } }) as Parameters<NonNullable<typeof handler>>[0];
    await act(async () => handler?.(at(1)));
    await act(async () => handler?.(at(40)));
    await act(async () => handler?.(at(80)));
    await act(async () => handler?.(at(0)));
    expect(states).toEqual([false, true, false]);
  });

  it('measures chrome heights once per change', async () => {
    let measure: ((event: { nativeEvent: { layout: { height: number } } }) => void) | undefined;
    const heights: number[] = [];
    function Probe() {
      const [height, onLayout] = useMeasuredHeight();
      measure = onLayout as unknown as typeof measure;
      heights.push(height);
      return null;
    }
    await renderWithTheme(<Probe />);
    await act(async () => undefined);
    expect(heights[heights.length - 1]).toBe(0);
    await act(async () => measure?.({ nativeEvent: { layout: { height: 63.6 } } }));
    const renders = heights.length;
    expect(heights[renders - 1]).toBe(64);
    await act(async () => measure?.({ nativeEvent: { layout: { height: 64 } } }));
    expect(heights).toHaveLength(renders);
  });
});

describe('Android blur target', () => {
  it('blurs the backdrop content through BlurTargetView for glass outside it, and gives glass inside it the denser unblurred tint', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    const version = jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
    const view = await renderWithTheme(
      <GlassBackdropScope>
        <GlassBackdrop testID="backdrop">
          <GlassSurface testID="inside" />
        </GlassBackdrop>
        <GlassSurface testID="outside" />
      </GlassBackdropScope>,
    );
    const tints = () => screen.getAllByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true });
    expect(tints()[1]).toHaveStyle({ backgroundColor: lightGlass.level.bar.unblurred });
    await act(async () => {
      screen.getByTestId('backdrop').props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
    });
    const blurs = hosts(view.container, 'ViewManagerAdapter_ExpoBlur');
    expect(blurs).toHaveLength(1);
    expect(blurs[0].props).toMatchObject({
      blurMethod: 'dimezisBlurViewSdk31Plus',
      tint: 'default',
      intensity: lightGlass.level.bar.blur / ANDROID_BLUR_REDUCTION,
      blurReductionFactor: ANDROID_BLUR_REDUCTION,
    });
    const [inside, outside] = tints();
    expect(outside).toHaveStyle({ backgroundColor: lightGlass.level.bar.tint });
    expect(inside).toHaveStyle({ backgroundColor: lightGlass.level.bar.unblurred });
    version.mockRestore();
    os.restore();
  });

  it('never claims a blur below Android 12, where the platform cannot sample the backdrop', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    const version = jest.spyOn(Platform, 'Version', 'get').mockReturnValue(30);
    const view = await renderWithTheme(
      <GlassBackdropScope>
        <GlassBackdrop testID="backdrop">
          <View />
        </GlassBackdrop>
        <GlassSurface level="sheet" />
      </GlassBackdropScope>,
      { mode: 'dark' },
    );
    await act(async () => {
      screen.getByTestId('backdrop').props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
    });
    expect(hosts(view.container, 'ViewManagerAdapter_ExpoBlur')).toHaveLength(0);
    expect(screen.getByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })).toHaveStyle({ backgroundColor: darkGlass.level.sheet.unblurred });
    version.mockRestore();
    os.restore();
  });

  it('keeps inline glass on its level tint when nothing blurs, because it sits on a solid content surface', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await renderWithTheme(<GlassSurface level="control" blur={false} />);
    expect(screen.getByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })).toHaveStyle({ backgroundColor: lightGlass.level.control.tint });
    os.restore();
  });

  it('is a plain view on other platforms', async () => {
    await renderWithTheme(
      <GlassBackdropScope>
        <GlassBackdrop testID="backdrop">
          <View />
        </GlassBackdrop>
      </GlassBackdropScope>,
    );
    expect(String(screen.getByTestId('backdrop').type)).toBe('View');
  });
});

describe('web without backdrop-filter', () => {
  it('uses the unblurred tint and no blur view when the browser cannot blur behind an element', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    const holder = globalThis as { CSS?: unknown };
    const before = holder.CSS;
    holder.CSS = { supports: () => false };
    try {
      const view = await renderWithTheme(<GlassSurface level="popover" />, { mode: 'dark' });
      expect(hosts(view.container, 'ViewManagerAdapter_ExpoBlur')).toHaveLength(0);
      expect(screen.getByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })).toHaveStyle({ backgroundColor: darkGlass.level.popover.unblurred });
    } finally {
      holder.CSS = before;
      os.restore();
    }
  });
});

import { Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { glassRimFor, useTheme, type GlassLevel } from '../theme';
import { cornerStyle, edgeStyle, type GlassCorners, type GlassRim } from './corners';
import { useBlurTarget } from './GlassBackdrop';
import { blurViewLook, glassTintFor, useGlassRenderer, webFrostStyle, type GlassRenderer } from './platform';
import { useMaterialProgress } from './useMaterialProgress';

export interface GlassMaterialProps {
  readonly level?: GlassLevel;
  readonly radius?: number;
  readonly corners?: GlassCorners;
  readonly rim?: GlassRim;
  readonly sheen?: boolean;
  readonly blur?: boolean;
  readonly active?: boolean;
  readonly rest?: number;
  readonly testID?: string;
}

export const GLASS_TINT_TEST_ID = 'glass-tint';
export const GLASS_FROST_TEST_ID = 'glass-frost';

export function restingOpacity(renderer: GlassRenderer, rest: number): number {
  if (rest <= 0) {
    return 0;
  }
  return renderer === 'opaque' ? 1 : Math.min(1, rest);
}

export function GlassMaterial({
  level = 'bar',
  radius = 0,
  corners = 'all',
  rim = 'all',
  sheen,
  blur = true,
  active = true,
  rest = 0,
  testID,
}: GlassMaterialProps) {
  const theme = useTheme();
  const glass = theme.glass;
  const tokens = glass.level[level];
  const renderer = useGlassRenderer();
  const target = useBlurTarget();
  const fade = useMaterialProgress(active, restingOpacity(renderer, rest));
  const frostFade = useMaterialProgress(active, rest > 0 ? 1 : 0);
  const shape = cornerStyle(corners, radius);

  if (renderer === 'liquid') {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape]} accessible={false} importantForAccessibility="no-hide-descendants" testID={testID}>
        <GlassView
          style={[StyleSheet.absoluteFill, shape]}
          glassEffectStyle={{ style: active || rest > 0 ? 'regular' : 'none', animate: !theme.motion.reduced, animationDuration: 0.2 }}
          tintColor={tokens.tint}
          colorScheme={theme.scheme}
        />
      </View>
    );
  }

  const opaque = renderer === 'opaque';
  const frosted = renderer === 'blur' && blur;
  const look = blurViewLook(Platform.OS, glass.blurTint, tokens.blur);
  const showSheen = !opaque && (sheen ?? tokens.sheen);
  const lit = glassRimFor(glass, level);
  const edge = opaque
    ? edgeStyle(rim, { width: theme.borderWidth.hairline, color: glass.opaqueEdge })
    : edgeStyle(rim, { width: glass.edge.width, color: glass.edge.color });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no-hide-descendants" testID={testID}>
      {frosted ? (
        <Animated.View testID={GLASS_FROST_TEST_ID} style={[StyleSheet.absoluteFill, shape, styles.clip, frostFade]}>
          {Platform.OS === 'web' ? (
            <View style={[StyleSheet.absoluteFill, webFrostStyle(tokens.blur, glass.saturation)]} />
          ) : (
            <BlurView
              key={target ? 'targeted' : 'plain'}
              style={StyleSheet.absoluteFill}
              tint={look.tint}
              intensity={look.intensity}
              blurReductionFactor={look.blurReductionFactor}
              blurTarget={target}
              blurMethod={target ? 'dimezisBlurViewSdk31Plus' : 'none'}
            />
          )}
        </Animated.View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, fade]}>
        <View style={[StyleSheet.absoluteFill, shape, edge, styles.clip]}>
          <View testID={GLASS_TINT_TEST_ID} style={[StyleSheet.absoluteFill, { backgroundColor: glassTintFor(tokens, renderer, !blur) }]} />
          {showSheen ? (
            <LinearGradient colors={[glass.sheen.from, glass.sheen.to]} style={[styles.sheen, { height: `${Math.round(glass.sheen.extent * 100)}%` }]} />
          ) : null}
          {!opaque && rim !== 'none' ? (
            <View style={[StyleSheet.absoluteFill, shape, edgeStyle(rim, { width: lit.width, color: lit.color, top: lit.top, left: lit.left })]} />
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0 },
});

import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { LinearGradient as Gradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme, withAlpha } from '../theme';

export interface LiquidLayerPaths {
  readonly body: string;
  readonly edge: string;
  readonly glow: string;
  readonly rim: string;
}

export interface LiquidLayerProps {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly paths: SharedValue<LiquidLayerPaths>;
  readonly testID?: string;
  readonly shapeTestID?: string;
  readonly lineTestID?: string;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

function cleanId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '');
}

export function LiquidLayer({ width, height, depth, paths, testID, shapeTestID, lineTestID }: LiquidLayerProps) {
  const theme = useTheme();
  const liquid = theme.glass.liquid;
  const id = cleanId(useId());
  const ids = { body: `liquid-body-${id}`, edge: `liquid-edge-${id}`, glow: `liquid-glow-${id}`, rim: `liquid-rim-${id}`, line: `liquid-line-${id}` };
  const bodyProps = useAnimatedProps(() => ({ d: paths.get().body }));
  const edgeProps = useAnimatedProps(() => ({ d: paths.get().edge }));
  const glowProps = useAnimatedProps(() => ({ d: paths.get().glow }));
  const rimProps = useAnimatedProps(() => ({ d: paths.get().rim }));
  return (
    <View
      pointerEvents="none"
      style={[styles.layer, { width, height }]}
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={ids.glow} cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
            <Stop offset="0" stopColor={liquid.glow} stopOpacity={liquid.glowOpacity} />
            <Stop offset="1" stopColor={liquid.glow} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={ids.body} x1="0" y1="0" x2="0" y2={depth} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={liquid.fill} stopOpacity={liquid.fillTop} />
            <Stop offset="1" stopColor={liquid.fill} stopOpacity={liquid.fillBottom} />
          </LinearGradient>
          <LinearGradient id={ids.edge} x1="0" y1="0" x2="0" y2={depth} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={liquid.edge} stopOpacity={0} />
            <Stop offset="0.4" stopColor={liquid.edge} stopOpacity={0} />
            <Stop offset="1" stopColor={liquid.edge} stopOpacity={liquid.edgeOpacity} />
          </LinearGradient>
          <LinearGradient id={ids.rim} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={liquid.rim} stopOpacity={0} />
            <Stop offset="0.5" stopColor={liquid.rim} stopOpacity={liquid.rimOpacity} />
            <Stop offset="1" stopColor={liquid.rim} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={ids.line} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={liquid.line} stopOpacity={0} />
            <Stop offset="0.16" stopColor={liquid.line} stopOpacity={liquid.lineOpacity} />
            <Stop offset="0.84" stopColor={liquid.line} stopOpacity={liquid.lineOpacity} />
            <Stop offset="1" stopColor={liquid.line} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {theme.glass.reduced ? null : <Rect x={0} y={0} width={width} height={1} fill={`url(#${ids.line})`} testID={lineTestID} />}
        <AnimatedPath animatedProps={glowProps} fill={`url(#${ids.glow})`} />
        <AnimatedPath animatedProps={bodyProps} fill={`url(#${ids.body})`} testID={shapeTestID} />
        <AnimatedPath animatedProps={edgeProps} fill="none" stroke={`url(#${ids.edge})`} strokeWidth={1} />
        <AnimatedPath animatedProps={rimProps} fill={`url(#${ids.rim})`} />
      </Svg>
    </View>
  );
}

export interface ChromeFadeProps {
  readonly height: number;
  readonly testID?: string;
}

export function ChromeFade({ height, testID }: ChromeFadeProps) {
  const theme = useTheme();
  const page = theme.color.background;
  return (
    <Gradient
      pointerEvents="none"
      colors={[withAlpha(page, 0), withAlpha(page, theme.glass.reduced ? 0 : theme.glass.fade)]}
      style={[styles.fade, { top: -height, height }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
  fade: { position: 'absolute', left: 0, right: 0 },
});

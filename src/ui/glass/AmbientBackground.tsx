import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { formatRgb, parseColor, useTheme } from '../theme';

export interface AmbientBackgroundProps {
  readonly testID?: string;
}

export interface AmbientGlow {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

export const AMBIENT_GLOWS: { readonly primary: AmbientGlow; readonly secondary: AmbientGlow } = {
  primary: { cx: 0.06, cy: 0.02, r: 0.85 },
  secondary: { cx: 0.92, cy: 0.46, r: 0.56 },
};

export const AMBIENT_FALLOFF: readonly (readonly [number, number])[] = [0, 0.2, 0.4, 0.6, 0.8, 1].map((offset) => {
  const floor = Math.exp(-3);
  return [offset, Math.round(((Math.exp(-3 * offset * offset) - floor) / (1 - floor)) * 1000) / 1000] as const;
});

export interface AmbientStop {
  readonly offset: number;
  readonly color: string;
  readonly opacity: number;
}

export function ambientStops(tone: string): AmbientStop[] {
  const rgba = parseColor(tone);
  const color = formatRgb(rgba);
  return AMBIENT_FALLOFF.map(([offset, weight]) => ({ offset, color, opacity: Math.round(rgba.a * weight * 10000) / 10000 }));
}

function svgId(raw: string, name: string): string {
  return `ambient${raw.replace(/[^A-Za-z0-9]/g, '')}${name}`;
}

export function AmbientBackground({ testID }: AmbientBackgroundProps) {
  const theme = useTheme();
  const raw = useId();
  if (theme.highContrast) {
    return null;
  }
  const glows = [
    { id: svgId(raw, 'primary'), glow: AMBIENT_GLOWS.primary, stops: ambientStops(theme.glass.ambient.primary) },
    { id: svgId(raw, 'secondary'), glow: AMBIENT_GLOWS.secondary, stops: ambientStops(theme.glass.ambient.secondary) },
  ];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no-hide-descendants" testID={testID}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          {glows.map(({ id, glow, stops }) => (
            <RadialGradient key={id} id={id} cx={glow.cx} cy={glow.cy} r={glow.r} fx={glow.cx} fy={glow.cy} gradientUnits="objectBoundingBox">
              {stops.map((stop) => (
                <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />
              ))}
            </RadialGradient>
          ))}
        </Defs>
        {glows.map(({ id }) => (
          <Rect key={id} x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
        ))}
      </Svg>
    </View>
  );
}

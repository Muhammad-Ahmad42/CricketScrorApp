import type { ReactNode, Ref } from 'react';
import { View, type ViewProps } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { useTheme, type GlassLevel } from '../theme';
import { cornerStyle, type GlassCorners, type GlassRim } from './corners';
import { GlassMaterial } from './GlassMaterial';
import { useGlassRenderer } from './platform';

export interface GlassSurfaceProps extends ViewProps {
  readonly level?: GlassLevel;
  readonly radius?: number;
  readonly corners?: GlassCorners;
  readonly rim?: GlassRim;
  readonly sheen?: boolean;
  readonly blur?: boolean;
  readonly active?: boolean;
  readonly elevated?: boolean;
  readonly interactive?: boolean;
  readonly materialTestID?: string;
  readonly ref?: Ref<View>;
  readonly children?: ReactNode;
}

export function GlassSurface({
  level = 'bar',
  radius = 0,
  corners = 'all',
  rim = 'all',
  sheen,
  blur = true,
  active = true,
  elevated = false,
  interactive = false,
  materialTestID,
  style,
  children,
  ref,
  ...rest
}: GlassSurfaceProps) {
  const theme = useTheme();
  const renderer = useGlassRenderer();
  const shape = cornerStyle(corners, radius);

  if (renderer === 'liquid') {
    return (
      <GlassView
        {...rest}
        ref={ref}
        style={[shape, style]}
        glassEffectStyle={{ style: active ? 'regular' : 'none', animate: !theme.motion.reduced, animationDuration: 0.2 }}
        tintColor={theme.glass.level[level].tint}
        colorScheme={theme.scheme}
        isInteractive={interactive && !theme.motion.reduced}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View {...rest} ref={ref} style={[shape, elevated && active ? theme.glass.shadow : null, style]}>
      <GlassMaterial level={level} radius={radius} corners={corners} rim={rim} sheen={sheen} blur={blur} active={active} testID={materialTestID} />
      {children}
    </View>
  );
}

import type { ReactNode } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { useInsets } from '../layout/useInsets';
import { useGlass } from '../theme';
import { GlassSurface } from './GlassSurface';

export interface GlassBarProps extends ViewProps {
  readonly scrolled?: boolean;
  readonly safeArea?: boolean;
  readonly floating?: boolean;
  readonly rest?: number;
  readonly children?: ReactNode;
}

export function GlassBar({ scrolled = true, safeArea = true, floating = false, rest, style, children, ...others }: GlassBarProps) {
  const insets = useInsets();
  const glass = useGlass();
  return (
    <GlassSurface
      {...others}
      level="bar"
      rim="bottom"
      active={scrolled}
      rest={rest ?? glass.rest}
      elevated
      style={[floating ? styles.floating : null, safeArea ? { paddingTop: insets.top } : null, style]}
    >
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
});

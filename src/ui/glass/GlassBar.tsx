import type { ReactNode } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { useInsets } from '../layout/useInsets';
import { GlassSurface } from './GlassSurface';

export interface GlassBarProps extends ViewProps {
  readonly scrolled?: boolean;
  readonly safeArea?: boolean;
  readonly floating?: boolean;
  readonly children?: ReactNode;
}

export function GlassBar({ scrolled = true, safeArea = true, floating = false, style, children, ...rest }: GlassBarProps) {
  const insets = useInsets();
  return (
    <GlassSurface
      {...rest}
      level="bar"
      rim="bottom"
      active={scrolled}
      style={[floating ? styles.floating : null, safeArea ? { paddingTop: insets.top } : null, style]}
    >
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
});

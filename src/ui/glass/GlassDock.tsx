import type { ReactNode } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { useInsets } from '../layout/useInsets';
import { useGlass } from '../theme';
import { GlassSurface } from './GlassSurface';

export interface GlassDockProps extends ViewProps {
  readonly safeArea?: boolean;
  readonly floating?: boolean;
  readonly rounded?: boolean;
  readonly offset?: number;
  readonly children?: ReactNode;
}

export function GlassDock({ safeArea = true, floating = false, rounded = true, offset = 0, style, children, ...rest }: GlassDockProps) {
  const insets = useInsets();
  const glass = useGlass();
  return (
    <GlassSurface
      {...rest}
      level="dock"
      rim="top"
      corners="top"
      radius={rounded ? glass.radius.dock : 0}
      style={[floating ? [styles.floating, { bottom: offset }] : null, safeArea ? { paddingBottom: insets.bottom } : null, style]}
    >
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', left: 0, right: 0, zIndex: 1 },
});

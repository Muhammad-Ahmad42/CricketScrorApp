import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { GlassContainer } from 'expo-glass-effect';
import { useGlassRenderer } from './platform';

export interface GlassGroupProps extends ViewProps {
  readonly spacing?: number;
  readonly children?: ReactNode;
}

export function GlassGroup({ spacing, children, ...rest }: GlassGroupProps) {
  const renderer = useGlassRenderer();
  if (renderer === 'liquid') {
    return (
      <GlassContainer {...rest} spacing={spacing}>
        {children}
      </GlassContainer>
    );
  }
  return <View {...rest}>{children}</View>;
}

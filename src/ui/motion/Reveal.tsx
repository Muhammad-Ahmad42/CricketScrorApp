import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import type { MotionDurationToken } from '../theme/tokens';
import { useEntrance } from './useEntrance';

export interface RevealProps {
  readonly children: ReactNode;
  readonly visible?: boolean;
  readonly enter?: MotionDurationToken;
  readonly translateY?: number;
  readonly scale?: number;
  readonly delay?: number;
  readonly replayKey?: string | number;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function Reveal({ children, visible = true, enter = 'base', translateY = 0, scale = 1, delay = 0, replayKey, style, testID }: RevealProps) {
  const entrance = useEntrance({ visible, enter, translateY, scale, delay, replayKey });
  return (
    <Animated.View testID={testID} style={[style, entrance]}>
      {children}
    </Animated.View>
  );
}

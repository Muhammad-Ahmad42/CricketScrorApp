import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { noteTouchStart } from '../primitives/internal/interaction';

export interface InputModalityRootProps {
  readonly children: ReactNode;
}

export function InputModalityRoot({ children }: InputModalityRootProps) {
  return (
    <View testID="input-modality-root" style={styles.fill} onStartShouldSetResponderCapture={noteTouchStart}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

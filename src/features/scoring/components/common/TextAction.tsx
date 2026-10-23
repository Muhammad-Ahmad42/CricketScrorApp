import { StyleSheet, View } from 'react-native';
import { Button, space, useGutter, type ButtonProps } from '@/ui';

export type TextActionProps = Pick<ButtonProps, 'label' | 'icon' | 'onPress' | 'disabled' | 'accessibilityLabel' | 'accessibilityHint' | 'testID'>;

export function TextAction(props: TextActionProps) {
  const gutter = useGutter();
  return (
    <View style={[styles.root, { paddingHorizontal: Math.max(0, gutter - space.sm) }]}>
      <Button {...props} variant="tertiary" size="sm" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'flex-start', paddingTop: space.xs },
});

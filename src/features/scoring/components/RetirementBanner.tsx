import { StyleSheet, View } from 'react-native';
import { Banner, Button, space, useGutter } from '@/ui';

export interface RetirementBannerProps {
  readonly message: string;
  readonly onRetire: () => void;
  readonly onDismiss: () => void;
}

export function RetirementBanner({ message, onRetire, onDismiss }: RetirementBannerProps) {
  const gutter = useGutter();
  return (
    <View testID="score-banner-retirement">
      <Banner tone="warning" message={message} action={{ label: 'Retire', onPress: onRetire, testID: 'score-banner-retire' }} />
      <View style={[styles.dismiss, { paddingHorizontal: Math.max(0, gutter - space.sm) }]}>
        <Button label="Not now" variant="tertiary" size="sm" onPress={onDismiss} testID="score-banner-not-now" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dismiss: { alignItems: 'flex-end' },
});

import { StyleSheet, View } from 'react-native';
import { Banner, Button, space } from '@/ui';

export interface RetirementBannerProps {
  readonly message: string;
  readonly onRetire: () => void;
  readonly onDismiss: () => void;
}

export function RetirementBanner({ message, onRetire, onDismiss }: RetirementBannerProps) {
  return (
    <View testID="score-banner-retirement">
      <Banner tone="warning" message={message} action={{ label: 'Retire', onPress: onRetire, testID: 'score-banner-retire' }} />
      <View style={styles.dismiss}>
        <Button label="Not now" variant="tertiary" size="sm" onPress={onDismiss} testID="score-banner-not-now" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dismiss: { alignItems: 'flex-end', paddingHorizontal: space.xs },
});

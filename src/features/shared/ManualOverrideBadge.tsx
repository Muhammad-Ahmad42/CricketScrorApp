import { StyleSheet, View } from 'react-native';
import { Badge, Text, space } from '@/ui';

export const MANUAL_OVERRIDE_LABEL = 'Manual Override';

export interface ManualOverrideBadgeProps {
  readonly reason: string;
  readonly showReason?: boolean;
  readonly testID?: string;
}

export function ManualOverrideBadge({ reason, showReason = true, testID }: ManualOverrideBadgeProps) {
  return (
    <View style={styles.root} accessible accessibilityLabel={`${MANUAL_OVERRIDE_LABEL}. Reason: ${reason}`}>
      <Badge label={MANUAL_OVERRIDE_LABEL} tone="override" testID={testID} />
      {showReason ? (
        <Text variant="footnote" tone="secondary" numberOfLines={3}>
          {`“${reason}”`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xxs, alignItems: 'flex-start' },
});

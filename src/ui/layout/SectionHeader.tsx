import { StyleSheet, View } from 'react-native';
import { Button } from '../primitives/Button';
import type { StateAction } from '../primitives/EmptyState';
import { space } from '../theme';
import { Text } from '../typography';
import { BoundaryRule } from './BoundaryRule';

export interface SectionHeaderProps {
  readonly title: string;
  readonly action?: StateAction;
  readonly ruled?: boolean;
  readonly testID?: string;
}

export function SectionHeader({ title, action, ruled = false, testID }: SectionHeaderProps) {
  return (
    <View testID={testID}>
      {ruled ? <BoundaryRule /> : null}
      <View style={styles.row}>
        <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {action ? (
          <Button label={action.label} onPress={action.onPress} variant="tertiary" size="sm" testID={action.testID} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.xl,
    paddingBottom: space.xs,
    paddingHorizontal: space.md,
    minHeight: 44,
  },
  title: { flexShrink: 1 },
});

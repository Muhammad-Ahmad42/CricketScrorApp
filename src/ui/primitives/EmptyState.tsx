import { StyleSheet, View } from 'react-native';
import { useGutter } from '../layout/gutter';
import { space } from '../theme';
import { Text } from '../typography';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export interface StateAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

export interface EmptyStateProps {
  readonly title: string;
  readonly body?: string;
  readonly icon?: IconName;
  readonly action?: StateAction;
  readonly caps?: boolean;
  readonly testID?: string;
}

export function EmptyState({ title, body, icon, action, caps = false, testID }: EmptyStateProps) {
  const gutter = useGutter();
  return (
    <View testID={testID} style={[styles.root, { paddingHorizontal: gutter }]}>
      {icon ? <Icon name={icon} size={32} color="textMuted" /> : null}
      <Text variant="title2" align="center" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="secondary" align="center" numberOfLines={3} style={styles.body}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} onPress={action.onPress} testID={action.testID} caps={caps} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingTop: space['3xl'],
    gap: space.xs,
  },
  title: { flexShrink: 1 },
  body: { maxWidth: 320 },
  action: { marginTop: space.md },
});

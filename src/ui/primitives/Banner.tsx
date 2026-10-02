import { StyleSheet, View } from 'react-native';
import { space, useTheme, type ColorToken } from '../theme';
import { Text } from '../typography';
import { Button } from './Button';
import type { StateAction } from './EmptyState';
import { Icon, type IconName } from './Icon';

export type BannerTone = 'danger' | 'warning' | 'info';

interface BannerLook {
  readonly background: ColorToken;
  readonly bar: ColorToken;
  readonly icon: IconName;
  readonly iconColor: ColorToken;
}

const LOOKS: { readonly [K in BannerTone]: BannerLook } = {
  danger: { background: 'dangerSubtle', bar: 'danger', icon: 'circle-alert', iconColor: 'danger' },
  warning: { background: 'warningSubtle', bar: 'warning', icon: 'triangle-alert', iconColor: 'warning' },
  info: { background: 'accentSubtle', bar: 'accent', icon: 'info', iconColor: 'accent' },
};

export interface BannerProps {
  readonly tone: BannerTone;
  readonly message: string;
  readonly action?: StateAction;
  readonly testID?: string;
}

export function Banner({ tone, message, action, testID }: BannerProps) {
  const theme = useTheme();
  const look = LOOKS[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
      style={[styles.root, { backgroundColor: theme.color[look.background] }]}
    >
      <View style={[styles.bar, { backgroundColor: theme.color[look.bar] }]} />
      <Icon name={look.icon} size={20} color={look.iconColor} />
      <Text variant="subhead" style={styles.text}>
        {message}
      </Text>
      {action ? <Button label={action.label} onPress={action.onPress} variant="tertiary" size="sm" testID={action.testID} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingLeft: space.md,
    paddingRight: space.xs,
    minHeight: 48,
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  text: { flex: 1 },
});

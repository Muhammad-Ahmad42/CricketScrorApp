import { StyleSheet, View } from 'react-native';
import { Button, Icon, Text, space, useTheme, type ColorToken, type IconName, type StateAction } from '@/ui';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

interface NoticeLook {
  readonly background: ColorToken;
  readonly bar: ColorToken;
  readonly icon: IconName;
}

const LOOKS: { readonly [K in NoticeTone]: NoticeLook } = {
  info: { background: 'accentSubtle', bar: 'accent', icon: 'info' },
  warning: { background: 'warningSubtle', bar: 'warning', icon: 'triangle-alert' },
  danger: { background: 'dangerSubtle', bar: 'danger', icon: 'circle-alert' },
  success: { background: 'successSubtle', bar: 'success', icon: 'circle-check' },
};

export interface NoticeProps {
  readonly tone: NoticeTone;
  readonly message: string;
  readonly action?: StateAction;
  readonly testID?: string;
}

export function Notice({ tone, message, action, testID }: NoticeProps) {
  const theme = useTheme();
  const look = LOOKS[tone];
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.root, { backgroundColor: theme.color[look.background] }]}
    >
      <View style={[styles.bar, { backgroundColor: theme.color[look.bar] }]} />
      <Icon name={look.icon} size={20} color={look.bar} />
      <Text variant="subhead" style={styles.text} testID={testID}>
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

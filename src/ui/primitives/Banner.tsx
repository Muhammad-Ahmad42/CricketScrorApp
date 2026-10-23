import { StyleSheet, View } from 'react-native';
import { useGutter } from '../layout/gutter';
import { space, useTheme, type ColorToken } from '../theme';
import { Button } from './Button';
import { ExplainedText, type DetailContent, type DetailPresentation } from './Disclosure';
import type { StateAction } from './EmptyState';
import { Icon, type IconName } from './Icon';

export type BannerTone = 'danger' | 'warning' | 'info' | 'success';

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
  success: { background: 'successSubtle', bar: 'success', icon: 'circle-check', iconColor: 'success' },
};

export interface BannerProps {
  readonly tone: BannerTone;
  readonly message: string;
  readonly supporting?: string | null;
  readonly detail?: DetailContent | null;
  readonly detailTitle?: string;
  readonly whyLabel?: string;
  readonly presentation?: DetailPresentation;
  readonly action?: StateAction;
  readonly testID?: string;
}

export function Banner({ tone, message, supporting, detail, detailTitle, whyLabel, presentation = 'sheet', action, testID }: BannerProps) {
  const theme = useTheme();
  const gutter = useGutter();
  const look = LOOKS[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
      style={[styles.root, { backgroundColor: theme.color[look.background], paddingLeft: gutter }]}
    >
      <View style={[styles.bar, { backgroundColor: theme.color[look.bar], width: theme.borderWidth.bar }]} />
      <Icon name={look.icon} size={20} color={look.iconColor} />
      <View style={styles.text}>
        <ExplainedText
          headline={message}
          supporting={supporting}
          detail={detail}
          detailTitle={detailTitle}
          whyLabel={whyLabel}
          presentation={presentation}
          size="subhead"
          headlineVariant="subhead"
          testID={testID ? `${testID}-text` : undefined}
        />
      </View>
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
    paddingRight: space.xs,
    minHeight: 48,
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  text: { flex: 1, minWidth: 0 },
});

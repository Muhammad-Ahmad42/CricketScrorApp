import { StyleSheet, View, type ViewStyle } from 'react-native';
import { space, useTheme, type ColorToken, type Theme } from '../theme';
import { Text } from '../typography';
import { Icon, type IconName } from './Icon';

export type BadgeTone =
  | 'live'
  | 'paused'
  | 'outline'
  | 'plain'
  | 'qualified'
  | 'contention'
  | 'eliminated'
  | 'provisional'
  | 'override'
  | 'repair';

interface BadgeLook {
  readonly background: ColorToken | null;
  readonly text: ColorToken;
  readonly border: 'solid' | 'dashed' | null;
  readonly icon: IconName | 'dot' | null;
}

const LOOKS: { readonly [K in BadgeTone]: BadgeLook } = {
  live: { background: 'accentSubtle', text: 'accent', border: null, icon: 'dot' },
  paused: { background: 'warningSubtle', text: 'warning', border: null, icon: 'pause' },
  outline: { background: null, text: 'textSecondary', border: 'solid', icon: null },
  plain: { background: null, text: 'textSecondary', border: null, icon: null },
  qualified: { background: 'successSubtle', text: 'success', border: null, icon: 'check' },
  contention: { background: null, text: 'textSecondary', border: 'solid', icon: null },
  eliminated: { background: null, text: 'textMuted', border: null, icon: 'x' },
  provisional: { background: null, text: 'textSecondary', border: 'dashed', icon: null },
  override: { background: 'warningSubtle', text: 'warning', border: null, icon: 'pencil-line' },
  repair: { background: 'dangerSubtle', text: 'danger', border: null, icon: 'circle-alert' },
};

export interface BadgeProps {
  readonly label: string;
  readonly tone?: BadgeTone;
  readonly showIcon?: boolean;
  readonly testID?: string;
}

function containerStyle(theme: Theme, look: BadgeLook): ViewStyle {
  return {
    backgroundColor: look.background ? theme.color[look.background] : 'transparent',
    borderRadius: theme.radius.xs,
    borderWidth: look.border ? theme.borderWidth.control : 0,
    borderColor: theme.color.borderStrong,
    borderStyle: look.border === 'dashed' ? 'dashed' : 'solid',
    paddingHorizontal: look.background || look.border ? space.xs : 0,
  };
}

function BadgeGlyph({ icon, color }: { readonly icon: BadgeLook['icon']; readonly color: ColorToken }) {
  const theme = useTheme();
  if (icon === null) {
    return null;
  }
  if (icon === 'dot') {
    return <View style={[styles.dot, { backgroundColor: theme.color[color] }]} />;
  }
  return <Icon name={icon} size={16} color={color} />;
}

export function Badge({ label, tone = 'outline', showIcon = true, testID }: BadgeProps) {
  const theme = useTheme();
  const look = LOOKS[tone];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.badge, containerStyle(theme, look)]}
    >
      {showIcon ? <BadgeGlyph icon={look.icon} color={look.text} /> : null}
      <Text variant="label" weight="semibold" style={[styles.text, { color: theme.color[look.text] }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xxs,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { textTransform: 'none', letterSpacing: 0 },
});

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Separator } from '../layout/BoundaryRule';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { Badge, type BadgeProps } from './Badge';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { focusRingStyle, useFocusRing } from './internal/interaction';

export type ListRowLeading = { readonly icon: IconName } | { readonly monogram: string };

export type ListRowTrailing =
  | { readonly kind: 'chevron' }
  | { readonly kind: 'value'; readonly text: string; readonly chevron?: boolean }
  | { readonly kind: 'switch'; readonly value: boolean; readonly onValueChange: (value: boolean) => void; readonly disabled?: boolean }
  | { readonly kind: 'badge'; readonly badge: BadgeProps }
  | { readonly kind: 'custom'; readonly node: ReactNode };

export interface ListRowMenu {
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

export interface ListRowProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly leading?: ListRowLeading;
  readonly trailing?: ListRowTrailing;
  readonly onPress?: () => void;
  readonly menu?: ListRowMenu;
  readonly compact?: boolean;
  readonly separator?: boolean;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

function rowLabel(title: string, subtitle: string | undefined, trailing: ListRowTrailing | undefined): string {
  const parts = [title];
  if (subtitle) {
    parts.push(subtitle);
  }
  if (trailing?.kind === 'value') {
    parts.push(trailing.text);
  }
  if (trailing?.kind === 'badge') {
    parts.push(trailing.badge.label);
  }
  return parts.join(', ');
}

function Trailing({ trailing }: { readonly trailing: ListRowTrailing }) {
  const theme = useTheme();
  switch (trailing.kind) {
    case 'chevron':
      return <Icon name="chevron-right" size={20} color="textMuted" />;
    case 'value':
      return (
        <View style={styles.trailingValue}>
          <Text variant="body" tone="secondary" numberOfLines={1}>
            {trailing.text}
          </Text>
          {trailing.chevron ? <Icon name="chevron-right" size={20} color="textMuted" /> : null}
        </View>
      );
    case 'switch':
      return (
        <Switch
          value={trailing.value}
          onValueChange={trailing.onValueChange}
          disabled={trailing.disabled}
          trackColor={{ true: theme.color.accent, false: theme.color.borderStrong }}
          accessible={false}
          importantForAccessibility="no"
        />
      );
    case 'badge':
      return <Badge {...trailing.badge} />;
    case 'custom':
      return <>{trailing.node}</>;
    default: {
      const unreachable: never = trailing;
      return unreachable;
    }
  }
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  menu,
  compact = false,
  separator = true,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const isSwitch = trailing?.kind === 'switch';
  const handlePress = isSwitch ? () => trailing.onValueChange(!trailing.value) : onPress;
  const interactive = handlePress !== undefined && !(isSwitch && trailing.disabled);
  const minHeight = compact || !subtitle ? theme.size.rowCompact : theme.size.row;
  const separatorInset = leading && 'monogram' in leading ? 64 : space.md;
  return (
    <View>
      <View style={styles.line}>
        <Pressable
          testID={testID}
          accessibilityRole={isSwitch ? 'switch' : interactive ? 'button' : 'text'}
          accessibilityLabel={accessibilityLabel ?? rowLabel(title, subtitle, trailing)}
          accessibilityHint={accessibilityHint}
          accessibilityState={isSwitch ? { checked: trailing.value, disabled: disabled || trailing.disabled } : { disabled }}
          disabled={disabled || !interactive}
          onPress={handlePress}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          style={({ pressed }) => [
            styles.row,
            {
              minHeight,
              backgroundColor: pressed && interactive ? theme.color.surfaceSunken : theme.color.surface,
            },
            focusRingStyle(theme, focus.focused, 'inside'),
          ]}
        >
          {leading ? (
            'icon' in leading ? (
              <Icon name={leading.icon} size={20} color="textSecondary" />
            ) : (
              <View
                style={[styles.monogram, { backgroundColor: theme.color.surfaceSunken, borderRadius: theme.radius.md }]}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              >
                <Text variant="subhead" weight="semibold">
                  {leading.monogram}
                </Text>
              </View>
            )
          ) : null}
          <View style={styles.text}>
            <Text variant="body" tone={disabled ? 'muted' : 'primary'} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="footnote" tone="secondary" numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {trailing ? <Trailing trailing={trailing} /> : null}
        </Pressable>
        {menu ? (
          <View style={[styles.menu, { backgroundColor: theme.color.surface }]}>
            <IconButton icon="ellipsis" accessibilityLabel={menu.accessibilityLabel} onPress={menu.onPress} testID={menu.testID} />
          </View>
        ) : null}
      </View>
      {separator ? <Separator inset={separatorInset} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'stretch' },
  row: {
    flex: 1,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  text: { flex: 1 },
  trailingValue: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, maxWidth: '50%' },
  monogram: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  menu: { justifyContent: 'center', paddingRight: space.xxs },
});

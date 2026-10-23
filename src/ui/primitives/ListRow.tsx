import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Separator } from '../layout/BoundaryRule';
import { useGutter, useRowBleed } from '../layout/gutter';
import { space, useContentSurface, useTheme } from '../theme';
import { Text } from '../typography';
import { Badge, type BadgeProps } from './Badge';
import { SelectionMark } from './Choice';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { Switch } from './Switch';
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
  readonly selected?: boolean;
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
        <Switch value={trailing.value} onValueChange={trailing.onValueChange} disabled={trailing.disabled} hidden />
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

export const LIST_SEPARATOR_INSET = space.md;
export const MONOGRAM_MIN_WIDTH = 40;

export interface MonogramProps {
  readonly text: string;
  readonly testID?: string;
}

export function Monogram({ text, testID }: MonogramProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.monogram, { backgroundColor: theme.color.accentSubtle, borderRadius: theme.radius.md }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Text variant="figureSmall" numberOfLines={1} style={{ color: theme.color.accent }}>
        {text}
      </Text>
    </View>
  );
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
  selected,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const isSwitch = trailing?.kind === 'switch';
  const choosable = selected !== undefined && !isSwitch;
  const handlePress = isSwitch ? () => trailing.onValueChange(!trailing.value) : onPress;
  const interactive = handlePress !== undefined && !(isSwitch && trailing.disabled);
  const minHeight = compact || !subtitle ? theme.size.rowCompact : theme.size.row;
  const gutter = useGutter();
  const bleed = useRowBleed();
  const surface = useContentSurface();
  return (
    <View style={bleed > 0 ? { marginHorizontal: -bleed } : null}>
      <View style={[styles.line, { backgroundColor: surface }]}>
        <Pressable
          testID={testID}
          accessibilityRole={isSwitch ? 'switch' : choosable ? 'radio' : interactive ? 'button' : 'text'}
          accessibilityLabel={accessibilityLabel ?? rowLabel(title, subtitle, trailing)}
          accessibilityHint={accessibilityHint}
          accessibilityState={
            isSwitch ? { checked: trailing.value, disabled: disabled || trailing.disabled } : choosable ? { checked: selected, selected, disabled } : { disabled }
          }
          aria-checked={isSwitch ? trailing.value : choosable ? selected : undefined}
          aria-disabled={disabled || (isSwitch && trailing.disabled === true)}
          disabled={disabled || !interactive}
          onPress={handlePress}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          style={({ pressed }) => [
            styles.row,
            {
              minHeight,
              paddingHorizontal: gutter,
              backgroundColor: pressed && interactive ? theme.color.surfaceSunken : surface,
            },
            focusRingStyle(theme, focus.focused, 'inside'),
          ]}
        >
          {choosable ? (
            <View testID={selected && testID ? `${testID}-check` : undefined}>
              <SelectionMark kind="radio" selected={selected} disabled={disabled} />
            </View>
          ) : null}
          {leading ? (
            'icon' in leading ? (
              <Icon name={leading.icon} size={20} color="textSecondary" />
            ) : (
              <Monogram text={leading.monogram} />
            )
          ) : null}
          <View style={styles.text}>
            <Text variant="body" tone={disabled ? 'muted' : 'primary'} weight={choosable && selected ? 'semibold' : undefined} numberOfLines={2}>
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
          <View style={[styles.menu, { backgroundColor: surface }]}>
            <IconButton icon="ellipsis" accessibilityLabel={menu.accessibilityLabel} onPress={menu.onPress} testID={menu.testID} />
          </View>
        ) : null}
      </View>
      {separator ? <Separator inset={gutter} /> : null}
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
    paddingVertical: space.sm,
    gap: space.sm,
  },
  text: { flex: 1 },
  trailingValue: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, maxWidth: '50%' },
  monogram: { minWidth: MONOGRAM_MIN_WIDTH, height: 32, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  menu: { justifyContent: 'center', paddingRight: space.xxs },
});

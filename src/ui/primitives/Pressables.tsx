import type { ReactNode, Ref } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type AccessibilityRole,
  type DimensionValue,
  type ViewStyle,
} from 'react-native';
import { Separator } from '../layout/BoundaryRule';
import { useGutter, useRowBleed } from '../layout/gutter';
import { space, useContentSurface, useTheme, type SpaceToken } from '../theme';
import { Text } from '../typography';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { focusRingStyle, MIN_TOUCH, useFocusRing } from './internal/interaction';

export type PressableRole = 'button' | 'link' | 'tab' | 'menuitem' | 'switch' | 'checkbox' | 'radio';

export interface PressableMenu {
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

interface PressableBaseProps {
  readonly accessibilityLabel: string;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly accessibilityHint?: string;
  readonly accessibilityRole?: PressableRole;
  readonly accessibilityActions?: readonly AccessibilityActionInfo[];
  readonly onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  readonly selected?: boolean;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly direction?: 'row' | 'column';
  readonly align?: 'center' | 'start' | 'stretch';
  readonly gap?: SpaceToken;
  readonly testID?: string;
  readonly ref?: Ref<View>;
  readonly children: ReactNode;
}

const ALIGN: { readonly [K in NonNullable<PressableBaseProps['align']>]: ViewStyle['alignItems'] } = {
  center: 'center',
  start: 'flex-start',
  stretch: 'stretch',
};

export function pressableRole(onPress: (() => void) | undefined, role: PressableRole | undefined): AccessibilityRole {
  if (onPress === undefined) {
    return 'text';
  }
  return role ?? 'button';
}

function a11yState(selected: boolean | undefined, checked: boolean | undefined, disabled: boolean) {
  return {
    disabled,
    ...(selected === undefined ? {} : { selected }),
    ...(checked === undefined ? {} : { checked }),
  };
}

export interface PressableRowProps extends PressableBaseProps {
  readonly chevron?: boolean;
  readonly separator?: boolean;
  readonly menu?: PressableMenu;
  readonly compact?: boolean;
  readonly inset?: boolean;
  readonly transparent?: boolean;
}

export function PressableRow({
  accessibilityLabel,
  onPress,
  onLongPress,
  accessibilityHint,
  accessibilityRole,
  accessibilityActions,
  onAccessibilityAction,
  selected,
  checked,
  disabled = false,
  direction = 'row',
  align = 'center',
  gap = 'sm',
  chevron = false,
  separator = true,
  menu,
  compact = false,
  inset = true,
  transparent = false,
  testID,
  ref,
  children,
}: PressableRowProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const surface = useContentSurface();
  const gutter = useGutter();
  const bleed = useRowBleed();
  const interactive = onPress !== undefined && !disabled;
  const resting = transparent ? 'transparent' : surface;
  return (
    <View style={bleed > 0 && inset ? { marginHorizontal: -bleed } : null}>
      <View style={[styles.line, { backgroundColor: resting }]}>
        <Pressable
          ref={ref}
          testID={testID}
          accessible
          accessibilityRole={pressableRole(onPress, accessibilityRole)}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={onPress === undefined ? undefined : accessibilityHint}
          accessibilityState={a11yState(selected, checked, disabled)}
          accessibilityActions={accessibilityActions}
          onAccessibilityAction={onAccessibilityAction}
          aria-selected={selected}
          aria-checked={checked}
          aria-disabled={disabled}
          disabled={!interactive}
          onPress={onPress}
          onLongPress={onLongPress}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          style={({ pressed }) => [
            styles.row,
            {
              flexDirection: direction,
              alignItems: ALIGN[align],
              gap: space[gap],
              minHeight: compact ? theme.size.rowCompact : theme.size.row,
              paddingLeft: inset ? gutter : 0,
              paddingRight: inset ? (menu ? space.xs : gutter) : 0,
              backgroundColor: pressed && interactive ? theme.color.surfaceSunken : resting,
            },
            focusRingStyle(theme, focus.focused, 'inside'),
          ]}
        >
          <View style={[styles.content, { flexDirection: direction, alignItems: ALIGN[align], gap: space[gap] }]}>{children}</View>
          {chevron && interactive ? <Icon name="chevron-right" size={20} color="textMuted" /> : null}
        </Pressable>
        {menu ? (
          <View style={[styles.menu, { paddingRight: Math.max(0, gutter - space.sm) }]}>
            <IconButton icon="ellipsis" accessibilityLabel={menu.accessibilityLabel} onPress={menu.onPress} testID={menu.testID} />
          </View>
        ) : null}
      </View>
      {separator ? <Separator inset={inset ? gutter : 0} /> : null}
    </View>
  );
}

export type CardPadding = SpaceToken | 'none';

export interface PressableCardProps extends PressableBaseProps {
  readonly padding?: CardPadding;
  readonly outlined?: boolean;
  readonly grow?: boolean;
  readonly basis?: DimensionValue;
  readonly radius?: 'sm' | 'md' | 'lg';
  readonly chevron?: boolean;
  readonly menu?: PressableMenu;
}

export function PressableCard({
  accessibilityLabel,
  onPress,
  onLongPress,
  accessibilityHint,
  accessibilityRole,
  accessibilityActions,
  onAccessibilityAction,
  selected,
  checked,
  disabled = false,
  direction = 'column',
  align = 'stretch',
  gap = 'xs',
  padding = 'sm',
  outlined = true,
  grow = false,
  basis,
  radius = 'lg',
  chevron = false,
  menu,
  testID,
  ref,
  children,
}: PressableCardProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const surface = useContentSurface();
  const interactive = onPress !== undefined && !disabled;
  const emphasised = selected === true || checked === true;
  const border = outlined ? (emphasised ? theme.borderWidth.emphasis : theme.borderWidth.hairline) : 0;
  const inner = padding === 'none' ? 0 : space[padding];
  return (
    <View style={[grow ? styles.grow : null, basis !== undefined ? { flexBasis: basis, flexGrow: 1 } : null]}>
      <Pressable
        ref={ref}
        testID={testID}
        accessible
        accessibilityRole={pressableRole(onPress, accessibilityRole)}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={onPress === undefined ? undefined : accessibilityHint}
        accessibilityState={a11yState(selected, checked, disabled)}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        aria-selected={selected}
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={!interactive}
        onPress={onPress}
        onLongPress={onLongPress}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        style={({ pressed }) => [
          styles.card,
          grow ? styles.grow : null,
          {
            borderRadius: theme.radius[radius],
            borderWidth: border,
            borderColor: emphasised ? theme.color.accent : theme.color.border,
            backgroundColor: pressed && interactive ? theme.color.surfaceSunken : emphasised ? theme.color.accentSubtle : surface,
            padding: Math.max(0, inner - Math.max(0, border - theme.borderWidth.hairline)),
            paddingRight: menu ? 0 : Math.max(0, inner - Math.max(0, border - theme.borderWidth.hairline)),
          },
          focusRingStyle(theme, focus.focused),
        ]}
      >
        <View style={[styles.content, { flexDirection: direction, alignItems: ALIGN[align], gap: space[gap] }]}>{children}</View>
        {chevron && interactive ? <Icon name="chevron-right" size={20} color="textMuted" /> : null}
        {menu ? <IconButton icon="ellipsis" accessibilityLabel={menu.accessibilityLabel} onPress={menu.onPress} testID={menu.testID} /> : null}
      </Pressable>
    </View>
  );
}

export interface PressableAreaProps extends PressableBaseProps {
  readonly feedback?: 'dim' | 'none';
}

export const PRESSED_OPACITY = 0.72;

export function PressableArea({
  accessibilityLabel,
  onPress,
  onLongPress,
  accessibilityHint,
  accessibilityRole,
  accessibilityActions,
  onAccessibilityAction,
  selected,
  checked,
  disabled = false,
  direction = 'column',
  align = 'stretch',
  gap,
  feedback = 'dim',
  testID,
  ref,
  children,
}: PressableAreaProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const interactive = onPress !== undefined && !disabled;
  return (
    <Pressable
      ref={ref}
      testID={testID}
      accessible
      accessibilityRole={pressableRole(onPress, accessibilityRole)}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onPress === undefined ? undefined : accessibilityHint}
      accessibilityState={a11yState(selected, checked, disabled)}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      aria-selected={selected}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={!interactive}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.area,
        { flexDirection: direction, alignItems: ALIGN[align], gap: gap === undefined ? 0 : space[gap] },
        pressed && interactive && feedback === 'dim' ? { opacity: PRESSED_OPACITY } : null,
        focusRingStyle(theme, focus.focused),
      ]}
    >
      {children}
    </Pressable>
  );
}

export type ActionTileSpan = 'third' | 'half' | 'full';

const SPAN_BASIS: { readonly [K in ActionTileSpan]: DimensionValue } = {
  third: '30%',
  half: '45%',
  full: '100%',
};

export interface ActionTileProps {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly caption?: string | null;
  readonly figure?: boolean;
  readonly span?: ActionTileSpan;
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

export function ActionTile({ label, accessibilityLabel, onPress, caption, figure = true, span = 'third', disabled = false, accessibilityHint, testID }: ActionTileProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const surface = useContentSurface();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.tile,
        {
          flexBasis: SPAN_BASIS[span],
          minHeight: theme.size.sheetChoice,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth.control,
          borderColor: disabled ? theme.color.border : theme.color.borderStrong,
          backgroundColor: pressed && !disabled ? theme.color.accentSubtle : surface,
        },
        focusRingStyle(theme, focus.focused),
      ]}
    >
      <Text variant={figure ? 'figureSmall' : 'bodyStrong'} tone={disabled ? 'muted' : 'primary'} numberOfLines={1}>
        {label}
      </Text>
      {caption ? (
        <Text variant="footnote" tone={disabled ? 'muted' : 'secondary'} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'stretch' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, minWidth: MIN_TOUCH },
  content: { flex: 1, minWidth: 0 },
  menu: { justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, gap: space.xs },
  grow: { flexGrow: 1 },
  area: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH },
  tile: { flexGrow: 1, minWidth: 96, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs },
});

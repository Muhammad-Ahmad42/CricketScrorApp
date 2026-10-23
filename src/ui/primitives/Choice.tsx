import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type DimensionValue } from 'react-native';
import { Separator } from '../layout/BoundaryRule';
import { useGutter, useRowBleed } from '../layout/gutter';
import { space, useContentSurface, useTheme, type ColorToken } from '../theme';
import { Text } from '../typography';
import { Icon, type IconName } from './Icon';
import { focusRingStyle, useFocusRing } from './internal/interaction';
import { ScrollRow } from './ScrollRow';

export type SelectionKind = 'radio' | 'checkbox';

export const SELECTION_MARK_SIZE = 22;
export const RADIO_DOT_SIZE = 10;
export const CHIP_HEIGHT = 44;

export interface SelectionMarkProps {
  readonly kind: SelectionKind;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function SelectionMark({ kind, selected, disabled = false, testID }: SelectionMarkProps) {
  const theme = useTheme();
  const on = disabled ? theme.color.textMuted : theme.color.accent;
  const ring = selected ? on : disabled ? theme.color.border : theme.color.borderStrong;
  if (kind === 'radio') {
    return (
      <View
        testID={testID}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.mark, { borderRadius: SELECTION_MARK_SIZE, borderColor: ring, borderWidth: theme.borderWidth.emphasis }]}
      >
        {selected ? <View style={[styles.dot, { backgroundColor: on }]} /> : null}
      </View>
    );
  }
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        {
          borderRadius: theme.radius.sm,
          borderColor: ring,
          borderWidth: theme.borderWidth.emphasis,
          backgroundColor: selected ? on : 'transparent',
        },
      ]}
    >
      {selected ? <Icon name="check" size={16} color="onAccent" /> : null}
    </View>
  );
}

export type ChoiceTone = 'default' | 'warning' | 'danger';

export interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly meta?: string;
  readonly tone?: ChoiceTone;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

const TONE_INK: { readonly [K in ChoiceTone]: ColorToken } = {
  default: 'textSecondary',
  warning: 'warning',
  danger: 'danger',
};

const TONE_ICON: { readonly [K in ChoiceTone]: IconName | null } = {
  default: null,
  warning: 'triangle-alert',
  danger: 'triangle-alert',
};

function describe(label: string, description: string | undefined, meta: string | undefined): string {
  return [label, meta, description].filter((part): part is string => typeof part === 'string' && part.length > 0).join(', ');
}

export interface ChoiceRowProps {
  readonly kind: SelectionKind;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly description?: string;
  readonly meta?: string;
  readonly lead?: string;
  readonly tone?: ChoiceTone;
  readonly disabled?: boolean;
  readonly trailing?: ReactNode;
  readonly separator?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

export function ChoiceRow({
  kind,
  label,
  selected,
  onPress,
  description,
  meta,
  lead,
  tone = 'default',
  disabled = false,
  trailing,
  separator = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ChoiceRowProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const surface = useContentSurface();
  const gutter = useGutter();
  const bleed = useRowBleed();
  const toneIcon = TONE_ICON[tone];
  return (
    <View style={bleed > 0 ? { marginHorizontal: -bleed } : null}>
      <View style={[styles.rowLine, { backgroundColor: surface }]}>
        <Pressable
          testID={testID}
          accessibilityRole={kind}
          accessibilityLabel={accessibilityLabel ?? describe(label, description, meta)}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ checked: selected, selected, disabled }}
          aria-checked={selected}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={onPress}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          style={({ pressed }) => [
            styles.row,
            { minHeight: theme.size.sheetChoice, paddingLeft: gutter, paddingRight: trailing ? space.xs : gutter, backgroundColor: pressed && !disabled ? theme.color.surfaceSunken : surface },
            focusRingStyle(theme, focus.focused, 'inside'),
          ]}
        >
          <SelectionMark kind={kind} selected={selected} disabled={disabled} testID={testID ? `${testID}-mark` : undefined} />
          {lead !== undefined ? (
            <Text variant="tableNumeric" tone="secondary" style={styles.lead}>
              {lead}
            </Text>
          ) : null}
          <View style={styles.rowText}>
            <Text variant="body" weight={selected ? 'semibold' : 'regular'} tone={disabled ? 'muted' : 'primary'}>
              {label}
            </Text>
            {description ? (
              <View style={styles.description}>
                {toneIcon ? <Icon name={toneIcon} size={16} color={disabled ? 'textMuted' : TONE_INK[tone]} /> : null}
                <Text variant="footnote" tone={disabled ? 'muted' : tone === 'default' ? 'secondary' : tone} style={styles.descriptionText}>
                  {description}
                </Text>
              </View>
            ) : null}
          </View>
          {meta ? (
            <Text variant="footnote" weight="semibold" tone="secondary">
              {meta}
            </Text>
          ) : null}
        </Pressable>
        {trailing ? <View style={[styles.rowTrailing, { paddingRight: gutter - space.xs }]}>{trailing}</View> : null}
      </View>
      {separator ? <Separator inset={gutter + SELECTION_MARK_SIZE + space.sm} /> : null}
    </View>
  );
}

interface ChoiceListBaseProps<T extends string> {
  readonly choices: readonly ChoiceOption<T>[];
  readonly accessibilityLabel: string;
  readonly separators?: boolean;
  readonly testID?: string;
}

export interface SingleChoiceListProps<T extends string> extends ChoiceListBaseProps<T> {
  readonly mode?: 'single';
  readonly value: T | null;
  readonly onChange: (value: T) => void;
}

export interface MultiChoiceListProps<T extends string> extends ChoiceListBaseProps<T> {
  readonly mode: 'multi';
  readonly values: readonly T[];
  readonly onChange: (values: T[]) => void;
}

export type ChoiceListProps<T extends string> = SingleChoiceListProps<T> | MultiChoiceListProps<T>;

export function toggleValue<T extends string>(values: readonly T[], value: T, order: readonly T[]): T[] {
  const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  return order.filter((v) => next.includes(v));
}

export function ChoiceList<T extends string>(props: ChoiceListProps<T>) {
  const { choices, accessibilityLabel, separators = true, testID } = props;
  const multi = props.mode === 'multi';
  const order = choices.map((choice) => choice.value);
  return (
    <View testID={testID} accessibilityRole={multi ? 'list' : 'radiogroup'} accessibilityLabel={accessibilityLabel}>
      {choices.map((choice, index) => {
        const selected = props.mode === 'multi' ? props.values.includes(choice.value) : props.value === choice.value;
        const press = () => {
          if (props.mode === 'multi') {
            props.onChange(toggleValue(props.values, choice.value, order));
          } else if (!selected) {
            props.onChange(choice.value);
          }
        };
        return (
          <ChoiceRow
            key={choice.value}
            kind={multi ? 'checkbox' : 'radio'}
            label={choice.label}
            description={choice.description}
            meta={choice.meta}
            tone={choice.tone}
            selected={selected}
            disabled={choice.disabled ?? false}
            accessibilityLabel={choice.accessibilityLabel ?? (choice.description ? `${choice.label}. ${choice.description}` : undefined)}
            testID={choice.testID}
            separator={separators && index < choices.length - 1}
            onPress={press}
          />
        );
      })}
    </View>
  );
}

export type RadioListProps<T extends string> = Omit<SingleChoiceListProps<T>, 'mode'>;

export function RadioList<T extends string>(props: RadioListProps<T>) {
  return <ChoiceList {...props} mode="single" />;
}

export type CheckboxListProps<T extends string> = Omit<MultiChoiceListProps<T>, 'mode'>;

export function CheckboxList<T extends string>(props: CheckboxListProps<T>) {
  return <ChoiceList {...props} mode="multi" />;
}

export interface ChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly kind?: SelectionKind;
  readonly disabled?: boolean;
  readonly basis?: DimensionValue;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

export function Chip({ label, selected, onPress, kind = 'radio', disabled = false, basis, accessibilityLabel, accessibilityHint, testID }: ChipProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const surface = useContentSurface();
  const border = selected ? theme.borderWidth.emphasis : theme.borderWidth.control;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={kind}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: selected, selected, disabled }}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.chip,
        basis !== undefined ? { flexBasis: basis, flexGrow: 1 } : null,
        {
          borderRadius: CHIP_HEIGHT / 2,
          borderWidth: border,
          borderColor: disabled ? theme.color.border : selected ? theme.color.accent : theme.color.borderStrong,
          backgroundColor: pressed && !disabled ? theme.color.surfaceSunken : selected ? theme.color.accentSubtle : surface,
          paddingLeft: (selected ? space.sm : space.md) - border,
          paddingRight: space.md - border,
        },
        focusRingStyle(theme, focus.focused),
      ]}
    >
      {selected ? <Icon name="check" size={16} color={disabled ? 'textMuted' : 'accent'} /> : null}
      <Text variant="subhead" weight={selected ? 'semibold' : 'medium'} tone={disabled ? 'muted' : 'primary'} numberOfLines={1} style={styles.chipLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

interface ChipGroupBaseProps<T extends string> {
  readonly options: readonly ChoiceOption<T>[];
  readonly accessibilityLabel: string;
  readonly scroll?: boolean;
  readonly columns?: number;
  readonly testID?: string;
}

export interface SingleChipGroupProps<T extends string> extends ChipGroupBaseProps<T> {
  readonly mode?: 'single';
  readonly value: T | null;
  readonly onChange: (value: T) => void;
}

export interface MultiChipGroupProps<T extends string> extends ChipGroupBaseProps<T> {
  readonly mode: 'multi';
  readonly values: readonly T[];
  readonly onChange: (values: T[]) => void;
}

export type ChipGroupProps<T extends string> = SingleChipGroupProps<T> | MultiChipGroupProps<T>;

export function chipBasis(columns: number | undefined): DimensionValue | undefined {
  if (columns === undefined || columns < 2) {
    return undefined;
  }
  return `${Math.max(10, Math.floor(100 / columns) - 4)}%`;
}

export function ChipGroup<T extends string>(props: ChipGroupProps<T>) {
  const { options, accessibilityLabel, scroll = false, columns, testID } = props;
  const multi = props.mode === 'multi';
  const order = options.map((option) => option.value);
  const basis = scroll ? undefined : chipBasis(columns);
  const isSelected = (value: T) => (props.mode === 'multi' ? props.values.includes(value) : props.value === value);
  const chips = options.map((option) => (
    <Chip
      key={option.value}
      label={option.label}
      kind={multi ? 'checkbox' : 'radio'}
      selected={isSelected(option.value)}
      disabled={option.disabled}
      basis={basis}
      accessibilityLabel={option.accessibilityLabel}
      testID={option.testID}
      onPress={() => {
        if (props.mode === 'multi') {
          props.onChange(toggleValue(props.values, option.value, order));
        } else {
          props.onChange(option.value);
        }
      }}
    />
  ));
  if (scroll) {
    const active = options.findIndex((option) => isSelected(option.value));
    return (
      <ScrollRow
        testID={testID}
        accessibilityRole={multi ? 'list' : 'radiogroup'}
        accessibilityLabel={accessibilityLabel}
        activeIndex={active >= 0 ? active : undefined}
        gap={space.xs}
        contentStyle={styles.chipScroll}
      >
        {chips}
      </ScrollRow>
    );
  }
  return (
    <View testID={testID} accessibilityRole={multi ? 'list' : 'radiogroup'} accessibilityLabel={accessibilityLabel} style={styles.chipWrap}>
      {chips}
    </View>
  );
}

export type OptionTileKind = SelectionKind | 'action';

export interface OptionTileProps {
  readonly title: string;
  readonly description?: string | null;
  readonly selected?: boolean;
  readonly onPress: () => void;
  readonly kind?: OptionTileKind;
  readonly tag?: string | null;
  readonly value?: string | null;
  readonly highlighted?: boolean;
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

export function OptionTile({
  title,
  description,
  selected = false,
  onPress,
  kind = 'radio',
  tag,
  value,
  highlighted = false,
  compact = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: OptionTileProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const surface = useContentSurface();
  const choosable = kind !== 'action';
  const on = choosable && selected;
  const emphasised = on || highlighted;
  const border = emphasised ? theme.borderWidth.emphasis : theme.borderWidth.control;
  const spoken = [title, tag, description, value].filter((part): part is string => typeof part === 'string' && part.length > 0).join('. ');
  return (
    <Pressable
      testID={testID}
      accessibilityRole={choosable ? kind : 'button'}
      accessibilityLabel={accessibilityLabel ?? spoken}
      accessibilityHint={accessibilityHint}
      accessibilityState={choosable ? { checked: on, selected: on, disabled } : { disabled }}
      aria-checked={choosable ? on : undefined}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.tile,
        {
          minHeight: compact ? theme.size.buttonMd : theme.size.sheetChoice,
          borderRadius: theme.radius.lg,
          borderWidth: border,
          borderColor: disabled ? theme.color.border : emphasised ? theme.color.accent : theme.color.borderStrong,
          backgroundColor: pressed && !disabled ? theme.color.surfaceSunken : on ? theme.color.accentSubtle : surface,
          paddingVertical: space.xs - (border - theme.borderWidth.control),
          paddingHorizontal: space.sm - (border - theme.borderWidth.control),
        },
        focusRingStyle(theme, focus.focused),
      ]}
    >
      <View style={styles.tileText}>
        <Text variant="body" weight={on ? 'semibold' : 'medium'} tone={disabled ? 'muted' : 'primary'}>
          {title}
        </Text>
        {description ? (
          <Text variant="footnote" tone={disabled ? 'muted' : 'secondary'}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="tableNumeric" tone="secondary" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {tag ? (
        <View style={[styles.tag, { borderColor: theme.color.borderStrong, borderRadius: theme.radius.xs, borderWidth: theme.borderWidth.control }]}>
          <Text variant="footnote" weight="semibold" tone="secondary">
            {tag}
          </Text>
        </View>
      ) : null}
      {choosable ? <SelectionMark kind={kind} selected={on} disabled={disabled} testID={testID ? `${testID}-mark` : undefined} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mark: { width: SELECTION_MARK_SIZE, height: SELECTION_MARK_SIZE, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dot: { width: RADIO_DOT_SIZE, height: RADIO_DOT_SIZE, borderRadius: RADIO_DOT_SIZE },
  rowLine: { flexDirection: 'row', alignItems: 'stretch' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, minWidth: 44 },
  rowTrailing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  rowText: { flex: 1, minWidth: 0, gap: space.xxs },
  lead: { minWidth: space.lg },
  description: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xxs },
  descriptionText: { flexShrink: 1 },
  chip: { minHeight: CHIP_HEIGHT, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxs },
  chipLabel: { flexShrink: 1 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chipScroll: { paddingVertical: space.xxs },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tileText: { flex: 1, minWidth: 0, gap: space.xxs },
  tag: { paddingHorizontal: space.xxs },
});

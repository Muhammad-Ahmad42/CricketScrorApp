import { Pressable, StyleSheet, View } from 'react-native';
import { Separator } from '../layout/BoundaryRule';
import { useGutter, useRowBleed } from '../layout/gutter';
import { space, useContentSurface, useTheme, type ColorToken } from '../theme';
import { Text, type TextTone } from '../typography';
import { SelectionMark, SELECTION_MARK_SIZE } from './Choice';
import { Icon, type IconName } from './Icon';
import { focusRingStyle, useFocusRing } from './internal/interaction';
import { Sheet } from './Sheet';

export type SheetChoiceKind = 'navigate' | 'action' | 'option';

export interface SheetChoice {
  readonly key: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: IconName;
  readonly kind?: SheetChoiceKind;
  readonly selected?: boolean;
  readonly destructive?: boolean;
  readonly warning?: boolean;
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
  readonly onPress: () => void;
}

export interface ActionRowProps {
  readonly choice: SheetChoice;
  readonly separator?: boolean;
  readonly testID?: string;
}

interface RowLook {
  readonly tone: TextTone;
  readonly icon: ColorToken;
}

function lookFor(choice: SheetChoice): RowLook {
  if (choice.disabled === true) {
    return { tone: 'muted', icon: 'textMuted' };
  }
  if (choice.destructive === true) {
    return { tone: 'danger', icon: 'danger' };
  }
  if (choice.warning === true) {
    return { tone: 'warning', icon: 'warning' };
  }
  return { tone: 'primary', icon: 'textSecondary' };
}

export function ActionRow({ choice, separator = false, testID }: ActionRowProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const surface = useContentSurface();
  const gutter = useGutter();
  const bleed = useRowBleed();
  const kind = choice.kind ?? 'navigate';
  const disabled = choice.disabled === true;
  const option = kind === 'option';
  const selected = option && choice.selected === true;
  const look = lookFor(choice);
  const label = [choice.title, choice.subtitle].filter((part): part is string => part !== undefined && part !== '').join(', ');
  const leadWidth = option ? SELECTION_MARK_SIZE : choice.icon ? 20 : 0;
  return (
    <View style={bleed > 0 ? { marginHorizontal: -bleed } : null}>
      <Pressable
        testID={testID}
        accessibilityRole={option ? 'radio' : 'button'}
        accessibilityLabel={label}
        accessibilityHint={choice.accessibilityHint}
        accessibilityState={option ? { checked: selected, selected, disabled } : { disabled }}
        aria-checked={option ? selected : undefined}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={choice.onPress}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        style={({ pressed }) => [
          styles.row,
          {
            minHeight: choice.subtitle ? theme.size.row : theme.size.rowCompact,
            paddingHorizontal: gutter,
            backgroundColor: pressed && !disabled ? theme.color.surfaceSunken : surface,
          },
          focusRingStyle(theme, focus.focused, 'inside'),
        ]}
      >
        {option ? (
          <SelectionMark kind="radio" selected={selected} disabled={disabled} testID={testID ? `${testID}-mark` : undefined} />
        ) : choice.icon ? (
          <Icon name={choice.icon} size={20} color={look.icon} />
        ) : null}
        <View style={styles.text}>
          <Text variant="body" weight={selected ? 'semibold' : 'regular'} tone={look.tone} numberOfLines={2}>
            {choice.title}
          </Text>
          {choice.subtitle ? (
            <Text variant="footnote" tone={disabled ? 'muted' : 'secondary'} numberOfLines={2}>
              {choice.subtitle}
            </Text>
          ) : null}
        </View>
        {kind === 'navigate' && !disabled ? <Icon name="chevron-right" size={20} color="textMuted" /> : null}
      </Pressable>
      {separator ? <Separator inset={gutter + (leadWidth > 0 ? leadWidth + space.sm : 0)} /> : null}
    </View>
  );
}

export interface ChoiceSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly choices: readonly SheetChoice[];
  readonly onClose: () => void;
  readonly subtitle?: string;
  readonly testID: string;
}

export function ChoiceSheet({ visible, title, subtitle, choices, onClose, testID }: ChoiceSheetProps) {
  const options = choices.some((choice) => choice.kind === 'option');
  return (
    <Sheet visible={visible} title={title} subtitle={subtitle} onClose={onClose} testID={testID}>
      <View accessibilityRole={options ? 'radiogroup' : undefined} accessibilityLabel={options ? title : undefined}>
        {choices.map((choice, index) => {
          const grouped = choice.destructive === true && index > 0 && choices[index - 1].destructive !== true;
          return (
            <View key={choice.key}>
              {grouped ? <View style={styles.group} /> : null}
              <ActionRow choice={choice} separator={index < choices.length - 1 && !(choices[index + 1]?.destructive === true && choice.destructive !== true)} testID={`${testID}-${choice.key}`} />
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, minWidth: 44 },
  text: { flex: 1, minWidth: 0, gap: space.xxs },
  group: { height: space.md },
});

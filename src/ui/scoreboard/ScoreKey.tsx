import { memo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Icon } from '../primitives/Icon';
import { StumpsGlyph } from '../primitives/Markers';
import { focusRingStyle, useFocusRing } from '../primitives/internal/interaction';
import { space, useTheme, type ColorToken } from '../theme';
import { MIN_TEXT_SIZE, TEXT_VARIANTS, Text, maxScaleFor } from '../typography';

export type ScoreKeyKind = 'runs' | 'extras' | 'wicket';

export interface ScoreKeyProps {
  readonly kind: ScoreKeyKind;
  readonly label: string;
  readonly caption?: string | null;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string;
  readonly height?: number;
  readonly compactLabel?: boolean;
  readonly selected?: boolean;
  readonly tag?: string | null;
  readonly testID?: string;
}

export const SCORE_KEY_MIN_HEIGHT = 56;

const COMPACT_LABEL_SIZE = 13;

export function keyLabelMinimumScale(fontScale: number, compact: boolean): number {
  const base = compact ? COMPACT_LABEL_SIZE : TEXT_VARIANTS.keyLabel.size;
  const rendered = base * Math.min(Math.max(fontScale, 1), maxScaleFor('keyLabel'));
  return Math.min(1, MIN_TEXT_SIZE / rendered);
}

function ScoreKeyComponent({
  kind,
  label,
  caption,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  height = 72,
  compactLabel = false,
  selected,
  tag,
  testID,
}: ScoreKeyProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const { fontScale } = useWindowDimensions();
  const wicket = kind === 'wicket';
  const on = selected === true;
  const pressedToken: ColorToken = wicket ? 'dangerSubtle' : 'accentSubtle';
  const face = on ? (wicket ? theme.color.danger : theme.color.accent) : theme.color.surface;
  const ink = on ? (wicket ? 'onDanger' : 'onAccent') : wicket ? 'danger' : kind === 'runs' ? 'score' : 'primary';
  const keyHeight = Math.max(SCORE_KEY_MIN_HEIGHT, height);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected: on }}
      aria-selected={selected}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.key,
        {
          height: keyHeight,
          minHeight: keyHeight,
          borderRadius: theme.radius.md,
          borderWidth: wicket || on ? theme.borderWidth.emphasis : theme.borderWidth.control,
          borderColor: on ? face : wicket ? theme.color.danger : theme.color.borderStrong,
          backgroundColor: pressed && !on ? theme.color[pressedToken] : face,
        },
        focusRingStyle(theme, focus.focused),
      ]}
    >
      {tag ? (
        <View style={[styles.tag, { backgroundColor: on ? 'transparent' : theme.color.surfaceSunken, borderRadius: theme.radius.xs }]} testID={testID ? `${testID}-tag` : undefined}>
          <Text variant="label" tone={on ? ink : 'secondary'} maxFontSizeMultiplier={1.2} numberOfLines={1}>
            {tag}
          </Text>
        </View>
      ) : null}
      {on ? (
        <View style={styles.check} testID={testID ? `${testID}-selected` : undefined}>
          <Icon name="check" size={16} color={wicket ? 'onDanger' : 'onAccent'} />
        </View>
      ) : null}
      {kind === 'runs' ? (
        <View style={[styles.center, tag ? styles.shifted : null]}>
          <Text variant="scoreKey" tone={ink}>
            {label}
          </Text>
          {caption ? (
            <Text variant="label" tone={on ? ink : 'secondary'} maxFontSizeMultiplier={1.2}>
              {caption}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.center, tag ? styles.shifted : null]}>
          {wicket ? <StumpsGlyph size={20} color={on ? 'onDanger' : 'danger'} /> : <Icon name="plus" size={20} color={on ? 'onAccent' : 'textPrimary'} />}
          <Text
            variant="keyLabel"
            tone={ink}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={keyLabelMinimumScale(fontScale, compactLabel)}
            ellipsizeMode="clip"
            style={compactLabel ? styles.compactLabel : null}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export const ScoreKey = memo(ScoreKeyComponent);

const styles = StyleSheet.create({
  key: { flex: 1, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxs },
  center: { alignItems: 'center', alignSelf: 'stretch' },
  compactLabel: { fontSize: COMPACT_LABEL_SIZE, letterSpacing: 0.4 },
  tag: { position: 'absolute', top: space.xxs, left: space.xxs, right: space.xxs, alignItems: 'center' },
  check: { position: 'absolute', bottom: space.xxs, right: space.xxs },
  shifted: { marginTop: space.sm },
});

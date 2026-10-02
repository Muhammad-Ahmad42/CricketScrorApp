import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { StumpsGlyph } from '../primitives/Markers';
import { focusRingStyle, useFocusRing } from '../primitives/internal/interaction';
import { space, useTheme, type ColorToken } from '../theme';
import { Text } from '../typography';

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
  readonly testID?: string;
}

export const SCORE_KEY_MIN_HEIGHT = 56;

function ScoreKeyComponent({
  kind,
  label,
  caption,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  height = 72,
  compactLabel = false,
  testID,
}: ScoreKeyProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const wicket = kind === 'wicket';
  const pressedToken: ColorToken = wicket ? 'dangerSubtle' : 'accentSubtle';
  const keyHeight = Math.max(SCORE_KEY_MIN_HEIGHT, height);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.key,
        {
          height: keyHeight,
          minHeight: keyHeight,
          borderRadius: theme.radius.md,
          borderWidth: wicket ? theme.borderWidth.emphasis : theme.borderWidth.control,
          borderColor: wicket ? theme.color.danger : theme.color.borderStrong,
          backgroundColor: pressed ? theme.color[pressedToken] : theme.color.surface,
        },
        focusRingStyle(theme, focus.focused),
      ]}
    >
      {kind === 'runs' ? (
        <View style={styles.center}>
          <Text variant="scoreKey" tone="score">
            {label}
          </Text>
          {caption ? (
            <Text variant="label" tone="secondary" maxFontSizeMultiplier={1.2}>
              {caption}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.center}>
          {wicket ? <StumpsGlyph size={20} color="danger" /> : <Icon name="plus" size={20} color="textPrimary" />}
          <Text
            variant="keyLabel"
            tone={wicket ? 'danger' : 'primary'}
            numberOfLines={1}
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
  center: { alignItems: 'center' },
  compactLabel: { fontSize: 13, letterSpacing: 0.4 },
});

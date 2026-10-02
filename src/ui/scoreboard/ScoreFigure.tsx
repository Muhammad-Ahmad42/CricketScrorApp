import { StyleSheet, View } from 'react-native';
import { useLayoutClass } from '../layout/layoutClass';
import { useTheme } from '../theme';
import { HERO_SIZES, maxScaleFor, textStyle, type HeroSize, type TextVariant } from '../typography';
import { RollingChar } from './RollingChar';

export type ScoreFigureVariant = 'hero' | 'large' | 'medium';

const VARIANT_TEXT: { readonly [K in ScoreFigureVariant]: TextVariant } = {
  hero: 'scoreHero',
  large: 'scoreLarge',
  medium: 'scoreMedium',
};

export interface ScoreFigureProps {
  readonly value: string;
  readonly accessibilityLabel?: string;
  readonly variant?: ScoreFigureVariant;
  readonly size?: HeroSize;
  readonly tone?: 'score' | 'primary';
  readonly flashAccent?: boolean;
  readonly testID?: string;
}

export function slotKeys(value: string): readonly string[] {
  return value.split('').map((_, index) => `r${value.length - 1 - index}`);
}

export function ScoreFigure({
  value,
  accessibilityLabel,
  variant = 'hero',
  size,
  tone = 'score',
  flashAccent = false,
  testID,
}: ScoreFigureProps) {
  const theme = useTheme();
  const layout = useLayoutClass();
  const textVariant = VARIANT_TEXT[variant];
  const heroSize: HeroSize = size ?? (layout.width === 'compact-s' || layout.height === 'short' ? 'compact' : 'regular');
  const metrics = variant === 'hero' ? HERO_SIZES[heroSize] : null;
  const style = textStyle(textVariant, theme, {
    tone: tone === 'score' ? 'score' : 'primary',
    size: metrics?.size,
    lineHeight: metrics?.lineHeight,
  });
  const baseColor = theme.color[tone === 'score' ? 'score' : 'textPrimary'];
  const lineHeight = typeof style.lineHeight === 'number' ? style.lineHeight : 64;
  const keys = slotKeys(value);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? value}
      style={styles.row}
    >
      {value.split('').map((char, index) => (
        <RollingChar
          key={keys[index]}
          char={char}
          style={style}
          baseColor={baseColor}
          accentColor={theme.color.accent}
          flash={flashAccent}
          reduced={theme.motion.reduced}
          lineHeight={lineHeight}
          maxFontSizeMultiplier={maxScaleFor(textVariant)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});

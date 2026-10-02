import type { Ref } from 'react';
import { Text as RNText, type StyleProp, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { maxScaleFor, textStyle, type TextTone, type TextWeight } from './textStyle';
import type { TextVariant } from './variants';

export interface TextProps extends Omit<RNTextProps, 'style'> {
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
  readonly weight?: TextWeight;
  readonly align?: 'left' | 'center' | 'right';
  readonly style?: StyleProp<TextStyle>;
  readonly ref?: Ref<RNText>;
}

export function Text({ variant = 'body', tone, weight, align, style, maxFontSizeMultiplier, ref, ...rest }: TextProps) {
  const theme = useTheme();
  const base = textStyle(variant, theme, { tone, weight });
  return (
    <RNText
      {...rest}
      ref={ref}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? maxScaleFor(variant)}
      style={[base, align ? { textAlign: align } : null, style]}
    />
  );
}

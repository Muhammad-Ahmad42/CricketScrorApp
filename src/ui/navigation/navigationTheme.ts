import type { Theme as NavigationTheme } from 'expo-router';
import type { Theme } from '../theme';
import { fontFamily } from '../typography/fonts';

export function navigationTheme(theme: Theme): NavigationTheme {
  return {
    dark: theme.scheme === 'dark',
    colors: {
      primary: theme.color.accent,
      background: theme.color.background,
      card: theme.color.surface,
      text: theme.color.textPrimary,
      border: theme.color.border,
      notification: theme.color.danger,
    },
    fonts: {
      regular: { fontFamily: fontFamily.inter400, fontWeight: '400' },
      medium: { fontFamily: fontFamily.inter500, fontWeight: '500' },
      bold: { fontFamily: fontFamily.inter600, fontWeight: '600' },
      heavy: { fontFamily: fontFamily.inter700, fontWeight: '700' },
    },
  };
}

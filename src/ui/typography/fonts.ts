import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { BarlowCondensed_500Medium } from '@expo-google-fonts/barlow-condensed/500Medium';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';

export const fontFamily = {
  inter400: 'Inter_400Regular',
  inter500: 'Inter_500Medium',
  inter600: 'Inter_600SemiBold',
  inter700: 'Inter_700Bold',
  barlow500: 'BarlowCondensed_500Medium',
  barlow600: 'BarlowCondensed_600SemiBold',
  barlow700: 'BarlowCondensed_700Bold',
} as const;

export type FontFamilyKey = keyof typeof fontFamily;

export const FONT_ASSETS: Record<(typeof fontFamily)[FontFamilyKey], number> = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
};

const BOLDER: Record<FontFamilyKey, FontFamilyKey> = {
  inter400: 'inter500',
  inter500: 'inter600',
  inter600: 'inter700',
  inter700: 'inter700',
  barlow500: 'barlow600',
  barlow600: 'barlow700',
  barlow700: 'barlow700',
};

export function bolderFamily(key: FontFamilyKey): FontFamilyKey {
  return BOLDER[key];
}

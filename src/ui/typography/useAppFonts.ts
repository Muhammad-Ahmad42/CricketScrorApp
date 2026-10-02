import { useFonts } from 'expo-font';
import { FONT_ASSETS } from './fonts';

export interface AppFontsState {
  readonly ready: boolean;
  readonly failed: boolean;
}

export function useAppFonts(): AppFontsState {
  const [loaded, error] = useFonts(FONT_ASSETS);
  return { ready: loaded || error != null, failed: error != null };
}

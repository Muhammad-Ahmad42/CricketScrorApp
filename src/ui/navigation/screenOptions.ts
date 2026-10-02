import type { NativeStackNavigationOptions } from 'expo-router';
import type { BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { useTheme, type Theme } from '../theme';

export function stackScreenOptions(theme: Theme): NativeStackNavigationOptions {
  return {
    headerShown: false,
    contentStyle: { backgroundColor: theme.color.background },
    animation: theme.motion.reduced ? 'none' : 'default',
  };
}

export const WIZARD_ROUTES = ['match/new', 'tournament/new'] as const;

export function wizardScreenOptions(theme: Theme): NativeStackNavigationOptions {
  return {
    presentation: 'modal',
    animation: theme.motion.reduced ? 'none' : 'slide_from_bottom',
  };
}

export function tabScreenOptions(theme: Theme): BottomTabNavigationOptions {
  return {
    headerShown: false,
    sceneStyle: { backgroundColor: theme.color.background },
    animation: 'none',
  };
}

export function useStackScreenOptions(): NativeStackNavigationOptions {
  return stackScreenOptions(useTheme());
}

export function useWizardScreenOptions(): NativeStackNavigationOptions {
  return wizardScreenOptions(useTheme());
}

export function useTabScreenOptions(): BottomTabNavigationOptions {
  return tabScreenOptions(useTheme());
}

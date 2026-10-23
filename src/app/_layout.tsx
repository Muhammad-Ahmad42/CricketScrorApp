import { useEffect } from 'react';
import { Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { useAppStore, useHomeStore, useSettingsStore, useToastStore } from '@/stores';
import type { AsyncStatus } from '@/stores';
import {
  BootstrapGate,
  InputModalityRoot,
  SystemChrome,
  ThemeProvider,
  ToastAnchorProvider,
  ToastHost,
  WIZARD_ROUTES,
  holdSplashScreen,
  navigationTheme,
  useAppFonts,
  useStackScreenOptions,
  useTheme,
  useWizardScreenOptions,
  type BootstrapStatus,
} from '@/ui';

holdSplashScreen();

function startApp(): void {
  void useAppStore
    .getState()
    .bootstrap()
    .then((ready) => (ready ? useHomeStore.getState().load() : false));
}

function gateStatus(fontsReady: boolean, status: AsyncStatus): BootstrapStatus {
  return fontsReady ? status : 'loading';
}

function Toasts() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  return <ToastHost toasts={toasts} onDismiss={dismiss} />;
}

function RootNavigator() {
  const theme = useTheme();
  const screenOptions = useStackScreenOptions();
  const wizardOptions = useWizardScreenOptions();
  return (
    <NavigationThemeProvider value={navigationTheme(theme)}>
      <SystemChrome />
      <ToastAnchorProvider>
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name="(tabs)" />
          {WIZARD_ROUTES.map((name) => (
            <Stack.Screen key={name} name={name} options={wizardOptions} />
          ))}
        </Stack>
        <Toasts />
      </ToastAnchorProvider>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const fonts = useAppFonts();
  const themeMode = useSettingsStore((state) => state.settings.theme);
  const reducedMotion = useSettingsStore((state) => state.settings.reducedMotion);
  const reduceTransparency = useSettingsStore((state) => state.settings.reduceTransparency === true);
  const status = useAppStore((state) => state.status);
  const error = useAppStore((state) => state.error);

  useEffect(() => {
    startApp();
  }, []);

  return (
    <ThemeProvider mode={themeMode} reducedMotion={reducedMotion} reduceTransparency={reduceTransparency}>
      <InputModalityRoot>
        <BootstrapGate
          status={gateStatus(fonts.ready, status)}
          error={error === null ? null : { message: error.message, detail: error.detail }}
          onRetry={startApp}
        >
          <RootNavigator />
        </BootstrapGate>
      </InputModalityRoot>
    </ThemeProvider>
  );
}

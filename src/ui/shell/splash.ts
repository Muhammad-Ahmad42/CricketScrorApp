import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';

let held = false;
let released = false;

export function holdSplashScreen(): void {
  if (held) {
    return;
  }
  held = true;
  SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

export function releaseSplashScreen(): void {
  if (released) {
    return;
  }
  released = true;
  SplashScreen.hideAsync().catch(() => undefined);
}

export function useSplashRelease(ready: boolean): void {
  useEffect(() => {
    if (ready) {
      releaseSplashScreen();
    }
  }, [ready]);
}

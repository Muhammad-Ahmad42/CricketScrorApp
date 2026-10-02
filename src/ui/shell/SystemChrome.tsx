import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useTheme } from '../theme';

export function statusBarStyleFor(scheme: 'light' | 'dark'): 'light' | 'dark' {
  return scheme === 'dark' ? 'light' : 'dark';
}

export function SystemChrome() {
  const theme = useTheme();
  const background = theme.color.background;
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(background).catch(() => undefined);
  }, [background]);
  return <StatusBar style={statusBarStyleFor(theme.scheme)} />;
}

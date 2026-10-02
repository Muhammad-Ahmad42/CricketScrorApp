import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { AppInfo } from '../selectors/diagnostics';

export const UNKNOWN_VERSION = 'unknown';

export function readAppInfo(): AppInfo {
  const version = Constants.expoConfig?.version ?? UNKNOWN_VERSION;
  return { version, platform: `${Platform.OS} ${String(Platform.Version)}` };
}

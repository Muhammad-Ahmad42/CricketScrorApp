import type { IconName } from '../primitives/Icon';

export type TabRoute = 'index' | 'tournaments' | 'history' | 'settings';

export interface TabConfig {
  readonly route: TabRoute;
  readonly label: string;
  readonly icon: IconName;
  readonly testID: string;
}

export const TAB_ITEMS: readonly TabConfig[] = [
  { route: 'index', label: 'Home', icon: 'house', testID: 'tab-home' },
  { route: 'tournaments', label: 'Tournaments', icon: 'trophy', testID: 'tab-tournaments' },
  { route: 'history', label: 'History', icon: 'history', testID: 'tab-history' },
  { route: 'settings', label: 'Settings', icon: 'settings', testID: 'tab-settings' },
];

export function tabConfigFor(route: string): TabConfig | undefined {
  return TAB_ITEMS.find((item) => item.route === route);
}

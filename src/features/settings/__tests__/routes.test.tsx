import '@/ui/testing';
import type { ComponentType } from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import SettingsTabRoute from '@/app/(tabs)/settings';
import AboutRoute from '@/app/settings/about';
import BackupRoute from '@/app/settings/backup';
import DiagnosticsRoute from '@/app/settings/diagnostics';
import PresetsRoute from '@/app/settings/presets';
import { resetFakeStores } from './support/fakeStores';

jest.mock('@/stores', () => jest.requireActual('./support/fakeStores').fakeStoresModule);
jest.mock('expo-router', () => jest.requireActual('./support/router').routerModule);
jest.mock('../platform/appInfo', () => ({ readAppInfo: () => ({ version: '1.0.0', platform: 'android 35' }) }));

beforeEach(() => {
  resetFakeStores();
});

describe('settings routes (ARCHITECTURE §9)', () => {
  it.each<[string, ComponentType, string]>([
    ['(tabs)/settings', SettingsTabRoute, 'screen-settings'],
    ['settings/backup', BackupRoute, 'screen-backup'],
    ['settings/presets', PresetsRoute, 'screen-presets'],
    ['settings/diagnostics', DiagnosticsRoute, 'screen-diagnostics'],
    ['settings/about', AboutRoute, 'screen-about'],
  ])('%s renders its screen root', async (_route, Route, rootID) => {
    await renderWithTheme(<Route />);
    expect(screen.getByTestId(rootID)).toBeOnTheScreen();
  });
});

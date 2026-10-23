import '@/ui/testing';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';
import { GUTTERS, widthClassFor } from '@/ui';
import { renderWithTheme, withWindow } from '@/ui/testing';
import { AboutScreen } from '../screens/AboutScreen';
import { BackupScreen } from '../screens/BackupScreen';
import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { PresetsScreen } from '../screens/PresetsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { resetFakeStores } from './support/fakeStores';
import { resetRouter } from './support/router';

jest.mock('@/stores', () => jest.requireActual('./support/fakeStores').fakeStoresModule);
jest.mock('expo-router', () => jest.requireActual('./support/router').routerModule);
jest.mock('../platform/appInfo', () => ({ readAppInfo: () => ({ version: '1.0.0', platform: 'android 35' }) }));

interface HostNode {
  readonly type: unknown;
  readonly props: { readonly style?: unknown };
  readonly parent: HostNode | null;
}

function amount(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function startInset(node: HostNode): number {
  let total = 0;
  for (let current = node.parent; current !== null; current = current.parent) {
    if (typeof current.type !== 'string') {
      continue;
    }
    const style = (StyleSheet.flatten(current.props.style as never) ?? {}) as Record<string, unknown>;
    total += amount(style.paddingLeft ?? style.paddingHorizontal ?? style.padding);
    total += amount(style.marginLeft ?? style.marginHorizontal ?? style.margin);
  }
  return total;
}

function insetOf(text: string): number {
  const node = text.startsWith('#') ? screen.getByTestId(text.slice(1)) : screen.getByText(text);
  return startInset(node as unknown as HostNode);
}

const WIDTHS = [320, 390, 820, 1024] as const;

const SCREENS: readonly (readonly [string, () => ReactElement, readonly string[]])[] = [
  ['Settings', () => <SettingsScreen />, ['Appearance', 'Theme', 'Reduce transparency', 'Default format', 'Show dot balls as', 'Reduce motion', 'About & privacy']],
  ['Backup', () => <BackupScreen />, ['Export', 'Export all data', 'Import', 'Choose a backup file…']],
  ['Presets', () => <PresetsScreen />, ['Built-in', 'T20']],
  ['Diagnostics', () => <DiagnosticsScreen />, ['This app', 'App version', '#diag-btn-technical', '#diag-text-no-repairs', '#diag-btn-fk-check', 'Share technical details']],
  ['About', () => <AboutScreen />, ['Scorebook', 'Your privacy', 'Uninstalling the app deletes your data.', 'Backup & import']],
];

beforeEach(() => {
  resetFakeStores();
  resetRouter();
});

describe('settings screens line up on the responsive gutter (CLAUDE.md Text layout, RESPONSIVE)', () => {
  for (const [name, render, texts] of SCREENS) {
    it.each(WIDTHS)(`${name}: every title, header and helper starts on the gutter at %i wide`, async (width) => {
      await withWindow({ width, height: 900 }, async () => {
        await renderWithTheme(render());
        const gutter = GUTTERS[widthClassFor(width)];
        for (const text of texts) {
          expect([text, insetOf(text)]).toEqual([text, gutter]);
        }
      });
    });
  }

  it('uses a wider gutter on tablets than on small phones', () => {
    expect(GUTTERS[widthClassFor(320)]).toBeLessThan(GUTTERS[widthClassFor(390)]);
    expect(GUTTERS[widthClassFor(1024)]).toBeGreaterThan(GUTTERS[widthClassFor(390)]);
  });
});

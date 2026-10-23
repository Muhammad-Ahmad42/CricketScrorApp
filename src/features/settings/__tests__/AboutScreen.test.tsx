import '@/ui/testing';
import { screen, userEvent } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import { AboutScreen } from '../screens/AboutScreen';
import { mockRouter, resetRouter } from './support/router';

jest.mock('expo-router', () => jest.requireActual('./support/router').routerModule);
jest.mock('../platform/appInfo', () => ({ readAppInfo: () => ({ version: '1.0.0', platform: 'ios 18' }) }));

beforeEach(() => {
  resetRouter();
});

describe('AboutScreen (§85)', () => {
  it('states the version and what the app is', async () => {
    await renderWithTheme(<AboutScreen />);
    expect(screen.getByTestId('screen-about')).toBeOnTheScreen();
    expect(screen.getByTestId('screen-about-ambient', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId('about-text-version')).toHaveTextContent('Version 1.0.0');
    expect(screen.getByTestId('about-text-tagline')).toHaveTextContent('Offline cricket scorebook and tournament manager.');
  });

  it('lists every §85 promise as a short title with at most one short line: no account, offline, no tracking or ads, no cloud, explicit sharing', async () => {
    await renderWithTheme(<AboutScreen />);
    expect(screen.getByTestId('about-row-account')).toHaveAccessibleName('No account or login');
    expect(screen.getByTestId('about-row-offline')).toHaveAccessibleName('Works without internet');
    expect(screen.getByTestId('about-row-tracking')).toHaveAccessibleName('No tracking or ads');
    expect(screen.getByTestId('about-row-cloud')).toHaveAccessibleName('No cloud sync');
    expect(screen.getByTestId('about-row-sharing')).toHaveAccessibleName("You choose what's shared. Only backups, PDFs and technical details you export.");
    for (const key of ['account', 'offline', 'tracking', 'cloud', 'sharing']) {
      expect(String(screen.getByTestId(`about-row-${key}`).props.accessibilityLabel).length).toBeLessThanOrEqual(80);
    }
  });

  it('warns that uninstalling deletes the data as a headline with one action line, not a paragraph', async () => {
    await renderWithTheme(<AboutScreen />);
    expect(screen.getByTestId('about-text-your-data-headline')).toHaveTextContent('Uninstalling the app deletes your data.');
    expect(screen.getByTestId('about-text-your-data-supporting')).toHaveTextContent('Export a backup to keep a copy.');
    expect(screen.queryByText(/database/i)).not.toBeOnTheScreen();
  });

  it('links to backup and back', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<AboutScreen />);
    await user.press(screen.getByTestId('about-btn-backup'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/backup');
    await user.press(screen.getByTestId('nav-btn-back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

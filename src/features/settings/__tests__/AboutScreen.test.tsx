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
  it('states the version and that data stays on the phone', async () => {
    await renderWithTheme(<AboutScreen />);
    expect(screen.getByTestId('screen-about')).toBeOnTheScreen();
    expect(screen.getByTestId('about-text-version')).toHaveTextContent('Version 1.0.0');
    expect(screen.getByTestId('about-text-privacy')).toHaveTextContent('Your data stays on this phone. No account, no tracking, no cloud.');
  });

  it('lists every §85 promise: no account, offline, no tracking or ads, no cloud, explicit sharing', async () => {
    await renderWithTheme(<AboutScreen />);
    expect(screen.getByTestId('about-row-account')).toHaveAccessibleName(/^No account\./);
    expect(screen.getByTestId('about-row-offline')).toHaveAccessibleName(/^Works without internet\./);
    expect(screen.getByTestId('about-row-tracking')).toHaveAccessibleName(/no analytics, no advertising/);
    expect(screen.getByTestId('about-row-cloud')).toHaveAccessibleName(/stored only on this phone/);
    expect(screen.getByTestId('about-row-sharing')).toHaveAccessibleName(/only when you export a backup or share a PDF/);
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

import '@/ui/testing';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import { shareText } from '../platform/shareText';
import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { bootstrapReport, integrityReport, serviceError } from './support/fixtures';
import { resetFakeStores, useFakeAppStore, useFakeBackupStore } from './support/fakeStores';
import { mockRouter, resetRouter } from './support/router';

jest.mock('@/stores', () => jest.requireActual('./support/fakeStores').fakeStoresModule);
jest.mock('expo-router', () => jest.requireActual('./support/router').routerModule);
jest.mock('../platform/appInfo', () => ({ readAppInfo: () => ({ version: '1.0.0', platform: 'android 35' }) }));
jest.mock('../platform/shareText', () => ({ shareText: jest.fn(async () => true) }));

const share = jest.mocked(shareText);

beforeEach(() => {
  resetFakeStores();
  resetRouter();
  share.mockClear();
  share.mockResolvedValue(true);
});

describe('DiagnosticsScreen (W-X3, §86, §93)', () => {
  it('shows the app and database versions', async () => {
    useFakeAppStore.setState({ report: bootstrapReport({ schemaVersion: 1, projectionsRebuilt: 2 }) });
    await renderWithTheme(<DiagnosticsScreen />);
    expect(screen.getByTestId('screen-diagnostics')).toBeOnTheScreen();
    expect(screen.getByTestId('diag-text-app-version')).toHaveTextContent('1.0.0');
    expect(screen.getByTestId('diag-text-schema-version')).toHaveTextContent('1');
    expect(screen.getByTestId('diag-text-engine-version')).toHaveTextContent('2');
    expect(screen.getByTestId('diag-text-backup-format')).toHaveTextContent('1');
    expect(screen.getByTestId('diag-text-rebuilt')).toHaveTextContent('2');
    expect(screen.getByLabelText('Database version, 1')).toBeOnTheScreen();
  });

  it('says so when no match needs repair', async () => {
    await renderWithTheme(<DiagnosticsScreen />);
    expect(screen.getByTestId('diag-text-no-repairs')).toHaveTextContent('No matches need repair.');
    expect(screen.queryByTestId('diag-row-repair-1')).not.toBeOnTheScreen();
  });

  it('lists matches that need repair and opens their ball log', async () => {
    useFakeAppStore.setState({
      report: bootstrapReport({ integrityIssues: [{ matchId: 'match-9', message: 'Lions v Tigers: event 214 cannot be replayed.' }] }),
    });
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    const row = screen.getByTestId('diag-row-repair-1');
    expect(row).toHaveAccessibleName(/^Lions v Tigers: event 214 cannot be replayed\./);
    await user.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/balls', params: { matchId: 'match-9' } });
  });

  it('runs the data-link check on demand and reports a clean database in plain words', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    expect(screen.queryByTestId('diag-text-fk-result')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('diag-btn-fk-check'));
    expect(useFakeAppStore.getState().checkIntegrity).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('diag-text-fk-result')).toHaveTextContent('All links between matches, teams and tournaments are intact.');
    expect(screen.getByTestId('diag-text-last-check')).toHaveTextContent(/^Last check: 30 Sep 2026, \d{2}:\d{2}$/);
  });

  it('reports broken links and the matches the check found', async () => {
    useFakeAppStore.setState({
      checkIntegrity: jest.fn(async () => integrityReport({ foreignKeyViolations: 2, matchesNeedingRepair: ['match-3'] })),
    });
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    await user.press(screen.getByTestId('diag-btn-fk-check'));
    expect(await screen.findByTestId('diag-text-fk-result')).toHaveTextContent(
      'Found 2 broken links between matches, teams and tournaments. Nothing was changed. 1 match needs repair; open it below. Share the technical details if you need help.',
    );
    expect(screen.getByTestId('diag-row-repair-1')).toHaveAccessibleName(/^This match needs repair/);
  });

  it('explains when the check itself fails', async () => {
    useFakeAppStore.setState({
      checkIntegrity: jest.fn(async () => {
        useFakeAppStore.setState({ error: serviceError({ message: "Couldn't open your scorebook data.", detail: 'SQLITE_BUSY' }) });
        return null;
      }),
    });
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    await user.press(screen.getByTestId('diag-btn-fk-check'));
    expect(await screen.findByTestId('diag-banner-error')).toHaveTextContent("Couldn't open your scorebook data.");
    expect(screen.queryByText(/SQLITE_BUSY/)).not.toBeOnTheScreen();
  });

  it('uses a safe message when the failed check carries none', async () => {
    useFakeAppStore.setState({ checkIntegrity: jest.fn(async () => null) });
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    await user.press(screen.getByTestId('diag-btn-fk-check'));
    expect(await screen.findByTestId('diag-banner-error')).toHaveTextContent("Couldn't check your data right now. Nothing was changed.");
  });

  it('keeps technical details off the screen and shares them only on request (§86)', async () => {
    useFakeBackupStore.setState({ error: serviceError({ code: 'IMPORT_INVALID', domainCode: 'SCHEMA_TOO_NEW', detail: 'schemaVersion 9 > 1' }) });
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    expect(screen.queryByText(/IMPORT_INVALID|SCHEMA_TOO_NEW|schemaVersion 9/)).not.toBeOnTheScreen();
    expect(share).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('diag-btn-share-details'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const [title, text] = share.mock.calls[0];
    expect(title).toBe('Scorebook technical details');
    expect(text).toContain('app_version=1.0.0');
    expect(text).toContain('- backup: IMPORT_INVALID/SCHEMA_TOO_NEW: ');
    expect(text).toContain('schemaVersion 9 > 1');
  });

  it('explains when the share sheet cannot open', async () => {
    share.mockResolvedValue(false);
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    await user.press(screen.getByTestId('diag-btn-share-details'));
    expect(await screen.findByTestId('diag-banner-error')).toHaveTextContent("Couldn't open the share sheet for the technical details.");
  });

  it('goes back with the header button', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    await user.press(screen.getByTestId('nav-btn-back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

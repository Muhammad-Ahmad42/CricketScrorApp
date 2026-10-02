import '@/ui/testing';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { FAB_HEIGHT, SCREEN_END_SPACE } from '@/ui';
import { renderWithTheme } from '@/ui/testing';
import { AuditScreen } from '../screens/AuditScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { FixturesScreen } from '../screens/FixturesScreen';
import { PoolsScreen } from '../screens/PoolsScreen';
import { StandingsScreen } from '../screens/StandingsScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { TournamentsScreen } from '../screens/TournamentsScreen';
import { InfoStepScreen } from '../screens/wizard/InfoStepScreen';
import { listItem, liveWizard, loadTournament, resetAll } from './support/harness';
import { useTournamentListStore, useTournamentStore } from './support/mockStores';
import { mockRouter } from './support/router';
import { cupSnapshot, playPair } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

function contentStyle(testID: string): { readonly paddingTop?: number; readonly paddingBottom?: number } {
  return StyleSheet.flatten(screen.getByTestId(testID).props.contentContainerStyle) ?? {};
}

async function layoutHeader(testID: string, height: number): Promise<void> {
  await fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
}

describe('Tournament glass chrome (§106)', () => {
  it('floats the dashboard title in the glass top bar over an ambient wash', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    const header = screen.getByTestId('screen-tournament-header');
    expect(within(header).getByTestId('dash-text-name')).toHaveTextContent('City Cup');
    expect(within(header).getByTestId('dash-btn-settings')).toBeOnTheScreen();
    expect(screen.getByTestId('screen-tournament-ambient', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(within(header).queryByTestId('dash-btn-fixtures')).not.toBeOnTheScreen();
  });

  it('pins the fixture grouping and status filters in the glass bar and keeps search on the page', async () => {
    loadTournament(playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO'));
    await renderWithTheme(<FixturesScreen tournamentId="t1" />);
    const header = screen.getByTestId('screen-fixtures-header');
    expect(within(header).getByTestId('fixtures-chip-round')).toBeOnTheScreen();
    expect(within(header).getByTestId('fixtures-tab-completed')).toBeOnTheScreen();
    expect(within(header).queryByTestId('fixtures-input-search')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('fixtures-tab-cancelled'));
    expect(screen.getByTestId('fixtures-text-none')).toBeOnTheScreen();
  });

  it('adds a match from a floating glass button whose clearance keeps the last fixture visible', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<FixturesScreen tournamentId="t1" />);
    const fab = screen.getByTestId('fixtures-btn-add');
    expect(fab).toHaveProp('accessibilityLabel', 'Add match');
    expect(within(screen.getByTestId('screen-fixtures-header')).queryByTestId('fixtures-btn-add')).not.toBeOnTheScreen();
    expect(contentStyle('fixtures-list').paddingBottom).toBeGreaterThanOrEqual(SCREEN_END_SPACE + FAB_HEIGHT);
    await fireEvent.press(fab);
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/tournament/[tournamentId]/fixtures/new' }));
  });

  it('starts the standings list below the measured glass header so the first row is never hidden', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    const header = screen.getByTestId('screen-standings-header');
    expect(within(header).getByTestId('standings-tabs')).toBeOnTheScreen();
    expect(within(header).queryByTestId('standings-header')).not.toBeOnTheScreen();
    await layoutHeader('screen-standings-header', 148);
    expect(contentStyle('standings-list').paddingTop).toBe(148);
  });

  it('keeps pool tabs working from the glass bar', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('standings-tab-pool-b'));
    expect(screen.getByTestId('standings-tab-pool-b')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  });

  it('pins the audit filter tabs in the glass bar', async () => {
    loadTournament(cupSnapshot());
    useTournamentStore.setState({ loadAudit: jest.fn(async () => []) });
    await renderWithTheme(<AuditScreen tournamentId="t1" />);
    expect(within(screen.getByTestId('screen-audit-header')).getByTestId('audit-tab-all')).toBeOnTheScreen();
    expect(await screen.findByTestId('audit-empty')).toBeOnTheScreen();
  });

  it('pins the statistics tabs in the glass bar', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<StatsScreen tournamentId="t1" />);
    expect(within(screen.getByTestId('screen-tournament-stats-header')).getByTestId('stats-tab-batting')).toBeOnTheScreen();
  });

  it('gives the pool board the screen insets', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await layoutHeader('screen-pools-header', 64);
    expect(contentStyle('pools-list').paddingTop).toBe(64);
    expect(contentStyle('pools-list').paddingBottom).toBeGreaterThanOrEqual(SCREEN_END_SPACE);
  });

  it('puts the wizard step header in the glass bar and its actions in the glass dock', async () => {
    liveWizard();
    await renderWithTheme(<InfoStepScreen />);
    expect(within(screen.getByTestId('screen-tournament-new-header')).getByTestId('twiz-text-step')).toHaveTextContent('Step 1 of 7');
    const footer = screen.getByTestId('screen-tournament-new-footer');
    expect(within(footer).getByTestId('twiz-btn-next')).toBeOnTheScreen();
    expect(within(footer).getByTestId('twiz-btn-back')).toBeOnTheScreen();
  });

  it('pins the tournaments title and filter in the glass bar and scrolls the list beneath it', async () => {
    useTournamentListStore.setState({ items: [listItem()] });
    await renderWithTheme(<TournamentsScreen />);
    const header = screen.getByTestId('screen-tournaments-header');
    expect(within(header).getByTestId('tournaments-filter')).toBeOnTheScreen();
    expect(within(header).getByTestId('tournaments-btn-create')).toBeOnTheScreen();
    await layoutHeader('screen-tournaments-header', 120);
    expect(contentStyle('tournaments-list').paddingTop).toBe(120);
  });
});

import '@/ui/testing';
import { Dimensions, StyleSheet, type ViewStyle } from 'react-native';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import { DashboardScreen } from '../screens/DashboardScreen';
import { loadTournament, resetAll } from './support/harness';
import { useMatchSetupStore, useTournamentStore } from './support/mockStores';
import { mockRouter } from './support/router';
import { cupSnapshot, playGroups, playPair, playToChampion } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

describe('DashboardScreen (§49, §80)', () => {
  it('shows the name, format line, current stage and progress', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    expect(screen.getByTestId('screen-tournament')).toBeOnTheScreen();
    expect(screen.getByTestId('dash-text-name')).toHaveTextContent('City Cup');
    expect(screen.getByText('8 teams · 2 pools · Groups + knockout · T20')).toBeOnTheScreen();
    expect(screen.getByTestId('dash-text-stage')).toHaveTextContent('Group Stage');
    expect(screen.getByTestId('dash-text-progress')).toHaveTextContent('0/15');
  });

  it('renders progress as "24/48" from the evaluation', async () => {
    const data = loadTournament(cupSnapshot());
    useTournamentStore.setState({ evaluation: { ...data.evaluation, progress: { done: 24, total: 48 } } });
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    expect(screen.getByTestId('dash-text-progress')).toHaveTextContent('24/48');
    expect(screen.getByText('24 of 48 matches played')).toBeOnTheScreen();
  });

  it('shows the next match with a Start action that goes to the match setup (§66)', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    const next = screen.getByTestId('dash-row-next-match');
    expect(within(next).getByText(/v/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('dash-btn-start-next'));
    await waitFor(() => expect(useMatchSetupStore.getState().startFromFixture).toHaveBeenCalledWith('t1', expect.any(String)));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/match/new', params: { tournamentId: 't1', fixtureId: expect.any(String) } });
  });

  it('shows a standings excerpt with the columns of §50 and a qualification line', async () => {
    loadTournament(playGroups(cupSnapshot(), 5));
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    for (const column of ['Pos', 'Team', 'P', 'W', 'L', 'NR', 'Pts', 'NRR']) {
      expect(screen.getAllByText(column, { includeHiddenElements: true }).length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId('dash-standings-cell-a-1-team')).toHaveTextContent('Lions');
    expect(screen.getByTestId('dash-standings-cell-a-1-pts')).toHaveTextContent('6');
    expect(screen.getByTestId('dash-text-qualification')).toHaveTextContent(/Lions/);
  });

  it('lists recent results with the domain result text', async () => {
    loadTournament(playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO'));
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    expect(screen.getByTestId('dash-row-result-1')).toHaveProp('accessibilityLabel', expect.stringContaining('Lions won by 6 runs'));
  });

  it('moves to the knockout stage once the groups are complete', async () => {
    loadTournament(playGroups(cupSnapshot()));
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    expect(screen.getByTestId('dash-text-stage')).toHaveTextContent('Knockouts');
    expect(screen.getByTestId('dash-text-progress')).toHaveTextContent('12/15');
  });

  it('names the champion with the basis once the final is played (§92)', async () => {
    loadTournament(playToChampion(cupSnapshot()));
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    expect(screen.getByTestId('dash-text-champion')).toHaveTextContent('Lions');
    expect(screen.getByText('Won the final: Lions won by 6 runs')).toBeOnTheScreen();
    expect(screen.getByTestId('dash-text-progress')).toHaveTextContent('15/15');
  });

  it('uses typography and separators, not a card per statistic', async () => {
    loadTournament(playGroups(cupSnapshot(), 3));
    const view = await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    const raised = view.container.queryAll((node) => {
      const style = StyleSheet.flatten(node.props.style as ViewStyle | undefined);
      return style !== undefined && style !== null && (typeof style.elevation === 'number' || typeof style.shadowOpacity === 'number');
    });
    expect(raised).toHaveLength(0);
  });

  it('splits into two panes on a tablet (§74)', async () => {
    const original = Dimensions.get('window');
    Dimensions.set({ window: { width: 1024, height: 768, scale: 2, fontScale: 1 }, screen: { width: 1024, height: 768, scale: 2, fontScale: 1 } });
    loadTournament(playGroups(cupSnapshot(), 5));
    const view = await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    const panes = view.container.queryAll((node) => StyleSheet.flatten(node.props.style as ViewStyle | undefined)?.flex === 55);
    expect(panes.length).toBeGreaterThan(0);
    expect(screen.getByTestId('dash-standings-cell-a-1-team')).toHaveTextContent('Lions');
    expect(screen.getByTestId('dash-row-next-match')).toBeOnTheScreen();
    await act(async () => {
      Dimensions.set({ window: original, screen: original });
    });
  });

  it('links every section of the tournament', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    for (const id of ['dash-btn-fixtures', 'dash-btn-standings', 'dash-btn-qualification', 'dash-btn-bracket', 'dash-btn-stats', 'dash-btn-pools', 'dash-btn-teams', 'dash-btn-what-if', 'dash-btn-audit', 'dash-btn-manage']) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByTestId('dash-btn-standings'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/tournament/[tournamentId]/standings', params: { tournamentId: 't1' } });
  });

  it('shows a loading state until the tournament is open, and a retry on error', async () => {
    useTournamentStore.setState({ status: 'error', error: { code: 'NOT_FOUND', message: 'Tournament not found', domainCode: null, detail: null } });
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    expect(screen.getByTestId('tournament-error')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('error-btn-retry'));
    expect(useTournamentStore.getState().open).toHaveBeenCalledWith('t1');
  });
});

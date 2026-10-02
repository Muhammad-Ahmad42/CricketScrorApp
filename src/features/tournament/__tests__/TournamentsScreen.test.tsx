import '@/ui/testing';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import { TournamentsScreen } from '../screens/TournamentsScreen';
import { listItem, resetAll } from './support/harness';
import { useTournamentListStore, useTournamentWizardStore } from './support/mockStores';
import { mockRouter } from './support/router';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

describe('TournamentsScreen', () => {
  it('shows the purposeful empty state with one primary action (§87)', async () => {
    await renderWithTheme(<TournamentsScreen />);
    expect(screen.getByTestId('tournaments-text-empty')).toBeOnTheScreen();
    expect(screen.getByText('No tournaments yet')).toBeOnTheScreen();
    expect(screen.getByText('Create a tournament and manage teams, fixtures, standings and finals in one place.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('tournaments-btn-empty-create'));
    expect(useTournamentWizardStore.getState().reset).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith('/tournament/new');
  });

  it('loads the list on mount', async () => {
    await renderWithTheme(<TournamentsScreen />);
    expect(useTournamentListStore.getState().load).toHaveBeenCalledTimes(1);
  });

  it('lists name, team count, status, progress and champion (§82)', async () => {
    useTournamentListStore.setState({
      items: [
        listItem(),
        listItem({ id: 't2', name: 'Winter League', season: null, status: 'completed', teamCount: 6, fixturesDone: 15, fixturesTotal: 15, championName: 'Tigers', updatedAt: '2026-09-01T10:00:00.000Z' }),
      ],
    });
    await renderWithTheme(<TournamentsScreen />);
    expect(screen.getByText('City Cup 2026')).toBeOnTheScreen();
    expect(screen.getByTestId('tournaments-text-status-1')).toHaveTextContent('Active');
    expect(screen.getByText('· 24/48 played')).toBeOnTheScreen();
    expect(screen.getByTestId('tournaments-text-status-2')).toHaveTextContent('Completed');
    expect(screen.getByTestId('tournaments-text-champion-2')).toHaveTextContent('Tigers');
    expect(screen.getByTestId('tournaments-row-1')).toHaveProp('accessibilityLabel', expect.stringContaining('24 of 48 matches played'));
  });

  it('filters by Active, Drafts and Completed', async () => {
    useTournamentListStore.setState({
      items: [
        listItem({ id: 'a', name: 'Active Cup', season: null }),
        listItem({ id: 'd', name: 'Draft Cup', season: null, status: 'structure_configured', updatedAt: '2026-09-21T10:00:00.000Z' }),
        listItem({ id: 'c', name: 'Old Cup', season: null, status: 'archived', updatedAt: '2026-08-01T10:00:00.000Z' }),
      ],
    });
    await renderWithTheme(<TournamentsScreen />);
    await fireEvent.press(screen.getByTestId('tournaments-chip-drafts'));
    expect(screen.getByText('Draft Cup')).toBeOnTheScreen();
    expect(screen.queryByText('Active Cup')).not.toBeOnTheScreen();
    expect(screen.getByText('Continue setup')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('tournaments-chip-completed'));
    expect(screen.getByText('Old Cup')).toBeOnTheScreen();
    expect(screen.getByTestId('tournaments-text-status-1')).toHaveTextContent('Archived');
  });

  it('opens an active tournament on its dashboard', async () => {
    useTournamentListStore.setState({ items: [listItem()] });
    await renderWithTheme(<TournamentsScreen />);
    await fireEvent.press(screen.getByTestId('tournaments-row-1'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/tournament/[tournamentId]', params: { tournamentId: 't1' } });
  });

  it('resumes a draft at its saved step', async () => {
    useTournamentListStore.setState({ items: [listItem({ status: 'pools_configured' })] });
    const resume = jest.fn(async () => {
      useTournamentWizardStore.setState({ step: 'fixtures' });
      return true;
    });
    useTournamentWizardStore.setState({ resume });
    await renderWithTheme(<TournamentsScreen />);
    await fireEvent.press(screen.getByTestId('tournaments-row-1'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/tournament/new/fixtures'));
    expect(resume).toHaveBeenCalledWith('t1');
  });

  it('starts a new wizard from the header button', async () => {
    useTournamentListStore.setState({ items: [listItem()] });
    await renderWithTheme(<TournamentsScreen />);
    await fireEvent.press(screen.getByTestId('tournaments-btn-create'));
    expect(useTournamentWizardStore.getState().reset).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith('/tournament/new');
  });

  it('virtualises a long list of tournaments', async () => {
    useTournamentListStore.setState({
      items: Array.from({ length: 128 }, (_, index) => listItem({ id: `t${index}`, name: `Cup ${index}`, season: null })),
    });
    await renderWithTheme(<TournamentsScreen />);
    expect(screen.getByTestId('tournaments-row-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('tournaments-row-128')).not.toBeOnTheScreen();
  });
});

import '@/features/scoring/__tests__/support/mocks';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Player, Team } from '@/domain/types';
import { fakeTeamLibrary } from '@/features/scoring/__tests__/support/fakes';
import { renderScreen, resetCommonStores } from '@/features/scoring/__tests__/support/render';
import { TeamDetailScreen } from '../screens/TeamDetailScreen';
import { TeamsScreen } from '../screens/TeamsScreen';
import { selectPlayerRows, shortNameError, suggestShortName } from '../selectors';
import { mockStores } from '@/features/scoring/__tests__/support/storeModule';

const { useTeamLibraryStore } = mockStores();

const AT = '2026-01-01T00:00:00.000Z';

function team(overrides: Partial<Team> = {}): Team {
  return { id: 'LIO', name: 'Lions', shortName: 'LIO', logoUri: null, captainId: 'p1', createdAt: AT, updatedAt: AT, archivedAt: null, ...overrides };
}

function player(overrides: Partial<Player> = {}): Player {
  return { id: 'p1', teamId: 'LIO', name: 'Hamza Ali', jerseyNumber: 7, role: 'batter', createdAt: AT, updatedAt: AT, archivedAt: null, ...overrides };
}

describe('team helpers', () => {
  it('suggests a short name and validates its length', () => {
    expect(suggestShortName('Pakistan XI')).toBe('PAK');
    expect(suggestShortName('  ')).toBe('');
    expect(shortNameError('L')).toBe('Use 2 to 4 letters');
    expect(shortNameError('LION')).toBeNull();
  });

  it('builds player rows with role, captain and archived flags', () => {
    const rows = selectPlayerRows(team(), [player(), player({ id: 'p2', name: 'Umar Gul', jerseyNumber: null, role: 'bowler', archivedAt: AT })]);
    expect(rows.map((row) => row.accessibilityLabel)).toEqual(['#7, Hamza Ali, Batter, captain', 'Umar Gul, Bowler, archived']);
  });
});

describe('TeamsScreen (§27)', () => {
  beforeEach(() => {
    resetCommonStores();
    useTeamLibraryStore.setState(fakeTeamLibrary({ teams: [team(), team({ id: 'TIG', name: 'Tigers', shortName: 'TIG' })] }), true);
    jest.clearAllMocks();
  });

  it('lists teams, searches and opens a team', async () => {
    jest.useFakeTimers();
    await renderScreen(<TeamsScreen />);
    expect(useTeamLibraryStore.getState().load).toHaveBeenCalledWith({ search: undefined, includeArchived: false });
    await fireEvent.changeText(screen.getByTestId('teams-search'), 'Tig');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(useTeamLibraryStore.getState().load).toHaveBeenLastCalledWith({ search: 'Tig', includeArchived: false });
    jest.useRealTimers();
    await fireEvent.press(screen.getByTestId('teams-row-TIG'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/teams/[teamId]', params: { teamId: 'TIG' } });
  });

  it('creates a team with a suggested short name', async () => {
    const createTeam = jest.fn(() => Promise.resolve(team({ id: 'NEW', name: 'Hawks', shortName: 'HAW' })));
    useTeamLibraryStore.setState({ createTeam });
    await renderScreen(<TeamsScreen />);
    await fireEvent.press(screen.getByTestId('teams-btn-new'));
    await fireEvent.changeText(screen.getByTestId('team-name'), 'Hawks');
    expect(screen.getByTestId('team-short-name')).toHaveProp('value', 'HAW');
    await fireEvent.press(screen.getByTestId('team-submit'));
    expect(createTeam).toHaveBeenCalledWith({ name: 'Hawks', shortName: 'HAW', players: [] });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/teams/[teamId]', params: { teamId: 'NEW' } }));
  });

  it('shows the empty state with an add action', async () => {
    useTeamLibraryStore.setState(fakeTeamLibrary({ teams: [] }), true);
    await renderScreen(<TeamsScreen />);
    expect(screen.getByTestId('teams-empty')).toBeOnTheScreen();
  });
});

describe('TeamDetailScreen', () => {
  beforeEach(() => {
    resetCommonStores();
    useTeamLibraryStore.setState(fakeTeamLibrary({ detail: { team: team(), players: [player(), player({ id: 'p2', name: 'Rizwan Ahmed', role: 'wicket_keeper', jerseyNumber: 10 })] } }), true);
    jest.clearAllMocks();
  });

  it('loads the team and lists its players', async () => {
    await renderScreen(<TeamDetailScreen teamId="LIO" />);
    expect(useTeamLibraryStore.getState().loadTeam).toHaveBeenCalledWith('LIO');
    expect(screen.getByText('Short name LIO · Captain Hamza Ali')).toBeOnTheScreen();
    expect(screen.getByTestId('team-player-p2')).toHaveProp('accessibilityLabel', '#10, Rizwan Ahmed, Keeper');
  });

  it('adds a player with a role', async () => {
    const addPlayer = jest.fn(() => Promise.resolve(player({ id: 'p3', name: 'Hassan Ali' })));
    useTeamLibraryStore.setState({ addPlayer });
    await renderScreen(<TeamDetailScreen teamId="LIO" />);
    await fireEvent.press(screen.getByTestId('team-btn-add-player'));
    await fireEvent.changeText(screen.getByTestId('player-name'), 'Hassan Ali');
    await fireEvent.changeText(screen.getByTestId('player-jersey'), '23');
    await fireEvent.press(screen.getByTestId('player-role-bowler'));
    await fireEvent.press(screen.getByTestId('player-submit'));
    expect(addPlayer).toHaveBeenCalledWith('LIO', { name: 'Hassan Ali', jerseyNumber: 23, role: 'bowler' });
  });

  it('edits and archives a player', async () => {
    await renderScreen(<TeamDetailScreen teamId="LIO" />);
    await fireEvent.press(screen.getByTestId('team-player-p2'));
    await fireEvent.changeText(screen.getByTestId('player-name'), 'Mohammad Rizwan');
    await fireEvent.press(screen.getByTestId('player-submit'));
    expect(useTeamLibraryStore.getState().updatePlayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2', name: 'Mohammad Rizwan', role: 'wicket_keeper' }));
    await fireEvent.press(screen.getByTestId('team-player-p1'));
    await fireEvent.press(screen.getByTestId('player-archive'));
    expect(useTeamLibraryStore.getState().archivePlayer).toHaveBeenCalledWith('p1');
  });

  it('edits the team and changes the captain', async () => {
    await renderScreen(<TeamDetailScreen teamId="LIO" />);
    await fireEvent.press(screen.getByTestId('team-btn-edit'));
    await fireEvent.press(screen.getByTestId('team-captain-p2'));
    await fireEvent.press(screen.getByTestId('team-submit'));
    expect(useTeamLibraryStore.getState().updateTeam).toHaveBeenCalledWith(expect.objectContaining({ id: 'LIO', captainId: 'p2' }));
  });

  it('archives the team after a confirmation', async () => {
    await renderScreen(<TeamDetailScreen teamId="LIO" />);
    await fireEvent.press(screen.getByTestId('team-btn-archive'));
    await fireEvent.press(screen.getByTestId('team-archive-confirm'));
    await waitFor(() => expect(useTeamLibraryStore.getState().archiveTeam).toHaveBeenCalledWith('LIO'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });
});

import '@/features/scoring/__tests__/support/mocks';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Player, Team } from '@/domain/types';
import { fakeTeamLibrary } from '@/features/scoring/__tests__/support/fakes';
import { renderScreen, resetCommonStores } from '@/features/scoring/__tests__/support/render';
import { TeamDetailScreen } from '../screens/TeamDetailScreen';
import { TeamsScreen } from '../screens/TeamsScreen';
import { playerCountText, selectPlayerRows, shortNameError, suggestShortName, teamRowSubtitle } from '../selectors';
import { mockStores } from '@/features/scoring/__tests__/support/storeModule';
import { focusSpy, focusedTestIDs } from '@/ui/testing';

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
    expect([playerCountText(undefined), playerCountText(0), playerCountText(1), playerCountText(8)]).toEqual([undefined, 'No players yet', '1 player', '8 players']);
    expect(teamRowSubtitle({ archivedAt: '2026-10-01T00:00:00.000Z' } as never, 5)).toBe('Archived · 5 players');
    expect(suggestShortName('Pakistan XI')).toBe('PAK');
    expect(suggestShortName('  ')).toBe('');
    expect(shortNameError('L')).toBe('Use 2 to 4 letters');
    expect(shortNameError('LION')).toBeNull();
  });

  it('builds player rows with role, captain and archived flags', () => {
    const rows = selectPlayerRows(team(), [player(), player({ id: 'p2', name: 'Umar Gul', jerseyNumber: null, role: 'bowler', archivedAt: AT })]);
    expect(rows.map((row) => row.accessibilityLabel)).toEqual(['#7, Hamza Ali, Batter, captain', 'Umar Gul, Bowler, archived']);
    expect(rows.map((row) => row.subtitle)).toEqual(['Batter', 'Bowler · Archived']);
  });

  it('leaves the role out of a player row when it is not set', () => {
    const rows = selectPlayerRows(team(), [player({ role: 'unknown' }), player({ id: 'p2', name: 'Umar Gul', role: 'unknown', archivedAt: AT })]);
    expect(rows.map((row) => row.subtitle)).toEqual([undefined, 'Archived']);
    expect(rows.map((row) => row.accessibilityLabel)).toEqual(['#7, Hamza Ali, captain', '#7, Umar Gul, archived']);
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
    expect(screen.getByText('LIO · Captain Hamza Ali')).toBeOnTheScreen();
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
    await waitFor(() => expect(screen.queryByTestId('sheet-player')).toBeNull());
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
    expect(screen.getByTestId('team-captain-p2')).toHaveProp('accessibilityRole', 'radio');
    await fireEvent.press(screen.getByTestId('team-captain-p2'));
    expect(screen.getByTestId('team-captain-p2')).toHaveProp('accessibilityState', expect.objectContaining({ checked: true, selected: true }));
    expect(screen.getByTestId('team-captain-none')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false, selected: false }));
    expect(screen.getByTestId('team-captain-p2-mark', { includeHiddenElements: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('team-submit'));
    expect(useTeamLibraryStore.getState().updateTeam).toHaveBeenCalledWith(expect.objectContaining({ id: 'LIO', captainId: 'p2' }));
  });

  it('chains the player form: Return on the name moves to a number pad for the shirt, Return there saves and readies the next player', async () => {
    const addPlayer = jest.fn(() => Promise.resolve(player({ id: 'p3', name: 'Hassan Ali' })));
    useTeamLibraryStore.setState({ addPlayer });
    const focus = focusSpy();
    await renderScreen(<TeamDetailScreen teamId="LIO" />);
    await fireEvent.press(screen.getByTestId('team-btn-add-player'));
    expect(screen.getByTestId('player-name')).toHaveProp('returnKeyType', 'next');
    expect(screen.getByTestId('player-jersey')).toHaveProp('keyboardType', 'number-pad');
    expect(screen.getByTestId('player-jersey')).toHaveProp('returnKeyType', 'next');
    await fireEvent.changeText(screen.getByTestId('player-name'), 'Hassan Ali');
    await fireEvent(screen.getByTestId('player-name'), 'submitEditing');
    expect(focusedTestIDs(focus)).toEqual(['player-jersey']);
    await fireEvent.changeText(screen.getByTestId('player-jersey'), '23');
    await fireEvent(screen.getByTestId('player-jersey'), 'submitEditing');
    expect(addPlayer).toHaveBeenCalledWith('LIO', { name: 'Hassan Ali', jerseyNumber: 23, role: 'unknown' });
    await waitFor(() => expect(screen.getByTestId('player-name')).toHaveProp('value', ''));
    expect(screen.getByTestId('sheet-player')).toBeOnTheScreen();
    expect(screen.getByText('1 added')).toBeOnTheScreen();
    expect(focusedTestIDs(focus)).toEqual(['player-jersey', 'player-name']);
    focus.mockRestore();
  });

  it('gives the next player a fresh name input after Save & add another, so Android composing text cannot join two names', async () => {
    const addPlayer = jest.fn(() => Promise.resolve(player({ id: 'p3', name: 'Ben North' })));
    useTeamLibraryStore.setState({ addPlayer });
    const focus = focusSpy();
    await renderScreen(<TeamDetailScreen teamId="LIO" />);
    await fireEvent.press(screen.getByTestId('team-btn-add-player'));
    const first = screen.getByTestId('player-name');
    expect(first).toHaveProp('autoCorrect', false);
    await fireEvent.changeText(first, 'Ben North');
    await fireEvent.press(screen.getByTestId('player-submit-another'));
    await waitFor(() => expect(addPlayer).toHaveBeenCalledWith('LIO', { name: 'Ben North', jerseyNumber: null, role: 'unknown' }));
    await waitFor(() => expect(screen.getByTestId('player-name')).not.toBe(first));
    expect(screen.getByTestId('player-name')).toHaveProp('value', '');
    expect(focusedTestIDs(focus)).toEqual(['player-name']);
    await fireEvent.changeText(screen.getByTestId('player-name'), 'Chris North');
    await fireEvent.press(screen.getByTestId('player-submit-another'));
    await waitFor(() => expect(addPlayer).toHaveBeenLastCalledWith('LIO', { name: 'Chris North', jerseyNumber: null, role: 'unknown' }));
    focus.mockRestore();
  });

  it('chains the team form from the name to the short name and submits from the keyboard', async () => {
    const focus = focusSpy();
    await renderScreen(<TeamDetailScreen teamId="LIO" />);
    await fireEvent.press(screen.getByTestId('team-btn-edit'));
    expect(screen.getByTestId('team-name')).toHaveProp('returnKeyType', 'next');
    expect(screen.getByTestId('team-name')).toHaveProp('autoCorrect', false);
    await fireEvent(screen.getByTestId('team-name'), 'submitEditing');
    expect(focusedTestIDs(focus)).toEqual(['team-short-name']);
    await fireEvent(screen.getByTestId('team-short-name'), 'submitEditing');
    expect(useTeamLibraryStore.getState().updateTeam).toHaveBeenCalledWith(expect.objectContaining({ id: 'LIO', name: 'Lions', shortName: 'LIO' }));
    focus.mockRestore();
  });

  it('archives the team after a confirmation', async () => {
    await renderScreen(<TeamDetailScreen teamId="LIO" />);
    await fireEvent.press(screen.getByTestId('team-btn-archive'));
    await fireEvent.press(screen.getByTestId('team-archive-confirm'));
    await waitFor(() => expect(useTeamLibraryStore.getState().archiveTeam).toHaveBeenCalledWith('LIO'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });
});

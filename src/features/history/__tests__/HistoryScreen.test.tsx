import '@/features/scoring/__tests__/support/mocks';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Team } from '@/domain/types';
import { fakeExport, fakeHistory, fakeTeamLibrary, fakeTournamentList } from '@/features/scoring/__tests__/support/fakes';
import { completedItem, listItem, tournamentItem } from '@/features/scoring/__tests__/support/listItems';
import { renderScreen, resetCommonStores } from '@/features/scoring/__tests__/support/render';
import { HistoryScreen } from '../screens/HistoryScreen';
import { historyRows, statusFilterOf, withStatus } from '../selectors/query';
import { mockStores } from '@/features/scoring/__tests__/support/storeModule';

const { useExportStore, useMatchHistoryStore, useTeamLibraryStore, useTournamentListStore } = mockStores();

const LIONS: Team = {
  id: 'LIO',
  name: 'Lions',
  shortName: 'LIO',
  logoUri: null,
  captainId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  archivedAt: null,
};

describe('history query helpers', () => {
  it('maps status filters to statuses and back', () => {
    const query = withStatus({ sort: 'recent' }, 'live');
    expect(query.statuses).toEqual(['live', 'paused']);
    expect(statusFilterOf(query)).toBe('live');
    expect(statusFilterOf(withStatus(query, 'all'))).toBe('all');
  });

  it('groups rows under month headings', () => {
    const rows = historyRows([completedItem(), listItem({ id: 'm-2', scheduledDate: '2026-08-01' })]);
    expect(rows.map((row) => (row.type === 'header' ? row.title : row.key))).toEqual(['September 2026', 'm-done', 'August 2026', 'm-2']);
  });
});

describe('HistoryScreen (§81)', () => {
  beforeEach(() => {
    resetCommonStores();
    useMatchHistoryStore.setState(fakeHistory({ items: [completedItem(), listItem()] }), true);
    useTeamLibraryStore.setState(fakeTeamLibrary({ teams: [LIONS] }), true);
    useTournamentListStore.setState(fakeTournamentList(), true);
    useExportStore.setState(fakeExport(), true);
    jest.clearAllMocks();
  });

  it('loads the list and shows result lines and scores per match', async () => {
    await renderScreen(<HistoryScreen />);
    expect(useMatchHistoryStore.getState().load).toHaveBeenCalledWith({ sort: 'recent' });
    expect(screen.getByText('Lions won by 5 wickets (12 balls left)')).toBeOnTheScreen();
    expect(screen.getByText('TIG 168/7 (20) · LIO 169/5 (18)')).toBeOnTheScreen();
    expect(screen.getByText('Live')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('history-row-m-done'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/scorecard', params: { matchId: 'm-done' } });
    await fireEvent.press(screen.getByTestId('history-row-m-live'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/score', params: { matchId: 'm-live' } });
  });

  it('searches after a short pause', async () => {
    jest.useFakeTimers();
    await renderScreen(<HistoryScreen />);
    await fireEvent.changeText(screen.getByTestId('history-search'), 'Lions');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(useMatchHistoryStore.getState().load).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Lions' }));
    jest.useRealTimers();
  });

  it('filters by status and team and sorts', async () => {
    await renderScreen(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-filter-status'));
    await fireEvent.press(screen.getByTestId('sheet-history-status-completed'));
    expect(useMatchHistoryStore.getState().load).toHaveBeenLastCalledWith(expect.objectContaining({ statuses: ['completed'] }));
    await fireEvent.press(screen.getByTestId('history-filter-team'));
    await fireEvent.press(screen.getByTestId('sheet-history-team-LIO'));
    expect(useMatchHistoryStore.getState().load).toHaveBeenLastCalledWith(expect.objectContaining({ teamId: 'LIO' }));
    await fireEvent.press(screen.getByTestId('history-filter-sort'));
    await fireEvent.press(screen.getByTestId('sheet-history-sort-oldest'));
    expect(useMatchHistoryStore.getState().load).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'oldest' }));
  });

  it('deletes a standalone match from the row menu after a confirmation', async () => {
    await renderScreen(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-row-m-done-menu'));
    await fireEvent.press(screen.getByTestId('sheet-history-row-delete'));
    await fireEvent.press(screen.getByTestId('history-delete-confirm'));
    await waitFor(() => expect(useMatchHistoryStore.getState().remove).toHaveBeenCalledWith('m-done'));
  });

  it('exports a PDF from the row menu', async () => {
    await renderScreen(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-row-m-done-menu'));
    await fireEvent.press(screen.getByTestId('sheet-history-row-pdf'));
    await waitFor(() => expect(useExportStore.getState().scorecardPdf).toHaveBeenCalledWith('m-done'));
  });

  it('does not delete a tournament match from history', async () => {
    useMatchHistoryStore.setState(fakeHistory({ items: [completedItem({ tournamentId: 't-1', tournamentName: 'City Cup' })] }), true);
    await renderScreen(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-row-m-done-menu'));
    expect(screen.getByTestId('sheet-history-row-delete')).toBeDisabled();
  });

  it('keeps the title, segments, search and filters in the glass header over the solid list', async () => {
    await renderScreen(<HistoryScreen />);
    const header = screen.getByTestId('screen-history-header');
    for (const id of ['history-segment-matches', 'history-search', 'history-filter-status', 'history-filter-team', 'history-filter-sort']) {
      expect(within(header).getByTestId(id)).toBeOnTheScreen();
    }
    expect(within(header).queryByTestId('history-row-m-done')).not.toBeOnTheScreen();
    expect(screen.getByTestId('history-list')).toHaveProp('scrollEventThrottle', 16);
    await fireEvent.press(screen.getByTestId('history-segment-tournaments'));
    expect(within(screen.getByTestId('screen-history-header')).queryByTestId('history-search')).not.toBeOnTheScreen();
  });

  it('loads more when the end of the list is reached', async () => {
    await renderScreen(<HistoryScreen />);
    await fireEvent(screen.getByTestId('history-list'), 'onEndReached');
    expect(useMatchHistoryStore.getState().loadMore).toHaveBeenCalled();
  });

  it('shows purposeful empty states', async () => {
    useMatchHistoryStore.setState(fakeHistory({ items: [] }), true);
    await renderScreen(<HistoryScreen />);
    expect(screen.getByTestId('history-empty')).toBeOnTheScreen();
    await act(async () => {
      useMatchHistoryStore.setState({ query: { sort: 'recent', search: 'zzz' } });
    });
    expect(await screen.findByTestId('history-empty-filtered')).toBeOnTheScreen();
  });

  it('lists finished tournaments with their champion', async () => {
    useTournamentListStore.setState(fakeTournamentList({ items: [tournamentItem({ id: 't-done', status: 'completed', championName: 'Tigers' }), tournamentItem()] }), true);
    await renderScreen(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-segment-tournaments'));
    expect(screen.getByText('Champion: Tigers')).toBeOnTheScreen();
    expect(screen.queryByTestId('history-tournament-t-1')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('history-tournament-t-done'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/tournament/[tournamentId]', params: { tournamentId: 't-done' } });
  });
});

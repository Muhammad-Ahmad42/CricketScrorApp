import '@/features/scoring/__tests__/support/mocks';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Team } from '@/domain/types';
import { fakeExport, fakeHistory, fakeTeamLibrary, fakeTournamentList } from '@/features/scoring/__tests__/support/fakes';
import { completedItem, inningsLine, listItem, tournamentItem } from '@/features/scoring/__tests__/support/listItems';
import { renderScreen, resetCommonStores } from '@/features/scoring/__tests__/support/render';
import { HistoryScreen } from '../screens/HistoryScreen';
import { historyRows, statusFilterOf, withStatus } from '../selectors/query';
import { selectContinue, selectMatchCard } from '../selectors/matchCard';
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

  it('says 1 over, not 1 overs, on a one-over match card and in its spoken label', () => {
    const card = selectMatchCard(completedItem({ oversPerInnings: 1, tournamentName: null }));
    expect(card.footer).toBe('1 over');
    expect(card.accessibilityLabel).toMatch(/, 1 over$/);
    const resume = selectContinue(listItem({ oversPerInnings: 1, innings: [inningsLine({ legalBalls: 3 })] }));
    expect(resume.oversOf).toBe('0.3 of 1 over');
    expect(resume.oversText).toBe('0.3 overs');
    expect(selectMatchCard(completedItem({ oversPerInnings: 20, tournamentName: null })).footer).toBe('20 overs');
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

  it('keeps only the segments and filters in a sticky glass bar while the title and search scroll away with the list', async () => {
    await renderScreen(<HistoryScreen />);
    const list = screen.getByTestId('history-list');
    expect(list).toHaveProp('stickyHeaderIndices', [1]);
    expect(list).toHaveProp('scrollEventThrottle', 16);
    const bar = screen.getByTestId('history-bar');
    for (const id of ['history-segment-matches', 'history-filter-status', 'history-filter-team', 'history-filter-sort']) {
      expect(within(bar).getByTestId(id)).toBeOnTheScreen();
    }
    expect(within(bar).queryByTestId('history-search')).not.toBeOnTheScreen();
    expect(within(screen.getByTestId('history-title')).getByTestId('history-search')).toHaveProp('accessibilityLabel', 'Search matches');
    expect(screen.queryByText('Search')).not.toBeOnTheScreen();
    expect(screen.getByTestId('screen-history-ambient', { includeHiddenElements: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('history-segment-tournaments'));
    expect(screen.queryByTestId('history-search')).not.toBeOnTheScreen();
    expect(within(screen.getByTestId('history-bar')).queryByTestId('history-filter-status')).not.toBeOnTheScreen();
  });

  it('shows the played date in the meta line and lets long titles wrap instead of truncating', async () => {
    useMatchHistoryStore.setState(
      fakeHistory({ items: [completedItem({ scheduledDate: '2026-10-04', startedAt: '2026-10-01T12:54:00.000Z', completedAt: '2026-10-01T12:55:00.000Z', tournamentName: 'City Cup' })] }),
      true,
    );
    await renderScreen(<HistoryScreen />);
    expect(screen.getByTestId('history-row-m-done-meta')).toHaveTextContent('Thu 1 Oct · 20 overs · City Cup');
    expect(screen.getByText('Lions v Tigers')).not.toHaveProp('numberOfLines');
  });

  it('marks the active filter in the single-choice filter sheets and styles Delete as destructive', async () => {
    useMatchHistoryStore.setState(fakeHistory({ items: [completedItem()], query: { sort: 'recent', statuses: ['completed'] } }), true);
    await renderScreen(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-filter-status'));
    expect(screen.getByTestId('sheet-history-status-completed')).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
    expect(screen.getByTestId('sheet-history-status-all')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
    expect(screen.getByTestId('sheet-history-status-completed-mark', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId('sheet-history-status-completed')).toHaveProp('accessibilityRole', 'radio');
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

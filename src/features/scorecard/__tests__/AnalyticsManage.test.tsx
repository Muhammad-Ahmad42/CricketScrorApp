import '@/features/scoring/__tests__/support/mocks';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { fakeHistory, fakeHome, fakeTeamLibrary } from '@/features/scoring/__tests__/support/fakes';
import { m3Setup } from '@/domain/scoring/testing';
import { liveMatch, OPEN } from '@/features/scoring/__tests__/support/liveMatch';
import { renderScreen, resetCommonStores, setLive } from '@/features/scoring/__tests__/support/render';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { ManageMatchScreen } from '../screens/ManageMatchScreen';
import { selectAnalytics } from '../selectors/analytics';
import { mockStores } from '@/features/scoring/__tests__/support/storeModule';

const { useHomeStore, useMatchHistoryStore, useTeamLibraryStore, useToastStore } = mockStores();

const ones = (count: number) => Array.from({ length: count }, () => '1');
const FINISHED = [OPEN, '4', '6', ...ones(16), 'start:T1:T2:L11', '6', '6', '6', '6', '4', 'end'];

describe('analytics', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('builds worm, manhattan and partnership data from the domain only', () => {
    const vm = selectAnalytics(liveMatch(FINISHED));
    expect(vm.worm.map((series) => series.label)).toEqual(['LIO', 'TIG']);
    expect(vm.worm[0].points).toEqual([
      { over: 1, runs: 14, wickets: 0 },
      { over: 2, runs: 20, wickets: 0 },
      { over: 3, runs: 26, wickets: 0 },
    ]);
    expect(vm.manhattan[0].overs.map((over) => over.runs)).toEqual([14, 6, 6]);
    expect(vm.partnerships[0].rows[0]).toMatchObject({ wicketLabel: '1st wkt', batters: 'Babar & Fakhar', runs: 26 });
    expect(vm.partnerships.map((entry) => entry.series)).toEqual([0, 1]);
    expect(vm.summary.find((row) => row.key === 'sixes')?.values).toEqual(['1', '4']);
  });

  it('describes the worm with the overs each innings really lasted and pluralises the overs', () => {
    const vm = selectAnalytics(liveMatch(FINISHED));
    expect(vm.worm[1].points).toEqual([{ over: 1, runs: 28, wickets: 0 }]);
    expect(vm.wormLabel).toBe('Runs by over: LIO 26 after 3 overs, TIG 28 after 0.5 overs');
    expect(vm.manhattanLabel).toBe('Runs per over for LIO, 3 overs and TIG, 1 over');
    const allOut = liveMatch([OPEN, ...ones(18), 'start:T1:T2:L11', '1', '.', '.', '.', '.', '.', '.', 'W:b', 'end'], m3Setup({ teamBPlayers: 2 }));
    expect(allOut.state.innings[1].completion?.reason).toBe('all_out');
    expect(selectAnalytics(allOut).wormLabel).toBe('Runs by over: LIO 18 after 3 overs, TIG 1 after 1.2 overs');
    expect(selectAnalytics(liveMatch([OPEN, ...ones(6)])).wormLabel).toBe('Runs by over: LIO 6 after 1 over');
  });

  it('renders the worm, Manhattan, partnerships and scoring table', async () => {
    setLive(liveMatch(FINISHED));
    await renderScreen(<AnalyticsScreen />);
    expect(screen.getByTestId('analytics-worm')).toBeOnTheScreen();
    expect(screen.getByTestId('analytics-manhattan')).toBeOnTheScreen();
    expect(screen.getByTestId('analytics-partnerships-0')).toBeOnTheScreen();
    expect(within(screen.getByTestId('analytics-summary')).getByText('Sixes')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('analytics-worm-btn-toggle'));
    expect(screen.getByText('Show as chart')).toBeOnTheScreen();
  });

  it('shows an empty state before the first ball', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<AnalyticsScreen />);
    expect(screen.getByTestId('analytics-empty')).toBeOnTheScreen();
  });
});

describe('match settings', () => {
  beforeEach(() => {
    resetCommonStores();
    useTeamLibraryStore.setState(fakeTeamLibrary(), true);
    useHomeStore.setState(fakeHome(), true);
    useMatchHistoryStore.setState(fakeHistory(), true);
    jest.clearAllMocks();
  });

  it('saves details through updateDetails', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ManageMatchScreen />);
    await fireEvent.press(screen.getByTestId('manage-row-details'));
    await fireEvent.changeText(screen.getByTestId('details-title'), 'Final');
    expect(screen.queryByDisplayValue('2026-09-12')).toBeNull();
    await fireEvent.press(screen.getByTestId('details-date'));
    await fireEvent(screen.getByTestId('details-date-sheet-picker'), 'change', { nativeEvent: { timestamp: new Date(2026, 9, 2, 12).getTime() } });
    await fireEvent.press(screen.getByTestId('details-date-sheet-done'));
    expect(screen.getByTestId('details-date-value')).toHaveTextContent(/2 Oct/);
    await fireEvent.press(screen.getByTestId('details-save'));
    expect(store.updateDetails).toHaveBeenCalledWith({ title: 'Final', venueId: null, scheduledDate: '2026-10-02', scheduledTime: '14:00' });
  });

  it('asks for a reason when the toss of a live match changes', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ManageMatchScreen />);
    await fireEvent.press(screen.getByTestId('manage-row-toss'));
    await fireEvent.press(screen.getByTestId('toss-winner-TIG'));
    await fireEvent.press(screen.getByTestId('toss-bowl'));
    await fireEvent.press(screen.getByTestId('toss-save'));
    await fireEvent.changeText(screen.getByTestId('dialog-reason-field'), 'Recorded the wrong winner');
    await fireEvent.press(screen.getByTestId('dialog-reason-confirm'));
    await waitFor(() => expect(store.setToss).toHaveBeenCalledWith({ winnerTeamId: 'TIG', decision: 'bowl' }, 'Recorded the wrong winner'));
  });

  it('adds a substitute to a squad', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ManageMatchScreen />);
    await fireEvent.press(screen.getByTestId('manage-row-squad-TIG'));
    await fireEvent.press(screen.getByTestId('squad-add'));
    await fireEvent.changeText(screen.getByTestId('add-player-name'), 'Twelfth Man');
    await fireEvent.press(screen.getByTestId('add-player-substitute'));
    await fireEvent.press(screen.getByTestId('add-player-submit'));
    expect(store.addSquadPlayer).toHaveBeenCalledWith('TIG', { newPlayer: { name: 'Twelfth Man', jerseyNumber: null } }, { isSubstitute: true });
  });

  it('ends a live match as abandoned through the end_match intent', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ManageMatchScreen />);
    await fireEvent.press(screen.getByTestId('manage-row-end'));
    await fireEvent.changeText(screen.getByTestId('end-match-reason'), 'Rain all afternoon');
    await fireEvent.press(screen.getByTestId('end-match-submit'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'end_match', outcome: { type: 'abandoned', reason: 'Rain all afternoon' } });
  });

  it('discards a live standalone match after a confirmation', async () => {
    setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ManageMatchScreen />);
    await fireEvent.press(screen.getByTestId('manage-btn-discard'));
    await fireEvent.press(screen.getByTestId('manage-discard-confirm'));
    await waitFor(() => expect(useHomeStore.getState().discard).toHaveBeenCalledWith('M1'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('never offers discard or delete for a tournament match', async () => {
    setLive(liveMatch([OPEN, '1'], undefined, { tournamentId: 'TOUR' }));
    await renderScreen(<ManageMatchScreen />);
    expect(screen.queryByTestId('manage-btn-discard')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('manage-btn-delete')).not.toBeOnTheScreen();
  });

  it('deletes a completed standalone match', async () => {
    setLive(liveMatch(FINISHED));
    await renderScreen(<ManageMatchScreen />);
    await fireEvent.press(screen.getByTestId('manage-btn-delete'));
    await fireEvent.press(screen.getByTestId('manage-delete-confirm'));
    await waitFor(() => expect(useMatchHistoryStore.getState().remove).toHaveBeenCalledWith('M1'));
    expect(useToastStore.getState().show).toHaveBeenCalledWith({ kind: 'success', message: 'Match deleted', action: null });
  });

  it('revises the overs of a live match from match settings', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ManageMatchScreen />);
    await fireEvent.press(screen.getByTestId('manage-row-revise'));
    await fireEvent.press(screen.getByTestId('revise-overs-decrement'));
    await fireEvent.changeText(screen.getByTestId('revise-reason'), 'Late start');
    await fireEvent.press(screen.getByTestId('revise-submit'));
    expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'revise_overs', inningsIndex: 0, overs: 2, reason: 'Late start' }));
  });
});


import '@/features/scoring/__tests__/support/mocks';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { fakeBackup, fakeExport, fakeHistory, fakeHome } from '@/features/scoring/__tests__/support/fakes';
import { liveMatch, OPEN } from '@/features/scoring/__tests__/support/liveMatch';
import { renderScreen, resetCommonStores, setLive } from '@/features/scoring/__tests__/support/render';
import { ScorecardScreen } from '../screens/ScorecardScreen';
import { mockStores } from '@/features/scoring/__tests__/support/storeModule';

const { useBackupStore, useExportStore, useHomeStore, useMatchHistoryStore } = mockStores();

const ones = (count: number) => Array.from({ length: count }, () => '1');
const COMPLETE = [OPEN, '4', '1', 'W:c:T5>L3', 'wd', 'lb1', ...ones(14), 'start:T1:T2:L11', '6', '6', '6', '4', 'end'];

describe('ScorecardScreen', () => {
  beforeEach(() => {
    resetCommonStores();
    useExportStore.setState(fakeExport(), true);
    useBackupStore.setState(fakeBackup(), true);
    useHomeStore.setState(fakeHome(), true);
    useMatchHistoryStore.setState(fakeHistory(), true);
    jest.clearAllMocks();
  });

  it('shows the result, toss and every scorecard section for the chosen innings', async () => {
    setLive(liveMatch(COMPLETE));
    await renderScreen(<ScorecardScreen />);
    expect(screen.getByTestId('scorecard-result')).toHaveTextContent('Tigers won by 10 wickets (14 balls left)');
    expect(screen.getByTestId('scorecard-toss')).toHaveTextContent('Lions won the toss and chose to bat');
    expect(within(screen.getByTestId('screen-scorecard-header')).getByTestId('scorecard-tab-0')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-scorecard-scroll')).queryByTestId('scorecard-tab-0')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('scorecard-tab-0'));
    const batting = screen.getByTestId('scorecard-innings-batting');
    expect(within(batting).getByText('c Azam b Haris')).toBeOnTheScreen();
    expect(screen.getByText('Extras (b 0, lb 1, wd 1, nb 0, p 0)')).toBeOnTheScreen();
    expect(screen.getByTestId('scorecard-innings-total')).toHaveTextContent(/Total · 1 wkts · 3 ov.*21\/1/);
    expect(screen.getByTestId('scorecard-innings-fow')).toHaveTextContent('1-5 (Fakhar, 0.3)');
    expect(screen.getByTestId('scorecard-innings-bowling')).toHaveTextContent(/Haris/);
    expect(screen.getByText('Partnerships')).toBeOnTheScreen();
    expect(screen.getByText('Overs')).toBeOnTheScreen();
    expect(screen.getByTestId('scorecard-over-1')).toBeOnTheScreen();
  });

  it('opens the ball log at an over from the over summary', async () => {
    setLive(liveMatch(COMPLETE));
    await renderScreen(<ScorecardScreen />);
    await fireEvent.press(screen.getByTestId('scorecard-tab-0'));
    await fireEvent.press(screen.getByTestId('scorecard-over-2'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/balls', params: { matchId: 'M1', innings: '0', over: '2' } });
  });

  it('shares the scorecard as a PDF through the export store', async () => {
    setLive(liveMatch(COMPLETE));
    await renderScreen(<ScorecardScreen />);
    await fireEvent.press(screen.getByTestId('scorecard-btn-share'));
    await fireEvent.press(screen.getByTestId('sheet-share-pdf'));
    await waitFor(() => expect(useExportStore.getState().share).toHaveBeenCalledWith('file:///scorecard.pdf', 'application/pdf'));
    expect(useExportStore.getState().scorecardPdf).toHaveBeenCalledWith('M1');
  });

  it('shares a match backup file', async () => {
    setLive(liveMatch(COMPLETE));
    await renderScreen(<ScorecardScreen />);
    await fireEvent.press(screen.getByTestId('scorecard-btn-share'));
    await fireEvent.press(screen.getByTestId('sheet-share-backup'));
    await waitFor(() => expect(useExportStore.getState().share).toHaveBeenCalledWith('file:///backup.json', 'application/json'));
    expect(useBackupStore.getState().exportBackup).toHaveBeenCalledWith({ kind: 'match', matchId: 'M1' });
  });

  it('reopens a completed standalone match after a confirmation', async () => {
    const store = setLive(liveMatch(COMPLETE));
    await renderScreen(<ScorecardScreen />);
    await fireEvent.press(screen.getByTestId('scorecard-btn-menu'));
    await fireEvent.press(screen.getByTestId('sheet-scorecard-menu-reopen'));
    await fireEvent.press(screen.getByTestId('scorecard-reopen-confirm'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/match/[matchId]/score', params: { matchId: 'M1' } }));
    expect(store.undo).toHaveBeenCalledWith(undefined);
  });

  it('asks for a reason before reopening a tournament match', async () => {
    const store = setLive(liveMatch(COMPLETE, undefined, { tournamentId: 'TOUR' }));
    await renderScreen(<ScorecardScreen />);
    await fireEvent.press(screen.getByTestId('scorecard-btn-menu'));
    expect(screen.queryByTestId('sheet-scorecard-menu-delete')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('sheet-scorecard-menu-reopen'));
    await fireEvent.changeText(screen.getByTestId('dialog-reason-field'), 'Wrong last ball');
    await fireEvent.press(screen.getByTestId('dialog-reason-confirm'));
    await waitFor(() => expect(store.undo).toHaveBeenCalledWith('Wrong last ball'));
  });

  it('deletes a completed standalone match after a confirmation', async () => {
    setLive(liveMatch(COMPLETE));
    await renderScreen(<ScorecardScreen />);
    await fireEvent.press(screen.getByTestId('scorecard-btn-menu'));
    await fireEvent.press(screen.getByTestId('sheet-scorecard-menu-delete'));
    await fireEvent.press(screen.getByTestId('scorecard-delete-confirm'));
    await waitFor(() => expect(useMatchHistoryStore.getState().remove).toHaveBeenCalledWith('M1'));
    expect(router.replace).toHaveBeenCalledWith('/history');
  });

  it('shows the live requirement for a match in progress', async () => {
    setLive(liveMatch([OPEN, ...ones(18), 'start:T1:T2:L11', '4']));
    await renderScreen(<ScorecardScreen />);
    expect(screen.getByTestId('scorecard-result')).toHaveTextContent('Tigers: Need 15 from 17 balls');
  });
});

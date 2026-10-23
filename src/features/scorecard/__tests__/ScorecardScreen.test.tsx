import '@/features/scoring/__tests__/support/mocks';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { lightColors } from '@/ui';
import { fakeBackup, fakeExport, fakeHistory, fakeHome } from '@/features/scoring/__tests__/support/fakes';
import { liveMatch, OPEN } from '@/features/scoring/__tests__/support/liveMatch';
import { renderScreen, resetCommonStores, setLive } from '@/features/scoring/__tests__/support/render';
import { ScorecardScreen } from '../screens/ScorecardScreen';
import { selectInningsCards } from '../selectors/innings';
import { battingColumns, bowlingColumns, columnScale, densityFor } from '../components/InningsCard';
import { mockStores } from '@/features/scoring/__tests__/support/storeModule';

const { useBackupStore, useExportStore, useHomeStore, useMatchHistoryStore, useToastStore } = mockStores();

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
    expect(screen.getByTestId('scorecard-innings-total')).toHaveTextContent(/Total · 1 wkt · 3 ov.*21\/1/);
    expect(screen.getByTestId('scorecard-innings-fow')).toHaveTextContent('1-5 (Fakhar, 0.3)');
    expect(screen.getByTestId('scorecard-innings-bowling')).toHaveTextContent(/Haris/);
    expect(screen.getByText('Partnerships')).toBeOnTheScreen();
    expect(screen.getByText('Overs')).toBeOnTheScreen();
    expect(screen.getByTestId('scorecard-over-1')).toBeOnTheScreen();
  });

  it('puts the shared innings tabs in the header glass bar, labels the overs and pluralises wickets', async () => {
    setLive(liveMatch(COMPLETE));
    await renderScreen(<ScorecardScreen />);
    const tabs = within(screen.getByTestId('screen-scorecard-header')).getByTestId('scorecard-tabs');
    expect(tabs).toHaveProp('accessibilityRole', 'tablist');
    expect(tabs).toHaveProp('accessibilityLabel', 'Innings');
    expect(screen.getByTestId('scorecard-tab-0')).toHaveTextContent('LIO 21/1 (3 ov)');
    expect(screen.getByTestId('scorecard-tab-1')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    expect(screen.getByTestId('scorecard-innings-total')).toHaveTextContent(/Total · 0 wkts/);
  });

  it('pluralises the wickets in the total line for 0, 1 and 2 wickets', () => {
    const total = (steps: readonly string[]) => {
      const live = liveMatch(steps);
      return selectInningsCards(live.setup, live.state, 'zero')[0].totalLine;
    };
    expect(total([OPEN, '1'])).toMatch(/^Total · 0 wkts · /);
    expect(total([OPEN, 'W:b>L3'])).toMatch(/^Total · 1 wkt · /);
    expect(total([OPEN, 'W:b>L3', 'W:b>L4'])).toMatch(/^Total · 2 wkts · /);
  });

  it('uses singular words in the screen-reader labels for 1 run, ball, four, six, over, maiden and wicket', () => {
    const card = (steps: readonly string[]) => {
      const live = liveMatch(steps);
      return selectInningsCards(live.setup, live.state, 'zero')[0];
    };
    const single = card([OPEN, '1']);
    expect(single.batting[0].accessibilityLabel).toMatch(/, 1 run off 1 ball, 0 fours, 0 sixes, /);
    expect(single.bowling[0].accessibilityLabel).toMatch(/, 0\.1 overs, 0 maidens, 1 run, 0 wickets, /);
    expect(single.partnerships[0].accessibilityLabel).toMatch(/, 1 run off 1 ball, unbroken$/);
    expect(single.overs[0].accessibilityLabel).toMatch(/^Over 1, .+, 1 run, 1\/0 at the end, in progress: /);
    const boundaries = card([OPEN, '4', '6']);
    expect(boundaries.batting[0].accessibilityLabel).toMatch(/, 10 runs off 2 balls, 1 four, 1 six, /);
    const maiden = card([OPEN, '.', '.', '.', '.', '.', 'W:b>L3']);
    expect(maiden.bowling[0].accessibilityLabel).toMatch(/, 1 over, 1 maiden, 0 runs, 1 wicket, /);
    expect(maiden.tabAccessibilityLabel).toMatch(/ 0 for 1 from 1 over$/);
    const all = [single, boundaries, maiden].flatMap((entry) => [
      entry.tabAccessibilityLabel,
      ...entry.batting.map((row) => row.accessibilityLabel),
      ...entry.bowling.map((row) => row.accessibilityLabel),
      ...entry.partnerships.map((row) => row.accessibilityLabel),
      ...entry.overs.map((row) => row.accessibilityLabel),
    ]);
    expect(all.filter((label) => /(?:^|[^\d.])1 (?:runs|balls|fours|sixes|overs|maidens|wickets)\b/.test(label))).toEqual([]);
  });

  it('does not call the last over of a completed match in progress', () => {
    const live = liveMatch(COMPLETE);
    const [first, second] = selectInningsCards(live.setup, live.state, 'zero');
    expect(live.state.innings[1].overs[0].isComplete).toBe(false);
    expect(second.overs[0].accessibilityLabel).toMatch(/^Over 1, .+, 22 runs, 22\/0 at the end: /);
    expect([...first.overs, ...second.overs].some((over) => over.accessibilityLabel.includes('in progress'))).toBe(false);
  });

  it('marks Delete match as destructive and keeps chevrons for navigation only', async () => {
    setLive(liveMatch(COMPLETE));
    await renderScreen(<ScorecardScreen />);
    await fireEvent.press(screen.getByTestId('scorecard-btn-menu'));
    expect(within(screen.getByTestId('sheet-scorecard-menu-delete')).getByText('Delete match')).toHaveStyle({ color: lightColors.danger });
    expect(within(screen.getByTestId('sheet-scorecard-menu-manage')).getByText('Match settings')).toHaveStyle({ color: lightColors.textPrimary });
    expect(screen.getByTestId('sheet-scorecard-menu-delete')).toHaveProp('accessibilityRole', 'button');
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

  it('keeps the share failure for Diagnostics and retries by building the PDF again', async () => {
    const share = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    useExportStore.setState({ share });
    setLive(liveMatch(COMPLETE));
    await renderScreen(<ScorecardScreen />);
    await fireEvent.press(screen.getByTestId('scorecard-btn-share'));
    await fireEvent.press(screen.getByTestId('sheet-share-pdf'));
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalled());
    const toast = jest.mocked(useToastStore.getState().show).mock.calls[0][0];
    expect(toast.message).toBe("Couldn't open the share sheet.");
    expect(useExportStore.getState().clearError).not.toHaveBeenCalled();
    toast.action?.run();
    await waitFor(() => expect(useExportStore.getState().scorecardPdf).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
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
    await fireEvent(screen.getByTestId('dialog-reason-field'), 'submitEditing');
    expect(store.undo).not.toHaveBeenCalled();
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

  it('names the batting side under the Live badge without repeating the status', async () => {
    setLive(liveMatch([OPEN, '4', '1']));
    await renderScreen(<ScorecardScreen />);
    expect(screen.getByText('Live')).toBeOnTheScreen();
    expect(screen.getByTestId('scorecard-result')).toHaveTextContent(/^Lions batting$/);
  });

  it('sizes the scorecard columns for large text instead of truncating the figures', () => {
    expect(columnScale(0.85)).toBe(1);
    expect(columnScale(1.3)).toBe(1.3);
    expect(columnScale(2)).toBe(1.5);
    expect(densityFor(390)).toBe('phone');
    expect(densityFor(390, 1.3)).toBe('compact');
    expect(densityFor(700, 1.3)).toBe('full');
    const width = (columns: readonly { readonly key: string; readonly width?: number }[], key: string) => columns.find((column) => column.key === key)?.width;
    expect(width(battingColumns('compact'), 'sr')).toBe(64);
    expect(width(battingColumns('compact', 1.3), 'sr')).toBe(84);
    expect(width(battingColumns('compact', 1.3), 'name')).toBe(125);
    expect(width(bowlingColumns('phone', 1.5), 'overs')).toBe(54);
  });
});

import './support/mocks';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { scoreRuns, swapStrike } from '@/domain/scoring/commands';
import { ScoringScreen } from '../screens/ScoringScreen';
import { liveMatch, OPEN } from './support/liveMatch';
import { renderScreen, resetCommonStores, setLive, setWindow } from './support/render';
import { mockStores } from './support/storeModule';

const { useLiveMatchStore, useToastStore } = mockStores();

const CHASE = [OPEN, ...Array.from({ length: 18 }, () => '1'), 'start:T1:T2:L11', '4', '1', '.', '6'];

describe('ScoringScreen', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('records 0 1 2 3 4 6 with exactly one tap and one dispatch each', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    for (const runs of [0, 1, 2, 3, 4, 6] as const) {
      await fireEvent.press(screen.getByTestId(`score-btn-${runs}`));
    }
    expect(store.dispatch).toHaveBeenCalledTimes(6);
    expect(jest.mocked(store.dispatch).mock.calls.map(([intent]) => intent)).toEqual([0, 1, 2, 3, 4, 6].map((runs) => scoreRuns(runs)));
  });

  it('shows score, overs, CRR, RRR, target, runs required and balls remaining from the chase state', async () => {
    const live = liveMatch(CHASE);
    setLive(live);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-text-score')).toHaveProp('accessibilityLabel', 'Tigers 11 for 0');
    expect(screen.getByTestId('score-text-innings')).toHaveTextContent('Tigers · 2nd innings');
    expect(screen.getByTestId('score-text-overs')).toHaveTextContent('0.4');
    expect(screen.getByTestId('score-text-overs-of')).toHaveTextContent('of 3');
    expect(screen.getByTestId('score-text-crr')).toHaveProp('accessibilityLabel', 'Current run rate 16.50');
    expect(screen.getByTestId('score-text-target')).toHaveProp('accessibilityLabel', 'Target 19');
    expect(screen.getByTestId('score-text-rrr')).toHaveProp('accessibilityLabel', `Required run rate ${live.state.chase?.requiredRunRate?.toFixed(2)}`);
    expect(screen.getByTestId('score-text-requirement')).toHaveTextContent('Need 8 from 14 balls');
    expect(screen.getByTestId('score-btn-scorecard')).toHaveProp(
      'accessibilityLabel',
      `Tigers, 11 for 0, 0.4 overs of 3. Need 8 from 14 balls. Required run rate ${live.state.chase?.requiredRunRate?.toFixed(2)}.`,
    );
  });

  it('marks the striker with an icon and text, not only colour, and shows the bowler line', async () => {
    setLive(liveMatch([OPEN, '4', '2', '.']));
    await renderScreen(<ScoringScreen />);
    const striker = screen.getByTestId('score-row-striker');
    expect(within(striker).getByTestId('score-marker-striker', { includeHiddenElements: true })).toBeTruthy();
    expect(within(striker).getByText('On strike · 4s 1 · 6s 0')).toBeOnTheScreen();
    expect(striker).toHaveProp('accessibilityLabel', 'Babar, on strike, 6 off 3 balls');
    expect(screen.getByTestId('score-row-non-striker')).toHaveProp('accessibilityLabel', 'Fakhar, 0 off 0 balls');
    expect(screen.getByTestId('score-row-bowler')).toHaveProp('accessibilityLabel', 'Bowling: Haris, 0.3-0-6-0, economy 12.00');
    expect(within(screen.getByTestId('score-row-bowler')).getByText('0.3-0-6-0')).toBeOnTheScreen();
  });

  it('shows the current over as ball chips with placeholders for the balls still due', async () => {
    setLive(liveMatch([OPEN, '1', '4', 'wd', 'W:b']));
    await renderScreen(<ScoringScreen />);
    const strip = screen.getByTestId('score-row-over');
    expect(strip.props.accessibilityLabel).toBe('This over: One run, Four, Wide, Wicket, bowled. 3 balls left. 6 runs.');
    expect(screen.getByTestId('score-chip-ball-1')).toHaveProp('accessibilityLabel', 'One run');
    expect(screen.getByTestId('score-chip-ball-4')).toHaveProp('accessibilityLabel', 'Wicket, bowled');
  });

  it('swaps strike, undoes and redoes from the action row', async () => {
    const store = setLive(liveMatch([OPEN, '1']), { redoStack: [[]] });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-swap'));
    expect(store.dispatch).toHaveBeenCalledWith(swapStrike());
    await fireEvent.press(screen.getByTestId('score-btn-undo'));
    expect(store.undo).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('score-btn-redo'));
    expect(store.redo).toHaveBeenCalledTimes(1);
  });

  it('hides Redo when nothing was undone and disables Undo at the start of the innings', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    expect(screen.queryByTestId('score-btn-redo')).not.toBeOnTheScreen();
    expect(screen.getByTestId('score-btn-undo')).toBeDisabled();
  });

  it('shows the save-failure toast with Try again that re-dispatches the same intent', async () => {
    const dispatch = jest.fn(() => {
      useLiveMatchStore.setState({ error: { code: 'STORAGE', message: 'disk', domainCode: null, detail: null } });
      return Promise.resolve(false);
    });
    setLive(liveMatch([OPEN]), { dispatch });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-4'));
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalled());
    const toast = jest.mocked(useToastStore.getState().show).mock.calls[0][0];
    expect(toast.message).toBe("Couldn't save this delivery. Your previous match data is still safe.");
    expect(toast.action?.label).toBe('Try again');
    await act(async () => {
      toast.action?.run();
    });
    expect(dispatch).toHaveBeenLastCalledWith(scoreRuns(4));
  });

  it('keeps the screen awake while scoring when the preference is on', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    expect(activateKeepAwakeAsync).toHaveBeenCalled();
  });

  it('releases the keep-awake lock when leaving the screen', async () => {
    setLive(liveMatch([OPEN]));
    const view = await renderScreen(<ScoringScreen />);
    await view.unmount();
    expect(deactivateKeepAwake).toHaveBeenCalled();
  });

  it('leaves haptics to the store so a committed ball never vibrates twice', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await act(async () => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, '4']) });
    });
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('does not keep the screen awake when the preference is off', async () => {
    resetCommonStores({ keepAwake: false });
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
  });

  it('opens the scorecard from the score and leaves the match with Back', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-scorecard'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/scorecard', params: { matchId: 'M1' } });
    await fireEvent.press(screen.getByTestId('top-bar-back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('shows a thin saving line only when a commit takes longer than 300 ms', async () => {
    jest.useFakeTimers();
    setLive(liveMatch([OPEN]), { status: 'saving' });
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-saving')).not.toHaveProp('accessibilityLabel', 'Saving');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
    expect(screen.getByTestId('score-saving')).toHaveProp('accessibilityLabel', 'Saving');
    jest.useRealTimers();
  });

  it('renders a loading state until the match is open', async () => {
    setLive(null);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('match-gate')).toBeOnTheScreen();
  });

  it('lays out scorecard | scoring as two panes on a tablet (>= 768 dp)', async () => {
    const restore = setWindow(1024, 768);
    setLive(liveMatch([OPEN, '1', '4']));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-two-pane')).toBeOnTheScreen();
    expect(screen.getByTestId('score-scorecard-pane')).toBeOnTheScreen();
    expect(within(screen.getByTestId('score-scorecard-pane-header')).getByTestId('score-pane-tab-0')).toBeOnTheScreen();
    expect(within(screen.getByTestId('score-scorecard-pane-scroll')).getByTestId('score-pane-innings-batting')).toBeOnTheScreen();
    expect(screen.getByTestId('score-btn-4')).toBeOnTheScreen();
    await restore();
  });

  it('uses the phone layout below 768 dp', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    expect(screen.queryByTestId('score-two-pane')).not.toBeOnTheScreen();
  });
});

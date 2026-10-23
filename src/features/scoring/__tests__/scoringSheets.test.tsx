import './support/mocks';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { bye, legBye, noBall, overthrowBoundary, scoreRuns, wicket, wide, type ScoringIntent } from '@/domain/scoring/commands';
import { ScoringScreen } from '../screens/ScoringScreen';
import { dismissalColumns } from '../sheets/WicketSheet';
import { liveMatch, OPEN } from './support/liveMatch';
import { renderScreen, resetCommonStores, setLive } from './support/render';
import { mockStores } from './support/storeModule';

const { useLiveMatchStore } = mockStores();

function dispatched(store: { readonly dispatch: (intent: ScoringIntent) => Promise<boolean> }): readonly ScoringIntent[] {
  return jest.mocked(store.dispatch).mock.calls.map(([intent]) => intent);
}

async function openExtras() {
  await fireEvent.press(screen.getByTestId('score-btn-extras'));
}

describe('extras sheet (§17)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('records WD, WD+1…WD+4 and a wide to the boundary with one chip tap each', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    for (const key of ['wd', 'wd1', 'wd2', 'wd3', 'wd4', 'wdb']) {
      await openExtras();
      await fireEvent.press(screen.getByTestId(`extras-chip-${key}`));
    }
    expect(dispatched(store)).toEqual([wide(), wide(1), wide(2), wide(3), wide(4), wide(0, { boundary: true })]);
    expect(screen.getByText('Wide: 1 run · bowled again', { includeHiddenElements: true })).toBeTruthy();
  });

  it('records no-balls off the bat, with byes and with leg byes', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-no_ball'));
    expect(screen.getByTestId('extras-chip-nb6')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('extras-chip-nb'));
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-no_ball'));
    await fireEvent.press(screen.getByTestId('extras-chip-nb6'));
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-no_ball'));
    await fireEvent.press(screen.getByTestId('extras-runs-to-bye'));
    expect(screen.queryByTestId('extras-chip-nb6')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('extras-chip-nb2'));
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-no_ball'));
    await fireEvent.press(screen.getByTestId('extras-runs-to-leg-bye'));
    await fireEvent.press(screen.getByTestId('extras-chip-nb4'));
    expect(dispatched(store)).toEqual([
      noBall({ runsTo: 'bat' }),
      noBall({ runsTo: 'bat', boundary: 6 }),
      noBall({ runsTo: 'bye', runsRun: 2 }),
      noBall({ runsTo: 'leg_bye', boundary: 4 }),
    ]);
  });

  it('records byes and leg byes including the boundary chip', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-bye'));
    await fireEvent.press(screen.getByTestId('extras-chip-B2'));
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-leg_bye'));
    await fireEvent.press(screen.getByTestId('extras-chip-LB1'));
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-leg_bye'));
    await fireEvent.press(screen.getByTestId('extras-chip-LB4'));
    expect(dispatched(store)).toEqual([bye(2), legBye(1), legBye(0, { boundary: true })]);
  });

  it('records custom values from the Custom panel and the Other tab', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-btn-custom'));
    await fireEvent.press(screen.getByTestId('extras-custom-runs-increment'));
    await fireEvent.press(screen.getByTestId('extras-custom-runs-increment'));
    await fireEvent.press(screen.getByTestId('extras-custom-more'));
    await fireEvent.press(screen.getByTestId('extras-custom-short-increment'));
    await fireEvent.press(screen.getByTestId('extras-custom-record'));
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-other'));
    await fireEvent.press(screen.getByTestId('extras-chip-r5'));
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-other'));
    await fireEvent.press(screen.getByTestId('extras-chip-ot1'));
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-other'));
    await fireEvent.press(screen.getByTestId('extras-chip-ar4'));
    await openExtras();
    await fireEvent.press(screen.getByTestId('extras-tab-bye'));
    await fireEvent.press(screen.getByTestId('extras-btn-custom'));
    await fireEvent.press(screen.getByTestId('extras-custom-runs-increment'));
    await fireEvent.press(screen.getByTestId('extras-custom-runs-increment'));
    await fireEvent.press(screen.getByTestId('extras-custom-runs-increment'));
    await fireEvent.press(screen.getByTestId('extras-custom-runs-increment'));
    await fireEvent.press(screen.getByTestId('extras-custom-record'));
    expect(dispatched(store)).toEqual([
      wide(3, { boundary: false, shortRuns: 1 }),
      scoreRuns(5),
      overthrowBoundary(1),
      scoreRuns(4, { allRun: true }),
      bye(5, { boundary: false }),
    ]);
  });
});

describe('wicket sheet (§18)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('stacks the dismissal buttons in one column on a narrow phone with large text', () => {
    expect(dismissalColumns(320, 1)).toBe(2);
    expect(dismissalColumns(390, 1.3)).toBe(2);
    expect(dismissalColumns(320, 1.3)).toBe(1);
    expect(dismissalColumns(360, 1.3)).toBe(1);
    expect(dismissalColumns(1024, 2)).toBe(2);
  });

  it('records bowled in two taps with the next batter preselected', async () => {
    const store = setLive(liveMatch([OPEN, '1', '1']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    expect(screen.getByTestId('wicket-next')).toHaveProp('accessibilityLabel', 'Next in, Saim');
    await fireEvent.press(screen.getByTestId('wicket-btn-bowled'));
    expect(dispatched(store)).toEqual([wicket({ dismissal: 'bowled', call: 'fair', nextBatterId: 'L3' })]);
  });

  it('records caught in three taps with the fielder and the incoming batter', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-btn-caught'));
    expect(screen.getByTestId('wicket-fielder-T11')).toHaveProp('accessibilityLabel', 'Haris. c&b');
    expect(screen.getByTestId('wicket-fielder-T1')).toHaveProp('accessibilityLabel', 'Rizwan. WK');
    expect(screen.getByTestId('wicket-fielder-T12')).toHaveProp('accessibilityLabel', 'Ali. sub');
    await fireEvent.press(screen.getByTestId('wicket-fielder-T5'));
    expect(dispatched(store)).toEqual([wicket({ dismissal: 'caught', call: 'fair', fielderIds: ['T5'], nextBatterId: 'L3' })]);
  });

  it('puts Back to the dismissal list in the sheet header once a dismissal is chosen', async () => {
    setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    expect(screen.queryByTestId('wicket-btn-back')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('wicket-btn-caught'));
    expect(screen.getByTestId('wicket-btn-back')).toHaveProp('accessibilityLabel', 'Back to dismissals');
    await fireEvent.press(screen.getByTestId('wicket-btn-back'));
    expect(screen.getByTestId('wicket-btn-caught')).toBeOnTheScreen();
  });

  it('lets the scorer change the incoming batter or choose later before the dismissal', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-next'));
    await fireEvent.press(screen.getByTestId('wicket-next-option-L5'));
    await fireEvent.press(screen.getByTestId('wicket-btn-lbw'));
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-next'));
    await fireEvent.press(screen.getByTestId('wicket-next-later'));
    await fireEvent.press(screen.getByTestId('wicket-btn-caught'));
    await fireEvent.press(screen.getByTestId('wicket-fielder-unknown'));
    expect(dispatched(store)).toEqual([
      wicket({ dismissal: 'lbw', call: 'fair', nextBatterId: 'L5' }),
      wicket({ dismissal: 'caught', call: 'fair', fielderIds: [], nextBatterId: null }),
    ]);
  });

  it('records a run out with the shown defaults in three taps', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-btn-run_out'));
    await fireEvent.press(screen.getByTestId('wicket-btn-record'));
    expect(dispatched(store)).toEqual([
      wicket({ dismissal: 'run_out', call: 'fair', playerOutId: 'L1', dismissalEnd: 'striker_end', runsRun: 0, fielderIds: [], nextBatterId: 'L3' }),
    ]);
  });

  it('records a stumping off a wide with the keeper first', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-call-wide'));
    expect(screen.queryByTestId('wicket-btn-bowled')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('wicket-btn-stumped'));
    await fireEvent.press(screen.getByTestId('wicket-fielder-T1'));
    expect(dispatched(store)).toEqual([wicket({ dismissal: 'stumped', call: 'wide', fielderIds: ['T1'], nextBatterId: 'L3' })]);
  });

  it('offers only free-hit dismissals after a no-ball', async () => {
    setLive(liveMatch([OPEN, 'nb']));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-free-hit')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    expect(screen.getByTestId('wicket-text-free-hit')).toBeOnTheScreen();
    expect(screen.queryByTestId('wicket-btn-bowled')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('wicket-btn-caught')).not.toBeOnTheScreen();
    expect(screen.getByTestId('wicket-btn-run_out')).toBeOnTheScreen();
  });

  it('keeps the sheet open with the Law 16.6 message and records the runs without the wicket', async () => {
    const dispatch = jest.fn((intent: ScoringIntent) => {
      if (intent.type === 'wicket') {
        useLiveMatchStore.setState({
          error: { code: 'VALIDATION', message: "The winning run was already scored on this ball, so this wicket doesn't count.", domainCode: 'WICKET_AFTER_RESULT', detail: null },
        });
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    });
    setLive(liveMatch([OPEN]), { dispatch });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-btn-run_out'));
    await fireEvent.press(screen.getByTestId('wicket-runs-1'));
    await fireEvent.press(screen.getByTestId('wicket-btn-record'));
    await waitFor(() => expect(screen.getByTestId('wicket-btn-without')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('wicket-btn-without'));
    expect(dispatch).toHaveBeenLastCalledWith(scoreRuns(1, { allRun: true }));
  });
});

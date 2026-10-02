import './support/mocks';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { batterIn, wicket, wide } from '@/domain/scoring/commands';
import type { HistoryEditPreview } from '@/services/contracts';
import { applyHistoryEdits, logFingerprint, type HistoryEditOp } from '@/domain/scoring/history';
import { ScorecardScreen } from '@/features/scorecard/screens/ScorecardScreen';
import { EditBallScreen } from '@/features/scorecard/screens/EditBallScreen';
import { ScoringScreen } from '../screens/ScoringScreen';
import { liveMatch, OPEN } from './support/liveMatch';
import { renderScreen, resetCommonStores, setLive } from './support/render';
import { mockStores } from './support/storeModule';

const { useLiveMatchStore } = mockStores();

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('double taps never record twice', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('records one wide when the WD chip is tapped twice', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-extras'));
    const chip = screen.getByTestId('extras-chip-wd');
    await fireEvent.press(chip);
    await fireEvent.press(chip);
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(wide());
  });

  it('records one wicket when Bowled is tapped twice while saving', async () => {
    const pending = deferred<boolean>();
    const dispatch = jest.fn(() => pending.promise);
    setLive(liveMatch([OPEN]), { dispatch });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    const bowled = screen.getByTestId('wicket-btn-bowled');
    await fireEvent.press(bowled);
    await fireEvent.press(bowled);
    await act(async () => {
      pending.resolve(true);
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(wicket({ dismissal: 'bowled', call: 'fair', nextBatterId: 'L3' }));
  });

  it('sends one batter_in when a batter is tapped twice', async () => {
    const pending = deferred<boolean>();
    const dispatch = jest.fn(() => pending.promise);
    setLive(liveMatch([OPEN, 'W:b']), { dispatch });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('prompt-batter-L3'));
    await fireEvent.press(screen.getByTestId('prompt-batter-L4'));
    await act(async () => {
      pending.resolve(true);
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(batterIn('L3', 'striker'));
  });

  it('allows the same prompt again after the scorer undoes', async () => {
    const live = liveMatch([OPEN, 'W:b']);
    const store = setLive(live);
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('prompt-batter-L3'));
    await act(async () => {
      useLiveMatchStore.setState({ live: { ...live } });
    });
    await fireEvent.press(screen.getByTestId('prompt-batter-L4'));
    expect(store.dispatch).toHaveBeenCalledTimes(2);
  });

  it('reopens a match once when the confirm button is tapped twice', async () => {
    const ones = Array.from({ length: 18 }, () => '1');
    const store = setLive(liveMatch([OPEN, ...ones, 'start:T1:T2:L11', '6', '6', '6', '1', 'end']));
    await renderScreen(<ScorecardScreen />);
    await fireEvent.press(screen.getByTestId('scorecard-btn-menu'));
    await fireEvent.press(screen.getByTestId('sheet-scorecard-menu-reopen'));
    const confirm = screen.getByTestId('scorecard-reopen-confirm');
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    await waitFor(() => expect(store.undo).toHaveBeenCalledTimes(1));
  });

  it('applies the edit that was previewed last, never a stale preview', async () => {
    const live = liveMatch([OPEN, '1', '1']);
    const seq = live.events[1].seq;
    const first = deferred<HistoryEditPreview | null>();
    const compute = (ops: readonly HistoryEditOp[]): HistoryEditPreview | null => {
      const outcome = applyHistoryEdits(live.setup, live.events, ops, { ids: () => `id-${Math.round(ops.length * 1000)}-${seq}`, now: '2026-09-12T15:00:00.000Z' });
      return outcome.ok ? { outcome, baseFingerprint: logFingerprint(live.events), impact: null, requiresReason: false } : null;
    };
    const previewHistoryEdit = jest
      .fn<Promise<HistoryEditPreview | null>, [readonly HistoryEditOp[]]>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation((ops) => Promise.resolve(compute(ops)));
    const store = setLive(live, { previewHistoryEdit });
    await renderScreen(<EditBallScreen seq={seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-2'));
    await fireEvent.press(screen.getByTestId('edit-btn-3'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    await act(async () => {
      first.resolve(compute(previewHistoryEdit.mock.calls[0][0]));
    });
    await fireEvent.press(screen.getByTestId('edit-btn-apply'));
    const appliedOps = jest.mocked(store.applyHistoryEdit).mock.calls[0][0];
    expect(appliedOps).toEqual(previewHistoryEdit.mock.calls[1][0]);
    expect(appliedOps[0]).toMatchObject({ op: 'replace', with: [expect.objectContaining({ runsRun: 3 })] });
  });
});

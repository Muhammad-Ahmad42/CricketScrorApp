import '@/features/scoring/__tests__/support/mocks';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ImpactSummary } from '@/domain/types';
import type { HistoryEditPreview, LiveMatch } from '@/services/contracts';
import { applyHistoryEdits, logFingerprint, type HistoryEditOp } from '@/domain/scoring/history';
import { liveMatch, OPEN } from '@/features/scoring/__tests__/support/liveMatch';
import { renderScreen, resetCommonStores, setLive } from '@/features/scoring/__tests__/support/render';
import { BallLogScreen } from '../screens/BallLogScreen';
import { EditBallScreen } from '../screens/EditBallScreen';
import { mockStores } from '@/features/scoring/__tests__/support/storeModule';

const { useLiveMatchStore } = mockStores();

let counter = 0;

function previewFor(live: LiveMatch, impact: ImpactSummary | null, requiresReason: boolean) {
  return jest.fn((ops: readonly HistoryEditOp[]): Promise<HistoryEditPreview | null> => {
    const outcome = applyHistoryEdits(live.setup, live.events, ops, { ids: () => `new-${(counter += 1)}`, now: '2026-09-12T15:00:00.000Z' });
    if (!outcome.ok) {
      useLiveMatchStore.setState({ error: { code: 'VALIDATION', message: outcome.message, domainCode: outcome.code, detail: null } });
      return Promise.resolve(null);
    }
    return Promise.resolve({ outcome, baseFingerprint: logFingerprint(live.events), impact, requiresReason });
  });
}

const ones = (count: number) => Array.from({ length: count }, () => '1');

const IMPACT: ImpactSummary = {
  severity: 'warning',
  headline: 'Standings change in Pool A',
  lines: ['Tigers move from 2nd to 1st'],
  fixtures: [],
  standings: [],
  qualification: [],
  slots: [],
  nrrChanged: true,
  completedMatchesAffected: 1,
  requiresConfirmation: true,
  requiresReason: true,
  blocked: null,
};

describe('ball log', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('groups balls by over, newest first, with notes and opens a ball for editing', async () => {
    const live = liveMatch([OPEN, ...ones(6), '4', 'W:b>L3']);
    setLive(live);
    await renderScreen(<BallLogScreen />);
    const groups = screen.getAllByTestId(/^balls-over-/);
    expect(groups[0]).toHaveTextContent(/Over 2/);
    expect(screen.getByText('Saim comes in')).toBeOnTheScreen();
    const ball = live.state.innings[0].balls.find((entry) => entry.wicket !== null);
    expect(screen.getByText(`${ball?.label}  ${ball?.strikerId === 'L1' ? 'Babar' : 'Fakhar'} ${ball?.wicket?.text}`)).toBeOnTheScreen();
    const four = live.events.find((event) => event.kind === 'delivery' && event.boundary === 4);
    await fireEvent.press(screen.getByTestId(`balls-cell-${four?.seq}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/edit/[seq]', params: { matchId: 'M1', seq: `${four?.seq}` } });
  });
});

describe('edit a past ball (§16, §99)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('previews WHAT WILL CHANGE for a live match and applies without a reason', async () => {
    const live = liveMatch([OPEN, '4', '1', '1']);
    const seq = live.events[1].seq;
    const previewHistoryEdit = previewFor(live, null, false);
    const store = setLive(live, { previewHistoryEdit });
    await renderScreen(<EditBallScreen seq={seq} />);
    expect(screen.getByTestId('edit-recorded')).toHaveTextContent(/Four · Haris to Babar/);
    await fireEvent.press(screen.getByTestId('edit-btn-2'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(previewHistoryEdit).toHaveBeenCalledWith([{ op: 'replace', seq, with: [expect.objectContaining({ kind: 'delivery', runsRun: 2, boundary: 0 })] }]);
    expect(screen.getByTestId('change-score-0')).toHaveProp('accessibilityLabel', 'LIO score: 6/0 changes to 4/0');
    expect(screen.getByTestId('edit-new')).toHaveTextContent(/Two runs/);
    await fireEvent.press(screen.getByTestId('edit-btn-apply'));
    const preview = await jest.mocked(previewHistoryEdit).mock.results[0].value;
    expect(store.applyHistoryEdit).toHaveBeenCalledWith(jest.mocked(previewHistoryEdit).mock.calls[0][0], null, preview);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('requires a reason for a completed tournament match and shows the tournament impact', async () => {
    const live = liveMatch([OPEN, ...ones(18), 'start:T1:T2:L11', '6', '6', '6', '1', 'end'], undefined, { tournamentId: 'TOUR' });
    const seq = live.events.filter((event) => event.kind === 'delivery').slice(-1)[0].seq;
    const previewHistoryEdit = previewFor(live, IMPACT, true);
    const store = setLive(live, { previewHistoryEdit });
    await renderScreen(<EditBallScreen seq={seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-4'));
    await waitFor(() => expect(screen.getByTestId('edit-impact')).toBeOnTheScreen());
    expect(screen.getByText('Tigers move from 2nd to 1st')).toBeOnTheScreen();
    expect(screen.getByTestId('edit-btn-apply')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('edit-reason'), 'Scorer pressed the wrong key');
    expect(screen.getByTestId('edit-btn-apply')).not.toBeDisabled();
    await fireEvent.press(screen.getByTestId('edit-btn-apply'));
    expect(store.applyHistoryEdit).toHaveBeenCalledWith(expect.any(Array), 'Scorer pressed the wrong key', expect.objectContaining({ requiresReason: true }));
  });

  it('shows the result change as a warning when the edit changes the result', async () => {
    const live = liveMatch([OPEN, ...ones(18), 'start:T1:T2:L11', ...ones(17), '.', 'end']);
    const last = live.events.filter((event) => event.kind === 'delivery').slice(-1)[0];
    setLive(live, { previewHistoryEdit: previewFor(live, null, true) });
    await renderScreen(<EditBallScreen seq={last.seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-2'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(screen.getByTestId('edit-result-change')).toHaveTextContent('Result changes: Lions won by 1 run → Tigers won by 10 wickets');
  });

  it('replaces a wicket with runs and also removes the incoming batter', async () => {
    const live = liveMatch([OPEN, '1', 'W:b>L3', '1']);
    const wicketSeq = live.events.find((event) => event.kind === 'delivery' && event.wicket !== null)?.seq ?? 0;
    const previewHistoryEdit = previewFor(live, null, false);
    setLive(live, { previewHistoryEdit });
    await renderScreen(<EditBallScreen seq={wicketSeq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-1'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(previewHistoryEdit.mock.calls[0][0]).toEqual([
      { op: 'replace', seq: wicketSeq, with: [expect.objectContaining({ kind: 'delivery', wicket: null })] },
      { op: 'delete', seq: wicketSeq + 1 },
    ]);
    expect(screen.getByText("Also removes Saim's arrival because the wicket is removed.")).toBeOnTheScreen();
  });

  it('changes a ball to a wide through the extras sheet and can delete a ball', async () => {
    const live = liveMatch([OPEN, '1', '2', '3']);
    const seq = live.events[2].seq;
    const previewHistoryEdit = previewFor(live, null, false);
    setLive(live, { previewHistoryEdit });
    await renderScreen(<EditBallScreen seq={seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-extras'));
    await fireEvent.press(screen.getByTestId('extras-chip-wd'));
    await waitFor(() => expect(previewHistoryEdit).toHaveBeenCalledTimes(1));
    expect(previewHistoryEdit.mock.calls[0][0]).toEqual([{ op: 'replace', seq, with: [expect.objectContaining({ call: 'wide' })] }]);
    await fireEvent.press(screen.getByTestId('edit-btn-delete'));
    await waitFor(() => expect(previewHistoryEdit).toHaveBeenCalledTimes(2));
    expect(previewHistoryEdit.mock.calls[1][0]).toEqual([{ op: 'delete', seq }]);
  });

  it('shows the domain explanation when the edit cannot be applied', async () => {
    const live = liveMatch([OPEN, '1']);
    const previewHistoryEdit = jest.fn(() => {
      useLiveMatchStore.setState({ error: { code: 'VALIDATION', message: 'That change leaves the crease empty.', domainCode: 'NO_VACANCY', detail: null } });
      return Promise.resolve(null);
    });
    setLive(live, { previewHistoryEdit });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-0'));
    await waitFor(() => expect(screen.getByTestId('edit-error')).toHaveTextContent('That change leaves the crease empty.'));
  });

  it('asks to review again when the log changed since the preview', async () => {
    const live = liveMatch([OPEN, '1', '1']);
    const previewHistoryEdit = previewFor(live, null, false);
    const applyHistoryEdit = jest.fn(() => {
      useLiveMatchStore.setState({ error: { code: 'CONFLICT', message: 'Changed', domainCode: null, detail: null } });
      return Promise.resolve(false);
    });
    setLive(live, { previewHistoryEdit, applyHistoryEdit });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-4'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('edit-btn-apply'));
    await fireEvent.press(await screen.findByTestId('edit-conflict-review'));
    await waitFor(() => expect(previewHistoryEdit).toHaveBeenCalledTimes(2));
  });
});

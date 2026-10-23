import '@/features/scoring/__tests__/support/mocks';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { BackHandler, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import type { ImpactSummary } from '@/domain/types';
import type { HistoryEditPreview, LiveMatch } from '@/services/contracts';
import { applyHistoryEdits, logFingerprint, type HistoryEditOp } from '@/domain/scoring/history';
import type { EditConflict } from '@/domain/scoring/editPlanning';
import { measureFieldsAt, resetKeyboard, scrollToSpy, showKeyboard, withPlatform } from '@/ui/testing';
import { liveMatch, OPEN } from '@/features/scoring/__tests__/support/liveMatch';
import { renderScreen, resetCommonStores, setLive, setWindow } from '@/features/scoring/__tests__/support/render';
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

type BackPress = (event: { readonly type: string; readonly timeStamp: number }) => boolean | null | undefined;

function hardwareBack() {
  const handlers = new Set<BackPress>();
  const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((...args) => {
    const handler = args[1];
    handlers.add(handler);
    return { remove: () => handlers.delete(handler) };
  });
  return {
    listening: () => handlers.size > 0,
    press: async () => {
      let handled = false;
      await act(async () => {
        handled = [...handlers].reverse().some((handler) => handler({ type: 'hardwareBackPress', timeStamp: 0 }) === true);
      });
      return handled;
    },
    restore: () => spy.mockRestore(),
  };
}

function stackOptions(): unknown {
  const calls = jest.mocked(Stack.Screen).mock.calls;
  return calls[calls.length - 1]?.[0].options;
}

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
    expect(screen.getByText(/^Openers: /)).toBeOnTheScreen();
    expect(screen.queryByText(/ innings: /)).not.toBeOnTheScreen();
    expect(screen.queryByText(/ to bowl$/)).not.toBeOnTheScreen();
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
    expect(screen.getByTestId('edit-reason')).toHaveProp('returnKeyType', 'done');
    expect(screen.getByTestId('edit-reason')).toHaveProp('submitBehavior', 'blurAndSubmit');
    expect(within(screen.getByTestId('edit-reason-group')).getByTestId('edit-reason')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-edit-footer')).getByTestId('edit-btn-apply')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('edit-reason'), 'submitEditing');
    expect(store.applyHistoryEdit).not.toHaveBeenCalled();
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
    expect(screen.getByText('Saim no longer comes in')).toBeOnTheScreen();
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
  it('goes to the ball log instead of back when the edit was opened by a link with no history', async () => {
    const live = liveMatch([OPEN, '1', '1']);
    setLive(live, { previewHistoryEdit: previewFor(live, null, false) });
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-4'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('edit-btn-apply'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/match/[matchId]/balls', params: { matchId: 'M1' } }));
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('top-bar-back'));
    expect(router.replace).toHaveBeenCalledTimes(2);
    jest.mocked(router.canGoBack).mockReturnValue(true);
  });

  it('marks the recorded key and shows the chosen key as selected, not only by colour', async () => {
    const live = liveMatch([OPEN, '4', '1']);
    setLive(live, { previewHistoryEdit: previewFor(live, null, false) });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    expect(screen.getByTestId('edit-btn-4-tag')).toHaveTextContent('Now');
    expect(screen.getByTestId('edit-btn-4')).toHaveProp('accessibilityLabel', 'Four runs, boundary, recorded');
    await fireEvent.press(screen.getByTestId('edit-btn-2'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(screen.getByTestId('edit-btn-2')).toHaveProp('accessibilityState', { selected: true });
    expect(screen.getByTestId('edit-btn-2-selected')).toBeOnTheScreen();
    expect(screen.getByTestId('edit-btn-4')).toHaveProp('accessibilityState', { selected: false });
    expect(screen.getByTestId('edit-top-bar')).toHaveTextContent(/Edit ball 0\.1/);
    expect(screen.getByTestId('edit-top-bar')).toHaveTextContent(/LIO 1st innings · Haris to Babar/);
  });

  it('shows only the rows that change and says when the result is unchanged', async () => {
    const live = liveMatch([OPEN, ...ones(18), 'start:T1:T2:L11', '6', '6', '6', '1', 'end']);
    const seq = live.events.filter((event) => event.kind === 'delivery').slice(-1)[0].seq;
    setLive(live, { previewHistoryEdit: previewFor(live, null, true) });
    await renderScreen(<EditBallScreen seq={seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-2'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(screen.queryByTestId('change-overs-1')).not.toBeOnTheScreen();
    expect(screen.getByTestId('edit-result-unchanged')).toHaveTextContent(/^Result: unchanged · /);
    expect(screen.getByText('Reason')).toBeOnTheScreen();
    expect(screen.getByText('At least 3 characters')).toBeOnTheScreen();
  });

  it('renders the reopen consequence, the automatic resolution and the named tournament impact', async () => {
    const live = liveMatch([OPEN, '1', '1'], undefined, { tournamentId: 'TOUR' });
    const base = previewFor(live, null, true);
    const impact: ImpactSummary = {
      ...IMPACT,
      lines: ['Old line that repeats the sections'],
      keyLines: ['The result of Match 6 · Tigers v Eagles no longer counts until the match is finished again.'],
      fixtures: [{ fixtureId: 'F6', label: 'Match 6 · Tigers v Eagles', change: 'result_changed', hasMatchData: true, changeText: 'Result no longer counts', note: 'Its scores stay saved.' }],
      standings: [{ stageId: 'S1', poolId: 'P1', teamId: 'TIG', before: null, after: null, text: 'Tigers · Group stage · Pool A · 1st → 2nd · NRR +1.500 → +0.900' }],
      slotShortfalls: [
        {
          slotId: 'B2',
          label: 'B2',
          stageId: 'KO',
          stageName: 'Knockouts',
          sourceStageId: 'S1',
          poolId: 'P2',
          poolName: 'Pool B',
          needed: 2,
          available: 1,
          fixtureLabels: ['SF1'],
          message: 'Pool B would be left with 1 team, so slot B2 in Knockouts could never be filled.',
        },
      ],
    };
    const previewHistoryEdit = jest.fn(async (ops: readonly HistoryEditOp[]): Promise<HistoryEditPreview | null> => {
      const value = await base(ops);
      if (value === null) {
        return null;
      }
      return {
        ...value,
        impact,
        resolutions: [{ kind: 'reopen_match', automatic: true, label: 'Reopen the match', description: 'The recorded result no longer stands, so the match is reopened.', ops }],
        consequences: {
          reopensMatch: true,
          resultBefore: 'Lions won by 1 run',
          resultAfter: null,
          targetChanges: [],
          removedDeliveries: 0,
          lines: ['The recorded result no longer stands, so the match is reopened.', 'Tigers need 3 runs to win from 2 balls.'],
        },
      };
    });
    setLive(live, { previewHistoryEdit });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-0'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(screen.getByTestId('edit-reopens')).toBeOnTheScreen();
    expect(screen.getAllByText('The recorded result no longer stands, so the match is reopened.')).toHaveLength(1);
    expect(screen.getByText('Tigers need 3 runs to win from 2 balls.')).toBeOnTheScreen();
    expect(screen.getByText('The result of Match 6 · Tigers v Eagles no longer counts until the match is finished again.')).toBeOnTheScreen();
    expect(screen.queryByText('Old line that repeats the sections')).not.toBeOnTheScreen();
    expect(screen.getByTestId('edit-impact-shortfall-B2')).toBeOnTheScreen();
    expect(screen.queryByTestId('impact-row-1')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('edit-impact-details'));
    expect(screen.getByTestId('impact-row-1')).toHaveTextContent(/Match 6 · Tigers v Eagles/);
    expect(screen.getByTestId('impact-row-1')).toHaveTextContent(/Result no longer counts/);
    expect(screen.getByTestId('impact-text-standing-1')).toHaveTextContent('Tigers · Group stage · Pool A · 1st → 2nd · NRR +1.500 → +0.900');
    expect(screen.queryByText(/\(has scores\)/)).not.toBeOnTheScreen();
    expect(screen.getByText('Apply and reopen')).toBeOnTheScreen();
    expect(screen.getByText('Reason')).toBeOnTheScreen();
  });

  it('shows short consequence and impact headlines with one supporting line instead of the long sentences', async () => {
    const live = liveMatch([OPEN, '1', '1'], undefined, { tournamentId: 'TOUR' });
    const base = previewFor(live, null, true);
    const impact: ImpactSummary = {
      ...IMPACT,
      headline: '1 fixture affected, 1 completed',
      keyLines: ['The result of Match 6 · Tigers v Eagles no longer counts until the match is finished again.'],
      keyItems: [{ headline: 'Match 6 result changes', detail: 'Tigers v Eagles.' }],
    };
    const previewHistoryEdit = jest.fn(async (ops: readonly HistoryEditOp[]): Promise<HistoryEditPreview | null> => {
      const value = await base(ops);
      if (value === null) {
        return null;
      }
      return {
        ...value,
        impact,
        consequences: {
          reopensMatch: true,
          resultBefore: 'Lions won by 1 run',
          resultAfter: null,
          targetChanges: [{ inningsIndex: 1, teamId: 'TIG', before: 28, after: 32 }],
          removedDeliveries: 2,
          lines: [
            'The target for Tigers changes from 28 to 32.',
            '“Lions won by 1 run” no longer stands, so the match is reopened.',
            '2 later balls are removed from the match.',
          ],
          items: [
            { headline: 'Target for Tigers: 28 → 32' },
            { headline: 'Match reopens', detail: '“Lions won by 1 run” no longer stands.' },
            { headline: '2 later balls removed' },
          ],
        },
      };
    });
    setLive(live, { previewHistoryEdit });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-0'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(screen.getByTestId('edit-reopens')).toHaveTextContent(/^Match reopens“Lions won by 1 run” no longer stands\.$/);
    expect(screen.getByTestId('edit-consequences')).toHaveTextContent(/Target for Tigers: 28 → 32/);
    expect(screen.getByTestId('edit-consequences')).toHaveTextContent(/2 later balls removed/);
    expect(screen.queryByText(/so the match is reopened/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/changes from 28 to 32/)).not.toBeOnTheScreen();
    expect(screen.getByTestId('edit-impact-line-1-headline')).toHaveTextContent('Match 6 result changes');
    expect(screen.getByTestId('edit-impact-line-1-supporting')).toHaveTextContent('Tigers v Eagles.');
    expect(screen.queryByText(/no longer counts until/)).not.toBeOnTheScreen();
  });

  it('offers the later-ball conflict resolutions, previews the chosen fix and can cancel', async () => {
    const live = liveMatch([OPEN, '1', '1', '1']);
    const fix: readonly HistoryEditOp[] = [{ op: 'delete', seq: live.events[3].seq }];
    const conflict: EditConflict = {
      code: 'PLAYER_NOT_AT_CREASE',
      message: 'Babar is no longer on strike for ball 0.3, so he cannot be out there.',
      reason: 'strike changed',
      atSeq: live.events[3].seq,
      eventId: live.events[3].id,
      inningsIndex: 0,
      ballLabel: '0.3',
      resolutions: [
        { kind: 'keep_strike', automatic: false, label: 'Keep the later balls as recorded', description: 'The batters change ends before ball 0.3.', ops: fix },
        { kind: 'remove_later_play', automatic: false, label: 'Remove the later balls', description: 'Ball 0.3 is removed from the match.', ops: fix },
      ],
    } as unknown as EditConflict;
    const base = previewFor(live, null, false);
    let first = true;
    const previewHistoryEdit = jest.fn((ops: readonly HistoryEditOp[]) => {
      if (first) {
        first = false;
        useLiveMatchStore.setState({ editConflict: conflict, error: { code: 'VALIDATION', message: conflict.message, domainCode: conflict.code, detail: null } });
        return Promise.resolve(null);
      }
      useLiveMatchStore.setState({ editConflict: null });
      return base(ops);
    });
    const clearEditConflict = jest.fn(() => useLiveMatchStore.setState({ editConflict: null, error: null }));
    setLive(live, { previewHistoryEdit, clearEditConflict });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-2'));
    await waitFor(() => expect(screen.getByTestId('edit-conflict')).toBeOnTheScreen());
    expect(screen.getByTestId('edit-conflict-message')).toHaveTextContent(conflict.message);
    expect(screen.getByTestId('edit-conflict-ball')).toHaveTextContent(/ball 0\.3/);
    expect(screen.queryByTestId('edit-error')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('edit-resolution-remove_later_play'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(previewHistoryEdit).toHaveBeenLastCalledWith(fix);
    expect(screen.getByText('Ball 0.3 is removed from the match.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('edit-btn-apply'));
    expect(useLiveMatchStore.getState().applyHistoryEdit).toHaveBeenCalledWith(fix, null, expect.anything());
    first = true;
    await fireEvent.press(screen.getByTestId('edit-btn-3'));
    await waitFor(() => expect(screen.getByTestId('edit-conflict')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('edit-conflict-cancel'));
    expect(clearEditConflict).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('edit-conflict')).not.toBeOnTheScreen());
  });
});

describe('edit a past ball: release polish', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  function conflictFor(live: LiveMatch): EditConflict {
    const fix: readonly HistoryEditOp[] = [{ op: 'delete', seq: live.events[3].seq }];
    return {
      code: 'PLAYER_NOT_AT_CREASE',
      message: 'Babar is no longer on strike for ball 0.3.',
      reason: 'strike changed',
      atSeq: live.events[3].seq,
      eventId: live.events[3].id,
      inningsIndex: 0,
      ballLabel: '0.3',
      resolutions: [{ kind: 'remove_later_play', automatic: false, label: 'Remove the later balls', description: 'Ball 0.3 is removed.', ops: fix }],
    } as unknown as EditConflict;
  }

  it('leaves without asking when nothing changed', async () => {
    const back = hardwareBack();
    const live = liveMatch([OPEN, '1', '1']);
    setLive(live, { previewHistoryEdit: previewFor(live, null, false) });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    expect(back.listening()).toBe(false);
    expect(stackOptions()).toEqual({ gestureEnabled: true });
    await fireEvent.press(screen.getByTestId('top-bar-back'));
    expect(screen.queryByTestId('edit-discard')).not.toBeOnTheScreen();
    expect(router.back).toHaveBeenCalledTimes(1);
    back.restore();
  });

  it('asks before the header back discards a previewed change', async () => {
    const live = liveMatch([OPEN, '1', '1']);
    setLive(live, { previewHistoryEdit: previewFor(live, null, false) });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-4'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(stackOptions()).toEqual({ gestureEnabled: false });
    await fireEvent.press(screen.getByTestId('top-bar-back'));
    expect(screen.getByTestId('edit-discard')).toHaveTextContent(/Discard changes\?/);
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('edit-discard-cancel'));
    await waitFor(() => expect(screen.queryByTestId('edit-discard')).not.toBeOnTheScreen());
    expect(screen.getByTestId('edit-preview')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('top-bar-back'));
    await fireEvent.press(screen.getByTestId('edit-discard-confirm'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('asks before the Android back button discards a change, and lets it through otherwise', async () => {
    const back = hardwareBack();
    const live = liveMatch([OPEN, '1', '1']);
    setLive(live, { previewHistoryEdit: previewFor(live, null, false) });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    expect(await back.press()).toBe(false);
    await fireEvent.press(screen.getByTestId('edit-btn-2'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(back.listening()).toBe(true);
    expect(await back.press()).toBe(true);
    expect(screen.getByTestId('edit-discard')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('edit-discard-confirm'));
    expect(router.back).toHaveBeenCalledTimes(1);
    back.restore();
  });

  it('treats a typed reason as a change worth asking about', async () => {
    const live = liveMatch([OPEN, ...ones(18), 'start:T1:T2:L11', '6', '6', '6', '1', 'end']);
    const seq = live.events.filter((event) => event.kind === 'delivery').slice(-1)[0].seq;
    setLive(live, { previewHistoryEdit: previewFor(live, null, true) });
    await renderScreen(<EditBallScreen seq={seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-2'));
    await waitFor(() => expect(screen.getByTestId('edit-reason')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('edit-reason'), 'Scorer slip');
    await fireEvent.press(screen.getByTestId('top-bar-back'));
    expect(screen.getByTestId('edit-discard')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('asks before leaving a choose-a-fix state and clears the conflict when discarded', async () => {
    const live = liveMatch([OPEN, '1', '1', '1']);
    const conflict = conflictFor(live);
    const previewHistoryEdit = jest.fn(() => {
      useLiveMatchStore.setState({ editConflict: conflict, error: { code: 'VALIDATION', message: conflict.message, domainCode: conflict.code, detail: null } });
      return Promise.resolve(null);
    });
    const clearEditConflict = jest.fn(() => useLiveMatchStore.setState({ editConflict: null, error: null }));
    setLive(live, { previewHistoryEdit, clearEditConflict });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-4'));
    await waitFor(() => expect(screen.getByTestId('edit-conflict')).toBeOnTheScreen());
    clearEditConflict.mockClear();
    await fireEvent.press(screen.getByTestId('top-bar-back'));
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('edit-discard-confirm'));
    expect(clearEditConflict).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('marks the picked key as selected while choosing a fix', async () => {
    const live = liveMatch([OPEN, '2', '1', '1']);
    const conflict = conflictFor(live);
    const previewHistoryEdit = jest.fn(() => {
      useLiveMatchStore.setState({ editConflict: conflict, error: { code: 'VALIDATION', message: conflict.message, domainCode: conflict.code, detail: null } });
      return Promise.resolve(null);
    });
    setLive(live, { previewHistoryEdit, clearEditConflict: jest.fn(() => useLiveMatchStore.setState({ editConflict: null, error: null })) });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    expect(screen.getByTestId('edit-btn-2-tag')).toHaveTextContent('Now');
    await fireEvent.press(screen.getByTestId('edit-btn-4'));
    await waitFor(() => expect(screen.getByTestId('edit-conflict')).toBeOnTheScreen());
    expect(screen.getByTestId('edit-btn-4')).toHaveProp('accessibilityState', { selected: true });
    expect(screen.getByTestId('edit-btn-4-selected')).toBeOnTheScreen();
    expect(screen.getByTestId('edit-btn-4')).toHaveProp('accessibilityLabel', 'Four runs, boundary, chosen');
    expect(screen.getByTestId('edit-btn-2')).toHaveProp('accessibilityState', { selected: false });
    expect(screen.queryByTestId('edit-btn-2-selected')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('edit-conflict-cancel'));
    await waitFor(() => expect(screen.queryByTestId('edit-conflict')).not.toBeOnTheScreen());
    expect(screen.getByTestId('edit-btn-4')).toHaveProp('accessibilityState', { selected: false });
  });

  it('docks Apply below the content at 390x844 with a hint while the reason is missing', async () => {
    const restore = setWindow(390, 844);
    const live = liveMatch([OPEN, ...ones(18), 'start:T1:T2:L11', '6', '6', '6', '1', 'end'], undefined, { tournamentId: 'TOUR' });
    const seq = live.events.filter((event) => event.kind === 'delivery').slice(-1)[0].seq;
    setLive(live, { previewHistoryEdit: previewFor(live, IMPACT, true) });
    await renderScreen(<EditBallScreen seq={seq} />);
    expect(screen.queryByTestId('screen-edit-footer')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('edit-btn-4'));
    await waitFor(() => expect(screen.getByTestId('edit-impact')).toBeOnTheScreen());
    const footer = within(screen.getByTestId('screen-edit-footer'));
    expect(footer.getByTestId('edit-btn-apply')).toBeDisabled();
    expect(footer.getByTestId('edit-apply-hint')).toHaveTextContent('Add a reason to apply');
    expect(footer.queryByTestId('edit-reason')).not.toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-edit-scroll')).queryByTestId('edit-btn-apply')).not.toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-edit-scroll')).getByTestId('edit-reason')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('edit-reason'), 'Umpire signalled four');
    expect(footer.queryByTestId('edit-apply-hint')).not.toBeOnTheScreen();
    expect(footer.getByTestId('edit-btn-apply')).not.toBeDisabled();
    await restore();
  });

  it('scrolls the reason field above the keyboard and the docked Apply', async () => {
    const live = liveMatch([OPEN, ...ones(18), 'start:T1:T2:L11', '6', '6', '6', '1', 'end']);
    const seq = live.events.filter((event) => event.kind === 'delivery').slice(-1)[0].seq;
    setLive(live, { previewHistoryEdit: previewFor(live, null, true) });
    await withPlatform('android', async () => {
      await renderScreen(<EditBallScreen seq={seq} />);
      await fireEvent.press(screen.getByTestId('edit-btn-2'));
      await waitFor(() => expect(screen.getByTestId('edit-reason')).toBeOnTheScreen());
      const scrollTo = scrollToSpy();
      measureFieldsAt(1200, 80);
      await fireEvent(screen.getByTestId('edit-reason'), 'focus');
      await showKeyboard(320);
      expect(scrollTo).toHaveBeenCalled();
      const last = scrollTo.mock.calls[scrollTo.mock.calls.length - 1][0] as { readonly y: number };
      expect(last.y).toBeGreaterThan(0);
      expect(within(screen.getByTestId('screen-edit-footer')).getByTestId('edit-btn-apply')).toBeOnTheScreen();
      await resetKeyboard();
      scrollTo.mockRestore();
    });
  });

  it.each([
    [390, 844],
    [820, 1180],
  ])('lines Delete ball up with the key grid edge at %ipt wide', async (width, height) => {
    const restore = setWindow(width, height);
    const live = liveMatch([OPEN, '1', '1']);
    setLive(live, { previewHistoryEdit: previewFor(live, null, false) });
    await renderScreen(<EditBallScreen seq={live.events[1].seq} />);
    const grid = StyleSheet.flatten(screen.getByTestId('edit-btn-pad').props.style);
    const actions = StyleSheet.flatten(screen.getByTestId('edit-actions').props.style);
    expect(typeof grid.paddingHorizontal).toBe('number');
    expect(actions.paddingRight).toBe(grid.paddingHorizontal);
    const wrapper = screen.getByTestId('edit-btn-delete').parent;
    expect(StyleSheet.flatten(wrapper?.props.style)).toMatchObject({ marginLeft: 'auto' });
    await restore();
  });
});

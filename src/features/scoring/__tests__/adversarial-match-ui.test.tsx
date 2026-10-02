import './support/mocks';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ImpactSummary, MatchListItem } from '@/domain/types';
import type { BootstrapReport, HistoryEditPreview, LiveMatch } from '@/services/contracts';
import { noBall, scoreRuns, selectBowler, wicket, type ScoringIntent } from '@/domain/scoring/commands';
import { currentInnings } from '@/domain/scoring/replay';
import { formatOvers, formatRate, formatRequirement } from '@/domain/scoring/format';
import { applyHistoryEdits, logFingerprint, type HistoryEditOp } from '@/domain/scoring/history';
import { m3Setup, m8LmsSetup } from '@/domain/scoring/testing';
import { touchTargetSize } from '@/ui/testing';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { resetResumeSession } from '@/features/home/resumeSession';
import { HistoryScreen } from '@/features/history/screens/HistoryScreen';
import { EditBallScreen } from '@/features/scorecard/screens/EditBallScreen';
import { ScoringScreen } from '../screens/ScoringScreen';
import { fakeApp, fakeHistory, fakeHome, fakeSetup, fakeTeamLibrary, fakeTournamentList, fakeWizard } from './support/fakes';
import { completedItem, listItem } from './support/listItems';
import { liveMatch, OPEN } from './support/liveMatch';
import { renderScreen, resetCommonStores, setLive, setWindow } from './support/render';
import { mockStores } from './support/storeModule';

const {
  useAppStore,
  useHomeStore,
  useLiveMatchStore,
  useMatchHistoryStore,
  useMatchSetupStore,
  useTeamLibraryStore,
  useToastStore,
  useTournamentListStore,
  useTournamentWizardStore,
} = mockStores();

const ones = (count: number) => Array.from({ length: count }, () => '1');
const FIRST_INNINGS = [OPEN, ...ones(18)];
const SECOND = 'start:T1:T2:L11';
const INTERACTIVE_ROLES = new Set(['button', 'tab', 'radio', 'switch', 'link', 'togglebutton']);

interface HostNode {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}

function dispatched(store: { readonly dispatch: (intent: ScoringIntent) => Promise<boolean> }): readonly ScoringIntent[] {
  return jest.mocked(store.dispatch).mock.calls.map(([intent]) => intent);
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function interactiveHosts(): readonly HostNode[] {
  return screen.container.queryAll(
    (node) => typeof node.type === 'string' && INTERACTIVE_ROLES.has(String(node.props.accessibilityRole)) && node.props.accessible !== false,
  );
}

function describeNode(node: HostNode): string {
  return String(node.props.testID ?? node.props.accessibilityLabel ?? 'unnamed');
}

async function openMore(action: string) {
  await fireEvent.press(screen.getByTestId('score-btn-more'));
  await fireEvent.press(screen.getByTestId(`more-row-${action}`));
}

function rejectWicketsAsAfterResult() {
  return jest.fn((intent: ScoringIntent) => {
    if (intent.type === 'wicket') {
      useLiveMatchStore.setState({
        error: {
          code: 'VALIDATION',
          message: 'The match was already won before this wicket. Record the runs without the wicket.',
          domainCode: 'WICKET_AFTER_RESULT',
          detail: null,
        },
      });
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  });
}

describe('attack: one-tap recording on the live screen (§2, §9, USER_FLOWS 2.1)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it.each([0, 1, 2, 3, 4, 6] as const)('records %i with exactly one tap, one dispatch and no sheet or confirmation', async (runs) => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId(`score-btn-${runs}`));
    expect(dispatched(store)).toEqual([scoreRuns(runs)]);
    expect(screen.queryAllByTestId(/^sheet-/)).toHaveLength(0);
    expect(screen.queryByTestId('dialog-btn-confirm')).not.toBeOnTheScreen();
  });

  it('queues a fast second tap while the first ball is still saving instead of dropping it (ACCESSIBILITY §9)', async () => {
    const first = deferred<boolean>();
    const dispatch = jest.fn(() => first.promise);
    setLive(liveMatch([OPEN]), { dispatch });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-4'));
    await fireEvent.press(screen.getByTestId('score-btn-4'));
    await act(async () => {
      first.resolve(true);
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(2, scoreRuns(4));
  });

  it('shows a dot key labelled "Dot ball" when the dot style is chosen and still records 0 runs', async () => {
    resetCommonStores({ dotStyle: 'dot' });
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    const key = screen.getByTestId('score-btn-0');
    expect(key).toHaveProp('accessibilityLabel', 'Dot ball');
    expect(within(key).getByText('•')).toBeOnTheScreen();
    await fireEvent.press(key);
    expect(dispatched(store)).toEqual([scoreRuns(0)]);
  });

  it('announces the committed ball and the new score to screen readers (ACCESSIBILITY §3)', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const dispatch = jest.fn(() => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, '4']) });
      return Promise.resolve(true);
    });
    setLive(liveMatch([OPEN]), { dispatch });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-4'));
    const spoken = announce.mock.calls.map(([message]) => message).join(' | ');
    const liveRegions = screen.container.queryAll((node) => typeof node.type === 'string' && (node.props.accessibilityLiveRegion === 'polite' || node.props.accessibilityLiveRegion === 'assertive'));
    const regionText = liveRegions.map((node) => String(node.props.accessibilityLabel ?? '')).join(' | ');
    expect(`${spoken} | ${regionText}`).toMatch(/four/i);
    expect(`${spoken} | ${regionText}`).toMatch(/4 for 0|4\/0/i);
    announce.mockRestore();
  });
});

describe('attack: extras (§17, USER_FLOWS 2.3)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('records a custom no-ball with leg byes (NB + 3 LB) through the Custom panel', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-extras'));
    await fireEvent.press(screen.getByTestId('extras-tab-no_ball'));
    await fireEvent.press(screen.getByTestId('extras-runs-to-leg-bye'));
    await fireEvent.press(screen.getByTestId('extras-btn-custom'));
    await fireEvent.press(screen.getByTestId('extras-custom-runs-increment'));
    await fireEvent.press(screen.getByTestId('extras-custom-runs-increment'));
    await fireEvent.press(screen.getByTestId('extras-custom-record'));
    const [intent] = dispatched(store);
    expect(intent).toMatchObject({ type: 'no_ball', runsTo: 'leg_bye', runsRun: 3 });
    expect(intent.type === 'no_ball' ? intent.boundary ?? 0 : -1).toBe(0);
  });

  it('records a custom wide with 5 runs run from the Custom panel', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-extras'));
    await fireEvent.press(screen.getByTestId('extras-btn-custom'));
    for (let step = 0; step < 4; step += 1) {
      await fireEvent.press(screen.getByTestId('extras-custom-runs-increment'));
    }
    await fireEvent.press(screen.getByTestId('extras-custom-record'));
    const [intent] = dispatched(store);
    expect(intent).toMatchObject({ type: 'wide', runsRun: 5 });
    expect(intent.type === 'wide' ? intent.boundary ?? false : true).toBe(false);
  });

  it('records custom leg byes to the boundary', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-extras'));
    await fireEvent.press(screen.getByTestId('extras-tab-leg_bye'));
    await fireEvent.press(screen.getByTestId('extras-btn-custom'));
    await fireEvent.press(screen.getByTestId('extras-custom-runs-decrement'));
    await fireEvent.press(screen.getByTestId('extras-custom-boundary-4'));
    await fireEvent.press(screen.getByTestId('extras-custom-record'));
    expect(dispatched(store)).toEqual([expect.objectContaining({ type: 'leg_bye', runsRun: 0, boundary: true })]);
  });

  it('defaults "Runs off" to Bat every time the extras sheet opens, so a no-ball hit for four is never recorded as byes', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-extras'));
    await fireEvent.press(screen.getByTestId('extras-tab-no_ball'));
    await fireEvent.press(screen.getByTestId('extras-runs-to-bye'));
    await fireEvent.press(screen.getByTestId('extras-chip-nb2'));
    await fireEvent.press(screen.getByTestId('score-btn-extras'));
    if (!screen.queryByTestId('extras-chip-nb4')) {
      await fireEvent.press(screen.getByTestId('extras-tab-no_ball'));
    }
    expect(screen.getByTestId('extras-runs-to-bat')).toBeSelected();
    await fireEvent.press(screen.getByTestId('extras-chip-nb4'));
    expect(dispatched(store)).toEqual([noBall({ runsTo: 'bye', runsRun: 2 }), noBall({ runsTo: 'bat', boundary: 4 })]);
  });

  it('opens on the Wide tab again once a new over has started (tab is remembered only for the rest of the over)', async () => {
    setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-extras'));
    await fireEvent.press(screen.getByTestId('extras-tab-no_ball'));
    await fireEvent.press(screen.getByTestId('extras-chip-nb'));
    await act(async () => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, '1', 'nb', ...ones(6)]) });
    });
    await fireEvent.press(screen.getByTestId('score-btn-extras'));
    expect(screen.getByTestId('extras-tab-wide')).toBeSelected();
  });

  it('gives every extras chip a button role, a spoken label and a 56 pt sheet-choice height', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-extras'));
    const problems: string[] = [];
    for (const tab of ['wide', 'no_ball', 'bye', 'leg_bye', 'other']) {
      await fireEvent.press(screen.getByTestId(`extras-tab-${tab}`));
      for (const chip of screen.getAllByTestId(/^extras-chip-/)) {
        const size = touchTargetSize(chip);
        if (chip.props.accessibilityRole !== 'button' || !chip.props.accessibilityLabel || size.height < 56) {
          problems.push(`${tab}:${String(chip.props.testID)} h=${size.height}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('attack: wicket flows (§18, USER_FLOWS 2.2)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it.each(['lbw', 'hit_wicket'] as const)('records %s in two taps with the next batter preselected', async (dismissal) => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId(`wicket-btn-${dismissal}`));
    expect(dispatched(store)).toEqual([wicket({ dismissal, call: 'fair', nextBatterId: 'L3' })]);
  });

  it('records obstructing the field from More dismissals with the batter and end', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-btn-more'));
    await fireEvent.press(screen.getByTestId('wicket-btn-obstructing_field'));
    await fireEvent.press(screen.getByTestId('wicket-btn-record'));
    expect(dispatched(store)).toEqual([
      expect.objectContaining({ type: 'wicket', dismissal: 'obstructing_field', call: 'fair', playerOutId: 'L1', nextBatterId: 'L3' }),
    ]);
  });

  it('runs out the non-striker at the bowler\'s end after 2 runs with the thrower recorded', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-btn-run_out'));
    await fireEvent.press(screen.getByTestId('wicket-who-non-striker'));
    expect(screen.getByTestId('wicket-end-non-striker')).toBeSelected();
    await fireEvent.press(screen.getByTestId('wicket-runs-2'));
    await fireEvent.press(screen.getByTestId('wicket-fielder-slot-0'));
    await fireEvent.press(screen.getByTestId('wicket-fielder-T3'));
    await fireEvent.press(screen.getByTestId('wicket-btn-record'));
    expect(dispatched(store)).toEqual([
      wicket({ dismissal: 'run_out', call: 'fair', playerOutId: 'L2', dismissalEnd: 'non_striker_end', runsRun: 2, fielderIds: ['T3'], nextBatterId: 'L3' }),
    ]);
  });

  it('lists the designated keeper first for a stumping (W-S3, USER_FLOWS 2.2)', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-btn-stumped'));
    const fielders = screen.getAllByTestId(/^wicket-fielder-T/);
    expect(fielders[0]).toHaveProp('testID', 'wicket-fielder-T1');
  });

  it('keeps the wide when a stumping off a match-winning wide is recorded without the wicket (Law 16.6)', async () => {
    const dispatch = rejectWicketsAsAfterResult();
    setLive(liveMatch([...FIRST_INNINGS, SECOND, '6', '6', '6']), { dispatch });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-call-wide'));
    await fireEvent.press(screen.getByTestId('wicket-btn-stumped'));
    await fireEvent.press(screen.getByTestId('wicket-fielder-L6'));
    await waitFor(() => expect(screen.getByTestId('wicket-btn-without')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('wicket-btn-without'));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1][0]).toMatchObject({ type: 'wide' });
  });

  it('records the last wicket in two taps with no incoming batter and says the innings ends', async () => {
    const store = setLive(liveMatch([OPEN, ...Array.from({ length: 9 }, () => 'W:b'), '.']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    expect(screen.getByTestId('wicket-text-last')).toHaveTextContent('Last wicket: the innings ends');
    await fireEvent.press(screen.getByTestId('wicket-btn-bowled'));
    expect(dispatched(store)).toEqual([wicket({ dismissal: 'bowled', call: 'fair', nextBatterId: null })]);
  });

  it('removes dismissals that are impossible on a no-ball or a wide instead of disabling them', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-call-no-ball'));
    for (const gone of ['bowled', 'lbw', 'caught', 'stumped']) {
      expect(screen.queryByTestId(`wicket-btn-${gone}`)).not.toBeOnTheScreen();
    }
    expect(screen.getByTestId('wicket-btn-run_out')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('wicket-call-wide'));
    for (const gone of ['bowled', 'lbw', 'caught']) {
      expect(screen.queryByTestId(`wicket-btn-${gone}`)).not.toBeOnTheScreen();
    }
    expect(screen.getByTestId('wicket-btn-stumped')).toBeOnTheScreen();
    expect(screen.getByTestId('wicket-btn-run_out')).toBeOnTheScreen();
  });

  it('makes every fielder choice a 56 pt sheet choice (ACCESSIBILITY §5)', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-btn-caught'));
    const short = screen
      .getAllByTestId(/^wicket-fielder-/)
      .map((node) => ({ id: String(node.props.testID), height: touchTargetSize(node).height }))
      .filter((entry) => entry.height < 56);
    expect(short).toEqual([]);
  });

  it('retires the batter who is at the crease now, not the one retired earlier in the session', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await openMore('retire');
    await fireEvent.press(screen.getByTestId('retire-submit'));
    expect(dispatched(store)[0]).toEqual({ type: 'retire', playerId: 'L1', retirement: 'retired_hurt', nextBatterId: 'L3' });
    const after = liveMatch([OPEN, { type: 'retire', playerId: 'L1', retirement: 'retired_hurt', nextBatterId: 'L3' }]);
    await act(async () => {
      useLiveMatchStore.setState({ live: after });
    });
    await openMore('retire');
    await fireEvent.press(screen.getByTestId('retire-submit'));
    const second = dispatched(store)[1];
    const innings = currentInnings(after.state);
    expect(second.type).toBe('retire');
    if (second.type === 'retire') {
      expect([innings?.strikerId, innings?.nonStrikerId]).toContain(second.playerId);
      expect(second.nextBatterId).not.toBe('L3');
    }
  });
});

describe('attack: retirements and bowler changes from More (§18, USER_FLOWS 2.5, 2.9, 2.11)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('advisory retirement banner: Not now hides it until the next ball, Retire records "retired not out" without blocking the pad', async () => {
    const setup = m3Setup({ rules: { mandatoryRetirement: { atRuns: 8, mayReturn: true, timing: 'immediately' } } });
    const store = setLive(liveMatch([OPEN, '4', '4'], setup));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-banner-retirement')).toHaveTextContent(/Babar/);
    expect(screen.getByTestId('score-btn-1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('score-banner-not-now'));
    expect(screen.queryByTestId('score-banner-retirement')).not.toBeOnTheScreen();
    await act(async () => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, '4', '4', '.'], setup) });
    });
    await fireEvent.press(screen.getByTestId('score-banner-retire'));
    expect(screen.getByTestId('retire-kind-retired_not_out')).toBeSelected();
    await fireEvent.press(screen.getByTestId('retire-submit'));
    expect(dispatched(store)).toEqual([{ type: 'retire', playerId: 'L1', retirement: 'retired_not_out', nextBatterId: 'L3' }]);
  });

  it('opens Change bowler on "Injured" every time, so a later injury is never recorded as a suspension', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await openMore('change_bowler');
    await fireEvent.press(screen.getByTestId('change-bowler-suspended'));
    await fireEvent.press(screen.getByTestId('change-bowler-T9'));
    await act(async () => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, '1', '@T9:suspended', '1']) });
    });
    await openMore('change_bowler');
    expect(screen.getByTestId('change-bowler-injury')).toBeSelected();
    await fireEvent.press(screen.getByTestId('change-bowler-T8'));
    expect(dispatched(store)).toEqual([selectBowler('T9', 'suspended'), selectBowler('T8', 'injury')]);
  });

  it('opens the penalty sheet with an empty reason after a penalty was recorded', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await openMore('penalty');
    await fireEvent.changeText(screen.getByTestId('penalty-reason'), 'Ball tampering');
    await fireEvent.press(screen.getByTestId('penalty-submit'));
    expect(dispatched(store)).toEqual([expect.objectContaining({ type: 'penalty', runs: 5, reason: 'Ball tampering' })]);
    await openMore('penalty');
    expect(screen.getByTestId('penalty-reason')).toHaveDisplayValue('');
    expect(screen.getByTestId('penalty-submit')).toBeDisabled();
  });
});

describe('attack: every PendingAction renders a prompt with Undo (§9, W-S4…W-S9)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  const CASES: readonly (readonly [string, string, () => LiveMatch])[] = [
    ['start_next_innings', 'prompt-start-innings', () => liveMatch(FIRST_INNINGS)],
    ['select_next_batter', 'prompt-next-batter', () => liveMatch([OPEN, '1', 'W:b'])],
    ['select_next_bowler', 'prompt-next-bowler', () => liveMatch([OPEN, ...ones(6)])],
    ['resume_play', 'prompt-resume-play', () => liveMatch([OPEN, '1', 'susp'])],
    ['confirm_result', 'prompt-confirm-result', () => liveMatch([...FIRST_INNINGS, SECOND, '6', '6', '6', '1'])],
    ['resolve_tie', 'prompt-resolve-tie', () => liveMatch([...FIRST_INNINGS, SECOND, ...ones(18)])],
  ];

  it.each(CASES)('%s replaces the pad with a titled panel that can undo the last ball', async (type, panelID, build) => {
    const live = build();
    expect(live.state.pendingAction?.type).toBe(type);
    const store = setLive(live);
    await renderScreen(<ScoringScreen />);
    expect(screen.queryByTestId('score-btn-1')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('score-btn-wicket')).not.toBeOnTheScreen();
    const panel = screen.getByTestId(panelID);
    expect(within(panel).getAllByRole('header').length).toBeGreaterThan(0);
    const undo = within(panel).getByRole('button', { name: /undo/i });
    await fireEvent.press(undo);
    expect(store.undo).toHaveBeenCalledTimes(1);
  });
});

describe('attack: colour-independent state (§11, §78, ACCESSIBILITY §6)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('shows FREE HIT as text with an icon in the header and marks the free-hit ball in its spoken label', async () => {
    setLive(liveMatch([OPEN, 'nb']));
    const view = await renderScreen(<ScoringScreen />);
    const pill = screen.getByTestId('score-free-hit');
    expect(within(pill).getByText(/free hit/i)).toBeOnTheScreen();
    expect(within(pill).getByTestId('lucide-triangle-alert', { includeHiddenElements: true })).toBeTruthy();
    await act(async () => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, 'nb', '1']) });
    });
    expect(screen.getByTestId('score-chip-ball-2').props.accessibilityLabel).toMatch(/free hit/i);
    expect(screen.getByTestId('score-chip-ball-2-free-hit', { includeHiddenElements: true })).toBeTruthy();
    view.unmount();
  });

  it('shows a wicket in the over strip as the letter W with a spoken dismissal, not only a red chip', async () => {
    setLive(liveMatch([OPEN, '1', 'W:b']));
    await renderScreen(<ScoringScreen />);
    const chip = screen.getByTestId('score-chip-ball-2');
    expect(within(chip).getByText('W', { includeHiddenElements: true })).toBeTruthy();
    expect(chip.props.accessibilityLabel).toMatch(/wicket/i);
  });

  it('marks the striker in the tablet scorecard pane with text, not only a highlight', async () => {
    const restore = setWindow(1024, 768);
    setLive(liveMatch([OPEN, '1', '4']));
    await renderScreen(<ScoringScreen />);
    const pane = screen.getByTestId('score-scorecard-pane');
    expect(within(pane).getAllByLabelText(/on strike/i).length).toBeGreaterThan(0);
    await restore();
  });
});

describe('attack: accessibility of the live screen (§72, §78, ACCESSIBILITY §2, §5, §12)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('gives every interactive control a role, a spoken label and a 44 pt target; scoring keys at least 56 pt', async () => {
    setLive(liveMatch([OPEN, '1', '4']), { redoStack: [[]] });
    await renderScreen(<ScoringScreen />);
    const nodes = interactiveHosts();
    expect(nodes.length).toBeGreaterThan(12);
    const unlabeled = nodes.filter((node) => typeof node.props.accessibilityLabel !== 'string' || String(node.props.accessibilityLabel).trim() === '').map(describeNode);
    expect(unlabeled).toEqual([]);
    const small = nodes
      .filter((node) => node.props.testID !== 'score-btn-scorecard')
      .map((node) => ({ id: describeNode(node), size: touchTargetSize(node) }))
      .filter(({ size }) => size.height < 44)
      .map(({ id, size }) => `${id} h=${size.height}`);
    expect(small).toEqual([]);
    for (const key of ['0', '1', '2', '3', '4', '6', 'extras', 'wicket']) {
      expect(touchTargetSize(screen.getByTestId(`score-btn-${key}`)).height).toBeGreaterThanOrEqual(56);
    }
  });

  it('labels the striker, the bowler and the over strip for screen readers', async () => {
    setLive(liveMatch([OPEN, '4', '1']));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-row-striker').props.accessibilityLabel).toMatch(/on strike/i);
    expect(screen.getByTestId('score-row-non-striker').props.accessibilityLabel).not.toMatch(/on strike/i);
    expect(screen.getByTestId('score-row-bowler').props.accessibilityLabel).toMatch(/^Bowling: /);
    expect(screen.getByTestId('score-row-over').props.accessibilityLabel).toMatch(/^This over: /);
  });

  it('expands CRR and RRR in their spoken labels (ACCESSIBILITY §12)', async () => {
    setLive(liveMatch([...FIRST_INNINGS, SECOND, '4', '1']));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-text-crr').props.accessibilityLabel).toMatch(/current run rate/i);
    expect(screen.getByTestId('score-text-rrr').props.accessibilityLabel).toMatch(/required run rate/i);
  });

  it('offers scoring shortcuts as accessibility actions on the score block (ACCESSIBILITY §4)', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    const block = screen.getByTestId('score-btn-scorecard');
    const actions = (block.props.accessibilityActions ?? []) as readonly { readonly name: string; readonly label?: string }[];
    expect(actions.map((action) => `${action.name} ${action.label ?? ''}`).join(' | ')).toMatch(/one run/i);
  });
});

describe('attack: score header values come from the state (§10)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('first innings: CRR and the powerplay line, but no target, RRR or requirement', async () => {
    setLive(liveMatch([OPEN, '1', '4']));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-text-innings')).toHaveTextContent('Lions · 1st innings');
    expect(screen.getByTestId('score-text-overs')).toHaveTextContent('0.2');
    expect(screen.getByTestId('score-text-overs-of')).toHaveTextContent('of 3');
    expect(screen.getByTestId('score-text-powerplay')).toHaveTextContent(/Powerplay/);
    expect(screen.queryByTestId('score-text-target')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('score-text-rrr')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('score-text-requirement')).not.toBeOnTheScreen();
  });

  it('drops the powerplay line once the powerplay overs are over', async () => {
    setLive(liveMatch([OPEN, ...ones(7)]));
    await renderScreen(<ScoringScreen />);
    expect(screen.queryByTestId('score-text-powerplay')).not.toBeOnTheScreen();
  });

  it('chase with a wicket, a wide and a no-ball: every header figure equals the domain state', async () => {
    const live = liveMatch([...FIRST_INNINGS, SECOND, '4', 'W:b', 'wd', 'nb', '2']);
    setLive(live);
    await renderScreen(<ScoringScreen />);
    const innings = currentInnings(live.state);
    const chase = live.state.chase;
    expect(innings).not.toBeNull();
    expect(chase).not.toBeNull();
    if (innings === null || chase === null) {
      return;
    }
    expect(screen.getByTestId('score-text-score')).toHaveProp('accessibilityLabel', `Tigers ${innings.runs} for ${innings.wickets}`);
    expect(screen.getByTestId('score-text-overs')).toHaveTextContent(formatOvers(innings.legalBalls, 6, { alwaysShowBalls: true }));
    expect(screen.getByTestId('score-text-target')).toHaveProp('accessibilityLabel', expect.stringContaining(`${chase.target}`));
    expect(screen.getByTestId('score-text-rrr')).toHaveProp('accessibilityLabel', expect.stringContaining(formatRate(chase.requiredRunRate)));
    expect(screen.getByTestId('score-text-requirement')).toHaveTextContent(formatRequirement(chase.runsRequired, chase.ballsRemaining));
  });

  it('shows revised overs as "of 2 (revised)" and recomputes balls remaining', async () => {
    const live = liveMatch([...FIRST_INNINGS, SECOND, '1', { type: 'revise_overs', inningsIndex: 1, overs: 2, reason: 'Rain' }]);
    setLive(live);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-text-overs-of')).toHaveTextContent('of 2 (revised)');
    expect(screen.getByTestId('score-text-requirement')).toHaveTextContent(formatRequirement(live.state.chase?.runsRequired ?? -1, 11));
  });
});

describe('attack: undo, redo and swap strike (§11, §15, USER_FLOWS 2.4, 2.6)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('undoes in one tap without a confirmation and the toast Redo calls redo', async () => {
    const store = setLive(liveMatch([OPEN, '4']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-undo'));
    expect(store.undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('dialog-btn-confirm')).not.toBeOnTheScreen();
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalled());
    const toast = jest.mocked(useToastStore.getState().show).mock.calls[0][0];
    expect(toast.action?.label).toBe('Redo');
    await act(async () => {
      toast.action?.run();
    });
    expect(store.redo).toHaveBeenCalledTimes(1);
  });

  it('tells the scorer the score was reloaded when another screen changed the match (CONFLICT, USER_FLOWS §0)', async () => {
    const dispatch = jest.fn(() => {
      useLiveMatchStore.setState({ error: { code: 'CONFLICT', message: 'stale', domainCode: null, detail: null } });
      return Promise.resolve(false);
    });
    setLive(liveMatch([OPEN]), { dispatch });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-2'));
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalled());
    const toast = jest.mocked(useToastStore.getState().show).mock.calls[0][0];
    expect(toast.message).toBe('This match was updated elsewhere. Showing the latest score.');
    expect(toast.message).not.toMatch(/stale|CONFLICT/);
  });

  it('says what was undone in the undo toast (USER_FLOWS 2.6 "Undone: 0.1 · Four")', async () => {
    setLive(liveMatch([OPEN, '4']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-undo'));
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalled());
    const toast = jest.mocked(useToastStore.getState().show).mock.calls[0][0];
    expect(toast.message).toMatch(/^Undone: .*(four|4)/i);
  });

  it('swaps strike in one tap and confirms with a "Strike swapped" toast that can be undone', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-swap'));
    expect(dispatched(store)).toEqual([{ type: 'swap_strike' }]);
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalled());
    const toast = jest.mocked(useToastStore.getState().show).mock.calls[0][0];
    expect(toast.message).toBe('Strike swapped');
    await act(async () => {
      toast.action?.run();
    });
    expect(store.undo).toHaveBeenCalledTimes(1);
  });

  it('disables Swap with an explanation when a last-man-stands batter bats alone', async () => {
    setLive(liveMatch(['start:L1:L2:T11', ...Array.from({ length: 7 }, () => 'W:b')], m8LmsSetup()));
    await renderScreen(<ScoringScreen />);
    const swap = screen.getByTestId('score-btn-swap');
    expect(swap).toBeDisabled();
    expect(swap).toHaveProp('accessibilityHint', 'Only one batter at the crease');
    expect(screen.getByText('Batting alone (last man stands)')).toBeOnTheScreen();
  });
});

describe('attack: small phone and tablet layouts (§74, W-S1b, W-S12)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('uses two panes at exactly 768 dp and the phone layout at 767 dp', async () => {
    let restore = setWindow(768, 1024);
    setLive(liveMatch([OPEN, '1']));
    const tablet = await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-two-pane')).toBeOnTheScreen();
    await tablet.unmount();
    await restore();
    restore = setWindow(767, 1024);
    await renderScreen(<ScoringScreen />);
    expect(screen.queryByTestId('score-two-pane')).not.toBeOnTheScreen();
    await restore();
  });

  it('uses 80 pt keys in the tablet scoring column', async () => {
    const restore = setWindow(1194, 834);
    setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    expect(touchTargetSize(screen.getByTestId('score-btn-4')).height).toBe(80);
    await restore();
  });

  it('on a 320 pt phone keeps RRR, drops CRR from the header and keeps keys at 56 pt or more', async () => {
    const restore = setWindow(320, 568);
    setLive(liveMatch([...FIRST_INNINGS, SECOND, '4', '1']));
    await renderScreen(<ScoringScreen />);
    expect(touchTargetSize(screen.getByTestId('score-btn-1')).height).toBeGreaterThanOrEqual(56);
    expect(screen.getByTestId('score-text-rrr')).toBeOnTheScreen();
    expect(screen.queryByTestId('score-text-crr')).not.toBeOnTheScreen();
    await restore();
  });

  it('on a 320 pt phone moves Redo into the More sheet', async () => {
    const restore = setWindow(320, 568);
    const store = setLive(liveMatch([OPEN, '1']), { redoStack: [[]] });
    await renderScreen(<ScoringScreen />);
    expect(screen.queryByTestId('score-btn-redo')).not.toBeOnTheScreen();
    await openMore('redo');
    await waitFor(() => expect(store.redo).toHaveBeenCalledTimes(1));
    await restore();
  });
});

function bootstrapReport(resumable: readonly MatchListItem[]): BootstrapReport {
  return { schemaVersion: 1, resumable, projectionsRebuilt: 0, integrityIssues: [] };
}

describe('attack: MATCH IN PROGRESS prompt (§23, W-H3, USER_FLOWS 3.1)', () => {
  beforeEach(() => {
    resetCommonStores();
    resetResumeSession();
    useAppStore.setState(fakeApp(), true);
    useHomeStore.setState(fakeHome(), true);
    useMatchSetupStore.setState(fakeSetup(), true);
    useTournamentWizardStore.setState(fakeWizard(), true);
    useMatchHistoryStore.setState(fakeHistory(), true);
    jest.clearAllMocks();
  });

  it('cannot be dismissed by the scrim or a close button', async () => {
    useAppStore.setState(fakeApp({ report: bootstrapReport([listItem()]) }), true);
    await renderScreen(<HomeScreen />);
    expect(screen.queryByTestId('sheet-resume-btn-close')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('sheet-resume-scrim'));
    expect(screen.getByTestId('resume-btn-resume')).toBeOnTheScreen();
    expect(useHomeStore.getState().dismissResume).not.toHaveBeenCalled();
  });

  it('lists several unfinished matches, resumes the chosen one, and SAVE & EXIT dismisses all of them', async () => {
    useAppStore.setState(fakeApp({ report: bootstrapReport([listItem({ id: 'a' }), listItem({ id: 'b', title: 'Hawks v Eagles' })]) }), true);
    const view = await renderScreen(<HomeScreen />);
    expect(screen.getByTestId('resume-item-a')).toBeOnTheScreen();
    expect(screen.getByTestId('resume-item-b')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('resume-item-b-resume'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/score', params: { matchId: 'b' } });
    await view.unmount();
    resetResumeSession();
    await renderScreen(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('resume-btn-save-exit'));
    expect(useHomeStore.getState().dismissResume).toHaveBeenCalledWith('a');
    expect(useHomeStore.getState().dismissResume).toHaveBeenCalledWith('b');
  });

  it('cancelling DISCARD keeps the match and brings the prompt back', async () => {
    useAppStore.setState(fakeApp({ report: bootstrapReport([listItem()]) }), true);
    await renderScreen(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('resume-btn-discard'));
    await fireEvent.press(screen.getByTestId('home-discard-cancel'));
    expect(useHomeStore.getState().discard).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('resume-btn-resume')).toBeOnTheScreen());
  });
});

let previewCounter = 0;

function previewFor(live: LiveMatch, impact: ImpactSummary | null, requiresReason: boolean) {
  return jest.fn((ops: readonly HistoryEditOp[]): Promise<HistoryEditPreview | null> => {
    const outcome = applyHistoryEdits(live.setup, live.events, ops, { ids: () => `adv-${(previewCounter += 1)}`, now: '2026-09-12T15:00:00.000Z' });
    if (!outcome.ok) {
      useLiveMatchStore.setState({ error: { code: 'VALIDATION', message: outcome.message, domainCode: outcome.code, detail: null } });
      return Promise.resolve(null);
    }
    return Promise.resolve({ outcome, baseFingerprint: logFingerprint(live.events), impact, requiresReason });
  });
}

const BLOCKED: ImpactSummary = {
  severity: 'destructive',
  headline: 'Semifinal already played',
  lines: [],
  fixtures: [],
  standings: [],
  qualification: [],
  slots: [],
  nrrChanged: false,
  completedMatchesAffected: 2,
  requiresConfirmation: true,
  requiresReason: true,
  blocked: { reason: 'The semifinal that depends on this result has been played.' },
};

describe('attack: historical edit (§16, §99, W-C3, USER_FLOWS 5)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  const COMPLETED = [...FIRST_INNINGS, SECOND, '6', '6', '6', '1', 'end'];

  it('shows no Apply button until WHAT WILL CHANGE has been previewed', async () => {
    const live = liveMatch(COMPLETED);
    const seq = live.events.filter((event) => event.kind === 'delivery').slice(-1)[0].seq;
    const store = setLive(live, { previewHistoryEdit: previewFor(live, null, true) });
    await renderScreen(<EditBallScreen seq={seq} />);
    expect(screen.queryByTestId('edit-btn-apply')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('edit-btn-2'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(screen.getByTestId('edit-btn-apply')).toBeOnTheScreen();
    expect(store.applyHistoryEdit).not.toHaveBeenCalled();
  });

  it('needs at least 3 non-space characters of reason for a completed match', async () => {
    const live = liveMatch(COMPLETED);
    const seq = live.events.filter((event) => event.kind === 'delivery').slice(-1)[0].seq;
    const store = setLive(live, { previewHistoryEdit: previewFor(live, null, true) });
    await renderScreen(<EditBallScreen seq={seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-4'));
    await waitFor(() => expect(screen.getByTestId('edit-btn-apply')).toBeOnTheScreen());
    for (const weak of ['', '   ', 'a b', '  ab  ']) {
      await fireEvent.changeText(screen.getByTestId('edit-reason'), weak);
      expect(screen.getByTestId('edit-btn-apply')).toBeDisabled();
    }
    await fireEvent.press(screen.getByTestId('edit-btn-apply'));
    expect(store.applyHistoryEdit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('edit-reason'), 'a b c');
    expect(screen.getByTestId('edit-btn-apply')).not.toBeDisabled();
  });

  it('keeps Apply disabled and explains why when the impact is blocked', async () => {
    const live = liveMatch(COMPLETED, undefined, { tournamentId: 'TOUR' });
    const seq = live.events.filter((event) => event.kind === 'delivery').slice(-1)[0].seq;
    setLive(live, { previewHistoryEdit: previewFor(live, BLOCKED, true) });
    await renderScreen(<EditBallScreen seq={seq} />);
    await fireEvent.press(screen.getByTestId('edit-btn-4'));
    await waitFor(() => expect(screen.getByTestId('edit-preview')).toBeOnTheScreen());
    expect(screen.getByText('The semifinal that depends on this result has been played.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('edit-reason'), 'Umpire signalled four');
    expect(screen.getByTestId('edit-btn-apply')).toBeDisabled();
  });
});

describe('attack: history search, sort and filter (§81, W-Y1)', () => {
  beforeEach(() => {
    resetCommonStores();
    useTeamLibraryStore.setState(fakeTeamLibrary(), true);
    useTournamentListStore.setState(fakeTournamentList(), true);
    jest.clearAllMocks();
  });

  function storeThatRemembersQuery(items: readonly MatchListItem[]) {
    const load = jest.fn((query: import('@/domain/types').MatchListQuery) => {
      useMatchHistoryStore.setState({ query });
      return Promise.resolve(true);
    });
    useMatchHistoryStore.setState(fakeHistory({ items, load }), true);
    return load;
  }

  it('collapses fast typing into one search after the 250 ms pause', async () => {
    jest.useFakeTimers();
    const load = storeThatRemembersQuery([completedItem()]);
    await renderScreen(<HistoryScreen />);
    load.mockClear();
    for (const text of ['L', 'Li', 'Lio', 'Lions']) {
      await fireEvent.changeText(screen.getByTestId('history-search'), text);
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
    }
    expect(load).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ search: 'Lions' }));
    jest.useRealTimers();
  });

  it('keeps the search when a status filter and a sort are applied', async () => {
    jest.useFakeTimers();
    const load = storeThatRemembersQuery([completedItem()]);
    await renderScreen(<HistoryScreen />);
    await fireEvent.changeText(screen.getByTestId('history-search'), 'Lions');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();
    await fireEvent.press(screen.getByTestId('history-filter-status'));
    await fireEvent.press(screen.getByTestId('sheet-history-status-live'));
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Lions', statuses: ['live', 'paused'] }));
    await fireEvent.press(screen.getByTestId('history-filter-sort'));
    await fireEvent.press(screen.getByTestId('sheet-history-sort-scheduled'));
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Lions', statuses: ['live', 'paused'], sort: 'scheduled' }));
  });

  it('opens a paused match in live scoring and clears every filter from the filtered empty state', async () => {
    const load = storeThatRemembersQuery([listItem({ id: 'm-paused', status: 'paused' })]);
    await renderScreen(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-row-m-paused'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/score', params: { matchId: 'm-paused' } });
    await act(async () => {
      useMatchHistoryStore.setState({ items: [], query: { sort: 'oldest', search: 'zzz', statuses: ['completed'], teamId: 'LIO' } });
    });
    await fireEvent.press(await screen.findByTestId('history-btn-clear'));
    expect(load).toHaveBeenLastCalledWith({ sort: 'oldest' });
  });
});

import '@/ui/testing';
import { Dimensions, StyleSheet, type ViewStyle } from 'react-native';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { abandonedResult, inningsSummary, summary } from '@/domain/scoring/testing';
import { evaluateTournament } from '@/domain/tournament/evaluate';
import { knockoutBracket } from '@/domain/tournament/fixtures';
import { computeImpact } from '@/domain/tournament/impact';
import { simulate } from '@/domain/tournament/whatif';
import type {
  FixtureDraft,
  HypotheticalResult,
  ProposedChange,
  StandingRow,
  TournamentEvaluation,
  TournamentSnapshot,
  WhatIfResult,
} from '@/domain/types';
import type { ChangePreview, FixturePlan } from '@/services/contracts';
import type { Toast, TournamentWizardDraft } from '@/stores/contracts';
import { renderWithTheme } from '@/ui/testing';
import { sourceTree } from '../../../__tests__/sourceTree';
import { DashboardScreen } from '../screens/DashboardScreen';
import { FixtureDetailScreen } from '../screens/FixtureDetailScreen';
import { ManageTournamentScreen } from '../screens/ManageTournamentScreen';
import { PoolsScreen } from '../screens/PoolsScreen';
import { QualificationScreen } from '../screens/QualificationScreen';
import { BracketScreen } from '../screens/BracketScreen';
import { StandingsScreen } from '../screens/StandingsScreen';
import { TournamentTeamsScreen } from '../screens/TournamentTeamsScreen';
import { WhatIfScreen } from '../screens/WhatIfScreen';
import { FixturesStepScreen } from '../screens/wizard/FixturesStepScreen';
import { InfoStepScreen } from '../screens/wizard/InfoStepScreen';
import { PoolsStepScreen } from '../screens/wizard/PoolsStepScreen';
import { RulesStepScreen } from '../screens/wizard/RulesStepScreen';
import { TeamsStepScreen } from '../screens/wizard/TeamsStepScreen';
import { tournamentIndex } from '../selectors/names';
import { editPolicy } from '../selectors/policy';
import { libraryTeams, liveWizard, loadTournament, previewOf, resetAll } from './support/harness';
import {
  useBackupStore,
  useExportStore,
  useMatchSetupStore,
  useTeamLibraryStore,
  useToastStore,
  useTournamentStore,
  useTournamentWizardStore,
} from './support/mockStores';
import { mockRouter } from './support/router';
import {
  AT,
  POOL_A_IDS,
  POOL_B_IDS,
  counter,
  cupSnapshot,
  knockoutSnapshot,
  leagueSnapshot,
  playGroups,
  playPair,
  teamSide,
  teamView,
} from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

const EIGHT = [...POOL_A_IDS, ...POOL_B_IDS];
const TEN = [...EIGHT, 'RHI', 'OWL'];

type Node = ReturnType<typeof screen.getByTestId>;

function orderedStages(snapshot: TournamentSnapshot) {
  return [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex);
}

function cupDraft(snapshot: TournamentSnapshot, withAssignment: boolean): Partial<TournamentWizardDraft> {
  const groups = orderedStages(snapshot)[0];
  const pools = snapshot.pools.filter((pool) => pool.stageId === groups.id).sort((a, b) => a.orderIndex - b.orderIndex);
  return {
    tournamentId: 't1',
    info: { ...useTournamentWizardStore.getState().draft.info, name: 'City Cup', structureKind: 'groups_knockout', templateId: 'builtin:8-team-t20' },
    teams: EIGHT.map((teamId) => ({ teamId, seed: null })),
    rules: snapshot.rules,
    stages: snapshot.stages,
    pools: snapshot.pools,
    slots: snapshot.slots.filter((slot) => slot.role === 'entry'),
    poolAssignment: withAssignment
      ? {
          seed: null,
          pools: pools.map((pool) => ({
            poolId: pool.id,
            name: pool.name,
            members: snapshot.poolEntries.filter((entry) => entry.poolId === pool.id).map((entry) => entry.side),
          })),
        }
      : null,
  };
}

function groupPlan(snapshot: TournamentSnapshot): FixturePlan {
  const stage = orderedStages(snapshot)[0];
  const fixtures: FixtureDraft[] = snapshot.fixtures
    .filter((fixture) => fixture.stageId === stage.id)
    .map(({ createdAt: _createdAt, updatedAt: _updatedAt, matchId: _matchId, matchSides: _matchSides, ...draft }) => draft);
  return { fixtures, slots: [], entrySlotSeeds: [], seed: null };
}

function realPreview() {
  const ids = counter('imp');
  return jest.fn(async (change: ProposedChange): Promise<ChangePreview | null> => {
    const snapshot = useTournamentStore.getState().snapshot;
    if (!snapshot) {
      throw new Error('No snapshot loaded');
    }
    return { version: snapshot.version, impact: computeImpact(change, snapshot, { ids, now: AT }) };
  });
}

function stubbedPreview(overrides: Partial<ChangePreview['impact']> = {}) {
  const previews: ChangePreview[] = [];
  const previewChange = jest.fn(async (change: ProposedChange): Promise<ChangePreview | null> => {
    const preview = previewOf(change, overrides);
    previews.push(preview);
    return preview;
  });
  return { previewChange, previews };
}

function toasts(): readonly Omit<Toast, 'id'>[] {
  return jest.mocked(useToastStore.getState().show).mock.calls.map(([toast]) => toast);
}

function toastAction(label: string): () => void {
  const found = [...toasts()].reverse().find((toast) => toast.action?.label === label);
  if (!found?.action) {
    throw new Error(`No toast offers ${label}`);
  }
  return found.action.run;
}

function doctorRows(evaluation: TournamentEvaluation, edit: (row: StandingRow) => StandingRow): TournamentEvaluation {
  return {
    ...evaluation,
    stages: evaluation.stages.map((stage) => ({
      ...stage,
      tables: stage.tables.map((table) => ({ ...table, rows: table.rows.map(edit) })),
    })),
  };
}

function textOf(node: Node): string {
  return node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');
}

function poolRowFor(team: string, letter = 'a', size = 4): number {
  for (let position = 1; position <= size; position += 1) {
    const cell = screen.queryByTestId(`standings-cell-${letter}-${position}-team`);
    if (cell && textOf(cell).includes(team)) {
      return position;
    }
  }
  throw new Error(`No standings row for ${team}`);
}

function flatStyle(node: Node): ViewStyle {
  return (StyleSheet.flatten(node.props.style as ViewStyle | undefined) ?? {}) as ViewStyle;
}

function ancestorWidth(node: Node): number | undefined {
  let current = node.parent;
  while (current) {
    const style = StyleSheet.flatten(current.props.style as ViewStyle | undefined);
    if (current.type === 'View' && style && typeof style.width === 'number') {
      return style.width;
    }
    current = current.parent;
  }
  return undefined;
}

function hasHorizontalScrollAncestor(node: Node): boolean {
  let current = node.parent;
  while (current) {
    if (current.props.horizontal === true) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function featureSources(): readonly { readonly file: string; readonly text: string }[] {
  return [...sourceTree('src/features/tournament'), ...sourceTree('src/features/shared')]
    .filter((source) => !source.isTest)
    .map((source) => ({ file: source.rel, text: source.text }));
}

async function openPoolMemberMenu(row: string) {
  await fireEvent.press(screen.getByTestId(`${row}-menu`));
}

describe('Wizard: step validation and progressive save (§25, §65)', () => {
  it('rejects a whitespace-only tournament name and never saves the step', async () => {
    liveWizard();
    await renderWithTheme(<InfoStepScreen />);
    await fireEvent.changeText(screen.getByTestId('twiz-input-name'), '     ');
    await fireEvent.press(screen.getByTestId('twiz-btn-next'));
    expect(screen.getByText('Enter a tournament name.', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(useTournamentWizardStore.getState().saveStep).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('saves the step it is on before moving on, and shows Next as busy while the save runs', async () => {
    liveWizard({ tournamentId: 't1', teams: EIGHT.map((teamId) => ({ teamId, seed: null })) }, 'teams');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    const stepsAtSave: string[] = [];
    let release: (ok: boolean) => void = () => undefined;
    const saveStep = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          stepsAtSave.push(useTournamentWizardStore.getState().step);
          release = resolve;
        }),
    );
    useTournamentWizardStore.setState({ saveStep });
    await renderWithTheme(<TeamsStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-btn-next'));
    expect(screen.getByTestId('twiz-btn-next').props.accessibilityState).toMatchObject({ busy: true });
    expect(saveStep).toHaveBeenCalledTimes(1);
    expect(stepsAtSave).toEqual(['teams']);
    expect(mockRouter.push).not.toHaveBeenCalled();
    await act(async () => {
      release(true);
    });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/tournament/new/structure'));
    expect(useTournamentWizardStore.getState().step).toBe('structure');
  });

  it('blocks Next when two teams are given the same seed', async () => {
    liveWizard({ tournamentId: 't1', teams: [{ teamId: 'LIO', seed: 1 }, { teamId: 'TIG', seed: null }, { teamId: 'EAG', seed: null }] }, 'teams');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    await renderWithTheme(<TeamsStepScreen />);
    await fireEvent.changeText(screen.getByTestId('twiz-input-seed-2'), '1');
    expect(screen.getByTestId('twiz-btn-next')).toBeDisabled();
    expect(screen.getByTestId('twiz-text-next-hint')).toHaveTextContent('Two teams have the same seed.');
    await fireEvent.press(screen.getByTestId('twiz-btn-next'));
    expect(useTournamentWizardStore.getState().saveStep).not.toHaveBeenCalled();
  });

  it('keeps Points first in the tie-breaker chain: it cannot be moved or removed (W-N4)', async () => {
    liveWizard({ tournamentId: 't1', rules: cupSnapshot({ withFixtures: false }).rules }, 'rules');
    await renderWithTheme(<RulesStepScreen />);
    expect(screen.queryByTestId('twiz-btn-tiebreaker-remove-1')).toBeNull();
    expect(screen.queryByTestId('twiz-btn-tiebreaker-down-1')).toBeNull();
    expect(screen.getByTestId('twiz-btn-tiebreaker-up-2')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('twiz-btn-tiebreaker-remove-2'));
    expect(useTournamentWizardStore.getState().draft.rules?.tieBreakers[0]).toBe('points');
    expect(screen.getByTestId('twiz-text-tiebreak-chain')).toHaveTextContent(/^Points → /);
  });

  it('virtualises the wizard team list for 128 teams (§27)', async () => {
    const ids = Array.from({ length: 128 }, (_, index) => `T${String(index + 1).padStart(3, '0')}`);
    liveWizard({ tournamentId: 't1', teams: ids.map((teamId) => ({ teamId, seed: null })) }, 'teams');
    useTeamLibraryStore.setState({ teams: ids.map((teamId) => teamView(teamId, `Team ${teamId}`).team) });
    await renderWithTheme(<TeamsStepScreen />);
    expect(screen.getByTestId('twiz-text-team-count')).toHaveTextContent('128 teams');
    expect(screen.getByTestId('twiz-row-team-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('twiz-row-team-128')).toBeNull();
  });
});

describe('Wizard pools: seeds, the replace warning and undo (§30–§32)', () => {
  async function renderPools(teams: readonly string[] = EIGHT) {
    const base = cupDraft(cupSnapshot({ withFixtures: false }), false);
    liveWizard({ ...base, teams: teams.map((teamId) => ({ teamId, seed: null })) }, 'pools');
    useTeamLibraryStore.setState({ teams: libraryTeams(teams) });
    await renderWithTheme(<PoolsStepScreen />);
  }

  async function drawWithSeed(seed: string, confirm: boolean) {
    await fireEvent.changeText(screen.getByTestId('twiz-input-pool-seed'), seed);
    await fireEvent.press(screen.getByTestId('twiz-btn-pools-random'));
    if (confirm) {
      expect(screen.getByTestId('twiz-text-replace-warning')).toHaveTextContent('Current pool arrangement will be replaced.');
      await fireEvent.press(screen.getByTestId('dialog-btn-confirm'));
    }
  }

  it('warns before a seeded ("By seed") draw replaces existing pools, and Cancel keeps them', async () => {
    await renderPools();
    await drawWithSeed('847291', false);
    const drawn = useTournamentWizardStore.getState().draft.poolAssignment;
    await fireEvent.press(screen.getByTestId('twiz-btn-pools-seeded'));
    expect(screen.getByTestId('twiz-text-replace-warning')).toHaveTextContent('Current pool arrangement will be replaced.');
    await fireEvent.press(screen.getByTestId('dialog-btn-cancel'));
    expect(useTournamentWizardStore.getState().draft.poolAssignment).toBe(drawn);
  });

  it('undo from the toast restores the replaced arrangement and says so', async () => {
    await renderPools();
    await drawWithSeed('111', false);
    const first = useTournamentWizardStore.getState().draft.poolAssignment;
    await drawWithSeed('222', true);
    expect(useTournamentWizardStore.getState().draft.poolAssignment).not.toEqual(first);
    await act(async () => {
      toastAction('Undo')();
    });
    expect(useTournamentWizardStore.getState().draft.poolAssignment).toEqual(first);
    expect(toasts()).toContainEqual(expect.objectContaining({ message: 'Previous pools restored' }));
  });

  it('after Restore, the seed shown is the seed of the arrangement on screen, not of the discarded draw', async () => {
    await renderPools();
    await drawWithSeed('111', false);
    expect(screen.getByTestId('twiz-text-pool-seed')).toHaveTextContent('Random draw · seed 111');
    await drawWithSeed('222', true);
    expect(screen.getByTestId('twiz-text-pool-seed')).toHaveTextContent('Random draw · seed 222');
    await fireEvent.press(screen.getByTestId('twiz-btn-restore-pools'));
    expect(useTournamentWizardStore.getState().draft.poolAssignment?.seed).toBe(111);
    expect(screen.queryByText(/seed 222/)).toBeNull();
  });

  it('drops the "Restore previous arrangement" link once the organizer makes the next change (USER_FLOWS 4.2 step 5)', async () => {
    await renderPools();
    await drawWithSeed('111', false);
    await drawWithSeed('222', true);
    expect(screen.getByTestId('twiz-btn-restore-pools')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('twiz-row-pool-a-1'));
    await fireEvent.press(screen.getByTestId('pools-btn-target-b'));
    expect(useTournamentWizardStore.getState().draft.poolAssignment?.pools[1].members).toHaveLength(5);
    expect(screen.queryByTestId('twiz-btn-restore-pools')).toBeNull();
  });

  it('stops claiming the random seed once a member is moved by hand (PoolAssignment.seed is null for manual arrangements)', async () => {
    await renderPools();
    await drawWithSeed('847291', false);
    await fireEvent.press(screen.getByTestId('twiz-row-pool-a-1'));
    await fireEvent.press(screen.getByTestId('pools-btn-target-b'));
    expect(screen.queryByText('Random draw · seed 847291')).toBeNull();
    expect(useTournamentWizardStore.getState().draft.poolAssignment?.seed).toBeNull();
  });

  it('warns "Current pool arrangement will be replaced." before a pool-count change discards drawn pools (§31)', async () => {
    await renderPools(TEN);
    const stepper = screen.getByTestId('twiz-input-pool-count');
    await fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await drawWithSeed('847291', false);
    const drawn = useTournamentWizardStore.getState().draft.poolAssignment;
    expect(drawn?.pools.map((pool) => pool.members.length)).toEqual([4, 3, 3]);
    await fireEvent(screen.getByTestId('twiz-input-pool-count'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.queryByTestId('pools-row-unassigned-1')).toBeNull();
    expect(screen.getByTestId('twiz-text-replace-warning')).toHaveTextContent('Current pool arrangement will be replaced.');
  });

  it('shows the uneven-pool warning as soon as the pool count gives uneven sizes, before any draw (USER_FLOWS 4.2 step 1)', async () => {
    await renderPools(TEN);
    await fireEvent(screen.getByTestId('twiz-input-pool-count'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('twiz-text-pool-sizes')).toHaveTextContent('4 · 3 · 3');
    expect(screen.getByTestId('twiz-text-uneven-warning')).toHaveTextContent('Teams in different pools may play different numbers of matches.');
  });

  it('does not show the uneven warning for two even pools filled by hand (E2E-06)', async () => {
    await renderPools();
    await fireEvent.press(screen.getByTestId('twiz-btn-pools-manual'));
    for (const target of ['a', 'a', 'a', 'a', 'b', 'b', 'b', 'b']) {
      await fireEvent.press(screen.getByTestId('pools-row-unassigned-1'));
      await fireEvent.press(screen.getByTestId(`pools-btn-target-${target}`));
    }
    expect(useTournamentWizardStore.getState().draft.poolAssignment?.pools.map((pool) => pool.members.length)).toEqual([4, 4]);
    expect(screen.queryByTestId('twiz-text-uneven-warning')).toBeNull();
    expect(screen.getByTestId('twiz-btn-next')).toBeEnabled();
  });
});

describe('Pools editor after fixtures: impact before apply (§33, §34, §99)', () => {
  it('applies a move only on Continue, with exactly the change and the preview object that were reviewed', async () => {
    loadTournament(cupSnapshot());
    const { previewChange, previews } = stubbedPreview({ headline: 'Moving changes 7 fixtures.' });
    let release: (ok: boolean) => void = () => undefined;
    const applyChange = jest.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    useTournamentStore.setState({ previewChange, applyChange });
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openPoolMemberMenu('pools-row-a-4');
    await fireEvent.press(screen.getByTestId('pools-btn-move'));
    await fireEvent.press(screen.getByTestId('pools-target-row-1'));
    await waitFor(() => expect(screen.getByTestId('sheet-impact')).toBeOnTheScreen());
    expect(applyChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    expect(screen.getByTestId('impact-btn-continue').props.accessibilityState).toMatchObject({ busy: true });
    expect(applyChange).toHaveBeenCalledTimes(1);
    const call = applyChange.mock.calls[0] as unknown as [ProposedChange, string | null, ChangePreview];
    expect(call[0]).toBe(previewChange.mock.calls[0][0]);
    expect(call[2]).toBe(previews[0]);
    await act(async () => {
      release(true);
    });
    await waitFor(() => expect(screen.queryByTestId('sheet-impact')).toBeNull());
  });

  it('shows no sheet and applies nothing when the preview fails', async () => {
    loadTournament(cupSnapshot());
    const previewChange = jest.fn(async () => {
      useTournamentStore.setState({ error: { code: 'STORAGE', message: 'Could not read the tournament.', domainCode: null, detail: null } });
      return null;
    });
    useTournamentStore.setState({ previewChange });
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openPoolMemberMenu('pools-row-a-1');
    await fireEvent.press(screen.getByTestId('pools-btn-swap'));
    await fireEvent.press(screen.getByTestId('pools-swap-row-1'));
    await waitFor(() => expect(previewChange).toHaveBeenCalled());
    expect(screen.queryByTestId('sheet-impact')).toBeNull();
    expect(useTournamentStore.getState().applyChange).not.toHaveBeenCalled();
    expect(toasts()).toContainEqual(expect.objectContaining({ kind: 'error' }));
  });

  it('after CONFLICT, rebuilds the move from the refreshed tournament instead of the stale one', async () => {
    const base = cupSnapshot();
    loadTournament(base);
    const playedMeanwhile = playPair(base, 'LIO', 'HAW', 'LIO');
    const nowPlayed = playedMeanwhile.fixtures.find((fixture) => fixture.status === 'completed');
    if (!nowPlayed) {
      throw new Error('Expected a played fixture');
    }
    const { previewChange } = stubbedPreview();
    const applyChange = jest.fn(async () => {
      useTournamentStore.setState({ error: { code: 'CONFLICT', message: 'Changed', domainCode: null, detail: null } });
      return false;
    });
    const refresh = jest.fn(async () => {
      loadTournament(playedMeanwhile);
      return true;
    });
    useTournamentStore.setState({ previewChange, applyChange, refresh });
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openPoolMemberMenu('pools-row-a-4');
    await fireEvent.press(screen.getByTestId('pools-btn-move'));
    await fireEvent.press(screen.getByTestId('pools-target-row-1'));
    await waitFor(() => expect(screen.getByTestId('impact-btn-continue')).toBeOnTheScreen());
    const first = previewChange.mock.calls[0][0];
    expect(first.kind === 'pool_move' && first.removeFixtureIds).toContain(nowPlayed.id);
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledTimes(2));
    const rebuilt = previewChange.mock.calls[1][0];
    expect(rebuilt.kind).toBe('pool_move');
    expect(rebuilt.kind === 'pool_move' ? rebuilt.removeFixtureIds : []).not.toContain(nowPlayed.id);
  });

  it('offers Undo after a re-draw that goes through a second impact preview, never a direct apply', async () => {
    const snapshot = cupSnapshot();
    loadTournament(snapshot);
    const { previewChange } = stubbedPreview();
    const applyChange = jest.fn(async () => true);
    useTournamentStore.setState({ previewChange, applyChange });
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('pools-btn-redraw'));
    await fireEvent.changeText(screen.getByTestId('pools-input-seed'), '847291');
    await fireEvent.press(screen.getByTestId('pools-btn-draw'));
    expect(screen.getByTestId('pools-text-replace-warning')).toHaveTextContent('Current pool arrangement will be replaced.');
    await fireEvent.press(screen.getByTestId('dialog-btn-confirm'));
    await waitFor(() => expect(screen.getByTestId('impact-btn-continue')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledTimes(1));
    await act(async () => {
      toastAction('Undo')();
    });
    await waitFor(() => expect(previewChange).toHaveBeenCalledTimes(2));
    const undo = previewChange.mock.calls[1][0];
    const groups = orderedStages(snapshot)[0];
    const original = snapshot.pools
      .filter((pool) => pool.stageId === groups.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((pool) => ({ poolId: pool.id, members: snapshot.poolEntries.filter((entry) => entry.poolId === pool.id).map((entry) => entry.side) }));
    expect(undo).toMatchObject({ kind: 'pools_replace', pools: original });
    expect(applyChange).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('sheet-impact')).toBeOnTheScreen());
  });

  it('keeps Continue disabled until the reason has at least 3 non-space characters (USER_FLOWS §0)', async () => {
    loadTournament(cupSnapshot());
    const { previewChange } = stubbedPreview({ requiresReason: true, severity: 'destructive', completedMatchesAffected: 1 });
    useTournamentStore.setState({ previewChange });
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openPoolMemberMenu('pools-row-a-4');
    await fireEvent.press(screen.getByTestId('pools-btn-move'));
    await fireEvent.press(screen.getByTestId('pools-target-row-1'));
    await waitFor(() => expect(screen.getByTestId('impact-input-reason')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('impact-input-reason'), ' x ');
    expect(screen.getByTestId('impact-btn-continue')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('impact-input-reason'), 'Hawks asked to move');
    expect(screen.getByTestId('impact-btn-continue')).toBeEnabled();
  });

  it('asks for a reason for a pool move once completed matches exist (edit policy "confirm", STATE_MACHINES §3)', async () => {
    const snapshot = playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO');
    const data = loadTournament(snapshot);
    expect(editPolicy(tournamentIndex(data.snapshot, data.evaluation)).pools).toBe('confirm');
    const previewChange = realPreview();
    const applyChange = jest.fn(async () => true);
    useTournamentStore.setState({ previewChange, applyChange });
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openPoolMemberMenu('pools-row-a-4');
    await fireEvent.press(screen.getByTestId('pools-btn-move'));
    await fireEvent.press(screen.getByTestId('pools-target-row-1'));
    await waitFor(() => expect(screen.getByTestId('sheet-impact')).toBeOnTheScreen());
    expect(screen.getByTestId('impact-input-reason')).toBeOnTheScreen();
    expect(screen.getByTestId('impact-btn-continue')).toBeDisabled();
  });

  it('lists every removed and created fixture as an impact-row-<n> line with + / − glyphs (E2E plan §3.1, E2E-08)', async () => {
    loadTournament(cupSnapshot());
    useTournamentStore.setState({ previewChange: realPreview() });
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openPoolMemberMenu('pools-row-a-4');
    await fireEvent.press(screen.getByTestId('pools-btn-move'));
    await fireEvent.press(screen.getByTestId('pools-target-row-1'));
    await waitFor(() => expect(screen.getByTestId('sheet-impact')).toBeOnTheScreen());
    const sheet = screen.getByTestId('sheet-impact');
    expect(within(sheet).getAllByText('−')).toHaveLength(3);
    expect(within(sheet).getAllByText('+')).toHaveLength(4);
    expect(screen.getByTestId('impact-row-1')).toBeOnTheScreen();
    expect(screen.getByTestId('impact-row-7')).toBeOnTheScreen();
  });
});

describe('Fixtures: preview before confirm, and edits once results exist (§36, §38, §55)', () => {
  it('lets the organizer swap sides in the preview; nothing is written until Confirm, which saves the edited plan', async () => {
    const snapshot = cupSnapshot();
    liveWizard({ ...cupDraft(snapshot, true), fixturePlan: groupPlan(snapshot) }, 'fixtures');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    useTournamentStore.setState({ tournamentId: 't1', snapshot: { ...snapshot, fixtures: [] } });
    const planAtSave: (FixturePlan | null)[] = [];
    useTournamentWizardStore.setState({
      saveStep: jest.fn(async () => {
        planAtSave.push(useTournamentWizardStore.getState().draft.fixturePlan);
        return true;
      }),
    });
    const before = groupPlan(snapshot).fixtures.find((fixture) => fixture.matchNumber === 1);
    await renderWithTheme(<FixturesStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-btn-edit-fixture-1'));
    await fireEvent.press(screen.getByTestId('twiz-btn-swap-sides'));
    const edited = useTournamentWizardStore.getState().draft.fixturePlan?.fixtures.find((fixture) => fixture.matchNumber === 1);
    expect(edited?.sideA).toEqual(before?.sideB);
    expect(edited?.sideB).toEqual(before?.sideA);
    const store = useTournamentStore.getState();
    expect(useTournamentWizardStore.getState().saveStep).not.toHaveBeenCalled();
    for (const write of [store.confirmFixtures, store.updateFixture, store.addFixture, store.applyChange]) {
      expect(write).not.toHaveBeenCalled();
    }
    expect(screen.getByText('Not saved yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('twiz-btn-confirm-fixtures'));
    await waitFor(() => expect(useTournamentWizardStore.getState().saveStep).toHaveBeenCalledTimes(1));
    expect(planAtSave[0]?.fixtures.find((fixture) => fixture.matchNumber === 1)?.sideA).toEqual(before?.sideB);
  });

  it('needs a fresh Confirm after the organizer edits an already confirmed preview, so edits are never left unsaved', async () => {
    const snapshot = cupSnapshot();
    liveWizard({ ...cupDraft(snapshot, true), fixturePlan: groupPlan(snapshot) }, 'fixtures');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    useTournamentStore.setState({ tournamentId: 't1', snapshot: { ...snapshot, fixtures: [] } });
    await renderWithTheme(<FixturesStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-btn-confirm-fixtures'));
    await waitFor(() => expect(screen.getByTestId('twiz-btn-next')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('twiz-btn-edit-fixture-2'));
    await fireEvent.changeText(screen.getByTestId('schedule-input-date'), '2026-09-13');
    await fireEvent.press(screen.getByTestId('schedule-btn-save'));
    expect(screen.getByText('Not saved yet')).toBeOnTheScreen();
    expect(screen.getByTestId('twiz-btn-next')).toBeDisabled();
    expect(screen.getByTestId('twiz-btn-confirm-fixtures')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('twiz-btn-confirm-fixtures'));
    await waitFor(() => expect(useTournamentWizardStore.getState().saveStep).toHaveBeenCalledTimes(2));
  });

  it('asks for a reason before a rules change once completed matches exist (AC-E8-09)', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 3));
    expect(editPolicy(tournamentIndex(data.snapshot, data.evaluation)).rules).toBe('confirm');
    const applyChange = jest.fn(async () => true);
    useTournamentStore.setState({ previewChange: realPreview(), applyChange });
    await renderWithTheme(<ManageTournamentScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tmanage-btn-rules'));
    await fireEvent(screen.getByTestId('tmanage-input-points-win'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await fireEvent.press(screen.getByTestId('tmanage-btn-rules-review'));
    await waitFor(() => expect(screen.getByTestId('sheet-impact')).toBeOnTheScreen());
    expect(screen.getByTestId('impact-btn-continue')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    expect(applyChange).not.toHaveBeenCalled();
  });

  it('locks a completed fixture: no schedule, team or status edit can bypass the correction path', async () => {
    const snapshot = playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO');
    loadTournament(snapshot);
    const fixture = snapshot.fixtures.find((candidate) => candidate.status === 'completed');
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={fixture?.id ?? ''} />);
    expect(screen.getByTestId('fixture-text-result')).toHaveTextContent('Lions won by 6 runs');
    for (const id of ['fixture-btn-edit', 'fixture-btn-swap-sides', 'fixture-btn-postpone', 'fixture-btn-cancel', 'fixture-btn-start-match']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByText(/Played fixtures keep their date and teams/)).toBeOnTheScreen();
  });

  it('shows WHAT WILL CHANGE (or requires a reason) before rescheduling a replay of an abandoned match with recorded data (§99, §55)', async () => {
    const base = cupSnapshot();
    const groups = orderedStages(base)[0];
    const target = base.fixtures.find((fixture) => fixture.stageId === groups.id && fixture.matchNumber === 1);
    if (!target || target.sideA.kind !== 'team' || target.sideB.kind !== 'team') {
      throw new Error('Expected a team fixture');
    }
    const matchId = 'm-abandoned';
    const snapshot: TournamentSnapshot = {
      ...base,
      stages: base.stages.map((stage) => (stage.id === groups.id ? { ...stage, config: { ...stage.config, abandonedMatches: 'replay' } } : stage)),
      fixtures: base.fixtures.map((fixture) =>
        fixture.id === target.id
          ? { ...fixture, status: 'abandoned', matchId, matchSides: { teamAId: fixture.sideA.kind === 'team' ? fixture.sideA.teamId : '', teamBId: fixture.sideB.kind === 'team' ? fixture.sideB.teamId : '' } }
          : fixture,
      ),
      summaries: {
        [matchId]: summary({
          matchId,
          teamAId: target.sideA.teamId,
          teamBId: target.sideB.teamId,
          result: abandonedResult('Rain'),
          innings: [inningsSummary({ inningsIndex: 0, battingTeamId: target.sideA.teamId, bowlingTeamId: target.sideB.teamId, runs: 40, wickets: 1, legalBalls: 30, allottedBalls: 120 })],
          completedAt: AT,
        }),
      },
    };
    loadTournament(snapshot);
    const { previewChange } = stubbedPreview();
    useTournamentStore.setState({ previewChange });
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={target.id} />);
    await fireEvent.press(screen.getByTestId('fixture-btn-reschedule'));
    await fireEvent.changeText(screen.getByTestId('schedule-input-date'), '2026-09-30');
    await fireEvent.press(screen.getByTestId('schedule-btn-save'));
    const updateFixture = useTournamentStore.getState().updateFixture;
    const reasonless = jest.mocked(updateFixture).mock.calls.filter(([, , reason]) => reason === null);
    expect(reasonless).toHaveLength(0);
    expect(screen.getByTestId('schedule-text-replay')).toHaveTextContent(/abandoned with recorded scores/);
    expect(screen.getByTestId('schedule-btn-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('schedule-input-reason'), 'Replay agreed by both captains');
    await fireEvent.press(screen.getByTestId('schedule-btn-save'));
    await waitFor(() =>
      expect(updateFixture).toHaveBeenCalledWith(target.id, { status: 'rescheduled', scheduledDate: '2026-09-30', scheduledTime: null }, 'Replay agreed by both captains'),
    );
  });
});

describe('Standings render the evaluation, not their own maths (§42, §50, §51, §98)', () => {
  it('shows exactly the values in the store evaluation even when they disagree with the snapshot', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 6));
    useTournamentStore.setState({
      evaluation: doctorRows(data.evaluation, (row) =>
        row.teamId === 'LIO' ? { ...row, played: 7, won: 5, lost: 1, noResult: 1, points: 99, nrr: 9.999 } : row,
      ),
    });
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('standings-cell-a-1-team')).toHaveTextContent('Lions');
    expect(screen.getByTestId('standings-cell-a-1-p')).toHaveTextContent('7');
    expect(screen.getByTestId('standings-cell-a-1-w')).toHaveTextContent('5');
    expect(screen.getByTestId('standings-cell-a-1-l')).toHaveTextContent('1');
    expect(screen.getByTestId('standings-cell-a-1-nr')).toHaveTextContent('1');
    expect(screen.getByTestId('standings-cell-a-1-pts')).toHaveTextContent('99');
    expect(screen.getByTestId('standings-cell-a-1-nrr')).toHaveTextContent('+9.999');
  });

  it('renders the qualification explanation and the tie-break note verbatim, on standings and on the dashboard (E2E plan §2.6)', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 6));
    const explanation = 'Checked by hand: this team is through on the organizer sheet.';
    const note = 'Ahead of Eagles on net run rate (+0.512 vs +0.231)';
    useTournamentStore.setState({
      evaluation: doctorRows(data.evaluation, (row) => {
        if ((row.teamId === 'LIO' || (POOL_B_IDS as readonly string[]).includes(row.teamId ?? '')) && row.qualification) {
          return { ...row, qualification: { ...row.qualification, explanation } };
        }
        if (row.teamId === 'TIG') {
          return { ...row, tieBreak: { separatedBy: 'nrr', aboveTeamId: 'EAG', detail: note } };
        }
        return row;
      }),
    });
    const view = await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('standings-text-qual-a-1')).toHaveTextContent(explanation, { exact: true });
    expect(screen.getByTestId('standings-text-tiebreak-a-2')).toHaveTextContent(note, { exact: true });
    await view.unmount();
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    expect(screen.getByTestId('dash-text-qualification')).toHaveTextContent(explanation, { exact: true });
  });

  it('inserts the T column after L only when a row has a tie, and shows shared positions as "=2"', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 6));
    useTournamentStore.setState({
      evaluation: doctorRows(data.evaluation, (row) => {
        if (row.teamId === 'TIG' || row.teamId === 'EAG') {
          return { ...row, position: 2, sharedPosition: true, tied: row.teamId === 'TIG' ? 1 : 0 };
        }
        return row;
      }),
    });
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('standings-header', { includeHiddenElements: true })).toHaveTextContent('PosTeamPWLTNRPtsNRR');
    expect(screen.getByTestId('standings-cell-a-2-pos')).toHaveTextContent('=2');
    expect(screen.getByTestId('standings-cell-a-3-pos')).toHaveTextContent('=2');
    expect(screen.getByTestId('standings-cell-a-2-t')).toHaveTextContent('1');
  });

  it('flags an unresolved tie on a slot boundary in words with a Resolve tie action (USER_FLOWS 4.5 step 2)', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 6));
    useTournamentStore.setState({
      evaluation: {
        ...data.evaluation,
        stages: data.evaluation.stages.map((stage, index) =>
          index === 0 ? { ...stage, tables: stage.tables.map((table, position) => (position === 0 ? { ...table, unresolvedTies: [['TIG', 'EAG']] } : table)) } : stage,
        ),
      },
    });
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('standings-text-tie-1')).toHaveTextContent(/Tigers and Eagles can't be separated/);
    await fireEvent.press(screen.getByTestId('standings-btn-resolve-tie-1'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/tournament/[tournamentId]/qualification', params: { tournamentId: 't1' } });
  });

  it('shows a withdrawn team as "(withdrawn)" and never gives it a qualification badge (W-D2)', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 6));
    useTournamentStore.setState({
      evaluation: doctorRows(data.evaluation, (row) => (row.teamId === 'HAW' ? { ...row, membership: 'withdrawn' } : row)),
    });
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('standings-cell-a-4-team')).toHaveTextContent('Hawks (withdrawn)');
    expect(screen.queryByTestId('standings-badge-qual-a-4')).toBeNull();
    expect(screen.queryByTestId('standings-text-qual-a-4')).toBeNull();
  });

  it('marks a team whose points were adjusted by the organizer as "Manual Override" in the table (§47, §54)', async () => {
    const base = playGroups(cupSnapshot(), 6);
    const groups = orderedStages(base)[0];
    const poolA = base.pools.filter((pool) => pool.stageId === groups.id).sort((a, b) => a.orderIndex - b.orderIndex)[0];
    loadTournament({
      ...base,
      overrides: [
        {
          id: 'ov-points',
          tournamentId: 't1',
          kind: 'points_adjustment',
          stageId: groups.id,
          poolId: poolA.id,
          teamId: 'LIO',
          points: -2,
          reason: 'Fielded an ineligible player',
          createdAt: AT,
          revokedAt: null,
          revokeReason: null,
        },
      ],
    });
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    const position = poolRowFor('Lions');
    expect(screen.getByTestId(`standings-cell-a-${position}-pts`)).toHaveTextContent('4');
    expect(within(screen.getByTestId(`standings-row-a-${position}`)).getByText('Manual Override')).toBeOnTheScreen();
  });

  it('marks a qualification override as "Manual Override" on the standings row too, never by colour alone', async () => {
    const base = playGroups(cupSnapshot(), 6);
    const knockout = orderedStages(base)[1];
    const slot = base.slots.find((candidate) => candidate.stageId === knockout.id && candidate.label === 'A2');
    loadTournament({
      ...base,
      overrides: [
        {
          id: 'ov1',
          tournamentId: 't1',
          kind: 'qualification',
          stageId: knockout.id,
          teamId: 'EAG',
          action: 'qualify',
          slotId: slot?.id ?? null,
          poolId: null,
          reason: 'Pool washed out',
          createdAt: AT,
          revokedAt: null,
          revokeReason: null,
        },
      ],
    });
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    const position = poolRowFor('Eagles');
    expect(screen.getByTestId(`standings-badge-qual-a-${position}`)).toHaveTextContent('Manual Override');
    expect(screen.getByTestId(`standings-row-a-${position}`).props.accessibilityLabel).toMatch(/Manual Override/);
  });

  it('never imports the standings, NRR, qualification, evaluation, what-if, impact or stats engines into UI code', () => {
    const forbidden = /^import\s+(?!type\b)[^;]*from\s+'@\/domain\/(tournament\/(nrr|standings|qualification|evaluate|whatif|impact|stats)|scoring\/(replay|stats|summary))'/m;
    const offenders = featureSources()
      .filter(({ text }) => text.split(/;\s*\n/).some((statement) => forbidden.test(statement.trim())))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
    const calls = featureSources()
      .filter(({ text }) => /\b(evaluateTournament|computeStandings|computeNrr|simulate|computeImpact|computeTournamentStats)\s*\(/.test(text))
      .map(({ file }) => file);
    expect(calls).toEqual([]);
  });

  it('sizes the standings columns from the design-system table widths (DESIGN_SYSTEM §6.5: counts 32, NRR 64)', async () => {
    loadTournament(playGroups(cupSnapshot(), 6));
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(ancestorWidth(screen.getByTestId('standings-cell-a-1-p'))).toBe(32);
    expect(ancestorWidth(screen.getByTestId('standings-cell-a-1-nrr'))).toBe(64);
  });

  it('scrolls the standings table horizontally at large font scales (W-D2 "Large text", RESPONSIVE §5)', async () => {
    const original = Dimensions.get('window');
    const large = { ...original, fontScale: 1.6 };
    Dimensions.set({ window: large, screen: large });
    try {
      loadTournament(playGroups(cupSnapshot(), 6));
      await renderWithTheme(<StandingsScreen tournamentId="t1" />);
      expect(hasHorizontalScrollAncestor(screen.getByTestId('standings-cell-a-1-nrr'))).toBe(true);
    } finally {
      Dimensions.set({ window: original, screen: original });
    }
  });
});

describe('Manual overrides need a reason and read "Manual Override" (§47)', () => {
  async function openOverrideFor(name: string) {
    for (let n = 1; n <= 8; n += 1) {
      const row = screen.queryByTestId(`qual-row-${n}`);
      if (row && within(row).queryByText(name)) {
        await fireEvent.press(screen.getByTestId(`qual-btn-override-${n}`));
        return;
      }
    }
    throw new Error(`No qualification row for ${name}`);
  }

  it('keeps Review disabled for a one-character reason (USER_FLOWS §0: at least 3 non-space characters)', async () => {
    loadTournament(playGroups(cupSnapshot(), 6));
    const { previewChange } = stubbedPreview({ requiresReason: true });
    useTournamentStore.setState({ previewChange });
    await renderWithTheme(<QualificationScreen tournamentId="t1" />);
    await openOverrideFor('Eagles');
    await fireEvent.press(screen.getByTestId('override-chip-eliminate'));
    await fireEvent.changeText(screen.getByTestId('override-input-reason'), '   ');
    expect(screen.getByTestId('override-btn-apply')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('override-input-reason'), 'k');
    expect(screen.getByTestId('override-btn-apply')).toBeDisabled();
  });

  it('sends an eliminate override with its reason through the impact sheet and applies it only on Continue', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 6));
    const { previewChange, previews } = stubbedPreview({ requiresReason: true });
    const applyChange = jest.fn(async () => true);
    useTournamentStore.setState({ previewChange, applyChange });
    await renderWithTheme(<QualificationScreen tournamentId="t1" />);
    await openOverrideFor('Tigers');
    await fireEvent.press(screen.getByTestId('override-chip-eliminate'));
    await fireEvent.changeText(screen.getByTestId('override-input-reason'), 'Forfeited the last match');
    await fireEvent.press(screen.getByTestId('override-btn-apply'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledTimes(1));
    const change = previewChange.mock.calls[0][0];
    expect(change).toMatchObject({
      kind: 'override_apply',
      override: { kind: 'qualification', action: 'eliminate', teamId: 'TIG', reason: 'Forfeited the last match', stageId: orderedStages(data.snapshot)[1].id },
    });
    expect(applyChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledWith(change, 'Forfeited the last match', previews[0]));
    expect(toasts()).toContainEqual(expect.objectContaining({ kind: 'success', message: 'Manual Override applied' }));
  });
});

describe('Bracket with a non-power-of-two field (§46)', () => {
  it('gives byes to the top three seeds of a five-team knockout and labels each bye box', async () => {
    loadTournament(knockoutSnapshot(5));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    expect(screen.getAllByText('Bye: straight through to the next round')).toHaveLength(3);
    expect(screen.getByTestId('bracket-text-byes')).toHaveTextContent('Byes: Seed 1, Seed 2 and Seed 3 go straight through to the next round.');
    const byeBoxes = [0, 1, 2, 3]
      .map((position) => screen.getByTestId(`bracket-row-1-${position}`))
      .filter((box) => /has a bye/.test(String(box.props.accessibilityLabel)));
    expect(byeBoxes).toHaveLength(3);
    for (const box of byeBoxes) {
      expect(box.props.accessibilityRole).toBe('text');
    }
    expect(screen.getAllByText(/Seed 4 v Seed 5|Seed 5 v Seed 4/)).toHaveLength(1);
  });

  it('draws a twelve-team knockout as a 16-slot first round with four byes and a quarterfinal column', async () => {
    loadTournament(knockoutSnapshot(12));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    const firstRound = Array.from({ length: 8 }, (_, position) => screen.getByTestId(`bracket-row-1-${position}`));
    expect(firstRound.filter((box) => /has a bye/.test(String(box.props.accessibilityLabel)))).toHaveLength(4);
    const byeNote = textOf(screen.getByTestId('bracket-text-byes'));
    expect(byeNote).toMatch(/^Byes: .* go straight through to the next round\.$/);
    expect(['Seed 1', 'Seed 2', 'Seed 3', 'Seed 4'].every((name) => byeNote.includes(name))).toBe(true);
    expect(byeNote).not.toMatch(/Seed (5|6|7|8|9|10|11|12)/);
    expect(screen.getByTestId('bracket-row-2-3')).toBeOnTheScreen();
    expect(screen.queryByTestId('bracket-row-1-8')).toBeNull();
  });

  it('shows slot labels on a bye box and on match boxes while the qualifiers are unknown', async () => {
    const base = cupSnapshot({ withFixtures: false });
    const knockout = orderedStages(base)[1];
    const groups = orderedStages(base)[0];
    const pools = base.pools.filter((pool) => pool.stageId === groups.id).sort((a, b) => a.orderIndex - b.orderIndex);
    const labels = [
      ['A1', 0, 1],
      ['B1', 1, 1],
      ['A2', 0, 2],
      ['B2', 1, 2],
      ['A3', 0, 3],
      ['B3', 1, 3],
    ] as const;
    const slots = labels.map(([label, pool, position], index) => ({
      id: `s-${label}`,
      stageId: knockout.id,
      index,
      label,
      role: 'entry' as const,
      source: { kind: 'pool_position' as const, stageId: groups.id, poolId: pools[pool].id, position },
      seed: index + 1,
    }));
    const bracketIds = counter('kb');
    const plan = knockoutBracket(
      slots.map((slot) => ({ kind: 'slot', slotId: slot.id })),
      {
        thirdPlacePlayoff: false,
        rounds: null,
        firstSlotIndex: slots.length,
        defaults: { tournamentId: 't1', stageId: knockout.id, poolId: null, formatId: null, matchRules: null, venueId: null, startMatchNumber: 1 },
      },
      bracketIds,
    );
    const snapshot: TournamentSnapshot = {
      ...base,
      slots: [...slots, ...plan.slots],
      fixtures: plan.fixtures.map((draft) => ({ ...draft, matchId: null, matchSides: null, createdAt: AT, updatedAt: AT })),
    };
    loadTournament(snapshot);
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    const byeTexts = [0, 1, 2, 3]
      .map((position) => screen.getByTestId(`bracket-row-1-${position}`))
      .filter((box) => /has a bye/.test(String(box.props.accessibilityLabel)))
      .map((box) => String(box.props.accessibilityLabel));
    expect(byeTexts).toHaveLength(2);
    expect(byeTexts.join(' ')).toMatch(/A1/);
    expect(byeTexts.join(' ')).toMatch(/B1/);
    expect(screen.getAllByText(/^(A2|B2|A3|B3) v (A2|B2|A3|B3)$/)).toHaveLength(2);
  });
});

describe('What if: simulation only (§48)', () => {
  function remaining(): number {
    const snapshot = useTournamentStore.getState().snapshot;
    const fixture = snapshot?.fixtures.find((candidate) => candidate.status === 'scheduled' && candidate.poolId !== null);
    if (!fixture) {
      throw new Error('No remaining fixture');
    }
    return fixture.matchNumber;
  }

  it('never calls any write action of any store across a full simulate, clear and re-run', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 5));
    const whatIf = jest.fn(async (hypotheticals: readonly HypotheticalResult[]) => simulate(data.snapshot, hypotheticals));
    useTournamentStore.setState({ whatIf });
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    const mn = remaining();
    for (const chip of ['side-b', 'tie']) {
      await fireEvent.press(screen.getByTestId(`whatif-row-${mn}`));
      await fireEvent.press(screen.getByTestId(`whatif-chip-${mn}-${chip}`));
      await fireEvent.press(screen.getByTestId('whatif-btn-done'));
      await fireEvent.press(screen.getByTestId('whatif-btn-run'));
      await waitFor(() => expect(screen.getByTestId('whatif-result')).toBeOnTheScreen());
      await fireEvent.press(screen.getByTestId('whatif-btn-reset'));
    }
    expect(whatIf).toHaveBeenCalledTimes(2);
    const tournament = useTournamentStore.getState();
    const writes = [
      tournament.applyChange,
      tournament.previewChange,
      tournament.updateFixture,
      tournament.addFixture,
      tournament.confirmFixtures,
      tournament.generateFixtures,
      tournament.setStatus,
      tournament.updateInfo,
      tournament.delete,
      tournament.saveAsTemplate,
      useTournamentWizardStore.getState().saveStep,
      useTournamentWizardStore.getState().commit,
      useMatchSetupStore.getState().startFromFixture,
      useMatchSetupStore.getState().submit,
      useBackupStore.getState().exportBackup,
      useExportStore.getState().tournamentPdf,
    ];
    for (const write of writes) {
      expect(write).not.toHaveBeenCalled();
    }
    expect(tournament.snapshot).toBe(data.snapshot);
    expect(tournament.evaluation).toBe(data.evaluation);
    expect(screen.queryByText(/^(Apply|Save|Confirm)/)).toBeNull();
  });

  it('renders the simulated table from the simulation result, not from its own maths', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 5));
    const whatIf = jest.fn(async (hypotheticals: readonly HypotheticalResult[]): Promise<WhatIfResult> => {
      const real = simulate(data.snapshot, hypotheticals);
      return {
        ...real,
        after: {
          ...real.after,
          tables: real.after.tables.map((table) => ({
            ...table,
            rows: table.rows.map((row) => (row.teamId === 'LIO' ? { ...row, points: 77, nrr: 7.777 } : row)),
          })),
        },
      };
    });
    useTournamentStore.setState({ whatIf });
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    const mn = remaining();
    await fireEvent.press(screen.getByTestId(`whatif-row-${mn}`));
    await fireEvent.press(screen.getByTestId(`whatif-chip-${mn}-side-a`));
    await fireEvent.press(screen.getByTestId('whatif-btn-done'));
    await fireEvent.press(screen.getByTestId('whatif-btn-run'));
    await waitFor(() => expect(screen.getByTestId('whatif-result')).toBeOnTheScreen());
    const result = screen.getByTestId('whatif-result');
    expect(within(result).getByText('77')).toBeOnTheScreen();
    expect(within(result).getByText('+7.777')).toBeOnTheScreen();
    expect(screen.getByTestId('whatif-text-banner')).toHaveTextContent('Simulation only. Nothing in the tournament changes.');
  });

  it('reports a failed simulation in plain words and shows no outcome', async () => {
    loadTournament(playGroups(cupSnapshot(), 5));
    const whatIf = jest.fn(async () => null);
    useTournamentStore.setState({ whatIf });
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    const mn = remaining();
    await fireEvent.press(screen.getByTestId(`whatif-row-${mn}`));
    await fireEvent.press(screen.getByTestId(`whatif-chip-${mn}-no-result`));
    await fireEvent.press(screen.getByTestId('whatif-btn-done'));
    await fireEvent.press(screen.getByTestId('whatif-btn-run'));
    await waitFor(() => expect(whatIf).toHaveBeenCalled());
    expect(screen.queryByTestId('whatif-result')).toBeNull();
    expect(toasts()).toContainEqual(expect.objectContaining({ kind: 'error', message: "Couldn't run the simulation." }));
    expect(useTournamentStore.getState().applyChange).not.toHaveBeenCalled();
  });
});

describe('Dashboard (§49, §80)', () => {
  it('shows "24/48", the current stage and the earliest fixture whose sides are known as the next match', async () => {
    const base = cupSnapshot();
    const knockout = orderedStages(base)[1];
    const snapshot: TournamentSnapshot = {
      ...base,
      fixtures: base.fixtures.map((fixture) => {
        if (fixture.stageId === knockout.id) {
          return { ...fixture, scheduledDate: '2026-09-01', scheduledTime: '10:00' };
        }
        if (fixture.matchNumber === 3) {
          return { ...fixture, scheduledDate: '2026-09-20', scheduledTime: '14:00' };
        }
        return fixture;
      }),
    };
    const data = loadTournament(snapshot);
    useTournamentStore.setState({ evaluation: { ...data.evaluation, progress: { done: 24, total: 48 } } });
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    expect(screen.getByTestId('dash-text-progress')).toHaveTextContent('24/48');
    expect(screen.getByTestId('dash-text-stage')).toHaveTextContent('Group Stage');
    const next = screen.getByTestId('dash-row-next-match');
    expect(within(next).getByTestId('dash-next-row-3')).toBeOnTheScreen();
    expect(screen.getByTestId('dash-btn-start-next')).toBeOnTheScreen();
  });

  it('explains an unresolved next match in words ("Waiting for Pool A winner") and offers no Start (W-D1, USER_FLOWS 4.4)', async () => {
    const base = cupSnapshot();
    const groups = orderedStages(base)[0];
    loadTournament({
      ...base,
      fixtures: base.fixtures.map((fixture) => (fixture.stageId === groups.id ? { ...fixture, status: 'postponed' } : fixture)),
    });
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    const next = screen.getByTestId('dash-row-next-match');
    expect(screen.queryByTestId('dash-btn-start-next')).toBeNull();
    expect(within(next).getByText(/Waiting for Pool A winner/)).toBeOnTheScreen();
  });

  it('has no card per statistic: no shadows, no rounded boxes around content, and the progress rule is decorative', async () => {
    loadTournament(playGroups(cupSnapshot(), 5));
    const view = await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    const raised = view.container.queryAll((node) => {
      const style = flatStyle(node);
      return typeof style.elevation === 'number' || typeof style.shadowOpacity === 'number' || style.shadowColor !== undefined;
    });
    expect(raised).toHaveLength(0);
    const rounded = view.container.queryAll((node) => {
      const style = flatStyle(node);
      return typeof style.borderRadius === 'number' && style.borderRadius > 6;
    });
    expect(rounded).toHaveLength(0);
    const decorative = view.container.queryAll((node) => node.props.importantForAccessibility === 'no-hide-descendants' && flatStyle(node).height === 4);
    expect(decorative.length).toBeGreaterThan(0);
  });

  it('uses the design-system section header spacing for its sections (DESIGN_SYSTEM §6.14: padding top 24)', async () => {
    loadTournament(playGroups(cupSnapshot(), 5));
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    const header = screen.getByText('Next match');
    let container = header.parent;
    while (container && typeof flatStyle(container).paddingTop !== 'number') {
      container = container.parent;
    }
    expect(container ? flatStyle(container).paddingTop : undefined).toBe(24);
  });
});

describe('Large tournaments: 128 teams (§27, §88)', () => {
  function bigGroups(): TournamentSnapshot {
    const base = leagueSnapshot(128);
    const stage = { ...base.stages[0], type: 'group' as const, name: 'Group Stage' };
    const pools = Array.from({ length: 16 }, (_, index) => ({ id: `pool-${index}`, stageId: stage.id, name: `Pool ${String.fromCharCode(65 + index)}`, orderIndex: index, legs: null }));
    const teamIds = base.teams.map((view) => view.team.id);
    return {
      ...base,
      tournament: { ...base.tournament, structureKind: 'groups' },
      stages: [stage],
      pools,
      poolEntries: teamIds.map((teamId, index) => ({ id: `pe-${teamId}`, poolId: pools[Math.floor(index / 8)].id, stageId: stage.id, side: teamSide(teamId), seed: null })),
    };
  }

  it('virtualises the tournament team list', async () => {
    loadTournament(leagueSnapshot(128));
    await renderWithTheme(<TournamentTeamsScreen tournamentId="t1" />);
    expect(screen.getByTestId('tteams-row-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('tteams-row-128')).toBeNull();
  });

  it('virtualises the pools editor instead of rendering all 128 member rows at once', async () => {
    const snapshot = bigGroups();
    expect(evaluateTournament(snapshot).stages[0].tables).toHaveLength(16);
    loadTournament(snapshot);
    const view = await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    const rows = view.container.queryAll((node) => typeof node.props.testID === 'string' && /^pools-row-[a-p]-\d+$/.test(node.props.testID));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(128);
  });
});

describe('§1 anti-patterns in tournament styling', () => {
  it('has no shadows, glass, gradients, giant icons or hard-coded corner radii in the tournament feature', () => {
    const findings: string[] = [];
    for (const { file, text } of featureSources()) {
      const name = file;
      if (/shadow(Color|Opacity|Radius|Offset)|\belevation\s*:|LinearGradient|BlurView|backdropFilter/.test(text)) {
        findings.push(`${name}: shadow, elevation, gradient or blur`);
      }
      for (const match of text.matchAll(/size=\{(\d+)\}/g)) {
        if (Number(match[1]) > 24) {
          findings.push(`${name}: icon size ${match[1]}`);
        }
      }
      for (const match of text.matchAll(/borderRadius:\s*(\d+)/g)) {
        findings.push(`${name}: literal borderRadius ${match[1]}`);
      }
    }
    expect(findings).toEqual([]);
  });
});

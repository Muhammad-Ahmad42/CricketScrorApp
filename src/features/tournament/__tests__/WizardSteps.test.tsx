import '@/ui/testing';
import { StyleSheet, type ViewStyle } from 'react-native';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { FixtureDraft, TournamentSnapshot } from '@/domain/types';
import type { FixturePlan } from '@/services/contracts';
import type { TournamentWizardDraft } from '@/stores/contracts';
import { renderWithTheme } from '@/ui/testing';
import { FixturesStepScreen } from '../screens/wizard/FixturesStepScreen';
import { InfoStepScreen } from '../screens/wizard/InfoStepScreen';
import { PoolsStepScreen } from '../screens/wizard/PoolsStepScreen';
import { ReviewStepScreen } from '../screens/wizard/ReviewStepScreen';
import { RulesStepScreen } from '../screens/wizard/RulesStepScreen';
import { StructureStepScreen } from '../screens/wizard/StructureStepScreen';
import { TeamsStepScreen } from '../screens/wizard/TeamsStepScreen';
import { libraryTeams, liveWizard, resetAll } from './support/harness';
import { pickDate, pickTime } from './support/pickers';
import { useTeamLibraryStore, useToastStore, useTournamentStore, useTournamentWizardStore } from './support/mockStores';
import { mockRouter } from './support/router';
import { POOL_A_IDS, POOL_B_IDS, cupSnapshot } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

const EIGHT = [...POOL_A_IDS, ...POOL_B_IDS];

function draftFromCup(snapshot: TournamentSnapshot, withAssignment: boolean): Partial<TournamentWizardDraft> {
  const groups = [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex)[0];
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

function planOf(snapshot: TournamentSnapshot, stageIndex: number): FixturePlan {
  const stage = [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex)[stageIndex];
  const fixtures: FixtureDraft[] = snapshot.fixtures
    .filter((fixture) => fixture.stageId === stage.id)
    .map(({ createdAt: _createdAt, updatedAt: _updatedAt, matchId: _matchId, matchSides: _matchSides, ...draft }) => draft);
  return { fixtures, slots: snapshot.slots.filter((slot) => slot.role === 'progression'), entrySlotSeeds: [], seed: null };
}

describe('Wizard · Information (§26)', () => {
  it('blocks Next until a name is entered and never saves an invalid step', async () => {
    liveWizard();
    await renderWithTheme(<InfoStepScreen />);
    expect(screen.getByTestId('twiz-text-step')).toHaveTextContent('Step 1 of 7');
    await fireEvent.press(screen.getByTestId('twiz-btn-next'));
    expect(screen.getByText('Enter a tournament name.', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId('twiz-input-name')).toHaveProp('accessibilityLabel', 'Name, Enter a tournament name.');
    expect(useTournamentWizardStore.getState().saveStep).not.toHaveBeenCalled();
  });

  it('saves the step progressively and moves to Teams', async () => {
    liveWizard();
    await renderWithTheme(<InfoStepScreen />);
    await fireEvent.changeText(screen.getByTestId('twiz-input-name'), 'City Cup');
    await fireEvent.changeText(screen.getByTestId('twiz-input-season'), '2026');
    expect(useTournamentWizardStore.getState().draft.info).toMatchObject({ name: 'City Cup', season: '2026' });
    await fireEvent.press(screen.getByTestId('twiz-btn-next'));
    await waitFor(() => expect(useTournamentWizardStore.getState().saveStep).toHaveBeenCalledTimes(1));
    expect(useTournamentWizardStore.getState().goTo).toHaveBeenCalledWith('teams');
    expect(mockRouter.push).toHaveBeenCalledWith('/tournament/new/teams');
  });

  it('stays on the step when saving fails', async () => {
    liveWizard({ info: { ...useTournamentWizardStore.getState().draft.info, name: 'City Cup' } });
    useTournamentWizardStore.setState({
      saveStep: jest.fn(async () => {
        useTournamentWizardStore.setState({ error: { code: 'STORAGE', message: 'Disk full', domainCode: null, detail: null } });
        return false;
      }),
    });
    await renderWithTheme(<InfoStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-btn-next'));
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: 'Disk full' })));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('validates the date window', async () => {
    liveWizard({ info: { ...useTournamentWizardStore.getState().draft.info, name: 'City Cup' } });
    await renderWithTheme(<InfoStepScreen />);
    await pickDate('twiz-input-start-date', '2026-10-04');
    await pickDate('twiz-input-end-date', '2026-09-12');
    expect(useTournamentWizardStore.getState().draft.info).toMatchObject({ startDate: '2026-10-04', endDate: '2026-09-12' });
    expect(screen.queryByDisplayValue('2026-10-04')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('twiz-btn-next'));
    expect(screen.getByText('Ends before it starts.', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(useTournamentWizardStore.getState().saveStep).not.toHaveBeenCalled();
  });

  it('closes the wizard and says the draft is saved', async () => {
    liveWizard({ tournamentId: 't1', info: { ...useTournamentWizardStore.getState().draft.info, name: 'City Cup' } });
    await renderWithTheme(<InfoStepScreen />);
    await fireEvent.press(screen.getByTestId('nav-btn-close'));
    expect(useToastStore.getState().show).toHaveBeenCalledWith(expect.objectContaining({ message: 'Draft saved' }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/tournaments');
  });
});

describe('Wizard · Teams (§27)', () => {
  it('needs at least two teams and counts them', async () => {
    liveWizard({ tournamentId: 't1' }, 'teams');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    await renderWithTheme(<TeamsStepScreen />);
    expect(screen.getByTestId('twiz-text-team-count')).toHaveTextContent('0 teams');
    expect(screen.getByTestId('twiz-btn-next')).toBeDisabled();
    expect(screen.getByTestId('twiz-text-next-hint')).toHaveTextContent('Add at least 2 teams');
    for (let added = 0; added < 8; added += 1) {
      await fireEvent.press(screen.getByTestId('twiz-btn-add-team'));
      await fireEvent.press(screen.getByTestId('picker-row-1'));
    }
    expect(screen.getByTestId('twiz-text-team-count')).toHaveTextContent('8 teams');
    expect(useTournamentWizardStore.getState().draft.teams.map((team) => team.teamId)).toEqual(EIGHT);
    expect(screen.getByTestId('twiz-btn-next')).toBeEnabled();
  });

  it('records optional seeds', async () => {
    liveWizard({ tournamentId: 't1', teams: EIGHT.slice(0, 2).map((teamId) => ({ teamId, seed: null })) }, 'teams');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    await renderWithTheme(<TeamsStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-toggle-seeds'));
    await fireEvent.changeText(screen.getByTestId('twiz-input-seed-1'), '1');
    expect(useTournamentWizardStore.getState().draft.teams[0]).toEqual({ teamId: 'LIO', seed: 1 });
  });
});

describe('Wizard · Format (§28, §29, §56)', () => {
  it('instantiates a template that fits the team count', async () => {
    liveWizard({ tournamentId: 't1', teams: EIGHT.map((teamId) => ({ teamId, seed: null })) }, 'structure');
    await renderWithTheme(<StructureStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-chip-template-8-team-t20'));
    const draft = useTournamentWizardStore.getState().draft;
    expect(draft.info.templateId).toBe('builtin:8-team-t20');
    expect(draft.stages.map((stage) => stage.name)).toEqual(['Group Stage', 'Knockouts']);
    expect(draft.pools.filter((pool) => pool.stageId === draft.stages[0].id)).toHaveLength(2);
    expect(draft.slots.map((slot) => slot.label)).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(screen.getByTestId('twiz-row-stage-2')).toHaveProp('accessibilityLabel', expect.stringContaining('★ Decides the champion'));
  });

  it('builds a structure from a kind and edits a stage', async () => {
    liveWizard({ tournamentId: 't1', teams: EIGHT.map((teamId) => ({ teamId, seed: null })) }, 'structure');
    await renderWithTheme(<StructureStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-chip-structure-league'));
    expect(useTournamentWizardStore.getState().draft.stages.map((stage) => stage.type)).toEqual(['league']);
    await fireEvent.press(screen.getByTestId('twiz-chip-structure-groups-knockout'));
    expect(useTournamentWizardStore.getState().draft.stages.map((stage) => stage.type)).toEqual(['group', 'knockout']);
    await fireEvent.press(screen.getByTestId('twiz-row-stage-2'));
    await fireEvent.press(screen.getByTestId('stage-toggle-third-place'));
    await fireEvent.press(screen.getByTestId('stage-btn-save'));
    expect(useTournamentWizardStore.getState().draft.stages[1].config.knockout?.thirdPlacePlayoff).toBe(true);
  });
});

describe('Wizard · Rules (§40–§43)', () => {
  it('shows the tie-breaker chain and edits points, NRR, order and format', async () => {
    const snapshot = cupSnapshot({ withFixtures: false });
    liveWizard({ tournamentId: 't1', rules: snapshot.rules }, 'rules');
    await renderWithTheme(<RulesStepScreen />);
    const order = () => [1, 2, 3, 4, 5].map((position) => screen.getByTestId(`twiz-text-tiebreaker-${position}`).props.children);
    expect(order()).toEqual(['Points', 'NRR', 'Head-to-Head', 'Most wins', 'Organizer decision']);
    expect(screen.queryByTestId('twiz-text-tiebreak-chain')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('twiz-btn-tiebreaker-down-2'));
    expect(order()).toEqual(['Points', 'Head-to-Head', 'NRR', 'Most wins', 'Organizer decision']);
    await fireEvent.press(screen.getByTestId('twiz-chip-nrr-actual-overs'));
    expect(useTournamentWizardStore.getState().draft.rules?.nrr.mode).toBe('actual_overs');
    await fireEvent.press(screen.getByTestId('twiz-chip-overs-1'));
    expect(useTournamentWizardStore.getState().draft.rules?.defaultMatchRules.oversPerInnings).toBe(1);
    expect(screen.getByTestId('twiz-chip-overs-1')).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
    expect(screen.getByTestId('twiz-chip-overs-20')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
    expect(screen.getByTestId('twiz-chip-overs-1')).toHaveProp('accessibilityLabel', '1 over');
    expect(screen.getByTestId('twiz-chip-overs-20')).toHaveProp('accessibilityLabel', '20 overs');
    await fireEvent.changeText(screen.getByTestId('twiz-input-players-per-side'), '3');
    expect(useTournamentWizardStore.getState().draft.rules?.defaultMatchRules.playersPerSide).toBe(3);
  });
});

describe('Wizard · Pools (§30–§32)', () => {
  it('draws randomly from a seed and shows the seed', async () => {
    liveWizard(draftFromCup(cupSnapshot({ withFixtures: false }), false), 'pools');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    await renderWithTheme(<PoolsStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-btn-repeat-draw'));
    await fireEvent.changeText(screen.getByTestId('twiz-input-pool-seed'), '847291');
    await fireEvent.press(screen.getByTestId('twiz-btn-repeat-draw-confirm'));
    expect(screen.getByTestId('twiz-text-pool-seed')).toHaveTextContent('Random draw · no. 847291');
    const first = useTournamentWizardStore.getState().draft.poolAssignment;
    expect(first?.seed).toBe(847291);
    expect(first?.pools.map((pool) => pool.members.length)).toEqual([4, 4]);
    expect(screen.getByTestId('twiz-row-pool-a-1')).toBeOnTheScreen();
  });

  it('warns "Current pool arrangement will be replaced." before replacing, reproduces the seed and can restore', async () => {
    liveWizard(draftFromCup(cupSnapshot({ withFixtures: false }), false), 'pools');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    await renderWithTheme(<PoolsStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-btn-repeat-draw'));
    await fireEvent.changeText(screen.getByTestId('twiz-input-pool-seed'), '847291');
    await fireEvent.press(screen.getByTestId('twiz-btn-repeat-draw-confirm'));
    const first = useTournamentWizardStore.getState().draft.poolAssignment;
    await fireEvent.press(screen.getByTestId('twiz-btn-pools-manual'));
    expect(screen.getByTestId('twiz-text-replace-warning')).toHaveTextContent('Current pool arrangement will be replaced.');
    expect(useTournamentWizardStore.getState().draft.poolAssignment).toBe(first);
    await fireEvent.press(screen.getByTestId('dialog-btn-cancel'));
    expect(useTournamentWizardStore.getState().draft.poolAssignment).toBe(first);
    await fireEvent.press(screen.getByTestId('twiz-btn-repeat-draw'));
    expect(screen.getByTestId('twiz-input-pool-seed')).toHaveProp('value', '847291');
    await fireEvent.press(screen.getByTestId('twiz-btn-repeat-draw-confirm'));
    await fireEvent.press(screen.getByTestId('dialog-btn-confirm'));
    expect(useTournamentWizardStore.getState().draft.poolAssignment).toEqual(first);
    await fireEvent.press(screen.getByTestId('twiz-btn-pools-manual'));
    await fireEvent.press(screen.getByTestId('dialog-btn-confirm'));
    expect(useTournamentWizardStore.getState().draft.poolAssignment?.pools.every((pool) => pool.members.length === 0)).toBe(true);
    expect(useToastStore.getState().show).toHaveBeenCalledWith(expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }));
    await fireEvent.press(screen.getByTestId('twiz-btn-restore-pools'));
    expect(useTournamentWizardStore.getState().draft.poolAssignment).toEqual(first);
  });

  it('assigns teams manually from the unassigned list', async () => {
    liveWizard(draftFromCup(cupSnapshot({ withFixtures: false }), false), 'pools');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    await renderWithTheme(<PoolsStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-btn-pools-manual'));
    expect(screen.getByTestId('twiz-btn-next')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('pools-row-unassigned-1'));
    await fireEvent.press(screen.getByTestId('pools-btn-target-b'));
    const assignment = useTournamentWizardStore.getState().draft.poolAssignment;
    expect(assignment?.pools[1].members).toEqual([{ kind: 'team', teamId: 'LIO' }]);
  });

  it('allows uneven pools with the §32 warning', async () => {
    const base = draftFromCup(cupSnapshot({ withFixtures: false }), false);
    const ten = [...EIGHT, 'RHI', 'OWL'];
    liveWizard({ ...base, teams: ten.map((teamId) => ({ teamId, seed: null })) }, 'pools');
    useTeamLibraryStore.setState({ teams: libraryTeams(ten) });
    await renderWithTheme(<PoolsStepScreen />);
    const stepper = screen.getByTestId('twiz-input-pool-count');
    await fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('twiz-text-pool-sizes')).toHaveTextContent('4 · 3 · 3');
    await fireEvent.press(screen.getByTestId('twiz-btn-pools-random'));
    expect(screen.getByTestId('twiz-text-uneven-warning-text-headline')).toHaveTextContent('Uneven pools');
    expect(screen.getByTestId('twiz-text-uneven-warning-text-supporting')).toHaveTextContent('Some teams play more matches than others.');
    expect(screen.getByTestId('twiz-btn-next')).toBeEnabled();
  });
});

describe('Wizard · Fixtures (§35, §36)', () => {
  it('generates a preview, lets the organizer edit it and persists only on Confirm', async () => {
    const snapshot = cupSnapshot();
    liveWizard(draftFromCup(snapshot, true), 'fixtures');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    const generateFixtures = jest.fn(async (stageId: string) => planOf(snapshot, snapshot.stages.findIndex((stage) => stage.id === stageId) === 0 ? 0 : 1));
    const open = jest.fn(async () => {
      useTournamentStore.setState({ tournamentId: 't1', snapshot: { ...snapshot, fixtures: [] } });
      return true;
    });
    const confirmFixtures = jest.fn(async () => true);
    const refresh = jest.fn(async () => {
      useTournamentStore.setState({ snapshot });
      return true;
    });
    useTournamentStore.setState({ generateFixtures, open, confirmFixtures, refresh });
    await renderWithTheme(<FixturesStepScreen />);
    expect(screen.getByTestId('twiz-btn-next')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('twiz-btn-generate'));
    await waitFor(() => expect(screen.getByTestId('twiz-text-fixture-count')).toHaveTextContent('12 matches'));
    expect(open).toHaveBeenCalledWith('t1');
    expect(useTournamentWizardStore.getState().saveStep).not.toHaveBeenCalled();
    expect(confirmFixtures).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('twiz-btn-edit-fixture-1'));
    await pickDate('schedule-input-date', '2026-09-12');
    await pickTime('schedule-input-time', '10:00');
    await fireEvent.press(screen.getByTestId('schedule-btn-save'));
    const edited = useTournamentWizardStore.getState().draft.fixturePlan?.fixtures.find((fixture) => fixture.matchNumber === 1);
    expect(edited).toMatchObject({ scheduledDate: '2026-09-12', scheduledTime: '10:00' });
    await fireEvent.press(screen.getByTestId('twiz-btn-confirm-fixtures'));
    await waitFor(() => expect(useTournamentWizardStore.getState().saveStep).toHaveBeenCalledTimes(1));
    expect(confirmFixtures).not.toHaveBeenCalled();
    expect(screen.getByTestId('twiz-row-later-15')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('twiz-btn-next')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('twiz-btn-next'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/tournament/new/review'));
  });

  it('asks before regenerating an edited preview', async () => {
    const snapshot = cupSnapshot();
    liveWizard({ ...draftFromCup(snapshot, true), fixturePlan: planOf(snapshot, 0) }, 'fixtures');
    useTournamentStore.setState({ tournamentId: 't1', snapshot: { ...snapshot, fixtures: [] } });
    await renderWithTheme(<FixturesStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-btn-generate'));
    expect(screen.getByText('Your edits to this preview will be lost.')).toBeOnTheScreen();
    expect(useTournamentStore.getState().generateFixtures).not.toHaveBeenCalled();
  });

  it('blocks Confirm when the preview has errors', async () => {
    const snapshot = cupSnapshot();
    const plan = planOf(snapshot, 0);
    const broken = { ...plan, fixtures: plan.fixtures.map((fixture, index) => (index === 0 ? { ...fixture, sideB: fixture.sideA } : fixture)) };
    liveWizard({ ...draftFromCup(snapshot, true), fixturePlan: broken }, 'fixtures');
    useTournamentStore.setState({ tournamentId: 't1', snapshot: { ...snapshot, fixtures: [] } });
    await renderWithTheme(<FixturesStepScreen />);
    expect(screen.getByTestId('twiz-text-fixture-issue-1')).toBeOnTheScreen();
    expect(screen.getByTestId('twiz-btn-confirm-fixtures')).toBeDisabled();
  });
});

describe('Wizard · glass chrome and dock (review: tournament-2)', () => {
  it('puts the §107 ambient atmosphere behind the wizard so its glass header and dock read as glass', async () => {
    liveWizard({}, 'info');
    await renderWithTheme(<InfoStepScreen />);
    expect(screen.getByTestId('screen-tournament-new-ambient', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('gives the primary dock button the room left by a compact Back button so "Confirm tournament" is never cut (#17)', async () => {
    const snapshot = cupSnapshot();
    liveWizard(draftFromCup(snapshot, true), 'review');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    useTournamentStore.setState({ tournamentId: 't1', snapshot });
    await renderWithTheme(<ReviewStepScreen />);
    const confirm = screen.getByTestId('twiz-btn-confirm-tournament');
    expect(confirm).toHaveTextContent('Confirm tournament');
    let node = screen.getByTestId('twiz-btn-back').parent;
    let backBox: ViewStyle | undefined;
    while (node && backBox === undefined) {
      const style = StyleSheet.flatten(node.props.style as ViewStyle | undefined);
      if (style && style.flexGrow !== undefined) {
        backBox = style;
      }
      node = node.parent;
    }
    expect(backBox?.flex).toBeUndefined();
    expect(backBox?.flexGrow).toBe(0);
  });

  it('offers Confirm fixtures in the dock while the preview is unsaved, then turns it into Next', async () => {
    const snapshot = cupSnapshot();
    liveWizard({ ...draftFromCup(snapshot, true), fixturePlan: planOf(snapshot, 0) }, 'fixtures');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    useTournamentStore.setState({ tournamentId: 't1', snapshot: { ...snapshot, fixtures: [] } });
    await renderWithTheme(<FixturesStepScreen />);
    const footer = screen.getByTestId('screen-tournament-new-footer');
    expect(within(footer).getByTestId('twiz-btn-confirm-fixtures')).toHaveTextContent('Confirm fixtures');
    expect(screen.getByTestId('twiz-text-next-hint')).toHaveTextContent(/^Review the \d+ fixtures, then confirm\.$/);
    await fireEvent.press(screen.getByTestId('twiz-btn-confirm-fixtures'));
    await waitFor(() => expect(within(screen.getByTestId('screen-tournament-new-footer')).getByTestId('twiz-btn-next')).toBeEnabled());
    expect(screen.queryByTestId('twiz-btn-confirm-fixtures')).not.toBeOnTheScreen();
    expect(useToastStore.getState().show).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Fixtures confirmed' }));
  });
});

describe('Wizard · Review', () => {
  it('summarises every step and confirms the tournament', async () => {
    const snapshot = cupSnapshot();
    liveWizard(draftFromCup(snapshot, true), 'review');
    useTeamLibraryStore.setState({ teams: libraryTeams(EIGHT) });
    useTournamentStore.setState({ tournamentId: 't1', snapshot });
    await renderWithTheme(<ReviewStepScreen />);
    expect(screen.getByTestId('twiz-review-teams')).toHaveTextContent('Lions, Tigers, Eagles, Hawks, +4');
    expect(screen.getByTestId('twiz-review-rules')).toHaveTextContent(/Win 2 · Tie 1 · NR 1 · Loss 0/);
    expect(screen.getByTestId('twiz-review-fixtures')).toHaveTextContent(/^15 matches · /);
    expect(screen.getByTestId('twiz-review-fixtures')).not.toHaveTextContent(/scheduled/);
    await fireEvent.press(screen.getByTestId('twiz-btn-confirm-tournament'));
    await waitFor(() => expect(useTournamentWizardStore.getState().commit).toHaveBeenCalled());
    expect(useTournamentWizardStore.getState().reset).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/tournament/[tournamentId]', params: { tournamentId: 't1' } });
  });
});

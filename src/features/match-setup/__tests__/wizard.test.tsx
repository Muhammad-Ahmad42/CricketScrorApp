import '@/features/scoring/__tests__/support/mocks';
import type { ReactElement } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Player, Team } from '@/domain/types';
import type { MatchSetupDraft, TeamDetail } from '@/stores/contracts';
import { getBuiltinPreset } from '@/domain/scoring/presets';
import { emptyDraft, fakeSetup, fakeTeamLibrary } from '@/features/scoring/__tests__/support/fakes';
import { renderScreen, resetCommonStores } from '@/features/scoring/__tests__/support/render';
import { SetupPlayersProvider } from '../context/SetupPlayersContext';
import { MatchInfoStep } from '../screens/MatchInfoStep';
import { OpenersStep } from '../screens/OpenersStep';
import { PlayersStep } from '../screens/PlayersStep';
import { TeamsStep } from '../screens/TeamsStep';
import { TossStep } from '../screens/TossStep';
import { battingFirstOf, battingOrderPatch, formatTitle, moved, NO_OPENERS } from '../selectors/wizard';
import { mockStores } from '@/features/scoring/__tests__/support/storeModule';

const { useMatchSetupStore, useTeamLibraryStore, useToastStore } = mockStores();

const AT = '2026-01-01T00:00:00.000Z';

function team(id: string, name: string, shortName: string, captainId: string | null = null): Team {
  return { id, name, shortName, logoUri: null, captainId, createdAt: AT, updatedAt: AT, archivedAt: null };
}

function roster(teamId: string, prefix: string, count: number): readonly Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    teamId,
    name: `${prefix} Player ${index + 1}`,
    jerseyNumber: index + 1,
    role: index === 1 ? 'wicket_keeper' : 'batter',
    createdAt: AT,
    updatedAt: AT,
    archivedAt: null,
  }));
}

const PAK = team('PAK', 'Pakistan XI', 'PAK', 'P1');
const LIO = team('LIO', 'Lions', 'LIO');
const DETAILS: Readonly<Record<string, TeamDetail>> = {
  PAK: { team: PAK, players: roster('PAK', 'P', 4) },
  LIO: { team: LIO, players: roster('LIO', 'L', 3) },
};

function installStores(draft: Partial<MatchSetupDraft> = {}) {
  useMatchSetupStore.setState(
    fakeSetup({
      draft: { ...emptyDraft(), ...draft },
      update: jest.fn((patch: Partial<MatchSetupDraft>) => useMatchSetupStore.setState((state) => ({ draft: { ...state.draft, ...patch } }))),
    }),
    true,
  );
  useTeamLibraryStore.setState(
    fakeTeamLibrary({
      teams: [PAK, LIO],
      loadTeam: jest.fn((teamId: string) => {
        useTeamLibraryStore.setState({ detail: DETAILS[teamId] ?? null });
        return Promise.resolve(true);
      }),
    }),
    true,
  );
}

function wrap(ui: ReactElement) {
  return renderScreen(<SetupPlayersProvider>{ui}</SetupPlayersProvider>);
}

const draft = () => useMatchSetupStore.getState().draft;

describe('wizard helpers', () => {
  it('labels an edited preset and derives who bats first from the toss', () => {
    const t20 = getBuiltinPreset('T20');
    expect(formatTitle({ ...emptyDraft(), rules: t20?.rules ?? emptyDraft().rules })).toBe('T20');
    expect(formatTitle({ ...emptyDraft(), rules: { ...emptyDraft().rules, lastManStands: true } })).toBe('T20 (edited)');
    const base = { ...emptyDraft(), teamAId: 'PAK', teamBId: 'LIO' };
    expect(battingFirstOf({ ...base, toss: { winnerTeamId: 'PAK', decision: 'bowl' } })).toBe('LIO');
    expect(battingFirstOf({ ...base, battingFirstTeamId: 'PAK' })).toBe('PAK');
    expect(battingFirstOf({ ...base, battingFirstTeamId: 'LIO' })).toBe('LIO');
    expect(battingFirstOf(base)).toBeNull();
    expect(battingFirstOf({ ...base, battingFirstTeamId: 'OTHER' })).toBeNull();
    expect(battingFirstOf({ ...base, toss: { winnerTeamId: 'LIO', decision: 'bat' }, battingFirstTeamId: 'PAK' })).toBe('LIO');
    expect(moved(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
  });

  it('clears the openers only when the side batting first changes', () => {
    const openers = { strikerId: 'P1', nonStrikerId: 'P2', bowlerId: 'L1' };
    const base = { ...emptyDraft(), teamAId: 'PAK', teamBId: 'LIO', toss: { winnerTeamId: 'PAK', decision: 'bat' as const }, openers };
    expect(battingOrderPatch(base, { toss: { winnerTeamId: 'LIO', decision: 'bowl' } })).toEqual({ toss: { winnerTeamId: 'LIO', decision: 'bowl' } });
    expect(battingOrderPatch(base, { toss: null, battingFirstTeamId: 'LIO' })).toEqual({ toss: null, battingFirstTeamId: 'LIO', openers: NO_OPENERS });
  });
});

describe('match setup wizard (§64)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('step 1: picks a format preset, custom overs and edits a rule', async () => {
    installStores();
    await wrap(<MatchInfoStep />);
    await fireEvent.press(screen.getByTestId('setup-format-T10'));
    expect(draft().formatId).toBe('T10');
    expect(draft().rules.oversPerInnings).toBe(10);
    await fireEvent.changeText(screen.getByTestId('setup-overs-custom'), '17');
    expect(draft().rules.oversPerInnings).toBe(17);
    expect(draft().formatId).toBe('custom');
    await fireEvent.press(screen.getByTestId('rules-row-wide'));
    await fireEvent.press(screen.getByTestId('rule-wide-2'));
    await fireEvent.press(screen.getByTestId('rule-done'));
    expect(draft().rules.wide.penaltyRuns).toBe(2);
    await fireEvent.press(screen.getByTestId('rules-row-noBall'));
    await fireEvent.press(screen.getByTestId('rule-noball-free-hit'));
    await fireEvent.press(screen.getByTestId('rule-done'));
    expect(draft().rules.noBall.freeHit).toBe(false);
    await fireEvent.press(screen.getByTestId('wizard-btn-next'));
    expect(router.push).toHaveBeenCalledWith('/match/new/teams');
  });

  it('step 1: blocks Next for an invalid number of overs', async () => {
    installStores();
    await wrap(<MatchInfoStep />);
    await fireEvent.changeText(screen.getByTestId('setup-overs-custom'), '0');
    expect(screen.getByText('Enter the number of overs (1 or more)', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('wizard-btn-next')).toBeDisabled();
  });

  it('step 1: a fixture entry prepares the draft and jumps to players', async () => {
    installStores();
    await wrap(<MatchInfoStep tournamentId="T1" fixtureId="F1" />);
    await waitFor(() => expect(useMatchSetupStore.getState().startFromFixture).toHaveBeenCalledWith('T1', 'F1'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/match/new/players'));
  });

  it('closing a started setup asks before discarding', async () => {
    installStores({ title: 'Final' });
    await wrap(<MatchInfoStep />);
    await fireEvent.press(screen.getByTestId('top-bar-back'));
    await fireEvent.press(screen.getByTestId('wizard-discard-confirm'));
    expect(useMatchSetupStore.getState().reset).toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });

  it('step 2: picks both teams and uneven side sizes', async () => {
    installStores();
    await wrap(<TeamsStep />);
    expect(screen.getByTestId('wizard-btn-next')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('setup-team-A'));
    await fireEvent.press(screen.getByTestId('team-picker-PAK'));
    await fireEvent.press(screen.getByTestId('setup-team-B'));
    expect(screen.queryByTestId('team-picker-PAK')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('team-picker-LIO'));
    expect(draft()).toMatchObject({ teamAId: 'PAK', teamBId: 'LIO' });
    await fireEvent.press(screen.getByTestId('setup-uneven'));
    await fireEvent.press(screen.getByTestId('setup-size-b-decrement'));
    expect(draft()).toMatchObject({ teamAPlayers: 11, teamBPlayers: 10 });
    expect(screen.getByTestId('wizard-btn-next')).not.toBeDisabled();
  });

  it('step 3: selects squads in batting order, substitutes and warns about short sides', async () => {
    installStores({ teamAId: 'PAK', teamBId: 'LIO' });
    await wrap(<PlayersStep />);
    await waitFor(() => expect(screen.getByTestId('setup-player-P1')).toBeOnTheScreen());
    expect(screen.getByTestId('setup-player-P1')).toHaveProp('accessibilityLabel', 'P Player 1, C, not selected');
    await fireEvent.press(screen.getByTestId('setup-player-P2'));
    await fireEvent.press(screen.getByTestId('setup-player-P1'));
    expect(draft().squadA).toEqual(['P2', 'P1']);
    await fireEvent.press(screen.getByTestId('setup-player-P1-up'));
    expect(draft().squadA).toEqual(['P1', 'P2']);
    await fireEvent.press(screen.getByTestId('setup-player-P4-sub'));
    expect(draft().substitutesA).toEqual(['P4']);
    expect(screen.getByTestId('setup-players-short')).toBeOnTheScreen();
    expect(within(screen.getByTestId('wizard-players-header')).getByTestId('setup-players-tab-B')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('setup-players-tab-B'));
    await waitFor(() => expect(screen.getByTestId('setup-player-L1')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('setup-players-all'));
    expect(draft().squadB).toEqual(['L1', 'L2', 'L3']);
    expect(screen.getByTestId('wizard-btn-next')).not.toBeDisabled();
  });

  it('step 3: adds a new player to the team and the squad', async () => {
    installStores({ teamAId: 'PAK', teamBId: 'LIO' });
    const created: Player = { ...roster('PAK', 'P', 5)[4], name: 'Late Addition' };
    useTeamLibraryStore.setState({ addPlayer: jest.fn(() => Promise.resolve(created)) });
    await wrap(<PlayersStep />);
    await waitFor(() => expect(screen.getByTestId('setup-player-P1')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('setup-players-add'));
    await fireEvent.changeText(screen.getByTestId('player-name'), 'Late Addition');
    await fireEvent.press(screen.getByTestId('player-submit'));
    await waitFor(() => expect(draft().squadA).toEqual(['P5']));
    expect(useTeamLibraryStore.getState().addPlayer).toHaveBeenCalledWith('PAK', { name: 'Late Addition', jerseyNumber: null, role: 'unknown' });
  });

  it('step 4: records the toss winner and decision, or who bats first without a toss', async () => {
    installStores({ teamAId: 'PAK', teamBId: 'LIO' });
    await wrap(<TossStep />);
    expect(screen.getByTestId('wizard-btn-next')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('setup-toss-winner-LIO'));
    await fireEvent.press(screen.getByTestId('setup-toss-bowl'));
    expect(draft().toss).toEqual({ winnerTeamId: 'LIO', decision: 'bowl' });
    expect(screen.getByTestId('setup-toss-summary')).toHaveTextContent('Pakistan XI will bat first.');
    await fireEvent.press(screen.getByTestId('setup-toss-none'));
    expect(draft().toss).toBeNull();
    expect(screen.getByTestId('wizard-btn-next')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('setup-bats-first-LIO'));
    expect(draft()).toMatchObject({ toss: null, battingFirstTeamId: 'LIO', teamAId: 'PAK', teamBId: 'LIO' });
    expect(screen.getByTestId('setup-toss-summary')).toHaveTextContent('Lions will bat first.');
    expect(screen.getByTestId('wizard-btn-next')).not.toBeDisabled();
    await fireEvent.press(screen.getByTestId('setup-toss-record'));
    expect(draft().battingFirstTeamId).toBeNull();
    expect(screen.getByTestId('wizard-btn-next')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('setup-toss-winner-PAK'));
    expect(draft()).toMatchObject({ toss: { winnerTeamId: 'PAK', decision: 'bat' }, battingFirstTeamId: null });
  });

  it('step 4: offers "Toss not recorded" for a tournament fixture too, since the sides never swap', async () => {
    installStores({ teamAId: 'PAK', teamBId: 'LIO', fixtureId: 'F1' });
    await wrap(<TossStep />);
    await fireEvent.press(screen.getByTestId('setup-toss-none'));
    await fireEvent.press(screen.getByTestId('setup-bats-first-LIO'));
    expect(draft()).toMatchObject({ teamAId: 'PAK', teamBId: 'LIO', toss: null, battingFirstTeamId: 'LIO', fixtureId: 'F1' });
  });

  it('step 4: changing who bats first clears openers picked for the other side', async () => {
    installStores({
      teamAId: 'PAK',
      teamBId: 'LIO',
      toss: { winnerTeamId: 'PAK', decision: 'bat' },
      openers: { strikerId: 'P1', nonStrikerId: 'P2', bowlerId: 'L1' },
    });
    await wrap(<TossStep />);
    await fireEvent.press(screen.getByTestId('setup-toss-winner-PAK'));
    expect(draft().openers).toEqual({ strikerId: 'P1', nonStrikerId: 'P2', bowlerId: 'L1' });
    await fireEvent.press(screen.getByTestId('setup-toss-bowl'));
    expect(draft().toss).toEqual({ winnerTeamId: 'PAK', decision: 'bowl' });
    expect(draft().openers).toEqual({ strikerId: null, nonStrikerId: null, bowlerId: null });
    expect(screen.getByTestId('setup-toss-summary')).toHaveTextContent('Lions will bat first.');
  });

  it('step 5: defaults the openers, needs a bowler and starts the match', async () => {
    installStores({ teamAId: 'PAK', teamBId: 'LIO', squadA: ['P1', 'P2', 'P3'], squadB: ['L1', 'L2', 'L3'], toss: { winnerTeamId: 'PAK', decision: 'bat' } });
    useMatchSetupStore.setState({ submit: jest.fn(() => Promise.resolve('NEW-MATCH')) });
    await wrap(<OpenersStep />);
    await waitFor(() => expect(draft().openers).toEqual({ strikerId: 'P1', nonStrikerId: 'P2', bowlerId: null }));
    expect(screen.getByTestId('wizard-btn-next')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('setup-opener-bowlerId'));
    await fireEvent.press(screen.getByTestId('setup-opener-bowlerId-L3'));
    await fireEvent.press(screen.getByTestId('wizard-btn-next'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/match/[matchId]/score', params: { matchId: 'NEW-MATCH' } }));
    expect(draft().title).toBe('Pakistan XI v Lions');
  });

  it('step 5: keeps the draft and offers Try again when the match cannot be created', async () => {
    installStores({
      teamAId: 'PAK',
      teamBId: 'LIO',
      squadA: ['P1', 'P2'],
      squadB: ['L1', 'L2'],
      toss: { winnerTeamId: 'PAK', decision: 'bat' },
      openers: { strikerId: 'P1', nonStrikerId: 'P2', bowlerId: 'L1' },
    });
    useMatchSetupStore.setState({ submit: jest.fn(() => Promise.resolve(null)) });
    await wrap(<OpenersStep />);
    await fireEvent.press(screen.getByTestId('wizard-btn-next'));
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalled());
    const toast = jest.mocked(useToastStore.getState().show).mock.calls[0][0];
    expect(toast.message).toBe("Couldn't create the match. Nothing was saved.");
    expect(toast.action?.label).toBe('Try again');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('step 5: creates one match even when Start is tapped twice', async () => {
    let finish: (value: string | null) => void = () => undefined;
    const submit = jest.fn(() => new Promise<string | null>((resolve) => {
      finish = resolve;
    }));
    installStores({
      teamAId: 'PAK',
      teamBId: 'LIO',
      squadA: ['P1', 'P2'],
      squadB: ['L1', 'L2'],
      toss: { winnerTeamId: 'PAK', decision: 'bat' },
      openers: { strikerId: 'P1', nonStrikerId: 'P2', bowlerId: 'L1' },
    });
    useMatchSetupStore.setState({ submit });
    await wrap(<OpenersStep />);
    await fireEvent.press(screen.getByTestId('wizard-btn-next'));
    await fireEvent.press(screen.getByTestId('wizard-btn-next'));
    finish('M-ONCE');
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('without a toss, starts with Team B batting first and keeps both team identities (no side swap)', async () => {
    installStores({ teamAId: 'PAK', teamBId: 'LIO', squadA: ['P1', 'P2'], squadB: ['L1', 'L2'], teamAPlayers: 11, teamBPlayers: 10 });
    useMatchSetupStore.setState({ submit: jest.fn(() => Promise.resolve('M-B-FIRST')) });
    await wrap(
      <>
        <TossStep />
        <OpenersStep />
      </>,
    );
    await fireEvent.press(screen.getByTestId('setup-toss-none'));
    await fireEvent.press(screen.getByTestId('setup-bats-first-LIO'));
    await waitFor(() => expect(draft().openers).toEqual({ strikerId: 'L1', nonStrikerId: 'L2', bowlerId: null }));
    expect(screen.getByText('Lions batting')).toBeOnTheScreen();
    expect(screen.getByText('Pakistan XI bowling')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('setup-opener-bowlerId'));
    await fireEvent.press(screen.getByTestId('setup-opener-bowlerId-P2'));
    await fireEvent.press(screen.getAllByTestId('wizard-btn-next')[1]);
    await waitFor(() => expect(useMatchSetupStore.getState().submit).toHaveBeenCalledTimes(1));
    expect(draft()).toMatchObject({
      teamAId: 'PAK',
      teamBId: 'LIO',
      squadA: ['P1', 'P2'],
      squadB: ['L1', 'L2'],
      teamAPlayers: 11,
      teamBPlayers: 10,
      toss: null,
      battingFirstTeamId: 'LIO',
      openers: { strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'P2' },
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/match/[matchId]/score', params: { matchId: 'M-B-FIRST' } }));
  });
});

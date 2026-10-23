import type { FixtureDraft, ProposedChange, StageSlot, TournamentSnapshot } from '@/domain/types';
import { DEFAULT_POINTS_SYSTEM } from '../defaults';
import { evaluateTournament } from '../evaluate';
import { qualificationChanges, slotChanges, standingChanges } from '../evaluation/diff';
import { applyChange, applyPlan, computeImpact, planChange } from '../impact';
import type { ImpactContext } from '../impact';
import { CUP_TEAMS, cupSnapshot, poolScenario } from './standingsKit/cup';
import { POOL_A } from './standingsKit/pools';
import { deepFreeze, played, simpleWin } from './standingsKit/summaries';
import { adjustment, entry, fixture, makeSnapshot, pool, slotSide, stage, team, withResult } from './standingsKit/tournament';

const NOW = '2026-06-01T12:00:00.000Z';

function ctx(): ImpactContext {
  let next = 0;
  return {
    ids: () => {
      next += 1;
      return `new-${next}`;
    },
    now: NOW,
  };
}

const rowOf = (snapshot: TournamentSnapshot, stageId: string, poolId: string, teamId: string) =>
  evaluateTournament(snapshot)
    .stages.find((candidate) => candidate.stageId === stageId)!
    .tables.find((table) => table.poolId === poolId)!
    .rows.find((row) => row.teamId === teamId);

const correctedM6 = played('m6', { team: 'TIG', runs: 19, balls: 12, wickets: 4 }, { team: 'EAG', runs: 20, balls: 11, wickets: 2 }, { allotted: 12 });

function withPanthers(snapshot: TournamentSnapshot): TournamentSnapshot {
  const base = makeSnapshot({ teams: [{ id: 'PAN', name: 'Panthers' }], stages: [] });
  return { ...snapshot, teams: [...snapshot.teams, ...base.teams] };
}

function moveSnapshot(): TournamentSnapshot {
  const played1 = simpleWin('hx', 'HAW', 'EAG');
  const fixtures = [
    withResult(fixture('HAWvEAG', 'groups', 'pA', 1, team('HAW'), team('EAG')), played1),
    fixture('HAWvLIO', 'groups', 'pA', 2, team('HAW'), team('LIO')),
    fixture('HAWvTIG', 'groups', 'pA', 3, team('HAW'), team('TIG')),
    fixture('LIOvTIG', 'groups', 'pA', 4, team('LIO'), team('TIG')),
    fixture('XRAvYAK', 'groups', 'pC', 5, team('XRA'), team('YAK')),
  ];
  return makeSnapshot({
    teams: ['LIO', 'TIG', 'EAG', 'HAW', 'XRA', 'YAK'].map((id) => ({ id, name: id })),
    stages: [stage('groups', 'Group stage', 'group', 0)],
    pools: [pool('pA', 'groups', 'Pool A', 0), pool('pC', 'groups', 'Pool C', 1)],
    poolEntries: [...['LIO', 'TIG', 'EAG', 'HAW'].map((id) => entry('groups', 'pA', team(id))), ...['XRA', 'YAK'].map((id) => entry('groups', 'pC', team(id)))],
    fixtures,
    summaries: [played1],
  });
}

function draft(id: string, number: number, a: string, b: string, poolId: string | null = 'pC', stageId = 'groups'): FixtureDraft {
  const { createdAt, updatedAt, matchId, matchSides, ...rest } = fixture(id, stageId, poolId, number, team(a), team(b));
  void createdAt;
  void updatedAt;
  void matchId;
  void matchSides;
  return rest;
}

describe('planChange, applyPlan and computeImpact per change kind', () => {
  it('U-IMP-01 pool_move deletes and creates exactly the listed fixtures', () => {
    const snapshot = deepFreeze(moveSnapshot());
    const change: ProposedChange = {
      kind: 'pool_move',
      stageId: 'groups',
      member: team('HAW'),
      toPoolId: 'pC',
      removeFixtureIds: ['HAWvLIO', 'HAWvTIG'],
      addFixtures: [draft('HAWvXRA', 40, 'HAW', 'XRA'), draft('HAWvYAK', 41, 'HAW', 'YAK')],
    };
    const plan = planChange(snapshot, change, ctx());
    expect(plan.poolEntries).toHaveLength(1);
    expect(plan.poolEntries[0].entries.find((candidate) => candidate.side.kind === 'team' && candidate.side.teamId === 'HAW')?.poolId).toBe('pC');
    expect(plan.fixtures.delete).toEqual(['HAWvLIO', 'HAWvTIG']);
    expect(plan.fixtures.insert.map((candidate) => [candidate.id, candidate.matchNumber])).toEqual([
      ['HAWvXRA', 40],
      ['HAWvYAK', 41],
    ]);
    const after = applyPlan(snapshot, plan);
    expect(after.fixtures.find((candidate) => candidate.id === 'HAWvEAG')).toEqual(snapshot.fixtures[0]);
    const impact = computeImpact(change, snapshot, ctx());
    expect(impact.fixtures.map((candidate) => [candidate.fixtureId, candidate.change, candidate.hasMatchData])).toEqual([
      ['HAWvLIO', 'removed', false],
      ['HAWvTIG', 'removed', false],
      ['HAWvXRA', 'created', false],
      ['HAWvYAK', 'created', false],
    ]);
    expect(impact.fixtures[0].label).toBe('Match 2 · HAW v LIO');
    expect(impact.headline).toBe('4 fixtures affected');
    expect(impact.lines).toEqual(expect.arrayContaining(['2 fixtures will be removed.', '2 fixtures will be created.']));
    expect(impact.blocked).toBeNull();
    expect(impact.severity).toBe('warning');
  });

  it('U-IMP-01 a played fixture in the removal list blocks the move', () => {
    const snapshot = deepFreeze(moveSnapshot());
    const impact = computeImpact(
      { kind: 'pool_move', stageId: 'groups', member: team('HAW'), toPoolId: 'pC', removeFixtureIds: ['HAWvEAG'], addFixtures: [] },
      snapshot,
      ctx(),
    );
    expect(impact.blocked?.reason).toBe('Match 1 already has a match. Delete or detach that match first.');
    expect(impact.severity).toBe('destructive');
  });

  it('U-IMP-02 pool_swap exchanges members and their unplayed fixtures only', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 4, playedB: 4 }));
    const plan = planChange(snapshot, { kind: 'pool_swap', stageId: 'groups', memberA: team('HAW'), memberB: team('WOL') }, ctx());
    const entries = plan.poolEntries[0].entries;
    expect(entries.filter((candidate) => candidate.poolId === 'pA').map((candidate) => candidate.side)).toEqual(['LIO', 'TIG', 'EAG', 'WOL'].map(team));
    expect(entries.filter((candidate) => candidate.poolId === 'pB').map((candidate) => candidate.side)).toEqual(['BUL', 'COB', 'BEA', 'HAW'].map(team));
    expect(plan.fixtures.update.map((candidate) => [candidate.id, candidate.sideA, candidate.sideB])).toEqual([
      ['g-m5', team('WOL'), team('LIO')],
      ['g-m11', team('HAW'), team('BUL')],
    ]);
    const after = applyPlan(snapshot, plan);
    expect(after.fixtures.find((candidate) => candidate.id === 'g-m4')).toEqual(snapshot.fixtures.find((candidate) => candidate.id === 'g-m4'));
    expect(after.fixtures.find((candidate) => candidate.id === 'g-m8')?.matchSides).toEqual({ teamAId: 'COB', teamBId: 'WOL' });
  });

  describe('U-IMP-03 team_replace', () => {
    const base = () => deepFreeze(withPanthers(cupSnapshot()));

    it('transfer_to_replacement aggregates the results into the replacement', () => {
      const snapshot = base();
      const change: ProposedChange = { kind: 'team_replace', outTeamId: 'TIG', inTeamId: 'PAN', inSeed: 5, priorResults: 'transfer_to_replacement' };
      const plan = planChange(snapshot, change, ctx());
      expect(plan.tournamentTeams.upsert).toEqual([
        expect.objectContaining({ teamId: 'TIG', status: 'replaced', replacedByTeamId: 'PAN' }),
        expect.objectContaining({ teamId: 'PAN', status: 'active', seed: 5, inheritsFromTeamId: 'TIG' }),
      ]);
      expect(plan.poolEntries[0].entries.some((candidate) => candidate.side.kind === 'team' && candidate.side.teamId === 'PAN')).toBe(true);
      const after = applyPlan(snapshot, plan);
      expect(rowOf(after, 'groups', 'pA', 'PAN')).toMatchObject({ played: 3, points: 4 });
      expect(rowOf(after, 'groups', 'pA', 'TIG')).toBeUndefined();
      const impact = computeImpact(change, snapshot, ctx());
      expect(impact.lines).toContain("Tigers' 3 results transfer to Panthers.");
      expect(impact.severity).toBe('destructive');
      expect(impact.completedMatchesAffected).toBe(3);
      expect(impact.requiresReason).toBe(true);
    });

    it('keep_for_opponents keeps the predecessor as a non-qualifying row', () => {
      const snapshot = base();
      const change: ProposedChange = { kind: 'team_replace', outTeamId: 'TIG', inTeamId: 'PAN', inSeed: null, priorResults: 'keep_for_opponents' };
      const plan = planChange(snapshot, change, ctx());
      expect(plan.tournamentTeams.upsert[1]).toMatchObject({ teamId: 'PAN', inheritsFromTeamId: null });
      expect(plan.overrides.insert).toEqual([]);
      const after = applyPlan(snapshot, plan);
      expect(rowOf(after, 'groups', 'pA', 'TIG')).toMatchObject({ membership: 'replaced', played: 3 });
      expect(rowOf(after, 'groups', 'pA', 'PAN')).toMatchObject({ played: 0, points: 0 });
      expect(computeImpact(change, snapshot, ctx()).lines).toContain("Tigers' 3 results stay in the table for their opponents.");
    });

    it('expunge adds an expunge_results override', () => {
      const snapshot = base();
      const change: ProposedChange = { kind: 'team_replace', outTeamId: 'TIG', inTeamId: 'PAN', inSeed: null, priorResults: 'expunge' };
      const plan = planChange(snapshot, change, ctx());
      expect(plan.overrides.insert).toEqual([
        {
          id: 'new-1',
          tournamentId: 't1',
          kind: 'expunge_results',
          stageId: null,
          teamId: 'TIG',
          reason: 'Tigers were replaced by Panthers.',
          createdAt: NOW,
          revokedAt: null,
          revokeReason: null,
        },
      ]);
      const after = applyPlan(snapshot, plan);
      expect(rowOf(after, 'groups', 'pA', 'LIO')).toMatchObject({ played: 2, points: 4 });
      expect(computeImpact(change, snapshot, ctx()).lines).toContain("Tigers' 3 results are removed from the standings.");
    });

    it('the replacement takes over unplayed fixtures', () => {
      const snapshot = deepFreeze(withPanthers(cupSnapshot({ playedA: 4 })));
      const plan = planChange(snapshot, { kind: 'team_replace', outTeamId: 'TIG', inTeamId: 'PAN', inSeed: null, priorResults: 'keep_for_opponents' }, ctx());
      expect(plan.fixtures.update.map((candidate) => [candidate.id, candidate.sideA])).toEqual([['g-m6', team('PAN')]]);
    });
  });

  it('U-IMP-04 team_withdraw with walkovers creates real matches', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 3 }));
    const change: ProposedChange = { kind: 'team_withdraw', teamId: 'HAW', remainingFixtures: 'walkover', expungeResults: false };
    const plan = planChange(snapshot, change, ctx());
    expect(plan.tournamentTeams.upsert).toEqual([expect.objectContaining({ teamId: 'HAW', status: 'withdrawn' })]);
    expect(plan.matchesToCreate.map((created) => [created.fixtureId, created.matchId, created.events])).toEqual([
      ['g-m4', 'new-1', [{ kind: 'match_ended', outcome: { type: 'walkover', winnerTeamId: 'TIG', reason: 'Hawks withdrew.' } }]],
      ['g-m5', 'new-2', [{ kind: 'match_ended', outcome: { type: 'walkover', winnerTeamId: 'LIO', reason: 'Hawks withdrew.' } }]],
    ]);
    expect(plan.matchesToCreate[0].match).toMatchObject({ teamAId: 'TIG', teamBId: 'HAW', tournamentId: 't1', fixtureId: 'g-m4', formatId: 'T20', toss: null });
    const after = applyPlan(snapshot, plan);
    expect(after.summaries['new-1'].result).toEqual({ type: 'walkover', winnerTeamId: 'TIG', loserTeamId: 'HAW', reason: 'Hawks withdrew.' });
    expect(after.fixtures.find((candidate) => candidate.id === 'g-m4')).toMatchObject({ status: 'completed', matchId: 'new-1' });
    expect(rowOf(after, 'groups', 'pA', 'TIG')).toMatchObject({ won: 1, points: 2 });
    expect(rowOf(after, 'groups', 'pA', 'HAW')).toMatchObject({ membership: 'withdrawn', lost: 3 });
    const impact = computeImpact(change, snapshot, ctx());
    expect(impact.lines).toContain('2 remaining matches become walkovers for the opponents.');
    expect(impact.fixtures.filter((candidate) => candidate.change === 'result_changed')).toHaveLength(2);
  });

  it('U-IMP-05 team_withdraw with cancellation and expunged results', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 3 }));
    const change: ProposedChange = { kind: 'team_withdraw', teamId: 'HAW', remainingFixtures: 'cancel', expungeResults: true };
    const plan = planChange(snapshot, change, ctx());
    expect(plan.fixtures.update.map((candidate) => [candidate.id, candidate.status])).toEqual([
      ['g-m4', 'cancelled'],
      ['g-m5', 'cancelled'],
    ]);
    expect(plan.overrides.insert).toEqual([expect.objectContaining({ kind: 'expunge_results', teamId: 'HAW', stageId: null })]);
    const after = applyPlan(snapshot, plan);
    expect(rowOf(after, 'groups', 'pA', 'EAG')).toMatchObject({ played: 1, points: 0 });
    const impact = computeImpact(change, snapshot, ctx());
    expect(impact.lines).toEqual(expect.arrayContaining(['2 remaining matches will be cancelled.', "Hawks' 1 result is removed from the standings."]));
    expect(impact.severity).toBe('destructive');
  });

  it('U-IMP-05 a live match of the withdrawing team blocks the withdrawal', () => {
    const base = cupSnapshot({ playedA: 3 });
    const snapshot = deepFreeze({
      ...base,
      fixtures: base.fixtures.map((candidate) =>
        candidate.id === 'g-m4' ? { ...candidate, status: 'live' as const, matchId: 'live-1', matchSides: { teamAId: 'TIG', teamBId: 'HAW' } } : candidate,
      ),
    });
    const impact = computeImpact({ kind: 'team_withdraw', teamId: 'HAW', remainingFixtures: 'walkover', expungeResults: false }, snapshot, ctx());
    expect(impact.blocked?.reason).toBe('Match 4 is being played. End the live match first.');
  });

  it('U-IMP-06 pools_replace keeps played fixtures and stores the seed', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 1, playedB: 0 }));
    const change: ProposedChange = {
      kind: 'pools_replace',
      stageId: 'groups',
      pools: [
        { poolId: 'pA', members: ['LIO', 'BUL', 'EAG', 'COB'].map(team) },
        { poolId: 'pB', members: ['TIG', 'HAW', 'BEA', 'WOL'].map(team) },
      ],
      seed: 847291,
    };
    const plan = planChange(snapshot, change, ctx());
    expect(plan.poolEntries[0].entries.map((candidate) => [candidate.poolId, candidate.side.kind === 'team' ? candidate.side.teamId : '', candidate.id])).toEqual([
      ['pA', 'LIO', 'pe-groups-LIO'],
      ['pA', 'BUL', 'pe-groups-BUL'],
      ['pA', 'EAG', 'pe-groups-EAG'],
      ['pA', 'COB', 'pe-groups-COB'],
      ['pB', 'TIG', 'pe-groups-TIG'],
      ['pB', 'HAW', 'pe-groups-HAW'],
      ['pB', 'BEA', 'pe-groups-BEA'],
      ['pB', 'WOL', 'pe-groups-WOL'],
    ]);
    expect(plan.stages.upsert[0].config.seedingSeed).toBe(847291);
    expect(plan.fixtures.delete).not.toContain('g-m1');
    expect(plan.fixtures.delete).toEqual(expect.arrayContaining(['g-m2', 'g-m7']));
    expect(plan.fixtures.delete).not.toContain('g-m3');
    expect(plan.fixtures.delete).not.toContain('g-m10');
    const after = applyPlan(snapshot, plan);
    expect(after.fixtures.find((candidate) => candidate.id === 'g-m1')?.matchId).toBe('m1');
  });

  it('U-IMP-07 seeds change the order only where seed is in the chain', () => {
    const results = [simpleWin('1', 'A', 'B'), simpleWin('2', 'C', 'D')];
    const pending: [string, string][] = [
      ['A', 'C'],
      ['B', 'D'],
    ];
    const seeded = deepFreeze(poolScenario({ teams: ['A', 'B', 'C', 'D'], results, pending, tieBreakers: ['points', 'seed'], seeds: { A: 2, C: 1 } }));
    const change: ProposedChange = { kind: 'team_seeds_change', seeds: [{ teamId: 'A', seed: 1 }, { teamId: 'C', seed: 2 }] };
    const plan = planChange(seeded, change, ctx());
    expect(plan.tournamentTeams.upsert.map((row) => [row.teamId, row.seed])).toEqual([
      ['A', 1],
      ['C', 2],
    ]);
    const impact = computeImpact(change, seeded, ctx());
    expect(impact.standings.find((line) => line.teamId === 'A')).toMatchObject({ before: { position: 2 }, after: { position: 1 } });
    expect(impact.lines).toContain('A move from 2nd to 1st in Pool A.');
    const unseeded = deepFreeze(poolScenario({ teams: ['A', 'B', 'C', 'D'], results, pending, seeds: { A: 2, C: 1 } }));
    expect(computeImpact(change, unseeded, ctx()).standings).toEqual([]);
  });

  it('U-IMP-08 stage_upsert re-expands dependent entry slots keeping ids by index', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 0, playedB: 0 }));
    const groups = snapshot.stages[0];
    const pools = [...snapshot.pools, pool('pC', 'groups', 'Pool C', 2)];
    const change: ProposedChange = { kind: 'stage_upsert', stage: groups, pools, slots: [] };
    const plan = planChange(snapshot, change, ctx());
    const koSlots = plan.slots.upsert.filter((candidate) => candidate.stageId === 'ko');
    expect(koSlots.map((candidate) => [candidate.id, candidate.index, candidate.label])).toEqual([
      ['sA2', 2, 'C1'],
      ['sB2', 3, 'A2'],
      ['new-1', 4, 'B2'],
      ['new-2', 5, 'C2'],
    ]);
    expect(plan.slots.delete).toEqual(expect.arrayContaining(['sW1', 'sW2']));
    expect(plan.fixtures.delete).toContain('final');
    expect(plan.pools.upsert.map((candidate) => candidate.id)).toEqual(['pA', 'pB', 'pC']);
    const after = applyPlan(snapshot, plan);
    expect(after.slots.filter((candidate) => candidate.stageId === 'ko').map((candidate) => candidate.id).sort()).toEqual(
      ['new-1', 'new-2', 'sA1', 'sA2', 'sB1', 'sB2'].sort(),
    );
  });

  it('U-IMP-08 stage_delete removes the stage and its unplayed fixtures', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const plan = planChange(snapshot, { kind: 'stage_delete', stageId: 'ko' }, ctx());
    expect(plan.stages.delete).toEqual(['ko']);
    expect(plan.slots.delete).toEqual(['sA1', 'sB1', 'sA2', 'sB2', 'sW1', 'sW2']);
    expect(plan.fixtures.delete).toEqual(['sf1', 'sf2', 'final']);
    const after = applyPlan(snapshot, plan);
    expect(after.stages.map((candidate) => candidate.id)).toEqual(['groups']);
    expect(evaluateTournament(after).stages).toHaveLength(1);
  });

  it('U-IMP-09 fixtures_replace re-draws a knockout keeping progression slots and storing the seed', () => {
    const snapshot = deepFreeze(cupSnapshot({ ko: { sf1: simpleWin('sf1m', 'LIO', 'COB') } }));
    const knockout = (id: string, number: number, a: string, b: string, position: number, round = 1): FixtureDraft => {
      const { createdAt, updatedAt, matchId, matchSides, ...rest } = fixture(id, 'ko', null, number, slotSide(a), slotSide(b), {
        bracket: { kind: 'main', round, position, roundName: round === 1 ? 'Semifinal' : 'Final' },
        isFinal: round === 2,
      });
      void createdAt;
      void updatedAt;
      void matchId;
      void matchSides;
      return rest;
    };
    const slots: StageSlot[] = snapshot.slots.filter((candidate) => candidate.role === 'progression');
    const change: ProposedChange = {
      kind: 'fixtures_replace',
      stageId: 'ko',
      poolId: null,
      fixtures: [knockout('sf2b', 21, 'sA2', 'sB1', 1), knockout('finalb', 22, 'sW1', 'sW2', 0, 2)],
      slots,
      seed: 42,
    };
    const plan = planChange(snapshot, change, ctx());
    expect(plan.fixtures.delete).toEqual(['sf2', 'final']);
    expect(plan.fixtures.insert.map((candidate) => candidate.id)).toEqual(['sf2b', 'finalb']);
    expect(plan.stages.upsert[0].config.seedingSeed).toBe(42);
    const evaluation = evaluateTournament(applyPlan(snapshot, plan));
    const ko = evaluation.stages[1];
    expect(ko.slots.find((candidate) => candidate.slotId === 'sW1')?.teamId).toBe('LIO');
    const impact = computeImpact(change, snapshot, ctx());
    expect(impact.lines[0]).toBe('3 fixtures will be regenerated (1 already played).');
  });

  it('U-IMP-10 match_result_change only records summary changes', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const plan = planChange(snapshot, { kind: 'match_result_change', matchId: 'm6', summary: correctedM6 }, ctx());
    expect(plan.summaryChanges).toEqual([{ matchId: 'm6', summary: correctedM6 }]);
    expect({ ...plan, summaryChanges: [] }).toEqual(planChange(snapshot, { kind: 'team_seeds_change', seeds: [] }, ctx()));
    const reopened = applyPlan(snapshot, planChange(snapshot, { kind: 'match_result_change', matchId: 'm6', summary: null }, ctx()));
    expect(reopened.summaries.m6).toBeUndefined();
    expect(reopened.fixtures.find((candidate) => candidate.id === 'g-m6')?.status).toBe('live');
  });

  it('U-IMP-11 rules_change sets the tournament rules and reports standings changes', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const points = { ...DEFAULT_POINTS_SYSTEM, win: 3 };
    const change: ProposedChange = { kind: 'rules_change', stageId: null, pointsSystem: points };
    const plan = planChange(snapshot, change, ctx());
    expect(plan.rules).toEqual({ ...snapshot.rules, pointsSystem: points, updatedAt: NOW });
    const impact = computeImpact(change, snapshot, ctx());
    expect(impact.standings.find((line) => line.teamId === 'LIO')).toMatchObject({ before: { points: 6 }, after: { points: 9 } });
    expect(impact.severity).toBe('warning');
    expect(impact.requiresConfirmation).toBe(true);
    const stagePlan = planChange(snapshot, { kind: 'rules_change', stageId: 'groups', tieBreakers: ['points', 'wins'] }, ctx());
    expect(stagePlan.stages.upsert[0].config.tieBreakers).toEqual(['points', 'wins']);
    expect(stagePlan.rules).toBeNull();
  });

  it('U-IMP-12 slot_change of a slot with a played fixture lists it', () => {
    const snapshot = deepFreeze(cupSnapshot({ ko: { sf1: simpleWin('sf1m', 'LIO', 'COB') } }));
    const change: ProposedChange = { kind: 'slot_change', slotId: 'sA1', source: { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 3 } };
    expect(planChange(snapshot, change, ctx()).slots.upsert).toEqual([
      { ...snapshot.slots[0], source: { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 3 } },
    ]);
    const impact = computeImpact(change, snapshot, ctx());
    expect(impact.slots.find((candidate) => candidate.slotId === 'sA1')).toEqual({
      slotId: 'sA1',
      label: 'A1',
      beforeTeamId: 'LIO',
      afterTeamId: 'EAG',
      playedFixtureIds: ['sf1'],
    });
    expect(impact.lines).toContain('A1 changes from Lions to Eagles, but SF1 was already played by Lions; played results stand.');
    const after = evaluateTournament(applyChange(snapshot, change, ctx()));
    expect(after.stages[1].slots.find((candidate) => candidate.slotId === 'sW1')?.teamId).toBe('LIO');
  });

  it('U-IMP-13 override_apply and override_revoke', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const penalty = adjustment('LIO', -2, { stageId: 'groups', reason: 'Slow over-rate' });
    const apply = computeImpact({ kind: 'override_apply', override: penalty }, snapshot, ctx());
    expect(planChange(snapshot, { kind: 'override_apply', override: penalty }, ctx()).overrides.insert).toEqual([penalty]);
    expect(apply.requiresReason).toBe(true);
    expect(apply.standings.find((line) => line.teamId === 'LIO')).toMatchObject({ before: { points: 6 }, after: { points: 4 } });
    const withPenalty = deepFreeze({ ...cupSnapshot(), overrides: [penalty] });
    const revokePlan = planChange(withPenalty, { kind: 'override_revoke', overrideId: penalty.id }, ctx());
    expect(revokePlan.overrides.revoke).toEqual([{ overrideId: penalty.id, at: NOW, reason: null }]);
    const revoked = applyPlan(withPenalty, revokePlan);
    expect(revoked.overrides[0]).toMatchObject({ revokedAt: NOW });
    expect(rowOf(revoked, 'groups', 'pA', 'LIO')?.points).toBe(6);
  });

  it('U-IMP-14 deleting a completed fixture is blocked and destructive', () => {
    const impact = computeImpact({ kind: 'fixture_delete', fixtureId: 'g-m1' }, deepFreeze(cupSnapshot()), ctx());
    expect(impact.blocked).toEqual({ reason: 'Match 1 already has a match. Delete or detach that match first.' });
    expect(impact.severity).toBe('destructive');
    expect(impact.lines[0]).toBe('Match 1 already has a match. Delete or detach that match first.');
  });

  it('U-IMP-14 the edit policy blocks changes in an archived tournament', () => {
    const impact = computeImpact({ kind: 'fixture_add', fixture: draft('extra', 99, 'LIO', 'BUL', null, 'ko') }, deepFreeze(cupSnapshot({ status: 'archived' })), ctx());
    expect(impact.blocked?.reason).toBe('The tournament is archived. Unarchive it first.');
    expect(computeImpact({ kind: 'fixture_update', fixtureId: 'g-m1', patch: { sideA: team('BUL') } }, deepFreeze(cupSnapshot()), ctx()).blocked?.reason).toBe(
      "Match 1 has been played. Its teams can't change.",
    );
  });

  it('U-IMP-15 severities', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 4 }));
    expect(computeImpact({ kind: 'fixture_update', fixtureId: 'g-m6', patch: { scheduledDate: '2026-06-10' } }, snapshot, ctx())).toMatchObject({
      severity: 'info',
      requiresConfirmation: false,
      requiresReason: false,
      fixtures: [expect.objectContaining({ change: 'rescheduled', hasMatchData: false })],
    });
    expect(computeImpact({ kind: 'override_apply', override: adjustment('TIG', 2, { stageId: 'groups' }) }, snapshot, ctx()).severity).toBe('warning');
    expect(computeImpact({ kind: 'fixture_update', fixtureId: 'g-m1', patch: { poolId: 'pB' } }, snapshot, ctx())).toMatchObject({
      severity: 'destructive',
      requiresConfirmation: true,
      requiresReason: true,
    });
    expect(computeImpact({ kind: 'team_seeds_change', seeds: [] }, snapshot, ctx())).toMatchObject({
      severity: 'none',
      headline: 'Nothing changes',
      lines: [],
      requiresConfirmation: false,
    });
  });

  it('U-IMP-16 confirmation and reason flags', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const result = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: correctedM6 }, snapshot, ctx());
    expect(result).toMatchObject({ requiresConfirmation: true, requiresReason: true, completedMatchesAffected: 1 });
    const early = deepFreeze(cupSnapshot({ playedA: 0, playedB: 0 }));
    expect(computeImpact({ kind: 'fixture_update', fixtureId: 'g-m1', patch: { venueId: 'v1' } }, early, ctx())).toMatchObject({
      requiresConfirmation: false,
      requiresReason: false,
    });
  });

  it('U-IMP-17 headline and lines for a corrected group result', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const impact = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: correctedM6 }, snapshot, ctx());
    expect(impact.headline).toBe('2 fixtures affected, 1 completed');
    expect(impact.fixtures.map((candidate) => [candidate.fixtureId, candidate.change, candidate.hasMatchData])).toEqual([
      ['g-m6', 'result_changed', true],
      ['sf2', 'teams_changed', false],
    ]);
    expect(impact.lines).toEqual([
      'The result of Match 6 · Tigers v Eagles changes.',
      '1 fixture changes teams.',
      'A2 changes from Tigers to Eagles.',
      'Tigers move from 2nd to 3rd in Pool A.',
      'Eagles move from 3rd to 2nd in Pool A.',
      'Tigers can no longer qualify for the Knockouts.',
      'Eagles have qualified for the Knockouts.',
      'Net run rate changes for 2 teams.',
    ]);
    expect(impact.nrrChanged).toBe(true);
    expect(impact.severity).toBe('warning');
  });

  it('U-QUAL-21 a correction after the SF was played reports the slot conflict and keeps the champion', () => {
    const ko = { sf1: simpleWin('sf1m', 'LIO', 'COB'), sf2: simpleWin('sf2m', 'BUL', 'TIG'), final: simpleWin('finalm', 'LIO', 'BUL') };
    const snapshot = deepFreeze(cupSnapshot({ ko }));
    const impact = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: correctedM6 }, snapshot, ctx());
    expect(impact.slots).toEqual([{ slotId: 'sA2', label: 'A2', beforeTeamId: 'TIG', afterTeamId: 'EAG', playedFixtureIds: ['sf2'] }]);
    expect(impact.fixtures.map((candidate) => candidate.fixtureId)).toEqual(['g-m6']);
    expect(impact.lines).not.toContain(expect.stringContaining('champion'));
  });

  it('U-IMP-18 applyChange equals applyPlan of planChange', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 3 }));
    const change: ProposedChange = { kind: 'team_withdraw', teamId: 'HAW', remainingFixtures: 'walkover', expungeResults: true };
    expect(applyChange(snapshot, change, ctx())).toEqual(applyPlan(snapshot, planChange(snapshot, change, ctx())));
  });
});

describe('U-IMP-00 computeImpact equals the diff of the two evaluations for every change kind', () => {
  const snapshot = deepFreeze(withPanthers(cupSnapshot({ playedA: 4, playedB: 5 })));
  const changes: readonly ProposedChange[] = [
    { kind: 'pool_move', stageId: 'groups', member: team('HAW'), toPoolId: 'pB', removeFixtureIds: ['g-m5'], addFixtures: [draft('n1', 30, 'HAW', 'BUL', 'pB')] },
    { kind: 'pool_swap', stageId: 'groups', memberA: team('EAG'), memberB: team('BEA') },
    { kind: 'team_replace', outTeamId: 'EAG', inTeamId: 'PAN', inSeed: null, priorResults: 'transfer_to_replacement' },
    { kind: 'team_withdraw', teamId: 'HAW', remainingFixtures: 'walkover', expungeResults: false },
    { kind: 'pools_replace', stageId: 'groups', pools: [{ poolId: 'pA', members: ['LIO', 'TIG', 'EAG', 'HAW'].map(team) }, { poolId: 'pB', members: ['BUL', 'COB', 'BEA', 'WOL'].map(team) }], seed: 7 },
    { kind: 'team_seeds_change', seeds: [{ teamId: 'LIO', seed: 1 }] },
    { kind: 'stage_upsert', stage: { ...snapshot.stages[1], name: 'Playoffs' }, pools: [], slots: snapshot.slots.filter((candidate) => candidate.stageId === 'ko') },
    { kind: 'stage_delete', stageId: 'ko' },
    { kind: 'fixture_add', fixture: draft('n2', 31, 'LIO', 'EAG', 'pA') },
    { kind: 'fixture_update', fixtureId: 'g-m6', patch: { scheduledDate: '2026-06-02' } },
    { kind: 'fixture_delete', fixtureId: 'g-m6' },
    { kind: 'fixtures_replace', stageId: 'groups', poolId: 'pA', fixtures: [draft('n3', 32, 'TIG', 'EAG', 'pA')], slots: [], seed: null },
    { kind: 'match_result_change', matchId: 'm1', summary: simpleWin('m1', 'TIG', 'LIO') },
    { kind: 'rules_change', stageId: 'groups', pointsSystem: { ...DEFAULT_POINTS_SYSTEM, win: 4 } },
    { kind: 'slot_change', slotId: 'sB2', source: { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 3 } },
    { kind: 'override_apply', override: adjustment('COB', 3, { stageId: 'groups' }) },
    { kind: 'override_revoke', overrideId: 'missing' },
  ];

  it('covers every ProposedChange kind', () => {
    expect(new Set(changes.map((change) => change.kind)).size).toBe(17);
  });

  it.each(changes.map((change) => [change.kind, change] as const))('%s', (_kind, change) => {
    const impact = computeImpact(change, snapshot, ctx());
    const after = applyPlan(snapshot, planChange(snapshot, change, ctx()));
    const before = evaluateTournament(snapshot);
    const next = evaluateTournament(after);
    expect(impact.standings).toMatchObject(standingChanges(before, next));
    expect(impact.standings).toHaveLength(standingChanges(before, next).length);
    expect(impact.qualification).toMatchObject(qualificationChanges(before, next));
    expect(impact.qualification).toHaveLength(qualificationChanges(before, next).length);
    expect(impact.slots).toEqual(slotChanges(snapshot, after, before, next));
    expect(impact.nrrChanged).toBe(impact.standings.some((line) => (line.before?.nrr ?? null) !== (line.after?.nrr ?? null)));
  });
});

describe('the snapshot is never mutated', () => {
  it('planChange, applyPlan and computeImpact leave a deep-frozen snapshot unchanged', () => {
    const snapshot = deepFreeze(withPanthers(cupSnapshot({ playedA: 3 })));
    const copy = JSON.parse(JSON.stringify(snapshot));
    const change: ProposedChange = { kind: 'team_replace', outTeamId: 'HAW', inTeamId: 'PAN', inSeed: null, priorResults: 'expunge' };
    expect(() => computeImpact(change, snapshot, ctx())).not.toThrow();
    expect(snapshot).toEqual(copy);
    expect(CUP_TEAMS).toHaveLength(8);
    expect(POOL_A).toHaveLength(6);
  });
});

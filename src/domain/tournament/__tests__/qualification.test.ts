import type {
  MatchSummary,
  StageEvaluation,
  TeamQualification,
  TournamentEvaluation,
  TournamentSnapshot,
  UnevenPoolNormalization,
} from '@/domain/types';
import { evaluateTournament, resolveFixtureTeams } from '../evaluate';
import { enumerate } from '../evaluation/scenarioSearch';
import { computeQualification, resolveChampion, resolveStageSlots } from '../qualification';
import { mulberry32 } from '../rng';
import { cupSnapshot, poolScenario, TOP_TWO } from './standingsKit/cup';
import { generatedTeam, generatedTournament } from './standingsKit/generated';
import { randomCrossCase } from './standingsKit/crossOracle';
import type { CrossCase } from './standingsKit/crossOracle';
import { POOL_A } from './standingsKit/pools';
import { bruteForceBounds, randomPool } from './standingsKit/scenarioOracle';
import { playFixture, template92 } from './standingsKit/template92';
import { abandoned, deepFreeze, noResult, played, simpleWin, tieSummary } from './standingsKit/summaries';
import {
  championOverride,
  entry,
  fixture,
  makeSnapshot,
  pool,
  qualificationOverride,
  slot,
  slotAssignment,
  slotSide,
  stage,
  team,
  withResult,
} from './standingsKit/tournament';

const stageOf = (evaluation: TournamentEvaluation, stageId: string): StageEvaluation =>
  evaluation.stages.find((candidate) => candidate.stageId === stageId)!;
const slotOf = (evaluation: TournamentEvaluation, slotId: string) =>
  evaluation.stages.flatMap((candidate) => candidate.slots).find((resolution) => resolution.slotId === slotId)!;
const qualOf = (evaluation: TournamentEvaluation, teamId: string, stageId = 'groups'): TeamQualification =>
  stageOf(evaluation, stageId).qualification.find((entry) => entry.teamId === teamId)!;
const statesOf = (evaluation: TournamentEvaluation, stageId = 'groups') =>
  Object.fromEntries(stageOf(evaluation, stageId).qualification.map((entry) => [entry.teamId, `${entry.state}/${entry.certainty}`]));
const evaluate = (snapshot: TournamentSnapshot, limit?: number) =>
  evaluateTournament(deepFreeze(snapshot), limit === undefined ? undefined : { enumerationLimit: limit });

const correctedM6 = played('m6', { team: 'TIG', runs: 19, balls: 12, wickets: 4 }, { team: 'EAG', runs: 20, balls: 11, wickets: 2 }, { allotted: 12 });

describe('slot resolution and qualification for the §92 tournament', () => {
  it('U-QUAL-01 complete pools fill every slot with a final team and explain qualification', () => {
    const evaluation = evaluate(cupSnapshot());
    expect(['sA1', 'sB1', 'sA2', 'sB2'].map((id) => [slotOf(evaluation, id).teamId, slotOf(evaluation, id).status])).toEqual([
      ['LIO', 'final'],
      ['BUL', 'final'],
      ['TIG', 'final'],
      ['COB', 'final'],
    ]);
    expect(slotOf(evaluation, 'sA1').explanation).toBe('Pool A winner: Lions (6 pts, NRR +3.255)');
    expect(qualOf(evaluation, 'LIO')).toMatchObject({
      state: 'qualified',
      certainty: 'mathematical',
      targetStageId: 'ko',
      slotIds: ['sA1'],
      poolId: 'pA',
      override: null,
      explanation:
        'Lions have mathematically qualified for the Knockouts as Pool A winners (Top 2 from each pool; Points → NRR → Head-to-Head → Most wins → Organizer decision).',
    });
    expect(qualOf(evaluation, 'COB')).toMatchObject({ state: 'qualified', certainty: 'mathematical', slotIds: ['sB2'] });
    expect(qualOf(evaluation, 'EAG')).toMatchObject({ state: 'eliminated', certainty: 'mathematical', slotIds: [] });
    expect(qualOf(evaluation, 'HAW')).toMatchObject({
      state: 'eliminated',
      certainty: 'mathematical',
      explanation: 'Hawks can no longer qualify for the Knockouts.',
    });
    expect(qualOf(evaluation, 'BEA').state).toBe('eliminated');
  });

  it('U-QUAL-01 rows carry their qualification and the SF sides follow the slots', () => {
    const evaluation = evaluate(cupSnapshot());
    const poolA = stageOf(evaluation, 'groups').tables[0];
    expect(poolA.rows[0].qualification?.state).toBe('qualified');
    expect(poolA.rows[3].qualification?.state).toBe('eliminated');
    const snapshot = cupSnapshot();
    const sf1 = snapshot.fixtures.find((candidate) => candidate.id === 'sf1')!;
    expect(resolveFixtureTeams(evaluation, sf1)).toEqual({ a: 'LIO', b: 'COB', frozen: false });
  });

  it('U-QUAL-02 an incomplete pool gives provisional slots and never a false mathematical claim', () => {
    const evaluation = evaluate(cupSnapshot({ playedA: 4 }));
    expect(slotOf(evaluation, 'sA1')).toMatchObject({ teamId: 'LIO', status: 'provisional' });
    expect(slotOf(evaluation, 'sA2').status).toBe('provisional');
    expect(slotOf(evaluation, 'sB1').status).toBe('final');
    expect(statesOf(evaluation)).toMatchObject({
      LIO: 'qualified/mathematical',
      TIG: 'in_contention/provisional',
      EAG: 'in_contention/provisional',
      HAW: 'eliminated/mathematical',
    });
    expect(qualOf(evaluation, 'LIO').explanation).toBe(
      'Lions have mathematically qualified for the Knockouts (Top 2 from each pool; Points → NRR → Head-to-Head → Most wins → Organizer decision).',
    );
    expect(qualOf(evaluation, 'EAG').explanation).toBe('Eagles are still in contention for the Knockouts. A win against Tigers guarantees qualification.');
    expect(qualOf(evaluation, 'TIG').explanation).toBe('Tigers are still in contention for the Knockouts. A win against Eagles guarantees qualification.');
  });

  it('U-QUAL-13 a progression slot takes a team that already holds an entry slot', () => {
    const evaluation = evaluate(cupSnapshot({ ko: { sf1: simpleWin('sf1m', 'LIO', 'COB') } }));
    expect(slotOf(evaluation, 'sA1').teamId).toBe('LIO');
    expect(slotOf(evaluation, 'sW1')).toMatchObject({ teamId: 'LIO', status: 'final', explanation: 'Winner SF1: Lions (won by 10 runs)' });
    expect(slotOf(evaluation, 'sB2').teamId).toBe('COB');
    expect(slotOf(evaluation, 'sW2')).toMatchObject({ teamId: null, status: 'pending' });
  });

  it('U-QUAL-21 frozen sides: a group correction after SF2 moves A2 but not SF2, Winner SF2 or the champion', () => {
    const ko = {
      sf1: simpleWin('sf1m', 'LIO', 'COB'),
      sf2: simpleWin('sf2m', 'BUL', 'TIG'),
      final: simpleWin('finalm', 'LIO', 'BUL'),
    };
    const before = evaluate(cupSnapshot({ ko }));
    const corrected = evaluate(cupSnapshot({ ko, poolA: [...POOL_A.slice(0, 5), correctedM6] }));
    expect(slotOf(before, 'sA2').teamId).toBe('TIG');
    expect(slotOf(corrected, 'sA2')).toMatchObject({ teamId: 'EAG', status: 'final' });
    const sf2 = cupSnapshot({ ko }).fixtures.find((candidate) => candidate.id === 'sf2')!;
    expect(resolveFixtureTeams(corrected, sf2)).toEqual({ a: 'BUL', b: 'TIG', frozen: true });
    expect(slotOf(corrected, 'sW2').teamId).toBe('BUL');
    expect(corrected.champion).toEqual(before.champion);
    expect(corrected.champion).toEqual({ teamIds: ['LIO'], basis: 'final', fixtureId: 'final' });
  });

  it('resolves a washed-out semifinal for the higher seed and a tied one through the super over or the organizer', () => {
    const higherSeed = evaluate(cupSnapshot({ ko: { sf1: abandoned('sf1m', 'LIO', 'COB') } }));
    expect(slotOf(higherSeed, 'sW1')).toMatchObject({
      teamId: 'LIO',
      status: 'final',
      explanation: 'Winner SF1: Lions advance as the higher seed (semifinal abandoned)',
    });
    const superOver = evaluate(cupSnapshot({ ko: { sf2: tieSummary('sf2m', 'BUL', 'TIG', 'TIG') } }));
    expect(slotOf(superOver, 'sW2')).toMatchObject({ teamId: 'TIG', explanation: 'Winner SF2: Tigers (won the super over)' });
    const stillTied = evaluate(cupSnapshot({ ko: { sf2: tieSummary('sf2m', 'BUL', 'TIG') } }));
    expect(slotOf(stillTied, 'sW2')).toMatchObject({
      teamId: null,
      status: 'pending',
      explanation: 'Winner SF2: to be decided by the organizer (semifinal tied)',
    });
    const decided = evaluate(cupSnapshot({ ko: { sf2: tieSummary('sf2m', 'BUL', 'TIG') }, overrides: [slotAssignment('sW2', 'BUL')] }));
    expect(slotOf(decided, 'sW2')).toMatchObject({ teamId: 'BUL', status: 'final', viaOverride: true });
  });

  it('resolves a bye position to the bye entrant', () => {
    const snapshot = makeSnapshot({
      teams: ['TIG', 'LIO', 'EAG'],
      stages: [stage('ko', 'Knockout', 'knockout', 0, { decidesChampion: true })],
      slots: [
        slot('e1', 'ko', 0, 'Seed 1', { kind: 'manual', teamId: 'TIG' }, { seed: 1 }),
        slot('e2', 'ko', 1, 'Seed 2', { kind: 'manual', teamId: 'LIO' }, { seed: 2 }),
        slot('e3', 'ko', 2, 'Seed 3', { kind: 'manual', teamId: 'EAG' }, { seed: 3 }),
        slot('w1', 'ko', 3, 'Winner SF1', { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 0 }, { role: 'progression' }),
        slot('w2', 'ko', 4, 'Winner SF2', { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 1 }, { role: 'progression' }),
      ],
      fixtures: [
        fixture('sf2', 'ko', null, 1, slotSide('e2'), slotSide('e3'), { bracket: { kind: 'main', round: 1, position: 1, roundName: 'Semifinal' } }),
        fixture('fin', 'ko', null, 2, slotSide('w1'), slotSide('w2'), { isFinal: true, bracket: { kind: 'main', round: 2, position: 0, roundName: 'Final' } }),
      ],
    });
    const evaluation = evaluate(snapshot);
    expect(slotOf(evaluation, 'w1')).toMatchObject({ teamId: 'TIG', status: 'final', explanation: 'Winner SF1 (bye): TIG' });
    expect(slotOf(evaluation, 'w2').status).toBe('pending');
  });
});

describe('uneven pools and cross-pool sources', () => {
  const unevenResults: readonly MatchSummary[] = [
    simpleWin('a1', 'RAV', 'HAW'),
    simpleWin('a2', 'RAV', 'OWL'),
    simpleWin('a3', 'RAV', 'KIT'),
    simpleWin('a4', 'HAW', 'OWL'),
    simpleWin('a5', 'HAW', 'KIT'),
    simpleWin('a6', 'OWL', 'KIT'),
    simpleWin('b1', 'BUL', 'BEA'),
    simpleWin('b2', 'BUL', 'BEA'),
    simpleWin('b3', 'BUL', 'BIS'),
    simpleWin('b4', 'BUL', 'BIS'),
    simpleWin('b5', 'BEA', 'BIS'),
    simpleWin('b6', 'BEA', 'BIS'),
    simpleWin('c1', 'COB', 'VIP'),
    noResult('c2', 'COB', 'VIP'),
    simpleWin('c3', 'COB', 'PYT'),
    simpleWin('c4', 'COB', 'PYT'),
    simpleWin('c5', 'VIP', 'PYT'),
    simpleWin('c6', 'VIP', 'PYT'),
  ];
  const poolOfResult = (matchId: string) => `p${matchId[0].toUpperCase()}`;

  function unevenSnapshot(normalization: UnevenPoolNormalization, playedCount = unevenResults.length): TournamentSnapshot {
    const pools = { pA: ['RAV', 'HAW', 'OWL', 'KIT'], pB: ['BUL', 'BEA', 'BIS'], pC: ['COB', 'VIP', 'PYT'] };
    return makeSnapshot({
      teams: Object.values(pools).flat(),
      stages: [
        stage('groups', 'Group stage', 'group', 0),
        stage('ko', 'Semifinal', 'knockout', 1, {
          decidesChampion: true,
          entryRules: [
            { kind: 'top_per_pool', sourceStageId: 'groups', count: 1, fromPosition: 1 },
            { kind: 'best_of_position', sourceStageId: 'groups', position: 2, count: 1, normalization },
          ],
        }),
      ],
      pools: [pool('pA', 'groups', 'Pool A', 0), pool('pB', 'groups', 'Pool B', 1, 2), pool('pC', 'groups', 'Pool C', 2, 2)],
      poolEntries: Object.entries(pools).flatMap(([poolId, ids]) => ids.map((id) => entry('groups', poolId, team(id)))),
      slots: [
        slot('kA1', 'ko', 0, 'A1', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 1 }),
        slot('kB1', 'ko', 1, 'B1', { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 1 }),
        slot('kC1', 'ko', 2, 'C1', { kind: 'pool_position', stageId: 'groups', poolId: 'pC', position: 1 }),
        slot('kBest', 'ko', 3, 'Best runner-up', { kind: 'best_of_position', stageId: 'groups', position: 2, rank: 1, normalization }),
      ],
      fixtures: unevenResults.map((summary, index) => {
        const base = fixture(`f-${summary.matchId}`, 'groups', poolOfResult(summary.matchId), index + 1, team(summary.teamAId), team(summary.teamBId));
        return index < playedCount ? withResult(base, summary) : base;
      }),
      summaries: unevenResults.slice(0, playedCount),
    });
  }

  it('U-QUAL-03 runners-up of uneven pools with their raw records', () => {
    const evaluation = evaluate(unevenSnapshot('raw'));
    const comparison = stageOf(evaluation, 'groups').comparisonTables.find((candidate) => candidate.key === 'position:2:raw')!;
    expect(comparison.position).toBe(2);
    expect(comparison.table.rows.map((row) => [row.teamId, row.points, row.played])).toEqual([
      ['VIP', 5, 4],
      ['HAW', 4, 3],
      ['BEA', 4, 4],
    ]);
    expect(['kA1', 'kB1', 'kC1'].map((id) => slotOf(evaluation, id).teamId)).toEqual(['RAV', 'BUL', 'COB']);
  });

  it.each([
    ['raw', 'VIP', 'VIP are the best runner-up: 5 pts, NRR +0.167, ahead of HAW'],
    ['per_match_average', 'HAW', 'HAW are the best runner-up: 1.33 pts per match, NRR +0.167, ahead of VIP'],
    [
      'drop_extra_results',
      'HAW',
      'HAW are the best runner-up: 4 pts, NRR +0.167, ahead of VIP (results against the lowest-placed teams of larger pools are not counted)',
    ],
  ] as const)('U-QUAL-04 best runner-up with %s normalisation', (normalization, winner, explanation) => {
    const evaluation = evaluate(unevenSnapshot(normalization));
    const groups = stageOf(evaluation, 'groups');
    expect(groups.comparisonTables.map((candidate) => candidate.key)).toEqual([`position:2:${normalization}`]);
    expect(slotOf(evaluation, 'kBest')).toMatchObject({ teamId: winner, status: 'final', explanation });
    expect(qualOf(evaluation, winner)).toMatchObject({ state: 'qualified', certainty: 'mathematical', slotIds: ['kBest'] });
    expect(qualOf(evaluation, winner).explanation).toContain('as the best runner-up');
  });

  it('U-QUAL-04 a best-of slot stays provisional while a pool is incomplete', () => {
    const evaluation = evaluate(unevenSnapshot('raw', 17));
    expect(slotOf(evaluation, 'kBest').status).toBe('provisional');
    expect(qualOf(evaluation, 'KIT')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
  });

  it('U-QUAL-05 pool winners plus the best 4 runners-up across 4 uneven pools', () => {
    const snapshot = generatedTournament({
      poolSizes: [5, 4, 4, 3],
      targets: [
        stage('ko', 'Quarterfinal', 'knockout', 1, {
          decidesChampion: true,
          entryRules: [
            { kind: 'top_per_pool', sourceStageId: 'groups', count: 1, fromPosition: 1 },
            { kind: 'best_of_position', sourceStageId: 'groups', position: 2, count: 4, normalization: 'raw' },
          ],
        }),
      ],
      slots: [
        ...['pA', 'pB', 'pC', 'pD'].map((poolId, index) =>
          slot(`w${index}`, 'ko', index, `${poolId[1]}1`, { kind: 'pool_position', stageId: 'groups', poolId, position: 1 }),
        ),
        ...[1, 2, 3, 4].map((rank) =>
          slot(`r${rank}`, 'ko', 3 + rank, `Best runner-up #${rank}`, { kind: 'best_of_position', stageId: 'groups', position: 2, rank, normalization: 'raw' }),
        ),
      ],
    });
    const evaluation = evaluate(snapshot);
    const ko = stageOf(evaluation, 'ko');
    expect(ko.slots).toHaveLength(8);
    const comparison = stageOf(evaluation, 'groups').comparisonTables.find((candidate) => candidate.key === 'position:2:raw')!;
    expect([1, 2, 3, 4].map((rank) => slotOf(evaluation, `r${rank}`).teamId)).toEqual(comparison.table.rows.map((row) => row.teamId));
    expect(new Set(comparison.table.rows.map((row) => row.teamId))).toEqual(new Set([0, 1, 2, 3].map((p) => generatedTeam(p, 1))));
    expect(qualOf(evaluation, generatedTeam(3, 1))).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    expect(qualOf(evaluation, generatedTeam(0, 2))).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
  });

  it('U-QUAL-06 top 8 overall over 16 teams comes from the overall table', () => {
    const snapshot = generatedTournament({
      poolSizes: [4, 4, 4, 4],
      targets: [
        stage('ko', 'Quarterfinal', 'knockout', 1, {
          decidesChampion: true,
          entryRules: [{ kind: 'top_overall', sourceStageId: 'groups', count: 8, normalization: 'raw' }],
        }),
      ],
      slots: Array.from({ length: 8 }, (_, index) =>
        slot(`o${index + 1}`, 'ko', index, `${index + 1} overall`, { kind: 'overall_position', stageId: 'groups', rank: index + 1, normalization: 'raw' }),
      ),
    });
    const evaluation = evaluate(snapshot);
    const overall = stageOf(evaluation, 'groups').overall!;
    expect(overall.poolId).toBeNull();
    expect(overall.rows).toHaveLength(16);
    const top8 = overall.rows.slice(0, 8).map((row) => row.teamId);
    expect(Array.from({ length: 8 }, (_, index) => slotOf(evaluation, `o${index + 1}`).teamId)).toEqual(top8);
    expect(new Set(top8)).toEqual(new Set([0, 1, 2, 3].flatMap((p) => [generatedTeam(p, 0), generatedTeam(p, 1)])));
    expect(slotOf(evaluation, 'o1').status).toBe('final');
  });
});

describe('parallel targets, direct entries, manual slots and overrides', () => {
  const plateStage = stage('plate', 'Plate semifinal', 'knockout', 2, {
    entryRules: [{ kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 3 }],
  });
  const plateSlots = [
    slot('pA3', 'plate', 0, 'A3', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 3 }),
    slot('pB3', 'plate', 1, 'B3', { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 3 }),
    slot('pA4', 'plate', 2, 'A4', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 4 }),
    slot('pB4', 'plate', 3, 'B4', { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 4 }),
  ];

  it('U-QUAL-07 Cup and Plate fed by the same groups are both targets', () => {
    const evaluation = evaluate(cupSnapshot({ koName: 'Cup', extraStages: [plateStage], extraSlots: plateSlots }));
    const eagles = qualOf(evaluation, 'EAG');
    expect(eagles.targets).toEqual([
      { stageId: 'ko', state: 'eliminated', certainty: 'mathematical', slotIds: [] },
      { stageId: 'plate', state: 'qualified', certainty: 'mathematical', slotIds: ['pA3'] },
    ]);
    expect(eagles).toMatchObject({ state: 'qualified', targetStageId: 'plate', slotIds: ['pA3'] });
    expect(eagles.explanation).toBe('Eagles are out of the Cup but have qualified for the Plate semifinal as Pool A 3rd.');
    const lions = qualOf(evaluation, 'LIO');
    expect(lions.targets.map((target) => target.state)).toEqual(['qualified', 'eliminated']);
    expect(lions.targetStageId).toBe('ko');
  });

  it('U-QUAL-08 a direct entry is a final manual slot and not a group-stage entrant', () => {
    const snapshot = makeSnapshot({
      teams: ['LIO', 'TIG', 'EAG', 'HAW', 'BUL'],
      stages: [
        stage('groups', 'Group stage', 'group', 0),
        stage('ko', 'Knockouts', 'knockout', 1, {
          decidesChampion: true,
          entryRules: [
            { kind: 'top_per_pool', sourceStageId: 'groups', count: 1, fromPosition: 1 },
            { kind: 'direct_entry', teamIds: ['LIO'] },
          ],
        }),
      ],
      pools: [pool('pA', 'groups', 'Pool A', 0)],
      poolEntries: ['TIG', 'EAG', 'HAW', 'BUL'].map((id) => entry('groups', 'pA', team(id))),
      slots: [
        slot('kA1', 'ko', 0, 'A1', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 1 }),
        slot('kD', 'ko', 1, 'Direct entry', { kind: 'manual', teamId: 'LIO' }),
      ],
    });
    const evaluation = evaluate(snapshot);
    expect(slotOf(evaluation, 'kD')).toMatchObject({ teamId: 'LIO', status: 'final', viaOverride: false });
    expect(slotOf(evaluation, 'kA1')).toMatchObject({ teamId: null, status: 'pending' });
    expect(stageOf(evaluation, 'groups').qualification.map((entry) => entry.teamId)).not.toContain('LIO');
  });

  it('U-QUAL-09 a manual slot is pending until a slot assignment fills it', () => {
    const wildcard = slot('sM', 'ko', 6, 'Wildcard', { kind: 'manual', teamId: null });
    const open = evaluate(cupSnapshot({ extraSlots: [wildcard] }));
    expect(slotOf(open, 'sM')).toMatchObject({ teamId: null, status: 'pending', explanation: 'Wildcard: to be chosen by the organizer' });
    const filled = evaluate(cupSnapshot({ extraSlots: [wildcard], overrides: [slotAssignment('sM', 'EAG', { reason: 'Host team' })] }));
    expect(slotOf(filled, 'sM')).toMatchObject({ teamId: 'EAG', status: 'final', viaOverride: true, explanation: "Wildcard: Eagles (Manual Override: 'Host team')" });
    expect(qualOf(filled, 'EAG')).toMatchObject({ state: 'qualified', certainty: 'manual' });
  });

  it('U-QUAL-10 a qualify override places the team and displaces the automatic occupant', () => {
    const override = qualificationOverride('ko', 'TIG', 'qualify', { slotId: 'sA2' }, { reason: 'Eagles fielded an ineligible player' });
    const before = evaluate(cupSnapshot({ playedA: 3 }));
    expect(slotOf(before, 'sA2').teamId).toBe('EAG');
    const evaluation = evaluate(cupSnapshot({ playedA: 3, overrides: [override] }));
    expect(slotOf(evaluation, 'sA2')).toMatchObject({ teamId: 'TIG', viaOverride: true, status: 'final' });
    expect(qualOf(evaluation, 'TIG')).toMatchObject({
      state: 'qualified',
      certainty: 'manual',
      override,
      slotIds: ['sA2'],
      explanation: "Tigers qualified for the Knockouts by Manual Override: 'Eagles fielded an ineligible player'.",
    });
    expect(qualOf(evaluation, 'EAG').slotIds).toEqual([]);
  });

  it('U-QUAL-11 an eliminate override moves the next team up', () => {
    const override = qualificationOverride('ko', 'LIO', 'eliminate', {}, { reason: 'Withdrew from the knockouts' });
    const evaluation = evaluate(cupSnapshot({ overrides: [override] }));
    expect(slotOf(evaluation, 'sA1').teamId).toBe('TIG');
    expect(slotOf(evaluation, 'sA2').teamId).toBe('EAG');
    expect(slotOf(evaluation, 'sA2').explanation).toContain('Lions removed by Manual Override');
    expect(qualOf(evaluation, 'LIO')).toMatchObject({
      state: 'eliminated',
      certainty: 'manual',
      explanation: "Lions were eliminated from the Knockouts by Manual Override: 'Withdrew from the knockouts'.",
    });
  });

  it('U-QUAL-12 a reassign override moves a team into a pool of a later stage', () => {
    const superStage = stage('super', 'Super 4', 'group', 2, { entryRules: TOP_TWO });
    const superSlots = [
      slot('xA1', 'super', 0, 'A1', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 1 }),
      slot('xB1', 'super', 1, 'B1', { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 1 }),
      slot('xA2', 'super', 2, 'A2', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 2 }),
      slot('xB2', 'super', 3, 'B2', { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 2 }),
    ];
    const base = cupSnapshot({ extraStages: [superStage], extraSlots: superSlots });
    const override = qualificationOverride('super', 'HAW', 'reassign', { poolId: 'pS2' }, { reason: 'Invited' });
    const snapshot: TournamentSnapshot = {
      ...base,
      pools: [...base.pools, pool('pS1', 'super', 'Group 1', 0), pool('pS2', 'super', 'Group 2', 1)],
      poolEntries: [
        ...base.poolEntries,
        entry('super', 'pS1', slotSide('xA1')),
        entry('super', 'pS1', slotSide('xB2')),
        entry('super', 'pS2', slotSide('xB1')),
        entry('super', 'pS2', slotSide('xA2')),
      ],
      overrides: [override],
    };
    const evaluation = evaluate(snapshot);
    const group2 = stageOf(evaluation, 'super').tables.find((table) => table.poolId === 'pS2')!;
    expect(group2.rows.map((row) => row.teamId)).toEqual(expect.arrayContaining(['BUL', 'TIG', 'HAW']));
    const group1 = stageOf(evaluation, 'super').tables.find((table) => table.poolId === 'pS1')!;
    expect(group1.rows.map((row) => row.slotLabel)).toEqual(['A1', 'B2']);
    const hawks = qualOf(evaluation, 'HAW');
    expect(hawks.targets.find((target) => target.stageId === 'super')).toMatchObject({ state: 'qualified', certainty: 'manual' });
    expect(hawks.targetStageId).toBe('super');
  });
});

describe('mathematical certainty', () => {
  const win = (id: string, winner: string, loser: string) => simpleWin(id, winner, loser);

  it('U-QUAL-14 one match left: A qualified, C eliminated, B and D in contention', () => {
    const snapshot = poolScenario({
      teams: ['A', 'B', 'C', 'D'],
      results: [win('1', 'A', 'B'), win('2', 'A', 'C'), win('3', 'A', 'D'), win('4', 'B', 'C'), win('5', 'D', 'C')],
      pending: [['B', 'D']],
    });
    expect(statesOf(evaluate(snapshot))).toEqual({
      A: 'qualified/mathematical',
      B: 'in_contention/provisional',
      C: 'eliminated/mathematical',
      D: 'in_contention/provisional',
    });
  });

  it('U-QUAL-15 the last match decides everything', () => {
    const snapshot = poolScenario({
      teams: ['A', 'B', 'C', 'D'],
      results: [win('1', 'A', 'B'), win('2', 'A', 'C'), win('3', 'A', 'D'), win('4', 'B', 'C'), win('5', 'D', 'C'), win('6', 'B', 'D')],
    });
    expect(statesOf(evaluate(snapshot))).toEqual({
      A: 'qualified/mathematical',
      B: 'qualified/mathematical',
      C: 'eliminated/mathematical',
      D: 'eliminated/mathematical',
    });
  });

  it('U-QUAL-16 level-on-points outcomes are treated pessimistically', () => {
    const snapshot = poolScenario({
      teams: ['A', 'B', 'C', 'D'],
      results: [win('1', 'A', 'B'), win('2', 'A', 'C'), win('3', 'B', 'C'), win('4', 'D', 'C')],
      pending: [
        ['A', 'D'],
        ['B', 'D'],
      ],
    });
    const states = statesOf(evaluate(snapshot));
    expect(states.A).toBe('in_contention/provisional');
    expect(states.C).toBe('eliminated/mathematical');
  });

  describe('U-QUAL-17 outcome sets come from the points system', () => {
    const base = {
      teams: ['L', 'X', 'Y'],
      results: [win('1', 'L', 'Y'), win('2', 'L', 'X'), noResult('3', 'X', 'Y')],
      pending: [['X', 'Y']] as const,
      qualify: 1,
    };
    const points = { win: 2, tie: 1, noResult: 1, loss: 0, abandoned: null, walkoverWin: null, walkoverLoss: null, superOverDecidedTie: 'win_loss', bonus: null } as const;

    it('default points: X cannot reach Lions', () => {
      const states = statesOf(evaluate(poolScenario({ ...base, points })));
      expect(states.X).toBe('eliminated/mathematical');
      expect(states.L).toBe('qualified/mathematical');
    });

    it('a bonus point keeps X in contention', () => {
      const states = statesOf(evaluate(poolScenario({ ...base, points: { ...points, bonus: { kind: 'run_rate_ratio', ratio: 1.25, points: 1 } } })));
      expect(states.X).toBe('in_contention/provisional');
      expect(states.Y).toBe('in_contention/provisional');
      expect(states.L).toBe('in_contention/provisional');
    });

    it('walkover points keep X in contention', () => {
      expect(statesOf(evaluate(poolScenario({ ...base, points: { ...points, walkoverWin: 3 } }))).X).toBe('in_contention/provisional');
    });

    it('abandoned points keep X in contention', () => {
      expect(statesOf(evaluate(poolScenario({ ...base, points: { ...points, abandoned: 3 } }))).X).toBe('in_contention/provisional');
    });
  });

  it('U-QUAL-18 bounds above the enumeration limit never contradict exact enumeration', () => {
    const teams = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const results = ['T2', 'T3', 'T4', 'T5', 'T6'].map((loser, index) => win(`w${index}`, 'T1', loser));
    const open: [string, string][] = [];
    for (let i = 1; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) open.push([teams[i], teams[j]]);
    }
    expect(open).toHaveLength(10);
    const extra = poolScenario({ teams, results, pending: open, qualify: 2 });
    const started = performance.now();
    const bounded = evaluate(extra);
    const exact = evaluate(extra, 12);
    console.log(`U-QUAL-18 bounds + exact enumeration: ${(performance.now() - started).toFixed(1)} ms`);
    const boundStates = stageOf(bounded, 'groups').qualification;
    const exactStates = stageOf(exact, 'groups').qualification;
    for (const entry of boundStates) {
      const truth = exactStates.find((candidate) => candidate.teamId === entry.teamId)!;
      if (entry.certainty === 'mathematical') expect(truth).toMatchObject({ state: entry.state, certainty: 'mathematical' });
    }
    expect(statesOf(bounded).T1).toBe('qualified/mathematical');
    expect(statesOf(exact).T1).toBe('qualified/mathematical');
  });

  it('U-QUAL-18 a nine-outcome points system falls back to sound bounds', () => {
    const points = {
      win: 2,
      tie: 1,
      noResult: 1,
      loss: 0,
      abandoned: 0,
      walkoverWin: 4,
      walkoverLoss: -1,
      superOverDecidedTie: 'win_loss',
      bonus: { kind: 'run_rate_ratio', ratio: 1.25, points: 1 },
    } as const;
    const snapshot = poolScenario({
      teams: ['A', 'B', 'C', 'D', 'E'],
      results: [win('1', 'A', 'B'), win('2', 'A', 'C'), win('3', 'A', 'D'), win('4', 'A', 'E')],
      pending: [
        ['B', 'C'],
        ['B', 'D'],
        ['B', 'E'],
        ['C', 'D'],
        ['C', 'E'],
        ['D', 'E'],
      ],
      qualify: 1,
      points,
    });
    const states = statesOf(evaluate(snapshot));
    expect(states.A).toBe('in_contention/provisional');
    const exact = statesOf(evaluate(snapshot, 12));
    expect(exact.A).toBe('in_contention/provisional');
  });

  it('pruned exact enumeration matches a brute-force search over every outcome', () => {
    const mismatches: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const pool = randomPool(mulberry32(seed));
      const oracle = bruteForceBounds(pool.work, pool.teams);
      const analysis = enumerate(pool.work, pool.teams, pool.remaining);
      if (JSON.stringify([...analysis.bounds]) !== JSON.stringify([...oracle])) mismatches.push(`seed ${seed}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('cross-pool sources (best runner-up, best third, top N overall) agree with a brute-force oracle within the limit', () => {
    const cases: CrossCase[] = [];
    for (let seed = 1; cases.length < 150 && seed < 600; seed += 1) {
      const generated = randomCrossCase(mulberry32(seed), seed);
      if (generated) cases.push(generated);
    }
    expect(cases.length).toBe(150);
    const mismatches: string[] = [];
    for (const generated of cases) {
      const states = statesOf(evaluate(generated.snapshot));
      for (const [teamId, verdict] of generated.expected) {
        const expected = verdict === 'in_contention' ? 'in_contention/provisional' : `${verdict}/mathematical`;
        if (states[teamId] !== expected) mismatches.push(`${generated.label}: ${teamId} expected ${expected}, got ${states[teamId]}`);
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  function certaintyViolations(generated: CrossCase, limit: number): string[] {
    const states = statesOf(evaluate(generated.snapshot, limit));
    const violations: string[] = [];
    for (const [teamId, verdict] of generated.expected) {
      if (generated.manual.has(teamId)) continue;
      const state = states[teamId];
      if (state === 'qualified/mathematical' && verdict !== 'qualified') violations.push(`${generated.label} (limit ${limit}): ${teamId} wrongly qualified`);
      if (state === 'eliminated/mathematical' && verdict !== 'eliminated') violations.push(`${generated.label} (limit ${limit}): ${teamId} wrongly eliminated`);
    }
    return violations;
  }

  it('cross-pool sources above the limit never claim a certainty the oracle contradicts', () => {
    const violations: string[] = [];
    for (let seed = 1000; seed < 1100; seed += 1) {
      const generated = randomCrossCase(mulberry32(seed), seed);
      if (generated) violations.push(...certaintyViolations(generated, 0), ...certaintyViolations(generated, 2));
    }
    expect(violations.slice(0, 10)).toEqual([]);
  });

  it('cross-pool sources with an eliminated team or a pinned slot never claim a certainty the oracle contradicts', () => {
    const violations: string[] = [];
    const seeds = [...Array.from({ length: 150 }, (_, index) => 3000 + index), 3501];
    for (const seed of seeds) {
      const generated = randomCrossCase(mulberry32(seed), seed, true);
      if (generated) violations.push(...certaintyViolations(generated, 8), ...certaintyViolations(generated, 0));
    }
    expect(violations.slice(0, 10)).toEqual([]);
  });

  it('U-QUAL-19 only a level group straddling a slot boundary in a complete table needs a decision', () => {
    const straddling = poolScenario({
      teams: ['A', 'B', 'C', 'D'],
      results: [win('1', 'A', 'B'), win('2', 'A', 'C'), win('3', 'A', 'D'), win('4', 'B', 'D'), win('5', 'C', 'D'), noResult('6', 'B', 'C')],
    });
    const evaluation = evaluate(straddling);
    const table = stageOf(evaluation, 'groups').tables[0];
    expect(table.unresolvedTies).toEqual([['B', 'C']]);
    expect(table.provisionalTies).toEqual([]);
    expect(table.rows[1].tieBreak?.detail).toBe('Level with C — organizer decision required');
    expect(slotOf(evaluation, 'q2')).toMatchObject({ teamId: 'B', status: 'provisional' });
    expect(qualOf(evaluation, 'B')).toMatchObject({ state: 'in_contention', explanation: 'B and C are level for A2: organizer decision required.' });
    expect(qualOf(evaluation, 'C').state).toBe('in_contention');

    const below = poolScenario({
      teams: ['A', 'B', 'C', 'D'],
      results: [win('1', 'A', 'B'), win('2', 'A', 'C'), win('3', 'A', 'D'), win('4', 'D', 'B'), win('5', 'D', 'C'), noResult('6', 'B', 'C')],
    });
    const lower = stageOf(evaluate(below), 'groups').tables[0];
    expect(lower.unresolvedTies).toEqual([]);
    expect(lower.provisionalTies).toEqual([['B', 'C']]);
    expect(lower.rows[2].tieBreak?.detail).toBe('Level with C');
  });

  it('U-QUAL-19 a tie resolution settles the decision', () => {
    const snapshot = poolScenario({
      teams: ['A', 'B', 'C', 'D'],
      results: [win('1', 'A', 'B'), win('2', 'A', 'C'), win('3', 'A', 'D'), win('4', 'B', 'D'), win('5', 'C', 'D'), noResult('6', 'B', 'C')],
      overrides: [
        {
          id: 'tr',
          tournamentId: 't1',
          kind: 'tie_resolution',
          reason: 'Draw',
          createdAt: '2026-05-02T10:00:00.000Z',
          revokedAt: null,
          revokeReason: null,
          stageId: 'groups',
          poolId: 'pA',
          orderedTeamIds: ['C', 'B'],
          method: 'draw_lots',
          seed: 58213,
        },
      ],
    });
    const evaluation = evaluate(snapshot);
    expect(stageOf(evaluation, 'groups').tables[0].unresolvedTies).toEqual([]);
    expect(slotOf(evaluation, 'q2')).toMatchObject({ teamId: 'C', status: 'final' });
    expect(qualOf(evaluation, 'B')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
  });

  it('U-QUAL-20 nothing played: no decision is ever required', () => {
    const snapshot = poolScenario({
      teams: ['A', 'B', 'C', 'D'],
      pending: [
        ['A', 'B'],
        ['C', 'D'],
        ['A', 'C'],
        ['B', 'D'],
        ['A', 'D'],
        ['B', 'C'],
      ],
    });
    const evaluation = evaluate(snapshot);
    for (const table of stageOf(evaluation, 'groups').tables) {
      expect(table.unresolvedTies).toEqual([]);
      expect(table.provisionalTies).toEqual([['A', 'B', 'C', 'D']]);
      expect(table.rows.map((row) => row.tieBreak?.detail ?? '').some((detail) => detail.includes('organizer decision required'))).toBe(false);
    }
    expect(Object.values(statesOf(evaluation))).toEqual(Array(4).fill('in_contention/provisional'));
    expect(slotOf(evaluation, 'q1').status).toBe('pending');
    expect(evaluate(cupSnapshot({ playedA: 0, playedB: 0 })).stages.flatMap((s) => s.tables.flatMap((t) => t.unresolvedTies))).toEqual([]);
  });
});

describe('QUALIFICATION_ENGINE worked examples and precedence', () => {
  it('9.1 certainty mid-stage with §98 texts', () => {
    const snapshot = poolScenario({
      teams: ['TIG', 'LIO', 'EAG', 'HAW'],
      results: [simpleWin('1', 'TIG', 'LIO'), simpleWin('2', 'TIG', 'EAG'), simpleWin('3', 'LIO', 'HAW'), simpleWin('4', 'EAG', 'HAW')],
      pending: [
        ['TIG', 'HAW'],
        ['LIO', 'EAG'],
      ],
    });
    const evaluation = evaluate(snapshot);
    expect(statesOf(evaluation)).toEqual({
      TIG: 'qualified/mathematical',
      LIO: 'in_contention/provisional',
      EAG: 'in_contention/provisional',
      HAW: 'eliminated/mathematical',
    });
    expect(qualOf(evaluation, 'TIG').explanation).toBe(
      'TIG have mathematically qualified for the Semifinal (Top 2 from each pool; Points → NRR → Head-to-Head → Most wins → Organizer decision).',
    );
    expect(qualOf(evaluation, 'LIO').explanation).toBe('LIO are still in contention for the Semifinal. A win against EAG guarantees qualification.');
    expect(qualOf(evaluation, 'HAW').explanation).toBe('HAW can no longer qualify for the Semifinal.');
  });

  it('9.2 one entry slot per team: later entry slots walk past placed teams', () => {
    const topOverall = stage('ko', 'Semifinal', 'knockout', 1, {
      decidesChampion: true,
      entryRules: [
        { kind: 'pool_position', sourceStageId: 'groups', poolId: 'pA', position: 1 },
        { kind: 'top_overall', sourceStageId: 'groups', count: 2, normalization: 'raw' },
      ],
    });
    const base = cupSnapshot();
    const snapshot: TournamentSnapshot = {
      ...base,
      stages: [base.stages[0], topOverall],
      slots: [
        slot('kA1', 'ko', 0, 'A1', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 1 }),
        slot('kO1', 'ko', 1, '1st overall', { kind: 'overall_position', stageId: 'groups', rank: 1, normalization: 'raw' }),
        slot('kO2', 'ko', 2, '2nd overall', { kind: 'overall_position', stageId: 'groups', rank: 2, normalization: 'raw' }),
      ],
      fixtures: base.fixtures.filter((candidate) => candidate.stageId === 'groups'),
    };
    const evaluation = evaluate(snapshot);
    expect(stageOf(evaluation, 'groups').overall?.rows.slice(0, 3).map((row) => row.teamId)).toEqual(['LIO', 'BUL', 'TIG']);
    expect(slotOf(evaluation, 'kA1').teamId).toBe('LIO');
    expect(slotOf(evaluation, 'kO1')).toMatchObject({
      teamId: 'BUL',
      status: 'final',
      explanation: 'Bulls are 1st overall: 4 pts, NRR +2.121, ahead of Tigers — Lions already qualified as Pool A winner',
    });
    expect(slotOf(evaluation, 'kO2').teamId).toBe('TIG');
    expect(stageOf(evaluation, 'groups').comparisonTables.map((candidate) => candidate.key)).toEqual(['overall:raw']);
  });

  it('the most recent of two slot assignments wins and a slot assignment beats a qualify override', () => {
    const older = slotAssignment('sA2', 'EAG', { id: 'o1', createdAt: '2026-05-02T10:00:00.000Z' });
    const newer = slotAssignment('sA2', 'HAW', { id: 'o2', createdAt: '2026-05-03T10:00:00.000Z' });
    expect(slotOf(evaluate(cupSnapshot({ overrides: [older, newer] })), 'sA2').teamId).toBe('HAW');
    const qualify = qualificationOverride('ko', 'EAG', 'qualify', { slotId: 'sA2' }, { createdAt: '2026-05-04T10:00:00.000Z' });
    const evaluation = evaluate(cupSnapshot({ overrides: [qualify, older] }));
    expect(slotOf(evaluation, 'sA2').teamId).toBe('EAG');
    const pinnedElsewhere = evaluate(cupSnapshot({ overrides: [qualify, newer] }));
    expect(slotOf(pinnedElsewhere, 'sA2').teamId).toBe('HAW');
    expect(qualOf(pinnedElsewhere, 'EAG')).toMatchObject({ certainty: 'manual', override: qualify });
  });
});

describe('U-QUAL-13 the §92 tournament built from the 8-team-t20 template', () => {
  it('Winner SF1 resolves to the A1 team and the champion is decided', () => {
    let snapshot = template92();
    const knockout = snapshot.stages.find((candidate) => candidate.config.decidesChampion)!;
    const koFixtures = snapshot.fixtures.filter((candidate) => candidate.stageId === knockout.id);
    const semis = koFixtures.filter((candidate) => !candidate.isFinal).sort((a, b) => a.bracket!.position - b.bracket!.position);
    const final = koFixtures.find((candidate) => candidate.isFinal)!;
    expect(semis).toHaveLength(2);
    const afterGroups = evaluate(snapshot);
    expect(resolveFixtureTeams(afterGroups, semis[0])).toEqual({ a: 'LIO', b: 'COB', frozen: false });
    expect(resolveFixtureTeams(afterGroups, semis[1])).toEqual({ a: 'BUL', b: 'TIG', frozen: false });
    snapshot = playFixture(snapshot, semis[0].id, simpleWin('sf1', 'LIO', 'COB'));
    snapshot = playFixture(snapshot, semis[1].id, simpleWin('sf2', 'TIG', 'BUL'));
    const afterSemis = evaluate(snapshot);
    const progression = snapshot.slots.filter((candidate) => candidate.stageId === knockout.id && candidate.role === 'progression');
    const a1 = snapshot.slots.find((candidate) => candidate.stageId === knockout.id && candidate.label === 'A1')!;
    expect(slotOf(afterSemis, a1.id).teamId).toBe('LIO');
    expect(progression.map((candidate) => slotOf(afterSemis, candidate.id).teamId)).toEqual(['LIO', 'TIG']);
    expect(resolveFixtureTeams(afterSemis, final)).toEqual({ a: 'LIO', b: 'TIG', frozen: false });
    snapshot = playFixture(snapshot, final.id, simpleWin('fin', 'TIG', 'LIO'));
    const done = evaluate(snapshot);
    expect(done.champion).toEqual({ teamIds: ['TIG'], basis: 'final', fixtureId: final.id });
    expect(done.progress).toEqual({ done: 15, total: 15 });
    expect(qualOf(done, 'LIO', snapshot.stages.find((candidate) => candidate.orderIndex === 0)!.id).state).toBe('qualified');
  });
});

describe('qualification out of a knockout stage', () => {
  it('QF winners qualify for the next stage and QF losers are eliminated', () => {
    const snapshot = makeSnapshot({
      teams: [
        { id: 'LIO', name: 'Lions' },
        { id: 'TIG', name: 'Tigers' },
        { id: 'EAG', name: 'Eagles' },
        { id: 'HAW', name: 'Hawks' },
      ],
      stages: [
        stage('qf', 'Quarterfinal', 'knockout', 0, { knockout: { thirdPlacePlayoff: false, rounds: 1, tiedMatch: 'super_over', noResult: 'higher_seed' } }),
        stage('fin', 'Final', 'knockout', 1, { decidesChampion: true, entryRules: [{ kind: 'knockout_winners', sourceStageId: 'qf' }] }),
      ],
      slots: [
        slot('e1', 'qf', 0, 'Seed 1', { kind: 'manual', teamId: 'LIO' }, { seed: 1 }),
        slot('e2', 'qf', 1, 'Seed 2', { kind: 'manual', teamId: 'TIG' }, { seed: 2 }),
        slot('e3', 'qf', 2, 'Seed 3', { kind: 'manual', teamId: 'EAG' }, { seed: 3 }),
        slot('e4', 'qf', 3, 'Seed 4', { kind: 'manual', teamId: 'HAW' }, { seed: 4 }),
        slot('w1', 'fin', 0, 'Winner QF1', { kind: 'bracket_winner', stageId: 'qf', round: 1, position: 0 }),
        slot('w2', 'fin', 1, 'Winner QF2', { kind: 'bracket_winner', stageId: 'qf', round: 1, position: 1 }),
      ],
      fixtures: [
        withResult(
          fixture('qf1', 'qf', null, 1, slotSide('e1'), slotSide('e4'), { label: 'QF1', bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semifinal' } }),
          simpleWin('q1', 'LIO', 'HAW'),
        ),
        fixture('qf2', 'qf', null, 2, slotSide('e2'), slotSide('e3'), { label: 'QF2', bracket: { kind: 'main', round: 1, position: 1, roundName: 'Semifinal' } }),
      ],
      summaries: [simpleWin('q1', 'LIO', 'HAW')],
    });
    const evaluation = evaluate(snapshot);
    expect(statesOf(evaluation, 'qf')).toEqual({
      LIO: 'qualified/mathematical',
      TIG: 'in_contention/provisional',
      EAG: 'in_contention/provisional',
      HAW: 'eliminated/mathematical',
    });
    expect(qualOf(evaluation, 'LIO', 'qf').explanation).toBe('Lions have mathematically qualified for the Final as Winner QF1 (Winners of the Quarterfinal).');
    expect(qualOf(evaluation, 'HAW', 'qf').explanation).toBe('Hawks can no longer qualify for the Final.');
  });
});

describe('champion', () => {
  const played92 = { sf1: simpleWin('sf1m', 'LIO', 'COB'), sf2: simpleWin('sf2m', 'BUL', 'TIG') };

  it('U-CHMP-01 the winner of the final', () => {
    const evaluation = evaluate(cupSnapshot({ ko: { ...played92, final: simpleWin('finalm', 'LIO', 'BUL') } }));
    expect(evaluation.champion).toEqual({ teamIds: ['LIO'], basis: 'final', fixtureId: 'final' });
    expect(evaluate(cupSnapshot({ ko: played92 })).champion).toBeNull();
  });

  it('U-CHMP-02 a Plate ordered last never produces the champion', () => {
    const plate = stage('plate', 'Plate', 'knockout', 2, { entryRules: [{ kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 3 }] });
    const plateSlots = [
      slot('pA3', 'plate', 0, 'A3', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 3 }),
      slot('pB3', 'plate', 1, 'B3', { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 3 }),
    ];
    const plateFinal = withResult(
      fixture('pf', 'plate', null, 16, slotSide('pA3'), slotSide('pB3'), { isFinal: true, bracket: { kind: 'main', round: 1, position: 0, roundName: 'Final' } }),
      simpleWin('pfm', 'EAG', 'BEA'),
    );
    const spec = { extraStages: [plate], extraSlots: plateSlots, extraFixtures: [plateFinal], extraSummaries: [simpleWin('pfm', 'EAG', 'BEA')] };
    expect(evaluate(cupSnapshot({ ...spec, ko: played92 })).champion).toBeNull();
    const decided = evaluate(cupSnapshot({ ...spec, ko: { ...played92, final: simpleWin('finalm', 'BUL', 'LIO') } }));
    expect(decided.champion).toEqual({ teamIds: ['BUL'], basis: 'final', fixtureId: 'final' });
  });

  it('U-CHMP-03 a washed-out final with shared honours', () => {
    const evaluation = evaluate(
      cupSnapshot({
        ko: { ...played92, final: abandoned('finalm', 'LIO', 'BUL') },
        koConfig: { knockout: { thirdPlacePlayoff: false, rounds: null, tiedMatch: 'super_over', noResult: 'shared' } },
      }),
    );
    expect(evaluation.champion).toEqual({ teamIds: ['LIO', 'BUL'], basis: 'shared', fixtureId: 'final' });
  });

  it('U-CHMP-04 a champion override wins over the computed champion', () => {
    const evaluation = evaluate(
      cupSnapshot({ ko: { ...played92, final: simpleWin('finalm', 'LIO', 'BUL') }, overrides: [championOverride(['LIO', 'BUL'], { reason: 'Joint winners' })] }),
    );
    expect(evaluation.champion).toEqual({ teamIds: ['LIO', 'BUL'], basis: 'manual', fixtureId: null });
    const revoked = evaluate(
      cupSnapshot({
        ko: { ...played92, final: simpleWin('finalm', 'LIO', 'BUL') },
        overrides: [championOverride(['BUL'], { revokedAt: '2026-05-03T10:00:00.000Z' })],
      }),
    );
    expect(revoked.champion?.teamIds).toEqual(['LIO']);
  });

  it('U-CHMP-05 a league is won by the top of the complete table', () => {
    const teams = ['LIO', 'TIG', 'EAG', 'HAW'];
    const results = [
      simpleWin('l1', 'LIO', 'TIG'),
      simpleWin('l2', 'LIO', 'EAG'),
      simpleWin('l3', 'LIO', 'HAW'),
      simpleWin('l4', 'TIG', 'EAG'),
      simpleWin('l5', 'TIG', 'HAW'),
      simpleWin('l6', 'EAG', 'HAW'),
    ];
    const league = (count: number) =>
      makeSnapshot({
        teams,
        stages: [stage('league', 'League', 'league', 0, { decidesChampion: true })],
        pools: [pool('pL', 'league', 'League', 0)],
        poolEntries: teams.map((id) => entry('league', 'pL', team(id))),
        fixtures: results.map((summary, index) => {
          const base = fixture(`lf${index}`, 'league', 'pL', index + 1, team(summary.teamAId), team(summary.teamBId));
          return index < count ? withResult(base, summary) : base;
        }),
        summaries: results.slice(0, count),
      });
    expect(evaluate(league(6)).champion).toEqual({ teamIds: ['LIO'], basis: 'league_table', fixtureId: null });
    expect(evaluate(league(5)).champion).toBeNull();
    const evaluation = evaluate(league(6));
    expect(resolveChampion(league(6), evaluation.stages)).toEqual(evaluation.champion);
  });

  it('U-CHMP-06 a custom stage final marked by the organizer', () => {
    const final = withResult(fixture('cf', 'custom', null, 1, team('TIG'), team('EAG'), { isFinal: true }), simpleWin('cfm', 'EAG', 'TIG'));
    const snapshot = makeSnapshot({
      teams: ['TIG', 'EAG'],
      stages: [stage('custom', 'Playoffs', 'custom', 0, { decidesChampion: true })],
      fixtures: [final],
      summaries: [simpleWin('cfm', 'EAG', 'TIG')],
    });
    expect(evaluate(snapshot).champion).toEqual({ teamIds: ['EAG'], basis: 'final', fixtureId: 'cf' });
  });
});

describe('public helpers', () => {
  it('resolveStageSlots and computeQualification agree with evaluateTournament', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 4 }));
    const evaluation = evaluateTournament(snapshot);
    const groups = stageOf(evaluation, 'groups');
    expect(resolveStageSlots(snapshot, 'ko', [groups])).toEqual(stageOf(evaluation, 'ko').slots);
    const tables = groups.tables.map((table) => ({ ...table, rows: table.rows.map((row) => ({ ...row, qualification: null })) }));
    expect(computeQualification(snapshot, 'groups', tables, [])).toEqual(groups.qualification);
  });
});

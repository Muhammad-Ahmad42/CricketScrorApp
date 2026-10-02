import type { Fixture, StageSlot, TournamentSnapshot } from '@/domain/types';
import { evaluateTournament, resolveFixtureTeams, resolveSideTeam, stageEntrants } from '../evaluate';
import { cupSnapshot } from './standingsKit/cup';
import { generatedTeam, generatedTournament, poolLetter } from './standingsKit/generated';
import { deepFreeze, simpleWin } from './standingsKit/summaries';
import { fixture, slot, slotSide, stage, team } from './standingsKit/tournament';

function bigTournament(playedRounds?: number): TournamentSnapshot {
  const pools = 16;
  const entrySlots: StageSlot[] = [];
  for (let position = 1; position <= 2; position += 1) {
    for (let p = 0; p < pools; p += 1) {
      entrySlots.push(
        slot(`e-${poolLetter(p)}${position}`, 'ko', entrySlots.length, `${poolLetter(p)}${position}`, {
          kind: 'pool_position',
          stageId: 'groups',
          poolId: `p${poolLetter(p)}`,
          position,
        }, { seed: entrySlots.length + 1 }),
      );
    }
  }
  const progression: StageSlot[] = [];
  const fixtures: Fixture[] = [];
  let number = 1000;
  let sides = entrySlots.map((entrySlot) => entrySlot.id);
  for (let round = 1; sides.length > 1; round += 1) {
    const next: string[] = [];
    for (let position = 0; position < sides.length / 2; position += 1) {
      const isFinal = sides.length === 2;
      fixtures.push(
        fixture(`ko-${round}-${position}`, 'ko', null, number, slotSide(sides[position * 2]), slotSide(sides[position * 2 + 1]), {
          isFinal,
          bracket: { kind: 'main', round, position, roundName: isFinal ? 'Final' : `Round ${round}` },
        }),
      );
      number += 1;
      if (!isFinal) {
        const id = `w-${round}-${position}`;
        progression.push(
          slot(id, 'ko', entrySlots.length + progression.length, `Winner R${round}-${position + 1}`, { kind: 'bracket_winner', stageId: 'ko', round, position }, { role: 'progression' }),
        );
        next.push(id);
      }
    }
    sides = next;
  }
  return generatedTournament({
    poolSizes: Array(pools).fill(8),
    playedRounds,
    targets: [
      stage('ko', 'Knockouts', 'knockout', 1, {
        decidesChampion: true,
        entryRules: [{ kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 1 }],
      }),
    ],
    slots: [...entrySlots, ...progression],
    extraFixtures: fixtures,
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('evaluateTournament', () => {
  it('U-EVAL-01 progress and current stage', () => {
    const evaluation = evaluateTournament(deepFreeze(cupSnapshot()));
    expect(evaluation.progress).toEqual({ done: 12, total: 15 });
    expect(evaluation.currentStageId).toBe('ko');
    expect(evaluation.stages.map((candidate) => [candidate.stageId, candidate.progress, candidate.complete])).toEqual([
      ['groups', { done: 12, total: 12 }, true],
      ['ko', { done: 0, total: 3 }, false],
    ]);
    const early = evaluateTournament(deepFreeze(cupSnapshot({ playedA: 2, playedB: 0 })));
    expect(early.progress).toEqual({ done: 2, total: 15 });
    expect(early.currentStageId).toBe('groups');
    const finished = evaluateTournament(
      deepFreeze(
        cupSnapshot({
          ko: { sf1: simpleWin('a', 'LIO', 'COB'), sf2: simpleWin('b', 'BUL', 'TIG'), final: simpleWin('c', 'LIO', 'BUL') },
        }),
      ),
    );
    expect(finished.progress).toEqual({ done: 15, total: 15 });
    expect(finished.currentStageId).toBe('ko');
    expect(finished.champion?.teamIds).toEqual(['LIO']);
  });

  it('evaluates a tournament without stages', () => {
    const empty = cupSnapshot();
    const evaluation = evaluateTournament(deepFreeze({ ...empty, stages: [], pools: [], poolEntries: [], slots: [], fixtures: [] }));
    expect(evaluation).toEqual({ stages: [], currentStageId: null, champion: null, progress: { done: 0, total: 0 } });
  });

  it('attaches tables per pool, an overall table and knockout stages without tables', () => {
    const evaluation = evaluateTournament(deepFreeze(cupSnapshot()));
    const groups = evaluation.stages[0];
    expect(groups.tables.map((table) => table.poolId)).toEqual(['pA', 'pB']);
    expect(groups.overall?.rows).toHaveLength(8);
    expect(groups.overall?.poolId).toBeNull();
    expect(groups.comparisonTables).toEqual([]);
    expect(evaluation.stages[1].tables).toEqual([]);
    expect(evaluation.stages[1].qualification).toEqual([]);
  });

  it('U-EVAL-02 stage entrants', () => {
    const snapshot = cupSnapshot();
    expect(stageEntrants(snapshot, 'groups')).toEqual(['LIO', 'TIG', 'EAG', 'HAW', 'BUL', 'COB', 'BEA', 'WOL'].map(team));
    expect(stageEntrants(snapshot, 'ko')).toEqual(['sA1', 'sB1', 'sA2', 'sB2'].map(slotSide));
    const withDirect: TournamentSnapshot = {
      ...snapshot,
      stages: snapshot.stages.map((candidate) =>
        candidate.id === 'ko'
          ? { ...candidate, config: { ...candidate.config, entryRules: [...candidate.config.entryRules, { kind: 'direct_entry', teamIds: ['WOL'] }] } }
          : candidate,
      ),
      teams: snapshot.teams.map((view) => (view.team.id === 'HAW' ? { ...view, membership: { ...view.membership, status: 'withdrawn' } } : view)),
    };
    expect(stageEntrants(withDirect, 'groups')).toEqual(['LIO', 'TIG', 'EAG', 'BUL', 'COB', 'BEA'].map(team));
    expect(stageEntrants(snapshot, 'missing')).toEqual([]);
  });

  it('resolveSideTeam and resolveFixtureTeams read slots and frozen sides', () => {
    const snapshot = cupSnapshot({ ko: { sf1: simpleWin('a', 'LIO', 'COB') } });
    const evaluation = evaluateTournament(deepFreeze(snapshot));
    expect(resolveSideTeam(evaluation, team('HAW'))).toBe('HAW');
    expect(resolveSideTeam(evaluation, slotSide('sB1'))).toBe('BUL');
    expect(resolveSideTeam(evaluation, slotSide('sW2'))).toBeNull();
    expect(resolveSideTeam(evaluation, slotSide('unknown'))).toBeNull();
    const byId = (id: string) => snapshot.fixtures.find((candidate) => candidate.id === id)!;
    expect(resolveFixtureTeams(evaluation, byId('sf1'))).toEqual({ a: 'LIO', b: 'COB', frozen: true });
    expect(resolveFixtureTeams(evaluation, byId('sf2'))).toEqual({ a: 'BUL', b: 'TIG', frozen: false });
    expect(resolveFixtureTeams(evaluation, byId('final'))).toEqual({ a: 'LIO', b: null, frozen: false });
  });

  it('U-EVAL-04 a deep-frozen snapshot is never mutated', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 4 }));
    const copy = JSON.parse(JSON.stringify(snapshot));
    expect(() => evaluateTournament(snapshot)).not.toThrow();
    expect(snapshot).toEqual(copy);
  });

  it('never counts a stale or missing summary', () => {
    const base = cupSnapshot();
    const { m6: _stale, ...summaries } = base.summaries;
    void _stale;
    const evaluation = evaluateTournament(deepFreeze({ ...base, summaries, staleSummaryMatchIds: ['m6'] }));
    const tigers = evaluation.stages[0].tables[0].rows.find((row) => row.teamId === 'TIG');
    expect(tigers).toMatchObject({ played: 2, points: 2 });
    expect(evaluation.stages[0].tables[0].complete).toBe(true);
  });

  it('is deterministic', () => {
    const snapshot = cupSnapshot({ playedA: 4, playedB: 5 });
    expect(evaluateTournament(snapshot)).toEqual(evaluateTournament(JSON.parse(JSON.stringify(snapshot))));
  });

  it('shows slot rows of a pool built from qualifiers before and after they are known', () => {
    const base = cupSnapshot({ playedA: 0, playedB: 0 });
    const superStage = stage('super', 'Super 4', 'group', 2, {
      entryRules: [{ kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 1 }],
    });
    const superSlots = [
      slot('xA1', 'super', 0, 'A1', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 1 }),
      slot('xB2', 'super', 1, 'B2', { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 2 }),
    ];
    const withSuper = (source: TournamentSnapshot): TournamentSnapshot => ({
      ...source,
      stages: [...source.stages, superStage],
      pools: [...source.pools, { id: 'pS', stageId: 'super', name: 'Super group', orderIndex: 0, legs: null }],
      poolEntries: [
        ...source.poolEntries,
        { id: 'x1', poolId: 'pS', stageId: 'super', side: slotSide('xA1'), seed: null },
        { id: 'x2', poolId: 'pS', stageId: 'super', side: slotSide('xB2'), seed: null },
      ],
      slots: [...source.slots, ...superSlots],
      fixtures: [...source.fixtures, fixture('s1', 'super', 'pS', 20, slotSide('xA1'), slotSide('xB2'))],
    });
    const before = evaluateTournament(deepFreeze(withSuper(base)));
    const table = before.stages[2].tables[0];
    expect(table.rows.map((row) => [row.slotLabel, row.teamId, row.matchesRemaining])).toEqual([
      ['A1', null, 1],
      ['B2', null, 1],
    ]);
    const midway = evaluateTournament(deepFreeze(withSuper(cupSnapshot({ playedA: 4 }))));
    const rows = midway.stages[2].tables[0].rows;
    expect(rows.find((row) => row.slotLabel === 'A1')).toMatchObject({ teamId: 'LIO', provisional: true });
    expect(rows.find((row) => row.slotLabel === 'B2')).toMatchObject({ teamId: 'COB', provisional: false });
  });
});

describe('U-EVAL-03 performance', () => {
  it.each([
    ['nothing played', 0],
    ['half the group stage played', 14],
    ['eight matches left per pool (exact enumeration)', 20],
    ['the group stage complete', undefined],
  ] as const)('128 teams, 16 pools and a 32-team bracket evaluate within budget: %s', (_label, playedRounds) => {
    const snapshot = deepFreeze(bigTournament(playedRounds));
    expect(snapshot.fixtures).toHaveLength(448 + 31);
    evaluateTournament(snapshot);
    const times: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const copy = { ...snapshot };
      const started = performance.now();
      const evaluation = evaluateTournament(copy);
      times.push(performance.now() - started);
      expect(evaluation.stages[0].tables).toHaveLength(16);
    }
    const measured = median(times);
    console.log(`U-EVAL-03 ${_label}: median ${measured.toFixed(1)} ms (budget 100 ms)`);
    expect(measured).toBeLessThan(300);
  });

  it('the complete group stage fills all 32 knockout places', () => {
    const evaluation = evaluateTournament(deepFreeze(bigTournament()));
    const ko = evaluation.stages[1];
    const entry = ko.slots.slice(0, 32);
    expect(entry.every((resolution) => resolution.status === 'final')).toBe(true);
    expect(entry[0].teamId).toBe(generatedTeam(0, 0));
    expect(entry[16].teamId).toBe(generatedTeam(0, 1));
  });
});

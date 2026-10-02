/** @jest-environment node */
import { BUILTIN_FORMAT_PRESETS } from '@/domain/scoring/presets';
import { DEFAULT_KNOCKOUT_CONFIG, DEFAULT_NRR_CONFIG, DEFAULT_POINTS_SYSTEM, DEFAULT_STAGE_CONFIGS, DEFAULT_TIE_BREAKERS } from '@/domain/tournament/defaults';
import { knockoutBracket, roundRobin } from '@/domain/tournament/fixtures';
import { seedEntrants, type SeededEntrant } from '@/domain/tournament/knockout';
import { distributePoolSizes } from '@/domain/tournament/pools';
import { expandEntryRules } from '@/domain/tournament/slots';
import {
  builtinTemplates,
  instantiateTemplate,
  templateFitsTeamCount,
  templateFromSnapshot,
  type InstantiatedStructure,
} from '@/domain/tournament/templates';
import type { FixtureSide, PoolEntry, StageSlot, StageType, TemplateStage, TournamentSnapshot, TournamentTemplate } from '@/domain/types';
import { deepFreeze, draftDefaults, idSequence, label, snapshotFrom, teams } from './structure/support';

const NOW = '2026-05-01T08:00:00.000Z';

function instantiate(template: TournamentTemplate, prefix = 'id'): InstantiatedStructure {
  return instantiateTemplate(template, { tournamentId: 'tour-1', now: NOW, ids: idSequence(prefix) });
}

function byId(id: string): TournamentTemplate {
  const found = builtinTemplates().find((template) => template.id === id);
  if (!found) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function entrySlotsOf(structure: InstantiatedStructure, stageIndex: number): readonly StageSlot[] {
  const stageId = structure.stages[stageIndex].id;
  return structure.slots.filter((s) => s.stageId === stageId && s.role === 'entry').sort((a, b) => a.index - b.index);
}

function seededFromSlots(structure: InstantiatedStructure, slots: readonly StageSlot[]): readonly SeededEntrant[] {
  return slots.map((s) => {
    if (s.source.kind !== 'pool_position') {
      return { side: { kind: 'slot', slotId: s.id }, rank: null, poolIndex: null, poolPosition: null };
    }
    const poolId = s.source.poolId;
    const poolIndex = structure.pools.find((p) => p.id === poolId)?.orderIndex ?? null;
    return { side: { kind: 'slot', slotId: s.id }, rank: null, poolIndex, poolPosition: s.source.position };
  });
}

function fixtureCount(template: TournamentTemplate, structure: InstantiatedStructure): number {
  const teamCount = template.teamCount ?? 0;
  return structure.stages.reduce((total, stage, index) => {
    const pools = structure.pools.filter((p) => p.stageId === stage.id);
    const entrants = stage.config.entryRules.length > 0 ? entrySlotsOf(structure, index).length : teamCount;
    if (stage.config.fixtureGeneration.method === 'knockout') {
      const entrantsSides: readonly FixtureSide[] = teams(entrants);
      return total + knockoutBracket(entrantsSides, { thirdPlacePlayoff: false, rounds: null, firstSlotIndex: entrants, defaults: draftDefaults() }, idSequence()).fixtures.length;
    }
    return (
      total +
      distributePoolSizes(entrants, pools.length).reduce(
        (sum, size) => sum + (size < 2 ? 0 : roundRobin(teams(size), stage.config.fixtureGeneration.legs).reduce((n, r) => n + r.pairings.length, 0)),
        0,
      )
    );
  }, 0);
}

describe('competition defaults', () => {
  it('pre-fill 2/1/1/0 points, the ICC NRR method and the documented tie-break chain', () => {
    expect([DEFAULT_POINTS_SYSTEM.win, DEFAULT_POINTS_SYSTEM.tie, DEFAULT_POINTS_SYSTEM.noResult, DEFAULT_POINTS_SYSTEM.loss]).toEqual([2, 1, 1, 0]);
    expect(DEFAULT_POINTS_SYSTEM.superOverDecidedTie).toBe('win_loss');
    expect(DEFAULT_NRR_CONFIG).toMatchObject({ mode: 'icc', includeNoResult: false, includeAbandoned: false, walkover: { kind: 'exclude' } });
    expect(DEFAULT_TIE_BREAKERS).toEqual(['points', 'nrr', 'head_to_head', 'wins', 'organizer_decision']);
  });

  it('give every stage type a matching fixture method and knockout config', () => {
    expect(DEFAULT_STAGE_CONFIGS.league.fixtureGeneration).toEqual({ method: 'round_robin', legs: 1 });
    expect(DEFAULT_STAGE_CONFIGS.group.knockout).toBeNull();
    expect(DEFAULT_STAGE_CONFIGS.knockout.fixtureGeneration.method).toBe('knockout');
    expect(DEFAULT_STAGE_CONFIGS.knockout.knockout).toEqual(DEFAULT_KNOCKOUT_CONFIG);
    expect(DEFAULT_STAGE_CONFIGS.custom.fixtureGeneration.method).toBe('manual');
    expect(Object.values(DEFAULT_STAGE_CONFIGS).every((config) => !config.decidesChampion && config.entryRules.length === 0)).toBe(true);
  });
});

describe('builtinTemplates', () => {
  it('U-TPL-01 five built-ins with one champion stage each, identical and frozen on every call', () => {
    const templates = builtinTemplates();
    expect(templates.map((t) => t.id)).toEqual([
      'builtin:8-team-t20',
      'builtin:4-team-league',
      'builtin:8-team-knockout',
      'builtin:16-team-groups',
      'builtin:20-team-pools',
    ]);
    expect(templates.every((t) => t.stages.filter((s) => s.decidesChampion).length === 1)).toBe(true);
    expect(builtinTemplates()).toBe(templates);
    expect(JSON.stringify(builtinTemplates())).toBe(JSON.stringify(templates));
    expect(isDeepFrozen(templates)).toBe(true);
    expect(Object.isFrozen(DEFAULT_POINTS_SYSTEM)).toBe(false);
  });

  it('uses the default rules, the T20 preset and the fixed timestamp', () => {
    const t20 = BUILTIN_FORMAT_PRESETS.find((p) => p.id === 'T20');
    for (const template of builtinTemplates()) {
      expect(template.builtin).toBe(true);
      expect(template.pointsSystem).toEqual(DEFAULT_POINTS_SYSTEM);
      expect(template.nrr).toEqual(DEFAULT_NRR_CONFIG);
      expect(template.tieBreakers).toEqual(DEFAULT_TIE_BREAKERS);
      expect(template.defaultFormatId).toBe('T20');
      expect(template.defaultMatchRules).toEqual(t20?.rules);
      expect(template.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(template.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    }
  });

  it('describes the documented structures', () => {
    expect(byId('builtin:8-team-t20').stages.map((s) => [s.type, s.poolCount, s.seeding])).toEqual([
      ['group', 2, 'fixed'],
      ['knockout', 0, 'fixed'],
    ]);
    expect(byId('builtin:4-team-league').stages.map((s) => [s.type, s.poolCount, s.fixtureGeneration.legs, s.decidesChampion])).toEqual([['league', 1, 2, true]]);
    expect(byId('builtin:8-team-knockout').stages.map((s) => [s.type, s.seeding, s.entry.length, s.decidesChampion])).toEqual([['knockout', 'ranking', 0, true]]);
    expect(byId('builtin:16-team-groups').stages[1].entry).toEqual([{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }]);
    expect(byId('builtin:20-team-pools').stages[1].entry).toEqual([{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 1, fromPosition: 1 }]);
    expect(builtinTemplates().map((t) => t.teamCount)).toEqual([8, 4, 8, 16, 20]);
  });
});

describe('instantiateTemplate', () => {
  it('U-TPL-02 8-team T20: group stage, knockouts with entry slots 0-3 and progression slots 4-5 at generation', () => {
    const structure = instantiate(byId('builtin:8-team-t20'), 't');
    const [groups, knockouts] = structure.stages;
    expect(structure.stages).toHaveLength(2);
    expect(groups).toMatchObject({ name: 'Group Stage', type: 'group', orderIndex: 0, status: 'pending', tournamentId: 'tour-1', createdAt: NOW, updatedAt: NOW });
    expect(groups.config.fixtureGeneration).toEqual({ method: 'round_robin', legs: 1 });
    expect(groups.config.decidesChampion).toBe(false);
    expect(knockouts).toMatchObject({ name: 'Knockouts', type: 'knockout', orderIndex: 1 });
    expect(knockouts.config).toMatchObject({ decidesChampion: true, seeding: 'fixed', seedingSeed: null, knockout: DEFAULT_KNOCKOUT_CONFIG });
    expect(knockouts.config.entryRules).toEqual([{ kind: 'top_per_pool', sourceStageId: groups.id, count: 2, fromPosition: 1 }]);
    expect(structure.pools.map((p) => [p.stageId, p.name, p.orderIndex, p.legs])).toEqual([
      [groups.id, 'Pool A', 0, null],
      [groups.id, 'Pool B', 1, null],
    ]);
    const entries = entrySlotsOf(structure, 1);
    expect(entries.map((s) => `${s.index}:${s.label}`)).toEqual(['0:A1', '1:B1', '2:A2', '3:B2']);
    expect(structure.slots).toEqual(entries);
    expect(structure.poolEntries).toEqual([]);
    expect(structure.rules).toEqual({
      tournamentId: 'tour-1',
      pointsSystem: DEFAULT_POINTS_SYSTEM,
      nrr: DEFAULT_NRR_CONFIG,
      tieBreakers: DEFAULT_TIE_BREAKERS,
      defaultFormatId: 'T20',
      defaultMatchRules: byId('builtin:8-team-t20').defaultMatchRules,
      updatedAt: NOW,
    });
    const plan = knockoutBracket(
      seedEntrants(seededFromSlots(structure, entries), knockouts.config.seeding, null),
      { thirdPlacePlayoff: false, rounds: null, firstSlotIndex: 4, defaults: draftDefaults({ stageId: knockouts.id }) },
      idSequence('ko'),
    );
    const name = (side: FixtureSide): string =>
      side.kind === 'slot' ? ([...entries, ...plan.slots].find((s) => s.id === side.slotId)?.label ?? '?') : side.teamId;
    expect(plan.fixtures.map((f) => `${f.label}: ${name(f.sideA)} v ${name(f.sideB)}`)).toEqual(['SF1: A1 v B2', 'SF2: B1 v A2', 'Final: Winner SF1 v Winner SF2']);
    expect(plan.slots.map((s) => [s.index, s.label, s.role, s.source.kind])).toEqual([
      [4, 'Winner SF1', 'progression', 'bracket_winner'],
      [5, 'Winner SF2', 'progression', 'bracket_winner'],
    ]);
    expect(plan.entrySlotSeeds.map((e) => [entries.find((s) => s.id === e.slotId)?.label, e.seed])).toEqual([
      ['A1', 1],
      ['B1', 2],
      ['A2', 3],
      ['B2', 4],
    ]);
  });

  it.each<[string, number, readonly number[], number, number]>([
    ['builtin:8-team-t20', 2, [2, 0], 4, 15],
    ['builtin:4-team-league', 1, [1], 0, 12],
    ['builtin:8-team-knockout', 1, [0], 0, 7],
    ['builtin:16-team-groups', 2, [4, 0], 8, 31],
    ['builtin:20-team-pools', 2, [4, 0], 4, 43],
  ])('U-TPL-03 %s instantiates for its team count', (id, stageCount, poolCounts, slotCount, fixtures) => {
    const template = byId(id);
    const structure = instantiate(template);
    expect(templateFitsTeamCount(template, template.teamCount ?? 0)).toEqual({ ok: true, message: null });
    expect(structure.stages).toHaveLength(stageCount);
    expect(structure.stages.map((stage) => structure.pools.filter((p) => p.stageId === stage.id).length)).toEqual(poolCounts);
    expect(structure.slots).toHaveLength(slotCount);
    expect(structure.stages.filter((s) => s.config.decidesChampion)).toHaveLength(1);
    expect(fixtureCount(template, structure)).toBe(fixtures);
    const ids = [...structure.stages.map((s) => s.id), ...structure.pools.map((p) => p.id), ...structure.slots.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic for the same id generator', () => {
    expect(instantiate(byId('builtin:16-team-groups'))).toEqual(instantiate(byId('builtin:16-team-groups')));
  });

  it('refuses a template whose entry rule points at a later or unknown stage', () => {
    const broken: TournamentTemplate = {
      ...byId('builtin:8-team-t20'),
      stages: [...byId('builtin:8-team-t20').stages].reverse(),
    };
    expect(() => instantiate(broken)).toThrow();
  });
});

describe('templateFitsTeamCount', () => {
  it('U-TPL-04 explains a team count mismatch', () => {
    expect(templateFitsTeamCount(byId('builtin:8-team-t20'), 10)).toEqual({ ok: false, message: 'Designed for 8 teams; you have 10.' });
    expect(templateFitsTeamCount(byId('builtin:20-team-pools'), 16)).toEqual({ ok: false, message: 'Designed for 20 teams; you have 16.' });
  });

  it('checks open-size templates against their pools', () => {
    const open: TournamentTemplate = { ...byId('builtin:16-team-groups'), teamCount: null };
    expect(templateFitsTeamCount(open, 12)).toEqual({ ok: true, message: null });
    expect(templateFitsTeamCount(open, 6)).toEqual({ ok: false, message: '4 pools need at least 8 teams; you have 6.' });
    expect(templateFitsTeamCount(open, 1)).toEqual({ ok: false, message: 'A tournament needs at least 2 teams; you have 1.' });
    const uneven: TournamentTemplate = { ...open, stages: [{ ...open.stages[0], poolCount: 3, poolSizes: [4, 3, 3] }, open.stages[1]] };
    expect(templateFitsTeamCount(uneven, 10).ok).toBe(true);
    expect(templateFitsTeamCount(uneven, 11)).toEqual({ ok: false, message: 'Designed for pools of 4, 3, 3 (10 teams); you have 11.' });
  });
});

function templateStage(key: string, name: string, type: StageType, overrides: Partial<TemplateStage> = {}): TemplateStage {
  const config = DEFAULT_STAGE_CONFIGS[type];
  return {
    key,
    name,
    type,
    poolCount: 0,
    poolSizes: null,
    poolSlotIndexes: null,
    fixtureGeneration: config.fixtureGeneration,
    seeding: config.seeding,
    seedingNormalization: config.seedingNormalization,
    entry: [],
    knockout: config.knockout,
    abandonedMatches: config.abandonedMatches,
    decidesChampion: false,
    headToHeadRequiresCompleteMiniLeague: false,
    formatId: null,
    matchRules: null,
    pointsSystem: null,
    tieBreakers: null,
    nrr: null,
    ...overrides,
  };
}

const SUPER_EIGHT: TournamentTemplate = deepFreeze({
  ...byId('builtin:8-team-t20'),
  id: 'user:super-8',
  name: 'Super 8 Cup',
  description: 'Groups, Super 8, quarterfinals and finals.',
  builtin: false,
  teamCount: 20,
  structureKind: 'custom',
  stages: [
    templateStage('groups', 'Group Stage', 'group', { poolCount: 4 }),
    templateStage('super8', 'Super 8', 'group', {
      poolCount: 2,
      poolSlotIndexes: [
        [0, 5, 2, 7],
        [1, 4, 3, 6],
      ],
      entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }],
    }),
    templateStage('qf', 'Quarterfinals', 'knockout', {
      knockout: { ...DEFAULT_KNOCKOUT_CONFIG, rounds: 1 },
      entry: [
        { kind: 'top_per_pool', sourceStageKey: 'super8', count: 2, fromPosition: 1 },
        { kind: 'direct_entry', count: 4 },
      ],
    }),
    templateStage('finals', 'Finals', 'knockout', {
      knockout: { ...DEFAULT_KNOCKOUT_CONFIG, thirdPlacePlayoff: true },
      entry: [{ kind: 'knockout_winners', sourceStageKey: 'qf' }],
      decidesChampion: true,
    }),
  ],
});

function signature(structure: Pick<TournamentSnapshot, 'stages' | 'pools' | 'slots' | 'poolEntries'>): unknown {
  const stageName = new Map(structure.stages.map((s) => [s.id, s.name]));
  const poolName = new Map(structure.pools.map((p) => [p.id, `${stageName.get(p.stageId)}/${p.name}`]));
  const slotIndex = new Map(structure.slots.map((s) => [s.id, s.index]));
  const rename = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value), (key, item: unknown) => {
      if (key === 'teamId' || key === 'teamIds') {
        return undefined;
      }
      if (typeof item === 'string' && stageName.has(item)) {
        return stageName.get(item);
      }
      if (typeof item === 'string' && poolName.has(item)) {
        return poolName.get(item);
      }
      return item;
    });
  return structure.stages.map((stage) => ({
    name: stage.name,
    type: stage.type,
    orderIndex: stage.orderIndex,
    config: rename(stage.config),
    pools: structure.pools.filter((p) => p.stageId === stage.id).map((p) => [p.name, p.orderIndex, p.legs]),
    entrySlots: structure.slots
      .filter((s) => s.stageId === stage.id && s.role === 'entry')
      .map((s) => [s.index, s.label, rename(s.source)]),
    slotPools: structure.pools
      .filter((p) => p.stageId === stage.id)
      .map((p) => structure.poolEntries.filter((e) => e.poolId === p.id && e.side.kind === 'slot').map((e) => (e.side.kind === 'slot' ? slotIndex.get(e.side.slotId) : -1))),
  }));
}

function playedSuperEight(): { readonly snapshot: TournamentSnapshot; readonly original: InstantiatedStructure } {
  const original = instantiate(SUPER_EIGHT, 'orig');
  const ids = idSequence('snap');
  const [groups, , qf, finals] = original.stages;
  const groupPools = original.pools.filter((p) => p.stageId === groups.id);
  const teamIds = teams(20).map(label);
  const groupEntries: readonly PoolEntry[] = teamIds.slice(0, 16).map((teamId, index) => ({
    id: ids(),
    poolId: groupPools[index % 4].id,
    stageId: groups.id,
    side: { kind: 'team', teamId },
    seed: null,
  }));
  const qfRules = [qf.config.entryRules[0], { kind: 'direct_entry' as const, teamIds: teamIds.slice(16) }];
  const qfExisting = original.slots.filter((s) => s.stageId === qf.id);
  const poolsByStage = new Map(original.stages.map((s) => [s.id, original.pools.filter((p) => p.stageId === s.id)]));
  const qfSlots = expandEntryRules(qf.id, qfRules, { pools: poolsByStage, brackets: new Map() }, qfExisting, ids).slots;
  const finalsEntries = original.slots.filter((s) => s.stageId === finals.id);
  const progression = knockoutBracket(
    finalsEntries.map((s): FixtureSide => ({ kind: 'slot', slotId: s.id })),
    { thirdPlacePlayoff: true, rounds: null, firstSlotIndex: finalsEntries.length, defaults: draftDefaults({ stageId: finals.id }) },
    ids,
  ).slots;
  const stages = original.stages.map((s) => (s.id === qf.id ? { ...s, config: { ...s.config, entryRules: qfRules } } : s));
  const slots = [...original.slots.filter((s) => s.stageId !== qf.id), ...qfSlots, ...progression];
  const snapshot = deepFreeze(
    snapshotFrom({ rules: original.rules, stages, pools: original.pools, slots, poolEntries: [...groupEntries, ...original.poolEntries] }, { teamIds, structureKind: 'custom' }),
  );
  return { snapshot, original };
}

const SIX_QUALIFIERS: TournamentTemplate = deepFreeze({
  ...byId('builtin:8-team-t20'),
  id: 'user:six-qualifiers',
  builtin: false,
  teamCount: 12,
  structureKind: 'custom',
  stages: [
    templateStage('groups', 'Groups', 'group', { poolCount: 3 }),
    templateStage('qf', 'Quarterfinals', 'knockout', {
      knockout: { ...DEFAULT_KNOCKOUT_CONFIG, rounds: 1 },
      entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }],
    }),
    templateStage('final4', 'Final four', 'knockout', {
      entry: [{ kind: 'knockout_winners', sourceStageKey: 'qf' }],
      decidesChampion: true,
    }),
  ],
});

describe('knockout winners of a bracket with byes', () => {
  it('label each slot like the quarterfinal it comes from and name the bye seeds', () => {
    const structure = instantiate(SIX_QUALIFIERS, 'six');
    const qfSlots = entrySlotsOf(structure, 1);
    expect(qfSlots).toHaveLength(6);
    const plan = knockoutBracket(
      qfSlots.map((s): FixtureSide => ({ kind: 'slot', slotId: s.id })),
      { thirdPlacePlayoff: false, rounds: 1, firstSlotIndex: 6, defaults: draftDefaults({ stageId: structure.stages[1].id }) },
      idSequence('qf'),
    );
    const fixtureAt = new Map(plan.fixtures.map((f) => [f.bracket?.position, f.label]));
    const finalFour = entrySlotsOf(structure, 2);
    expect(finalFour.map((s) => s.label)).toEqual(['QF seed 1', 'Winner QF1', 'QF seed 2', 'Winner QF2']);
    for (const slot of finalFour) {
      const fixture = slot.source.kind === 'bracket_winner' ? fixtureAt.get(slot.source.position) : undefined;
      if (fixture !== undefined) {
        expect(slot.label).toBe(`Winner ${fixture}`);
      }
    }
  });

  it('keep those labels through a save and a new instantiation', () => {
    const structure = instantiate(SIX_QUALIFIERS, 'six');
    const saved = templateFromSnapshot(snapshotFrom(structure, { structureKind: 'custom' }), { id: 'user:copy', name: 'Copy', description: '', now: NOW });
    expect(entrySlotsOf(instantiate(saved, 'copy'), 2).map((s) => s.label)).toEqual(['QF seed 1', 'Winner QF1', 'QF seed 2', 'Winner QF2']);
  });
});

describe('templateFromSnapshot', () => {
  const meta = { id: 'user:copy', name: 'Copy', description: 'Saved from Spring Cup', now: NOW };

  it('U-TPL-05 Super 8 tournament: slot pools, direct entries and knockout winners survive', () => {
    const { snapshot } = playedSuperEight();
    const template = templateFromSnapshot(snapshot, meta);
    expect(template).toMatchObject({ id: 'user:copy', name: 'Copy', description: 'Saved from Spring Cup', builtin: false, teamCount: 20, structureKind: 'custom', createdAt: NOW, updatedAt: NOW });
    expect(template.stages.map((s) => s.key)).toEqual(['stage-1', 'stage-2', 'stage-3', 'stage-4']);
    expect(template.stages[0]).toMatchObject({ name: 'Group Stage', poolCount: 4, poolSizes: null, poolSlotIndexes: null, entry: [] });
    expect(template.stages[1].poolSlotIndexes).toEqual([
      [0, 5, 2, 7],
      [1, 4, 3, 6],
    ]);
    expect(template.stages[1].entry).toEqual([{ kind: 'top_per_pool', sourceStageKey: 'stage-1', count: 2, fromPosition: 1 }]);
    expect(template.stages[2].entry).toEqual([
      { kind: 'top_per_pool', sourceStageKey: 'stage-2', count: 2, fromPosition: 1 },
      { kind: 'direct_entry', count: 4 },
    ]);
    expect(template.stages[2].knockout).toEqual({ ...DEFAULT_KNOCKOUT_CONFIG, rounds: 1 });
    expect(template.stages[3].entry).toEqual([{ kind: 'knockout_winners', sourceStageKey: 'stage-3' }]);
    expect(template.stages.map((s) => s.decidesChampion)).toEqual([false, false, false, true]);
    expect(template.pointsSystem).toEqual(snapshot.rules.pointsSystem);
    expect(JSON.stringify(template)).not.toContain('T01');
  });

  it('U-TPL-05 instantiating the saved template gives the same structure (ids aside)', () => {
    const { snapshot, original } = playedSuperEight();
    const template = templateFromSnapshot(snapshot, meta);
    const again = instantiate(template, 'again');
    expect(signature(again)).toEqual(signature(original));
    expect(entrySlotsOf(again, 3).map((s) => s.label)).toEqual(['Winner QF1', 'Winner QF2', 'Winner QF3', 'Winner QF4']);
    const roundTrip = templateFromSnapshot(snapshotFrom(again, { teamIds: teams(20).map(label), structureKind: 'custom' }), meta);
    expect(roundTrip).toEqual(template);
  });

  it('round-trips every built-in structure', () => {
    for (const builtin of builtinTemplates()) {
      const structure = instantiate(builtin);
      const saved = templateFromSnapshot(snapshotFrom(structure, { structureKind: builtin.structureKind }), meta);
      expect(signature(instantiate(saved, 'copy'))).toEqual(signature(structure));
      expect(saved.stages.map((s) => [s.name, s.type, s.poolCount, s.decidesChampion])).toEqual(builtin.stages.map((s) => [s.name, s.type, s.poolCount, s.decidesChampion]));
      expect(saved.teamCount).toBeNull();
    }
  });

  it('derives entry rules from hand-built entry slots when a stage has no rules', () => {
    const { snapshot } = playedSuperEight();
    const qf = snapshot.stages[2];
    const finals = snapshot.stages[3];
    const handBuilt: readonly StageSlot[] = [
      { id: 'h1', stageId: finals.id, index: 0, role: 'entry', label: 'Winner QF1', source: { kind: 'bracket_winner', stageId: qf.id, round: 1, position: 0 }, seed: 1 },
      { id: 'h2', stageId: finals.id, index: 1, role: 'entry', label: 'Winner QF2', source: { kind: 'bracket_winner', stageId: qf.id, round: 1, position: 1 }, seed: 2 },
      { id: 'h3', stageId: finals.id, index: 2, role: 'entry', label: 'Holders', source: { kind: 'manual', teamId: 'T01' }, seed: null },
      { id: 'h4', stageId: finals.id, index: 3, role: 'entry', label: 'Wildcard', source: { kind: 'manual', teamId: null }, seed: null },
    ];
    const edited: TournamentSnapshot = {
      ...snapshot,
      stages: snapshot.stages.map((s) => (s.id === finals.id ? { ...s, config: { ...s.config, entryRules: [] } } : s)),
      slots: [...snapshot.slots.filter((s) => s.stageId !== finals.id), ...handBuilt],
    };
    const template = templateFromSnapshot(edited, meta);
    expect(template.stages[3].entry).toEqual([
      { kind: 'knockout_winners', sourceStageKey: 'stage-3' },
      { kind: 'direct_entry', count: 1 },
      { kind: 'manual', count: 1, label: 'TBD' },
    ]);
    expect(() => instantiate(template)).not.toThrow();
  });

  it('always produces an instantiable template, even with a dangling source stage', () => {
    const { snapshot } = playedSuperEight();
    const dangling: TournamentSnapshot = {
      ...snapshot,
      stages: snapshot.stages.map((s, index) =>
        index === 1 ? { ...s, config: { ...s.config, entryRules: [{ kind: 'top_per_pool', sourceStageId: 'deleted-stage', count: 2, fromPosition: 1 }] } } : s,
      ),
    };
    const template = templateFromSnapshot(dangling, meta);
    expect(template.stages[1].entry).toEqual([{ kind: 'manual', count: 1, label: 'TBD' }]);
    expect(() => instantiate(template)).not.toThrow();
  });

  it('keeps explicit uneven pool sizes and enforces exactly one champion stage', () => {
    const structure = instantiate(byId('builtin:4-team-league'));
    const [league] = structure.stages;
    const pools = [structure.pools[0], { ...structure.pools[0], id: 'second', name: 'Pool B', orderIndex: 1 }];
    const poolEntries: readonly PoolEntry[] = ['a', 'b', 'c', 'd', 'e'].map((teamId, index) => ({
      id: `e${index}`,
      poolId: index < 3 ? pools[0].id : 'second',
      stageId: league.id,
      side: { kind: 'team', teamId },
      seed: null,
    }));
    const noChampion = { ...league, config: { ...league.config, decidesChampion: false } };
    const saved = templateFromSnapshot(snapshotFrom({ ...structure, stages: [noChampion], pools, poolEntries }, { teamIds: ['a', 'b', 'c', 'd', 'e'] }), meta);
    expect(saved.stages[0].poolSizes).toEqual([3, 2]);
    expect(saved.stages[0].decidesChampion).toBe(true);
    expect(saved.teamCount).toBe(5);
    expect(templateFitsTeamCount(saved, 5).ok).toBe(true);
  });
});

import { BASE_MATCH_RULES, getBuiltinPreset } from '@/domain/scoring/presets';
import { DEFAULT_NRR_CONFIG, DEFAULT_POINTS_SYSTEM, DEFAULT_STAGE_CONFIGS, DEFAULT_TIE_BREAKERS } from '@/domain/tournament/defaults';
import { bracketShape } from '@/domain/tournament/knockout';
import { poolName } from '@/domain/tournament/pools';
import { expandEntryRules, type SourceBracketShape } from '@/domain/tournament/slots';
import { instantiateTemplate, type InstantiatedStructure } from '@/domain/tournament/templates';
import type {
  IdGenerator,
  IsoDateTime,
  Pool,
  QualificationRule,
  Stage,
  StageConfig,
  StageId,
  StageSlot,
  StageType,
  TemplateStage,
  TournamentId,
  TournamentRules,
  TournamentStructureKind,
  TournamentTemplate,
} from '@/domain/types';

export interface DraftStructure {
  readonly stages: readonly Stage[];
  readonly pools: readonly Pool[];
  readonly slots: readonly StageSlot[];
}

interface StructureContext {
  readonly tournamentId: TournamentId;
  readonly now: IsoDateTime;
  readonly ids: IdGenerator;
  readonly teamCount: number;
}

export function defaultRules(tournamentId: TournamentId, now: IsoDateTime): TournamentRules {
  return {
    tournamentId,
    pointsSystem: DEFAULT_POINTS_SYSTEM,
    nrr: DEFAULT_NRR_CONFIG,
    tieBreakers: DEFAULT_TIE_BREAKERS,
    defaultFormatId: 'T20',
    defaultMatchRules: getBuiltinPreset('T20')?.rules ?? BASE_MATCH_RULES,
    updatedAt: now,
  };
}

export function defaultPoolCount(teamCount: number): number {
  if (teamCount < 6) {
    return 1;
  }
  return Math.max(2, Math.round(teamCount / 4));
}

function templateStage(key: string, name: string, type: StageType, overrides: Partial<Omit<TemplateStage, 'key' | 'name' | 'type'>>): TemplateStage {
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
    headToHeadRequiresCompleteMiniLeague: config.headToHeadRequiresCompleteMiniLeague,
    formatId: null,
    matchRules: null,
    pointsSystem: null,
    tieBreakers: null,
    nrr: null,
    ...overrides,
  };
}

function stagesForKind(kind: TournamentStructureKind, teamCount: number): readonly TemplateStage[] {
  const pools = defaultPoolCount(teamCount);
  switch (kind) {
    case 'league':
      return [templateStage('league', 'League', 'league', { poolCount: 1, decidesChampion: true })];
    case 'groups':
      return [templateStage('groups', 'Group Stage', 'group', { poolCount: Math.max(pools, 1), decidesChampion: true })];
    case 'knockout':
      return [templateStage('knockout', 'Knockout', 'knockout', { seeding: 'fixed', decidesChampion: true })];
    case 'groups_knockout':
      return [
        templateStage('groups', 'Group Stage', 'group', { poolCount: Math.max(pools, 2) }),
        templateStage('knockouts', 'Knockouts', 'knockout', {
          seeding: 'fixed',
          entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }],
          decidesChampion: true,
        }),
      ];
    case 'custom':
      return [templateStage('custom', 'Main stage', 'custom', { decidesChampion: true })];
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function structureFromKind(kind: TournamentStructureKind, rules: TournamentRules, ctx: StructureContext): InstantiatedStructure {
  const template: TournamentTemplate = {
    id: `kind:${kind}`,
    name: kind,
    description: '',
    builtin: false,
    teamCount: ctx.teamCount,
    structureKind: kind,
    pointsSystem: rules.pointsSystem,
    nrr: rules.nrr,
    tieBreakers: rules.tieBreakers,
    defaultFormatId: rules.defaultFormatId,
    defaultMatchRules: rules.defaultMatchRules,
    stages: stagesForKind(kind, ctx.teamCount),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  return instantiateTemplate(template, { tournamentId: ctx.tournamentId, now: ctx.now, ids: ctx.ids });
}

export function structureFromTemplate(template: TournamentTemplate, ctx: StructureContext): InstantiatedStructure {
  return instantiateTemplate(template, { tournamentId: ctx.tournamentId, now: ctx.now, ids: ctx.ids });
}

function byOrder<T extends { readonly orderIndex: number }>(items: readonly T[]): readonly T[] {
  return [...items].sort((a, b) => a.orderIndex - b.orderIndex);
}

function isKnockout(stage: Stage): boolean {
  return stage.type === 'knockout' || stage.config.fixtureGeneration.method === 'knockout';
}

export function reexpandSlots(structure: DraftStructure, teamCount: number, ids: IdGenerator): readonly StageSlot[] {
  const poolsByStage = new Map<StageId, readonly Pool[]>();
  for (const stage of structure.stages) {
    poolsByStage.set(stage.id, byOrder(structure.pools.filter((pool) => pool.stageId === stage.id)));
  }
  const brackets = new Map<StageId, SourceBracketShape>();
  const slots: StageSlot[] = [];
  for (const stage of byOrder(structure.stages)) {
    const existing = structure.slots.filter((slot) => slot.stageId === stage.id && slot.role === 'entry');
    const expanded = expandEntryRules(stage.id, stage.config.entryRules, { pools: poolsByStage, brackets }, existing, ids).slots;
    slots.push(...expanded);
    const entrants = stage.config.entryRules.length > 0 ? expanded.length : teamCount;
    if (isKnockout(stage) && entrants >= 2) {
      const shape = bracketShape(entrants, stage.config.knockout?.rounds ?? null);
      brackets.set(stage.id, { lastRound: shape.roundsPlayed, positions: shape.winners, entrants });
    }
  }
  return slots;
}

export function withPoolCount(structure: DraftStructure, stageId: StageId, count: number, teamCount: number, ids: IdGenerator): DraftStructure {
  const current = byOrder(structure.pools.filter((pool) => pool.stageId === stageId));
  const nextPools: Pool[] = Array.from({ length: Math.max(1, count) }, (_, index) =>
    current[index] ?? { id: ids(), stageId, name: poolName(index), orderIndex: index, legs: null },
  );
  const pools = [...structure.pools.filter((pool) => pool.stageId !== stageId), ...nextPools];
  const next = { ...structure, pools };
  return { ...next, slots: reexpandSlots(next, teamCount, ids) };
}

export function withStage(structure: DraftStructure, stage: Stage, teamCount: number, ids: IdGenerator): DraftStructure {
  const champion = stage.config.decidesChampion;
  const stages = structure.stages.map((candidate) => {
    if (candidate.id === stage.id) {
      return stage;
    }
    return champion && candidate.config.decidesChampion ? { ...candidate, config: { ...candidate.config, decidesChampion: false } } : candidate;
  });
  const next = { ...structure, stages };
  return { ...next, slots: reexpandSlots(next, teamCount, ids) };
}

export function withStageConfig(stage: Stage, patch: Partial<StageConfig>): Stage {
  return { ...stage, config: { ...stage.config, ...patch } };
}

export function moveStage(structure: DraftStructure, stageId: StageId, direction: -1 | 1, teamCount: number, ids: IdGenerator): DraftStructure {
  const ordered = byOrder(structure.stages);
  const from = ordered.findIndex((stage) => stage.id === stageId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) {
    return structure;
  }
  const swapped = [...ordered];
  [swapped[from], swapped[to]] = [swapped[to], swapped[from]];
  const stages = swapped.map((stage, index) => ({ ...stage, orderIndex: index }));
  const next = { ...structure, stages };
  return { ...next, slots: reexpandSlots(next, teamCount, ids) };
}

function referencesStage(rule: QualificationRule, stageId: StageId): boolean {
  return 'sourceStageId' in rule && rule.sourceStageId === stageId;
}

export function removeStage(structure: DraftStructure, stageId: StageId, teamCount: number, ids: IdGenerator): DraftStructure {
  const removed = structure.stages.find((stage) => stage.id === stageId);
  const remaining = byOrder(structure.stages.filter((stage) => stage.id !== stageId)).map((stage, index) => ({
    ...stage,
    orderIndex: index,
    config: { ...stage.config, entryRules: stage.config.entryRules.filter((rule) => !referencesStage(rule, stageId)) },
  }));
  const stages =
    removed?.config.decidesChampion && remaining.length > 0
      ? remaining.map((stage, index) => (index === remaining.length - 1 ? { ...stage, config: { ...stage.config, decidesChampion: true } } : stage))
      : remaining;
  const next = {
    stages,
    pools: structure.pools.filter((pool) => pool.stageId !== stageId),
    slots: structure.slots.filter((slot) => slot.stageId !== stageId),
  };
  return { ...next, slots: reexpandSlots(next, teamCount, ids) };
}

export function addKnockoutStage(structure: DraftStructure, ctx: StructureContext): DraftStructure {
  const ordered = byOrder(structure.stages);
  const last = ordered[ordered.length - 1];
  const lastPools = last ? structure.pools.filter((pool) => pool.stageId === last.id).length : 0;
  const entryRules: readonly QualificationRule[] = !last
    ? []
    : lastPools > 0
      ? [{ kind: 'top_per_pool', sourceStageId: last.id, count: 2, fromPosition: 1 }]
      : isKnockout(last)
        ? [{ kind: 'knockout_winners', sourceStageId: last.id }]
        : [];
  const stage: Stage = {
    id: ctx.ids(),
    tournamentId: ctx.tournamentId,
    name: 'Knockouts',
    type: 'knockout',
    orderIndex: ordered.length,
    status: 'pending',
    config: { ...DEFAULT_STAGE_CONFIGS.knockout, entryRules, decidesChampion: true },
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const stages = [...ordered.map((candidate) => ({ ...candidate, config: { ...candidate.config, decidesChampion: false } })), stage];
  const next = { ...structure, stages };
  return { ...next, slots: reexpandSlots(next, ctx.teamCount, ctx.ids) };
}

export function poolStage(stages: readonly Stage[], pools: readonly Pool[]): Stage | null {
  return byOrder(stages).find((stage) => stage.config.entryRules.length === 0 && pools.some((pool) => pool.stageId === stage.id)) ?? null;
}

export function stagePools(pools: readonly Pool[], stageId: StageId): readonly Pool[] {
  return byOrder(pools.filter((pool) => pool.stageId === stageId));
}

export function topPerPoolCount(stage: Stage): number | null {
  const rule = stage.config.entryRules.find((candidate) => candidate.kind === 'top_per_pool');
  return rule && rule.kind === 'top_per_pool' ? rule.count : null;
}

export function withTopPerPool(stage: Stage, count: number): Stage {
  return withStageConfig(stage, {
    entryRules: stage.config.entryRules.map((rule) => (rule.kind === 'top_per_pool' ? { ...rule, count } : rule)),
  });
}

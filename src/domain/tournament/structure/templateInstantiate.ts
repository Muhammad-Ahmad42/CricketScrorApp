import type {
  IdGenerator,
  IsoDateTime,
  Pool,
  PoolEntry,
  QualificationRule,
  Stage,
  StageConfig,
  StageId,
  StageSlot,
  TemplateEntryRule,
  TemplateStage,
  TournamentId,
  TournamentTemplate,
} from '../../types';
import { bracketShape } from '../knockout';
import { assignSlotsToPools, poolName } from '../pools';
import { expandEntryRules, type SourceBracketShape } from '../slots';
import type { InstantiatedStructure } from '../templates';
import { DIRECT_ENTRY_LABEL } from './labels';
import { assertNever } from './sides';

interface StageLookup {
  readonly stageIdByKey: ReadonlyMap<string, StageId>;
  readonly orderByKey: ReadonlyMap<string, number>;
  readonly poolsByStage: ReadonlyMap<StageId, readonly Pool[]>;
}

function sourceStage(key: string, targetOrder: number, lookup: StageLookup): StageId {
  const stageId = lookup.stageIdByKey.get(key);
  const order = lookup.orderByKey.get(key);
  if (stageId === undefined || order === undefined) {
    throw new Error(`The template refers to an unknown stage "${key}".`);
  }
  if (order >= targetOrder) {
    throw new Error(`Stage "${key}" must come before the stage it feeds.`);
  }
  return stageId;
}

function entryRule(rule: TemplateEntryRule, targetOrder: number, lookup: StageLookup): QualificationRule {
  switch (rule.kind) {
    case 'top_per_pool':
      return { kind: 'top_per_pool', sourceStageId: sourceStage(rule.sourceStageKey, targetOrder, lookup), count: rule.count, fromPosition: rule.fromPosition };
    case 'pool_position': {
      const sourceStageId = sourceStage(rule.sourceStageKey, targetOrder, lookup);
      const pool = lookup.poolsByStage.get(sourceStageId)?.[rule.poolIndex];
      if (!pool) {
        throw new Error(`Stage "${rule.sourceStageKey}" has no pool number ${rule.poolIndex + 1}.`);
      }
      return { kind: 'pool_position', sourceStageId, poolId: pool.id, position: rule.position };
    }
    case 'best_of_position':
      return {
        kind: 'best_of_position',
        sourceStageId: sourceStage(rule.sourceStageKey, targetOrder, lookup),
        position: rule.position,
        count: rule.count,
        normalization: rule.normalization,
      };
    case 'top_overall':
      return {
        kind: 'top_overall',
        sourceStageId: sourceStage(rule.sourceStageKey, targetOrder, lookup),
        count: rule.count,
        normalization: rule.normalization,
      };
    case 'knockout_winners':
      return { kind: 'knockout_winners', sourceStageId: sourceStage(rule.sourceStageKey, targetOrder, lookup) };
    case 'manual':
      return { kind: 'manual', count: rule.count, label: rule.label };
    case 'direct_entry':
      return { kind: 'manual', count: rule.count, label: DIRECT_ENTRY_LABEL };
    default:
      return assertNever(rule);
  }
}

function stageConfig(stage: TemplateStage, entryRules: readonly QualificationRule[]): StageConfig {
  return {
    fixtureGeneration: stage.fixtureGeneration,
    seeding: stage.seeding,
    seedingSeed: null,
    seedingNormalization: stage.seedingNormalization,
    pointsSystem: stage.pointsSystem,
    tieBreakers: stage.tieBreakers,
    headToHeadRequiresCompleteMiniLeague: stage.headToHeadRequiresCompleteMiniLeague,
    nrr: stage.nrr,
    entryRules,
    knockout: stage.knockout,
    abandonedMatches: stage.abandonedMatches,
    decidesChampion: stage.decidesChampion,
    formatId: stage.formatId,
    matchRules: stage.matchRules,
  };
}

function directEntryCount(template: TournamentTemplate): number {
  return template.stages.reduce(
    (total, stage) => total + stage.entry.reduce((sum, rule) => sum + (rule.kind === 'direct_entry' ? rule.count : 0), 0),
    0,
  );
}

function isKnockoutStage(stage: Stage): boolean {
  return stage.type === 'knockout' || stage.config.fixtureGeneration.method === 'knockout';
}

function bracketFor(stage: Stage, entrants: number): SourceBracketShape | null {
  if (!isKnockoutStage(stage) || entrants < 2) {
    return null;
  }
  const shape = bracketShape(entrants, stage.config.knockout?.rounds ?? null);
  return { lastRound: shape.roundsPlayed, positions: shape.winners, entrants };
}

export function instantiateStructure(
  template: TournamentTemplate,
  input: { readonly tournamentId: TournamentId; readonly now: IsoDateTime; readonly ids: IdGenerator },
): InstantiatedStructure {
  const { tournamentId, now, ids } = input;
  const stageIds = template.stages.map(() => ids());
  const pools: Pool[] = [];
  const poolsByStage = new Map<StageId, readonly Pool[]>();
  template.stages.forEach((stage, stageIndex) => {
    const stagePools = Array.from({ length: Math.max(0, stage.poolCount) }, (_, index): Pool => ({
      id: ids(),
      stageId: stageIds[stageIndex],
      name: poolName(index),
      orderIndex: index,
      legs: null,
    }));
    poolsByStage.set(stageIds[stageIndex], stagePools);
    pools.push(...stagePools);
  });
  const lookup: StageLookup = {
    stageIdByKey: new Map(template.stages.map((stage, index) => [stage.key, stageIds[index]])),
    orderByKey: new Map(template.stages.map((stage, index) => [stage.key, index])),
    poolsByStage,
  };
  const stages: readonly Stage[] = template.stages.map((stage, index) => ({
    id: stageIds[index],
    tournamentId,
    name: stage.name,
    type: stage.type,
    orderIndex: index,
    status: 'pending',
    config: stageConfig(stage, stage.entry.map((rule) => entryRule(rule, index, lookup))),
    createdAt: now,
    updatedAt: now,
  }));
  const firstStageEntrants = Math.max(0, (template.teamCount ?? 0) - directEntryCount(template));
  const brackets = new Map<StageId, SourceBracketShape>();
  const slots: StageSlot[] = [];
  const poolEntries: PoolEntry[] = [];
  stages.forEach((stage, index) => {
    const expanded = expandEntryRules(stage.id, stage.config.entryRules, { pools: poolsByStage, brackets }, [], ids).slots;
    slots.push(...expanded);
    const entrants = stage.config.entryRules.length > 0 ? expanded.length : firstStageEntrants;
    const bracket = bracketFor(stage, entrants);
    if (bracket) {
      brackets.set(stage.id, bracket);
    }
    const layout = template.stages[index].poolSlotIndexes;
    const stagePools = poolsByStage.get(stage.id) ?? [];
    if (layout && stagePools.length > 0) {
      const known = new Set(expanded.map((slot) => slot.index));
      const perPool = stagePools.map((_, poolIndex) => (layout[poolIndex] ?? []).filter((slotIndex) => known.has(slotIndex)));
      const assignment = assignSlotsToPools(
        expanded.map((slot) => ({ slotId: slot.id, index: slot.index })),
        stagePools.map((pool) => pool.id),
        { kind: 'fixed_order', slotIndexesPerPool: perPool },
      );
      for (const pool of assignment.pools) {
        for (const side of pool.members) {
          poolEntries.push({ id: ids(), poolId: pool.poolId, stageId: stage.id, side, seed: null });
        }
      }
    }
  });
  return {
    rules: {
      tournamentId,
      pointsSystem: template.pointsSystem,
      nrr: template.nrr,
      tieBreakers: template.tieBreakers,
      defaultFormatId: template.defaultFormatId,
      defaultMatchRules: template.defaultMatchRules,
      updatedAt: now,
    },
    stages,
    pools,
    slots,
    poolEntries,
  };
}

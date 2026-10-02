import type {
  Id,
  IsoDateTime,
  Pool,
  QualificationRule,
  Stage,
  StageId,
  StageSlot,
  TemplateEntryRule,
  TemplateStage,
  TournamentSnapshot,
  TournamentTemplate,
} from '../../types';
import { DIRECT_ENTRY_LABEL, TBD_LABEL } from './labels';
import { assertNever } from './sides';

interface SnapshotLookup {
  readonly keyById: ReadonlyMap<StageId, string>;
  readonly orderById: ReadonlyMap<StageId, number>;
  readonly poolsByStage: ReadonlyMap<StageId, readonly Pool[]>;
}

function stageKey(index: number): string {
  return `stage-${index + 1}`;
}

function earlierKey(stageId: StageId, targetOrder: number, lookup: SnapshotLookup): string | null {
  const order = lookup.orderById.get(stageId);
  const key = lookup.keyById.get(stageId);
  return key !== undefined && order !== undefined && order < targetOrder ? key : null;
}

function placeholder(count: number): TemplateEntryRule {
  return { kind: 'manual', count: Math.max(1, count), label: TBD_LABEL };
}

function slotsFrom(stageId: StageId, entrySlots: readonly StageSlot[]): number {
  return entrySlots.filter((slot) => 'stageId' in slot.source && slot.source.stageId === stageId).length;
}

function ruleFromConfig(
  rule: QualificationRule,
  targetOrder: number,
  lookup: SnapshotLookup,
  entrySlots: readonly StageSlot[],
): TemplateEntryRule {
  switch (rule.kind) {
    case 'top_per_pool': {
      const key = earlierKey(rule.sourceStageId, targetOrder, lookup);
      return key ? { kind: 'top_per_pool', sourceStageKey: key, count: rule.count, fromPosition: rule.fromPosition } : placeholder(slotsFrom(rule.sourceStageId, entrySlots));
    }
    case 'pool_position': {
      const key = earlierKey(rule.sourceStageId, targetOrder, lookup);
      const poolIndex = (lookup.poolsByStage.get(rule.sourceStageId) ?? []).findIndex((pool) => pool.id === rule.poolId);
      return key && poolIndex >= 0 ? { kind: 'pool_position', sourceStageKey: key, poolIndex, position: rule.position } : placeholder(1);
    }
    case 'best_of_position': {
      const key = earlierKey(rule.sourceStageId, targetOrder, lookup);
      return key
        ? { kind: 'best_of_position', sourceStageKey: key, position: rule.position, count: rule.count, normalization: rule.normalization }
        : placeholder(rule.count);
    }
    case 'top_overall': {
      const key = earlierKey(rule.sourceStageId, targetOrder, lookup);
      return key ? { kind: 'top_overall', sourceStageKey: key, count: rule.count, normalization: rule.normalization } : placeholder(rule.count);
    }
    case 'knockout_winners': {
      const key = earlierKey(rule.sourceStageId, targetOrder, lookup);
      return key ? { kind: 'knockout_winners', sourceStageKey: key } : placeholder(slotsFrom(rule.sourceStageId, entrySlots));
    }
    case 'manual':
      return rule.label === DIRECT_ENTRY_LABEL ? { kind: 'direct_entry', count: rule.count } : { kind: 'manual', count: rule.count, label: rule.label };
    case 'direct_entry':
      return { kind: 'direct_entry', count: rule.teamIds.length };
    default:
      return assertNever(rule);
  }
}

function ruleFromSlot(slot: StageSlot, targetOrder: number, lookup: SnapshotLookup): TemplateEntryRule {
  const source = slot.source;
  switch (source.kind) {
    case 'pool_position': {
      const key = earlierKey(source.stageId, targetOrder, lookup);
      const poolIndex = (lookup.poolsByStage.get(source.stageId) ?? []).findIndex((pool) => pool.id === source.poolId);
      return key && poolIndex >= 0 ? { kind: 'pool_position', sourceStageKey: key, poolIndex, position: source.position } : placeholder(1);
    }
    case 'best_of_position': {
      const key = earlierKey(source.stageId, targetOrder, lookup);
      return key
        ? { kind: 'best_of_position', sourceStageKey: key, position: source.position, count: 1, normalization: source.normalization }
        : placeholder(1);
    }
    case 'overall_position': {
      const key = earlierKey(source.stageId, targetOrder, lookup);
      return key ? { kind: 'top_overall', sourceStageKey: key, count: 1, normalization: source.normalization } : placeholder(1);
    }
    case 'bracket_winner': {
      const key = earlierKey(source.stageId, targetOrder, lookup);
      return key ? { kind: 'knockout_winners', sourceStageKey: key } : placeholder(1);
    }
    case 'bracket_loser':
    case 'fixture_winner':
    case 'fixture_loser':
      return placeholder(1);
    case 'manual':
      return source.teamId === null ? placeholder(1) : { kind: 'direct_entry', count: 1 };
    default:
      return assertNever(source);
  }
}

function merge(previous: TemplateEntryRule, next: TemplateEntryRule): TemplateEntryRule | null {
  if (previous.kind === 'knockout_winners' && next.kind === 'knockout_winners' && previous.sourceStageKey === next.sourceStageKey) {
    return previous;
  }
  if (previous.kind === 'manual' && next.kind === 'manual' && previous.label === next.label) {
    return { ...previous, count: previous.count + next.count };
  }
  if (previous.kind === 'direct_entry' && next.kind === 'direct_entry') {
    return { kind: 'direct_entry', count: previous.count + next.count };
  }
  if (previous.kind === 'top_overall' && next.kind === 'top_overall' && previous.sourceStageKey === next.sourceStageKey && previous.normalization === next.normalization) {
    return { ...previous, count: previous.count + next.count };
  }
  if (
    previous.kind === 'best_of_position' &&
    next.kind === 'best_of_position' &&
    previous.sourceStageKey === next.sourceStageKey &&
    previous.position === next.position &&
    previous.normalization === next.normalization
  ) {
    return { ...previous, count: previous.count + next.count };
  }
  return null;
}

function rulesFromSlots(entrySlots: readonly StageSlot[], targetOrder: number, lookup: SnapshotLookup): readonly TemplateEntryRule[] {
  return entrySlots.reduce<readonly TemplateEntryRule[]>((rules, slot) => {
    const next = ruleFromSlot(slot, targetOrder, lookup);
    const last = rules[rules.length - 1];
    const merged = last ? merge(last, next) : null;
    return merged ? [...rules.slice(0, -1), merged] : [...rules, next];
  }, []);
}

function poolLayout(
  stage: Stage,
  snapshot: TournamentSnapshot,
  pools: readonly Pool[],
  entrySlots: readonly StageSlot[],
): Pick<TemplateStage, 'poolSizes' | 'poolSlotIndexes'> {
  const entries = snapshot.poolEntries.filter((entry) => entry.stageId === stage.id);
  const slotIndexById = new Map(entrySlots.map((slot) => [slot.id, slot.index]));
  const slotBuilt = entries.length > 0 && entries.every((entry) => entry.side.kind === 'slot');
  if (slotBuilt) {
    const poolSlotIndexes = pools.map((pool) =>
      entries.flatMap((entry) => {
        const index = entry.poolId === pool.id && entry.side.kind === 'slot' ? slotIndexById.get(entry.side.slotId) : undefined;
        return index === undefined ? [] : [index];
      }),
    );
    return { poolSizes: null, poolSlotIndexes };
  }
  const sizes = pools.map((pool) => entries.filter((entry) => entry.poolId === pool.id).length);
  const uneven = entries.length > 0 && new Set(sizes).size > 1;
  return { poolSizes: uneven ? sizes : null, poolSlotIndexes: null };
}

function templateStageFrom(stage: Stage, index: number, snapshot: TournamentSnapshot, lookup: SnapshotLookup): TemplateStage {
  const pools = lookup.poolsByStage.get(stage.id) ?? [];
  const entrySlots = snapshot.slots
    .filter((slot) => slot.stageId === stage.id && slot.role === 'entry')
    .sort((a, b) => a.index - b.index);
  const config = stage.config;
  const entry =
    config.entryRules.length > 0
      ? config.entryRules.map((rule) => ruleFromConfig(rule, index, lookup, entrySlots))
      : rulesFromSlots(entrySlots, index, lookup);
  return {
    key: stageKey(index),
    name: stage.name,
    type: stage.type,
    poolCount: pools.length,
    ...poolLayout(stage, snapshot, pools, entrySlots),
    fixtureGeneration: config.fixtureGeneration,
    seeding: config.seeding,
    seedingNormalization: config.seedingNormalization,
    entry,
    knockout: config.knockout,
    abandonedMatches: config.abandonedMatches,
    decidesChampion: config.decidesChampion,
    headToHeadRequiresCompleteMiniLeague: config.headToHeadRequiresCompleteMiniLeague,
    formatId: config.formatId,
    matchRules: config.matchRules,
    pointsSystem: config.pointsSystem,
    tieBreakers: config.tieBreakers,
    nrr: config.nrr,
  };
}

function withSingleChampion(stages: readonly TemplateStage[]): readonly TemplateStage[] {
  if (stages.filter((stage) => stage.decidesChampion).length === 1) {
    return stages;
  }
  return stages.map((stage, index) => ({ ...stage, decidesChampion: index === stages.length - 1 }));
}

export function templateFromStructure(
  snapshot: TournamentSnapshot,
  meta: { readonly id: Id; readonly name: string; readonly description: string; readonly now: IsoDateTime },
): TournamentTemplate {
  const stages = [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const poolsByStage = new Map<StageId, readonly Pool[]>(
    stages.map((stage) => [stage.id, snapshot.pools.filter((pool) => pool.stageId === stage.id).sort((a, b) => a.orderIndex - b.orderIndex)]),
  );
  const lookup: SnapshotLookup = {
    keyById: new Map(stages.map((stage, index) => [stage.id, stageKey(index)])),
    orderById: new Map(stages.map((stage, index) => [stage.id, index])),
    poolsByStage,
  };
  const activeTeams = snapshot.teams.filter((view) => view.membership.status === 'active').length;
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    builtin: false,
    teamCount: activeTeams > 0 ? activeTeams : null,
    structureKind: snapshot.tournament.structureKind,
    pointsSystem: snapshot.rules.pointsSystem,
    nrr: snapshot.rules.nrr,
    tieBreakers: snapshot.rules.tieBreakers,
    defaultFormatId: snapshot.rules.defaultFormatId,
    defaultMatchRules: snapshot.rules.defaultMatchRules,
    stages: withSingleChampion(stages.map((stage, index) => templateStageFrom(stage, index, snapshot, lookup))),
    createdAt: meta.now,
    updatedAt: meta.now,
  };
}

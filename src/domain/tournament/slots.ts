import type { IdGenerator, Pool, QualificationRule, SlotSource, StageId, StageSlot } from '../types';
import { bracketOrder, nextPowerOfTwo } from './structure/bracketMath';
import {
  bestOfPositionLabel,
  bracketFixtureLabel,
  byeSeedLabel,
  DIRECT_ENTRY_LABEL,
  numberedLabel,
  ordinal,
  overallLabel,
  poolPositionLabel,
  poolPositionLabelFor,
  TBD_LABEL,
} from './structure/labels';
import { deepEqual } from './structure/equality';
import { assertNever } from './structure/sides';

export interface SourceBracketShape {
  readonly lastRound: number;
  readonly positions: number;
  readonly entrants?: number;
}

interface SlotSpec {
  readonly label: string;
  readonly source: SlotSource;
}

type EntrySources = {
  readonly pools: ReadonlyMap<StageId, readonly Pool[]>;
  readonly brackets: ReadonlyMap<StageId, SourceBracketShape>;
};

function orderedPools(sources: EntrySources, stageId: StageId): readonly Pool[] {
  return [...(sources.pools.get(stageId) ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
}

function range(from: number, count: number): readonly number[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => from + index);
}

function roundOneByeSeeds(shape: SourceBracketShape, teamsInRound: number): readonly (number | null)[] | null {
  const entrants = shape.entrants;
  if (shape.lastRound !== 1 || entrants === undefined || entrants >= teamsInRound || nextPowerOfTwo(entrants) !== teamsInRound) {
    return null;
  }
  const order = bracketOrder(teamsInRound);
  return range(0, shape.positions).map((position) => (order[2 * position + 1] > entrants ? order[2 * position] : null));
}

function knockoutWinnerLabels(shape: SourceBracketShape): readonly string[] {
  const teamsInRound = shape.positions * 2;
  const byeSeeds = roundOneByeSeeds(shape, teamsInRound);
  if (byeSeeds === null) {
    return range(0, shape.positions).map((position) => `Winner ${bracketFixtureLabel(teamsInRound, shape.lastRound, position + 1)}`);
  }
  const labels: string[] = [];
  let fixtureNumber = 0;
  for (const byeSeed of byeSeeds) {
    if (byeSeed === null) {
      fixtureNumber += 1;
      labels.push(`Winner ${bracketFixtureLabel(teamsInRound, shape.lastRound, fixtureNumber)}`);
    } else {
      labels.push(byeSeedLabel(teamsInRound, shape.lastRound, byeSeed));
    }
  }
  return labels;
}

function specsForRule(rule: QualificationRule, sources: EntrySources): readonly SlotSpec[] {
  switch (rule.kind) {
    case 'top_per_pool': {
      const pools = orderedPools(sources, rule.sourceStageId);
      return range(Math.max(1, rule.fromPosition), rule.count).flatMap((position) =>
        pools.map((pool, index) => ({
          label: poolPositionLabel(pool.name, index, position),
          source: { kind: 'pool_position', stageId: rule.sourceStageId, poolId: pool.id, position },
        })),
      );
    }
    case 'pool_position': {
      const pools = orderedPools(sources, rule.sourceStageId);
      const index = pools.findIndex((pool) => pool.id === rule.poolId);
      const label = index >= 0 ? poolPositionLabel(pools[index].name, index, rule.position) : `${ordinal(rule.position)} place`;
      return [{ label, source: { kind: 'pool_position', stageId: rule.sourceStageId, poolId: rule.poolId, position: rule.position } }];
    }
    case 'best_of_position':
      return range(1, rule.count).map((rank) => ({
        label: bestOfPositionLabel(rule.position, rank),
        source: {
          kind: 'best_of_position',
          stageId: rule.sourceStageId,
          position: rule.position,
          rank,
          normalization: rule.normalization,
        },
      }));
    case 'top_overall':
      return range(1, rule.count).map((rank) => ({
        label: overallLabel(rank),
        source: { kind: 'overall_position', stageId: rule.sourceStageId, rank, normalization: rule.normalization },
      }));
    case 'knockout_winners': {
      const shape = sources.brackets.get(rule.sourceStageId);
      if (!shape) {
        return [];
      }
      const labels = knockoutWinnerLabels(shape);
      return labels.map((label, position) => ({
        label,
        source: { kind: 'bracket_winner', stageId: rule.sourceStageId, round: shape.lastRound, position },
      }));
    }
    case 'manual': {
      const base = rule.label.trim() === '' ? TBD_LABEL : rule.label.trim();
      return range(0, rule.count).map((index) => ({
        label: numberedLabel(base, index, rule.count),
        source: { kind: 'manual', teamId: null },
      }));
    }
    case 'direct_entry':
      return rule.teamIds.map((teamId, index) => ({
        label: numberedLabel(DIRECT_ENTRY_LABEL, index, rule.teamIds.length),
        source: { kind: 'manual', teamId },
      }));
    default:
      return assertNever(rule);
  }
}

export function expandEntryRules(
  targetStageId: StageId,
  rules: readonly QualificationRule[],
  sources: {
    readonly pools: ReadonlyMap<StageId, readonly Pool[]>;
    readonly brackets: ReadonlyMap<StageId, SourceBracketShape>;
  },
  existing: readonly StageSlot[],
  ids: IdGenerator,
): { readonly slots: readonly StageSlot[]; readonly removed: readonly StageSlot[] } {
  const specs = rules.flatMap((rule) => specsForRule(rule, sources));
  const existingEntries = new Map(existing.filter((slot) => slot.role === 'entry').map((slot) => [slot.index, slot]));
  const slots = specs.map((spec, index): StageSlot => {
    const kept = existingEntries.get(index);
    return {
      id: kept ? kept.id : ids(),
      stageId: targetStageId,
      index,
      role: 'entry',
      label: spec.label,
      source: spec.source,
      seed: kept && deepEqual(kept.source, spec.source) ? kept.seed : null,
    };
  });
  const keptIds = new Set(slots.map((slot) => slot.id));
  const removed = existing.filter(
    (slot) => !keptIds.has(slot.id) && (slot.role === 'entry' || slot.index < specs.length),
  );
  return { slots, removed };
}

function positionsPhrase(from: number, count: number): string {
  if (count === 1) {
    return from === 2 ? 'Runners-up' : `${ordinal(from)}`;
  }
  if (count === 2) {
    return `${ordinal(from)} and ${ordinal(from + 1)}`;
  }
  return `${ordinal(from)} to ${ordinal(from + count - 1)}`;
}

function bestOfNoun(position: number, count: number): string {
  if (position === 1) {
    return count === 1 ? 'pool winner' : 'pool winners';
  }
  if (position === 2) {
    return count === 1 ? 'runner-up' : 'runners-up';
  }
  return `${ordinal(position)}-placed ${count === 1 ? 'team' : 'teams'}`;
}

function bestOfPhrase(position: number, count: number): string {
  return count === 1 ? `Best ${bestOfNoun(position, count)}` : `Best ${count} ${bestOfNoun(position, count)}`;
}

function rulePhrase(rule: QualificationRule, stageNames: ReadonlyMap<StageId, string>): string {
  switch (rule.kind) {
    case 'top_per_pool':
      if (rule.fromPosition <= 1) {
        return rule.count === 1 ? 'Pool winners' : `Top ${rule.count} from each pool`;
      }
      return `${positionsPhrase(rule.fromPosition, rule.count)} of each pool`;
    case 'pool_position':
      return rule.position === 1 ? 'A pool winner' : rule.position === 2 ? 'A pool runner-up' : `A ${ordinal(rule.position)}-placed team`;
    case 'best_of_position':
      return bestOfPhrase(rule.position, rule.count);
    case 'top_overall':
      return `Top ${rule.count} overall`;
    case 'knockout_winners': {
      const name = stageNames.get(rule.sourceStageId);
      return name ? `Winners of the ${name}` : 'Knockout winners';
    }
    case 'manual':
      return `Organizer selects ${rule.count}`;
    case 'direct_entry':
      return rule.teamIds.length === 1 ? '1 direct entry' : `${rule.teamIds.length} direct entries`;
    default:
      return assertNever(rule);
  }
}

function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text;
}

export function explainEntryRules(rules: readonly QualificationRule[], stageNames: ReadonlyMap<StageId, string>): string {
  if (rules.length === 0) {
    return 'All teams in the tournament';
  }
  return rules.map((rule, index) => (index === 0 ? rulePhrase(rule, stageNames) : lowerFirst(rulePhrase(rule, stageNames)))).join(' + ');
}

export function defaultSlotLabel(
  source: SlotSource,
  names: {
    readonly poolName: (poolId: string) => string;
    readonly fixtureLabel: (fixtureId: string) => string;
    readonly bracketLabel: (stageId: string, round: number, position: number) => string;
  },
): string {
  switch (source.kind) {
    case 'pool_position':
      return poolPositionLabelFor(names.poolName(source.poolId), source.position);
    case 'best_of_position':
      return bestOfPositionLabel(source.position, source.rank);
    case 'overall_position':
      return overallLabel(source.rank);
    case 'bracket_winner':
      return `Winner ${names.bracketLabel(source.stageId, source.round, source.position)}`;
    case 'bracket_loser':
      return `Loser ${names.bracketLabel(source.stageId, source.round, source.position)}`;
    case 'fixture_winner':
      return `Winner ${names.fixtureLabel(source.fixtureId)}`;
    case 'fixture_loser':
      return `Loser ${names.fixtureLabel(source.fixtureId)}`;
    case 'manual':
      return source.teamId === null ? TBD_LABEL : DIRECT_ENTRY_LABEL;
    default:
      return assertNever(source);
  }
}

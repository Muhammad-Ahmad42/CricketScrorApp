import type { PoolId, SlotShortfall, StageId, StageSlot, TournamentSnapshot } from '../../types';
import { joinNames, ordinal, plural } from '../evaluation/format';
import type { SnapshotIndex } from '../evaluation/snapshotIndex';

interface Need {
  readonly needed: number;
  readonly available: number;
  readonly poolId: PoolId | null;
  readonly sourceStageId: StageId;
}

function withdrawnTeams(snapshot: TournamentSnapshot): ReadonlySet<string> {
  return new Set(snapshot.teams.filter((view) => view.membership.status === 'withdrawn').map((view) => view.team.id));
}

function poolSize(snapshot: TournamentSnapshot, poolId: PoolId, withdrawn: ReadonlySet<string>): number {
  return snapshot.poolEntries.filter((entry) => entry.poolId === poolId && (entry.side.kind === 'slot' || !withdrawn.has(entry.side.teamId))).length;
}

function stageSize(snapshot: TournamentSnapshot, index: SnapshotIndex, stageId: StageId, withdrawn: ReadonlySet<string>): number | null {
  const pools = index.poolsByStage.get(stageId) ?? [];
  if (pools.length === 0) return null;
  return pools.reduce((sum, pool) => sum + poolSize(snapshot, pool.id, withdrawn), 0);
}

function needOf(snapshot: TournamentSnapshot, index: SnapshotIndex, slot: StageSlot): Need | null {
  const withdrawn = withdrawnTeams(snapshot);
  const source = slot.source;
  switch (source.kind) {
    case 'pool_position':
      if (!index.poolById.has(source.poolId)) return null;
      return { needed: source.position, available: poolSize(snapshot, source.poolId, withdrawn), poolId: source.poolId, sourceStageId: source.stageId };
    case 'best_of_position': {
      const pools = index.poolsByStage.get(source.stageId) ?? [];
      if (pools.length === 0) return null;
      const deep = pools.filter((pool) => poolSize(snapshot, pool.id, withdrawn) >= source.position).length;
      return { needed: source.rank, available: deep, poolId: null, sourceStageId: source.stageId };
    }
    case 'overall_position': {
      const size = stageSize(snapshot, index, source.stageId, withdrawn);
      return size === null ? null : { needed: source.rank, available: size, poolId: null, sourceStageId: source.stageId };
    }
    default:
      return null;
  }
}

function ruleText(index: SnapshotIndex, slot: StageSlot): string | null {
  const stage = index.stageById.get(slot.stageId);
  if (!stage || slot.source.kind !== 'pool_position') return null;
  const sourceStageId = slot.source.stageId;
  const rule = stage.config.entryRules.find((candidate) => candidate.kind === 'top_per_pool' && candidate.sourceStageId === sourceStageId);
  if (!rule || rule.kind !== 'top_per_pool') return null;
  return rule.fromPosition === 1 ? `Top ${rule.count} from each pool` : `${ordinal(rule.fromPosition)} to ${ordinal(rule.fromPosition + rule.count - 1)} from each pool`;
}

function fixtureLabels(snapshot: TournamentSnapshot, slotId: string): readonly string[] {
  return snapshot.fixtures
    .filter((fixture) => (fixture.sideA.kind === 'slot' && fixture.sideA.slotId === slotId) || (fixture.sideB.kind === 'slot' && fixture.sideB.slotId === slotId))
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map((fixture) => fixture.label ?? `Match ${fixture.matchNumber}`);
}

interface ShortfallText {
  readonly headline: string;
  readonly detail: string;
  readonly message: string;
}

function reasonOf(index: SnapshotIndex, slot: StageSlot, need: Need, poolName: string | null): string {
  const source = slot.source;
  if (source.kind === 'pool_position') {
    const pool = poolName ?? 'The pool';
    const rule = ruleText(index, slot);
    const left = `${pool} would have ${plural(need.available, 'team')}`;
    return rule === null ? `${left}; ${slot.label} needs its ${ordinal(source.position)}-placed team.` : `${left}; “${rule}” needs ${source.position}.`;
  }
  if (source.kind === 'best_of_position') {
    return `Only ${plural(need.available, 'pool')} would have a ${ordinal(source.position)}-placed team; ${slot.label} needs the ${ordinal(source.rank)} best.`;
  }
  const sourceStage = index.stageById.get(need.sourceStageId)?.name ?? 'The earlier stage';
  return `${sourceStage} would have ${plural(need.available, 'team')}; ${slot.label} needs the team ranked ${ordinal(need.needed)}.`;
}

function textOf(index: SnapshotIndex, slot: StageSlot, need: Need, stageName: string, poolName: string | null, labels: readonly string[]): ShortfallText {
  const headline = `${slot.label} in ${stageName} can't be filled`;
  const tail = labels.length === 0 ? '' : ` ${joinNames(labels)} could not be played.`;
  const detail = `${reasonOf(index, slot, need, poolName)}${tail}`;
  return { headline, detail, message: `${headline}. ${detail}` };
}

function shortSlots(snapshot: TournamentSnapshot, index: SnapshotIndex): ReadonlyMap<string, Need> {
  const short = new Map<string, Need>();
  for (const slot of snapshot.slots) {
    const need = needOf(snapshot, index, slot);
    if (need !== null && need.available < need.needed) short.set(slot.id, need);
  }
  return short;
}

export function slotShortfalls(
  before: { readonly snapshot: TournamentSnapshot; readonly index: SnapshotIndex },
  after: { readonly snapshot: TournamentSnapshot; readonly index: SnapshotIndex },
): readonly SlotShortfall[] {
  const existing = shortSlots(before.snapshot, before.index);
  const result: SlotShortfall[] = [];
  for (const [slotId, need] of shortSlots(after.snapshot, after.index)) {
    if (existing.has(slotId)) continue;
    const slot = after.index.slotById.get(slotId);
    if (!slot) continue;
    const stageName = after.index.stageById.get(slot.stageId)?.name ?? 'the next stage';
    const poolName = need.poolId === null ? null : (after.index.poolById.get(need.poolId)?.name ?? null);
    const labels = fixtureLabels(after.snapshot, slotId);
    const text = textOf(after.index, slot, need, stageName, poolName, labels);
    result.push({
      slotId,
      label: slot.label,
      stageId: slot.stageId,
      stageName,
      sourceStageId: need.sourceStageId,
      poolId: need.poolId,
      poolName,
      needed: need.needed,
      available: need.available,
      fixtureLabels: labels,
      message: text.message,
      headline: text.headline,
      detail: text.detail,
    });
  }
  return result;
}

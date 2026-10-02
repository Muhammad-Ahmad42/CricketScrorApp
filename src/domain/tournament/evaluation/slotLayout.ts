import type { PoolId, SlotResolution, StageSlot, TeamId, UnevenPoolNormalization } from '../../types';

export interface BestOfLayout {
  readonly ranks: ReadonlySet<number>;
  readonly normalization: UnevenPoolNormalization | null;
}

export interface OverallLayout {
  readonly count: number | null;
  readonly raw: boolean;
  readonly afterPools: boolean;
}

export interface ViewLayout {
  readonly poolSlots: ReadonlyMap<PoolId, ReadonlySet<number>>;
  readonly bestOf: ReadonlyMap<number, BestOfLayout>;
  readonly overall: OverallLayout | null;
  readonly pinnedTeams: ReadonlySet<TeamId>;
  readonly foreignTeams: ReadonlySet<TeamId>;
  readonly pinnedSourceSlots: boolean;
}

export interface LayoutInput {
  readonly sourceSlots: readonly StageSlot[];
  readonly entrySlots: readonly StageSlot[];
  readonly resolutions: ReadonlyMap<string, SlotResolution>;
}

export function takeWalked(starts: readonly number[]): ReadonlySet<number> {
  const taken = new Set<number>();
  for (const start of starts) {
    let position = Math.max(1, start);
    while (taken.has(position)) position += 1;
    taken.add(position);
  }
  return taken;
}

export function isPrefixSet(positions: ReadonlySet<number>): boolean {
  for (let position = 1; position <= positions.size; position += 1) {
    if (!positions.has(position)) return false;
  }
  return true;
}

function overallLayout(slots: readonly StageSlot[], poolSlots: readonly StageSlot[]): OverallLayout | null {
  if (slots.length === 0) return null;
  const ranks = slots.map((slot) => (slot.source.kind === 'overall_position' ? slot.source.rank : 0));
  const contiguous = ranks.every((rank, position) => rank === position + 1);
  const firstOverall = Math.min(...slots.map((slot) => slot.index));
  return {
    count: contiguous ? ranks.length : null,
    raw: slots.every((slot) => slot.source.kind === 'overall_position' && slot.source.normalization === 'raw'),
    afterPools: poolSlots.every((slot) => slot.index < firstOverall),
  };
}

export function viewLayout(input: LayoutInput): ViewLayout {
  const pinned = (slot: StageSlot) => input.resolutions.get(slot.id)?.viaOverride === true;
  const sourceIds = new Set(input.sourceSlots.map((slot) => slot.id));
  const pinnedTeams = new Set<TeamId>();
  const foreignTeams = new Set<TeamId>();
  for (const slot of input.entrySlots) {
    const teamId = input.resolutions.get(slot.id)?.teamId ?? null;
    if (teamId === null) continue;
    if (pinned(slot)) pinnedTeams.add(teamId);
    else if (!sourceIds.has(slot.id)) foreignTeams.add(teamId);
  }
  const open = input.sourceSlots.filter((slot) => !pinned(slot));
  const poolStarts = new Map<PoolId, number[]>();
  const bestStarts = new Map<number, { starts: number[]; normalizations: Set<UnevenPoolNormalization> }>();
  const poolSourced: StageSlot[] = [];
  const overallSourced: StageSlot[] = [];
  for (const slot of open) {
    const source = slot.source;
    if (source.kind === 'pool_position') {
      poolSourced.push(slot);
      const starts = poolStarts.get(source.poolId) ?? [];
      starts.push(source.position);
      poolStarts.set(source.poolId, starts);
    } else if (source.kind === 'best_of_position') {
      const entry = bestStarts.get(source.position) ?? { starts: [], normalizations: new Set<UnevenPoolNormalization>() };
      entry.starts.push(source.rank);
      entry.normalizations.add(source.normalization);
      bestStarts.set(source.position, entry);
    } else if (source.kind === 'overall_position') {
      overallSourced.push(slot);
    }
  }
  const poolSlots = new Map<PoolId, ReadonlySet<number>>();
  poolStarts.forEach((starts, poolId) => poolSlots.set(poolId, takeWalked(starts)));
  const bestOf = new Map<number, BestOfLayout>();
  bestStarts.forEach((entry, position) =>
    bestOf.set(position, {
      ranks: takeWalked(entry.starts),
      normalization: entry.normalizations.size === 1 ? [...entry.normalizations][0] : null,
    }),
  );
  return {
    poolSlots,
    bestOf,
    overall: overallLayout(overallSourced, poolSourced),
    pinnedTeams,
    foreignTeams,
    pinnedSourceSlots: input.sourceSlots.some(pinned),
  };
}

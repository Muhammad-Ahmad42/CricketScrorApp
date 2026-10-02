import type {
  Fixture,
  FixtureSide,
  Pool,
  PoolId,
  SlotId,
  SlotResolution,
  Stage,
  StageId,
  StageSlot,
  TeamId,
  TournamentEvaluation,
  TournamentSnapshot,
} from '@/domain/types';
import { ordinal, type ImpactNames } from '@/features/shared';

export interface SideVM {
  readonly text: string;
  readonly teamId: TeamId | null;
  readonly slotLabel: string | null;
  readonly meaning: string | null;
  readonly resolved: boolean;
  readonly provisional: boolean;
}

export interface TournamentIndex {
  readonly snapshot: TournamentSnapshot;
  readonly evaluation: TournamentEvaluation | null;
  readonly stages: readonly Stage[];
  teamName(teamId: TeamId | null | undefined): string;
  teamShort(teamId: TeamId | null | undefined): string;
  stage(stageId: StageId): Stage | undefined;
  stageName(stageId: StageId): string;
  pool(poolId: PoolId): Pool | undefined;
  poolName(poolId: PoolId | null): string | null;
  poolKey(poolId: PoolId): string;
  poolsOf(stageId: StageId): readonly Pool[];
  slot(slotId: SlotId): StageSlot | undefined;
  slotResolution(slotId: SlotId): SlotResolution | undefined;
  side(side: FixtureSide): SideVM;
  fixtureSides(fixture: Fixture): { readonly a: SideVM; readonly b: SideVM; readonly frozen: boolean };
  fixtureLabel(fixture: Fixture): string;
  fixtureTitle(fixture: Fixture): string;
  readonly impactNames: ImpactNames;
}

const UNKNOWN_TEAM = 'Unknown team';

function placeName(position: number): string {
  if (position === 1) {
    return 'pool winner';
  }
  if (position === 2) {
    return 'runner-up';
  }
  return `${ordinal(position)}-placed team`;
}

function slotMeaning(slot: StageSlot | undefined, label: string, poolName: (poolId: PoolId) => string): string {
  if (!slot) {
    return label;
  }
  const source = slot.source;
  switch (source.kind) {
    case 'pool_position': {
      const pool = poolName(source.poolId);
      if (source.position === 1) {
        return `${pool} winner`;
      }
      if (source.position === 2) {
        return `${pool} runner-up`;
      }
      return `${ordinal(source.position)} in ${pool}`;
    }
    case 'best_of_position':
      return source.rank === 1 ? `the best ${placeName(source.position)}` : `the ${ordinal(source.rank)} best ${placeName(source.position)}`;
    case 'overall_position':
      return `the team ${ordinal(source.rank)} overall`;
    case 'manual':
      return source.teamId === null ? 'a team chosen by the organizer' : label;
    default:
      return label;
  }
}

export function letterFor(index: number): string {
  let value = index;
  let letters = '';
  do {
    letters = String.fromCharCode(97 + (value % 26)) + letters;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return letters;
}

function poolLetter(pool: Pool, siblings: readonly Pool[]): string {
  const match = /^pool\s+([a-z]+)$/i.exec(pool.name.trim());
  if (match) {
    return match[1].toLowerCase();
  }
  return letterFor(Math.max(0, siblings.findIndex((candidate) => candidate.id === pool.id)));
}

function byOrder<T extends { readonly orderIndex: number }>(items: readonly T[]): readonly T[] {
  return [...items].sort((a, b) => a.orderIndex - b.orderIndex);
}

function buildIndex(snapshot: TournamentSnapshot, evaluation: TournamentEvaluation | null): TournamentIndex {
  const teams = new Map(snapshot.teams.map((view) => [view.team.id, view.team]));
  const stages = byOrder(snapshot.stages);
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const poolById = new Map(snapshot.pools.map((pool) => [pool.id, pool]));
  const poolsByStage = new Map<StageId, readonly Pool[]>();
  for (const stage of stages) {
    poolsByStage.set(stage.id, byOrder(snapshot.pools.filter((pool) => pool.stageId === stage.id)));
  }
  const poolKeys = new Map<PoolId, string>();
  for (const pool of snapshot.pools) {
    poolKeys.set(pool.id, poolLetter(pool, poolsByStage.get(pool.stageId) ?? []));
  }
  const slotById = new Map(snapshot.slots.map((slot) => [slot.id, slot]));
  const resolutions = new Map<SlotId, SlotResolution>();
  for (const stage of evaluation?.stages ?? []) {
    for (const resolution of stage.slots) {
      resolutions.set(resolution.slotId, resolution);
    }
  }
  const teamName = (teamId: TeamId | null | undefined): string => (teamId ? teams.get(teamId)?.name ?? UNKNOWN_TEAM : UNKNOWN_TEAM);
  const teamShort = (teamId: TeamId | null | undefined): string => (teamId ? teams.get(teamId)?.shortName ?? '?' : '?');
  const side = (value: FixtureSide): SideVM => {
    if (value.kind === 'team') {
      return { text: teamName(value.teamId), teamId: value.teamId, slotLabel: null, meaning: null, resolved: true, provisional: false };
    }
    const label = slotById.get(value.slotId)?.label ?? 'To be decided';
    const meaning = slotMeaning(slotById.get(value.slotId), label, (poolId) => poolById.get(poolId)?.name ?? 'the pool');
    const resolution = resolutions.get(value.slotId);
    if (resolution === undefined || resolution.teamId === null || resolution.status === 'pending') {
      return { text: label, teamId: null, slotLabel: label, meaning, resolved: false, provisional: false };
    }
    if (resolution.status === 'provisional') {
      return {
        text: `${label} · ${teamName(resolution.teamId)} (provisional)`,
        teamId: resolution.teamId,
        slotLabel: label,
        meaning,
        resolved: true,
        provisional: true,
      };
    }
    return { text: teamName(resolution.teamId), teamId: resolution.teamId, slotLabel: label, meaning, resolved: true, provisional: false };
  };
  const frozenSide = (teamId: TeamId, original: FixtureSide): SideVM => ({
    text: teamName(teamId),
    teamId,
    slotLabel: original.kind === 'slot' ? slotById.get(original.slotId)?.label ?? null : null,
    meaning: null,
    resolved: true,
    provisional: false,
  });
  const fixtureLabel = (fixture: Fixture): string => fixture.label ?? `M${fixture.matchNumber}`;
  return {
    snapshot,
    evaluation,
    stages,
    teamName,
    teamShort,
    stage: (stageId) => stageById.get(stageId),
    stageName: (stageId) => stageById.get(stageId)?.name ?? 'Stage',
    pool: (poolId) => poolById.get(poolId),
    poolName: (poolId) => (poolId === null ? null : poolById.get(poolId)?.name ?? null),
    poolKey: (poolId) => poolKeys.get(poolId) ?? 'x',
    poolsOf: (stageId) => poolsByStage.get(stageId) ?? [],
    slot: (slotId) => slotById.get(slotId),
    slotResolution: (slotId) => resolutions.get(slotId),
    side,
    fixtureSides: (fixture) =>
      fixture.matchSides
        ? { a: frozenSide(fixture.matchSides.teamAId, fixture.sideA), b: frozenSide(fixture.matchSides.teamBId, fixture.sideB), frozen: true }
        : { a: side(fixture.sideA), b: side(fixture.sideB), frozen: false },
    fixtureLabel,
    fixtureTitle: (fixture) => fixture.label ?? `Match ${fixture.matchNumber}`,
    impactNames: {
      team: teamName,
      pool: (poolId) => (poolId === null ? null : poolById.get(poolId)?.name ?? null),
      stage: (stageId) => stageById.get(stageId)?.name ?? 'Stage',
    },
  };
}

const withEvaluation = new WeakMap<TournamentSnapshot, WeakMap<TournamentEvaluation, TournamentIndex>>();
const withoutEvaluation = new WeakMap<TournamentSnapshot, TournamentIndex>();

export function tournamentIndex(snapshot: TournamentSnapshot, evaluation: TournamentEvaluation | null): TournamentIndex {
  if (evaluation === null) {
    const cached = withoutEvaluation.get(snapshot);
    if (cached) {
      return cached;
    }
    const built = buildIndex(snapshot, null);
    withoutEvaluation.set(snapshot, built);
    return built;
  }
  let perSnapshot = withEvaluation.get(snapshot);
  if (!perSnapshot) {
    perSnapshot = new WeakMap();
    withEvaluation.set(snapshot, perSnapshot);
  }
  const cached = perSnapshot.get(evaluation);
  if (cached) {
    return cached;
  }
  const built = buildIndex(snapshot, evaluation);
  perSnapshot.set(evaluation, built);
  return built;
}

export function sidesText(a: SideVM, b: SideVM): string {
  return `${a.text} v ${b.text}`;
}

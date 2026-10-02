import type {
  ChangePlan,
  Fixture,
  FixtureSide,
  IdGenerator,
  IsoDateTime,
  PoolEntry,
  StageId,
  TeamId,
  TournamentOverride,
  TournamentSnapshot,
} from '../../types';
import type { SnapshotIndex } from '../evaluation/snapshotIndex';
import { indexSnapshot, teamName } from '../evaluation/snapshotIndex';
import { hasMatchHistory, sideEquals } from '../evaluation/sides';

export interface PlanContext {
  readonly snapshot: TournamentSnapshot;
  readonly index: SnapshotIndex;
  readonly ids: IdGenerator;
  readonly now: IsoDateTime;
}

export function planContext(snapshot: TournamentSnapshot, ids: IdGenerator, now: IsoDateTime): PlanContext {
  return { snapshot, index: indexSnapshot(snapshot), ids, now };
}

export function emptyPlan(): ChangePlan {
  return {
    tournamentTeams: { upsert: [] },
    rules: null,
    stages: { upsert: [], delete: [] },
    pools: { upsert: [], delete: [] },
    slots: { upsert: [], delete: [] },
    poolEntries: [],
    fixtures: { insert: [], update: [], delete: [] },
    overrides: { insert: [], revoke: [] },
    matchesToCreate: [],
    summaryChanges: [],
  };
}

export function stageEntries(snapshot: TournamentSnapshot, stageId: StageId): readonly PoolEntry[] {
  return snapshot.poolEntries.filter((entry) => entry.stageId === stageId);
}

export function swapSide(side: FixtureSide, from: FixtureSide, to: FixtureSide): FixtureSide {
  return sideEquals(side, from) ? to : side;
}

export function rewriteSides(fixture: Fixture, rewrite: (side: FixtureSide) => FixtureSide, now: IsoDateTime): Fixture | null {
  const sideA = rewrite(fixture.sideA);
  const sideB = rewrite(fixture.sideB);
  if (sideEquals(sideA, fixture.sideA) && sideEquals(sideB, fixture.sideB)) return null;
  return { ...fixture, sideA, sideB, updatedAt: now };
}

export function expungeOverride(ctx: PlanContext, teamId: TeamId, reason: string): TournamentOverride {
  return {
    id: ctx.ids(),
    tournamentId: ctx.snapshot.tournament.id,
    kind: 'expunge_results',
    stageId: null,
    teamId,
    reason,
    createdAt: ctx.now,
    revokedAt: null,
    revokeReason: null,
  };
}

export function nameOf(ctx: PlanContext, teamId: TeamId): string {
  return ctx.index.teamNames.has(teamId) ? teamName(ctx.index, teamId) : teamId;
}

export function isUnplayed(fixture: Fixture): boolean {
  return fixture.matchId === null;
}

export function isDeletable(snapshot: TournamentSnapshot, fixture: Fixture): boolean {
  return !hasMatchHistory(snapshot, fixture);
}

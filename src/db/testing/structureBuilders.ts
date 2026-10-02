import type {
  Fixture,
  FixtureDraft,
  FixtureSide,
  Pool,
  PoolEntry,
  Stage,
  StageSlot,
  TeamId,
  TournamentOverride,
  TournamentTeam,
} from '@/domain/types';
import { createRepositories } from '../repositories';
import type { SqlDatabase } from '../types';
import { buildTournament, buildTournamentRules, isoAt } from './builders';
import { stageConfig } from './tournamentScenario';

export const teamSide = (teamId: TeamId): FixtureSide => ({ kind: 'team', teamId });
export const slotSide = (slotId: string): FixtureSide => ({ kind: 'slot', slotId });

export function buildMembership(tournamentId: string, teamId: TeamId, seed: number | null = null): TournamentTeam {
  return {
    id: `${tournamentId}-tt-${teamId}`,
    tournamentId,
    teamId,
    seed,
    status: 'active',
    replacedByTeamId: null,
    inheritsFromTeamId: null,
    joinedAt: isoAt(30),
  };
}

export function buildStage(input: Pick<Stage, 'id' | 'tournamentId'> & Partial<Stage>): Stage {
  return {
    name: 'Group stage',
    type: 'group',
    orderIndex: 0,
    status: 'pending',
    config: stageConfig(),
    createdAt: isoAt(60),
    updatedAt: isoAt(60),
    ...input,
  };
}

export function buildPool(input: Pick<Pool, 'id' | 'stageId'> & Partial<Pool>): Pool {
  return { name: `Pool ${input.id}`, orderIndex: 0, legs: null, ...input };
}

export function buildPoolEntry(input: Pick<PoolEntry, 'id' | 'poolId' | 'stageId' | 'side'> & Partial<PoolEntry>): PoolEntry {
  return { seed: null, ...input };
}

export function buildSlot(input: Pick<StageSlot, 'id' | 'stageId' | 'index' | 'source'> & Partial<StageSlot>): StageSlot {
  return { role: 'entry', label: `S${input.index + 1}`, seed: null, ...input };
}

export function buildFixture(input: Pick<Fixture, 'id' | 'tournamentId' | 'stageId' | 'sideA' | 'sideB'> & Partial<Fixture>): Fixture {
  return {
    poolId: null,
    matchNumber: 1,
    label: null,
    round: null,
    leg: null,
    bracket: null,
    isFinal: false,
    scheduledDate: null,
    scheduledTime: null,
    venueId: null,
    status: 'scheduled',
    matchId: null,
    matchSides: null,
    formatId: null,
    matchRules: null,
    notes: null,
    createdAt: isoAt(120),
    updatedAt: isoAt(120),
    ...input,
  };
}

export function toDraft(fixture: Fixture): FixtureDraft {
  const { createdAt, updatedAt, matchId, matchSides, ...draft } = fixture;
  return draft;
}

export function buildPointsOverride(input: Pick<TournamentOverride, 'id' | 'tournamentId'> & { readonly stageId: string; readonly teamId: TeamId }): TournamentOverride {
  return {
    kind: 'points_adjustment',
    poolId: null,
    points: -2,
    reason: 'Late arrival',
    createdAt: isoAt(500),
    revokedAt: null,
    revokeReason: null,
    ...input,
  };
}

export interface BareTournament {
  readonly tournamentId: string;
  readonly groupStageId: string;
  readonly knockoutStageId: string;
  readonly poolId: string;
}

export async function seedBareTournament(db: SqlDatabase, tournamentId: string, teamIds: readonly TeamId[]): Promise<BareTournament> {
  const ids: BareTournament = {
    tournamentId,
    groupStageId: `${tournamentId}-groups`,
    knockoutStageId: `${tournamentId}-ko`,
    poolId: `${tournamentId}-pool`,
  };
  await db.withTransactionAsync(async (tx) => {
    const repos = createRepositories(tx);
    await repos.tournaments.insert(buildTournament({ id: tournamentId, name: `Cup ${tournamentId}` }), buildTournamentRules(tournamentId));
    await repos.tournaments.upsertTournamentTeams(teamIds.map((teamId, index) => buildMembership(tournamentId, teamId, index + 1)));
    await repos.tournaments.upsertStages([
      buildStage({ id: ids.groupStageId, tournamentId }),
      buildStage({
        id: ids.knockoutStageId,
        tournamentId,
        name: 'Knockouts',
        type: 'knockout',
        orderIndex: 1,
        config: stageConfig({ fixtureGeneration: { method: 'knockout', legs: 1 }, decidesChampion: true }),
      }),
    ]);
    await repos.tournaments.upsertPools([buildPool({ id: ids.poolId, stageId: ids.groupStageId, name: 'Pool A' })]);
    await repos.tournaments.replacePoolEntries(
      ids.groupStageId,
      teamIds.map((teamId, index) =>
        buildPoolEntry({ id: `${tournamentId}-pe-${teamId}`, poolId: ids.poolId, stageId: ids.groupStageId, side: teamSide(teamId), seed: index + 1 }),
      ),
    );
  });
  return ids;
}

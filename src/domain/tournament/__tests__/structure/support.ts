import type {
  Fixture,
  FixtureDraft,
  FixtureSide,
  IdGenerator,
  MatchResult,
  MatchSummary,
  Pool,
  SlotId,
  TeamId,
  TournamentSnapshot,
  TournamentStructureKind,
} from '@/domain/types';
import type { DraftDefaults } from '@/domain/tournament/fixtures';
import { mulberry32, randomInt } from '@/domain/tournament/rng';

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
  }
  return value;
}

export function idSequence(prefix = 'id'): IdGenerator {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

export function team(teamId: TeamId): FixtureSide {
  return { kind: 'team', teamId };
}

export function slot(slotId: SlotId): FixtureSide {
  return { kind: 'slot', slotId };
}

export function teams(count: number, prefix = 'T'): readonly FixtureSide[] {
  return Array.from({ length: count }, (_, index) => team(`${prefix}${String(index + 1).padStart(2, '0')}`));
}

export function label(side: FixtureSide): string {
  return side.kind === 'team' ? side.teamId : side.slotId;
}

export function draftDefaults(overrides: Partial<DraftDefaults> = {}): DraftDefaults {
  return {
    tournamentId: 'tour-1',
    stageId: 'stage-1',
    poolId: null,
    formatId: null,
    matchRules: null,
    venueId: null,
    startMatchNumber: 1,
    ...overrides,
  };
}

export function pool(id: string, stageId: string, name: string, orderIndex: number, legs: number | null = null): Pool {
  return { id, stageId, name, orderIndex, legs };
}

export function fixture(partial: Partial<Fixture> & Pick<Fixture, 'id' | 'sideA' | 'sideB'>): Fixture {
  return {
    tournamentId: 'tour-1',
    stageId: 'stage-1',
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
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...partial,
  };
}

export function draft(partial: Partial<FixtureDraft> & Pick<FixtureDraft, 'id' | 'sideA' | 'sideB'>): FixtureDraft {
  const { createdAt, updatedAt, matchId, matchSides, ...rest } = fixture(partial);
  void createdAt;
  void updatedAt;
  void matchId;
  void matchSides;
  return rest;
}

export function summary(matchId: string, teamAId: TeamId, teamBId: TeamId, result: MatchResult): MatchSummary {
  const winner = (() => {
    switch (result.type) {
      case 'win':
      case 'walkover':
        return result.winnerTeamId;
      case 'awarded':
        return result.winnerTeamId;
      case 'tie':
        return result.decider ? result.decider.winnerTeamId : null;
      default:
        return null;
    }
  })();
  return {
    summaryVersion: 2,
    matchId,
    teamAId,
    teamBId,
    status: result.type === 'abandoned' ? 'abandoned' : 'completed',
    result,
    winnerTeamId: winner,
    ballsPerOver: 6,
    innings: [],
    superOvers: [],
    squads: [],
    completedAt: '2026-05-01T12:00:00.000Z',
  };
}

export function seededCases(seed: number, count: number, maxExclusive: number, minimum = 0): readonly number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => minimum + randomInt(rng, maxExclusive - minimum));
}

export function snapshotFrom(
  structure: Pick<TournamentSnapshot, 'rules' | 'stages' | 'pools' | 'slots' | 'poolEntries'>,
  options: { readonly teamIds?: readonly TeamId[]; readonly structureKind?: TournamentStructureKind } = {},
): TournamentSnapshot {
  const now = '2026-05-01T00:00:00.000Z';
  const tournamentId = structure.rules.tournamentId;
  return {
    version: '1',
    tournament: {
      id: tournamentId,
      name: 'Spring Cup',
      season: null,
      description: null,
      logoUri: null,
      organizer: null,
      contact: null,
      location: null,
      notes: null,
      startDate: null,
      endDate: null,
      venueIds: [],
      structureKind: options.structureKind ?? 'groups_knockout',
      status: 'structure_configured',
      createdAt: now,
      updatedAt: now,
    },
    rules: structure.rules,
    teams: (options.teamIds ?? []).map((teamId) => ({
      membership: {
        id: `tt-${teamId}`,
        tournamentId,
        teamId,
        seed: null,
        status: 'active',
        replacedByTeamId: null,
        inheritsFromTeamId: null,
        joinedAt: now,
      },
      team: { id: teamId, name: teamId, shortName: teamId.slice(0, 3), logoUri: null, captainId: null, createdAt: now, updatedAt: now, archivedAt: null },
    })),
    stages: structure.stages,
    pools: structure.pools,
    poolEntries: structure.poolEntries,
    slots: structure.slots,
    fixtures: [],
    summaries: {},
    staleSummaryMatchIds: [],
    overrides: [],
  };
}

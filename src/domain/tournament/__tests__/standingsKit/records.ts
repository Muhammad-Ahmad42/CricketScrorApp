import type { TeamId, TournamentOverride } from '@/domain/types';
import type { HeadToHeadRecord, RankContext, TeamRecord } from '../../tiebreakers';

export function teamRecord(teamId: TeamId, patch: Partial<TeamRecord> = {}): TeamRecord {
  return {
    teamId,
    points: 4,
    played: 3,
    won: 2,
    lost: 1,
    tied: 0,
    noResult: 0,
    nrr: 0,
    runsScored: 300,
    wicketsTaken: 20,
    seed: null,
    name: teamId,
    ...patch,
  };
}

export interface MutualResult {
  readonly a: TeamId;
  readonly b: TeamId;
  readonly winner: TeamId | null;
}

type Resolution = Extract<TournamentOverride, { readonly kind: 'tie_resolution' }>;

export function rankContext(
  results: readonly MutualResult[],
  opts: {
    readonly requireComplete?: boolean;
    readonly resolutions?: readonly Resolution[];
    readonly headToHeadNrr?: Readonly<Record<TeamId, number>>;
  } = {},
): RankContext {
  return {
    headToHeadRequiresCompleteMiniLeague: opts.requireComplete ?? false,
    resolutions: opts.resolutions ?? [],
    headToHead: (teamIds) => {
      const ids = new Set(teamIds);
      const records = new Map<TeamId, { points: number; wins: number; matchesPlayed: number }>();
      teamIds.forEach((id) => records.set(id, { points: 0, wins: 0, matchesPlayed: 0 }));
      const pairs = new Set<string>();
      for (const result of results) {
        if (!ids.has(result.a) || !ids.has(result.b)) continue;
        pairs.add([result.a, result.b].sort().join('|'));
        for (const side of [result.a, result.b]) {
          const entry = records.get(side)!;
          entry.matchesPlayed += 1;
          if (result.winner === null) entry.points += 1;
          else if (result.winner === side) {
            entry.points += 2;
            entry.wins += 1;
          }
        }
      }
      const complete = teamIds.every((x, i) => teamIds.slice(i + 1).every((y) => pairs.has([x, y].sort().join('|'))));
      const out = new Map<TeamId, HeadToHeadRecord>();
      records.forEach((value, id) => out.set(id, { ...value, nrr: opts.headToHeadNrr?.[id] ?? null }));
      return { records: out, complete };
    },
  };
}

export function tieResolution(
  orderedTeamIds: readonly TeamId[],
  method: 'organizer_decision' | 'draw_lots',
  patch: Partial<Resolution> = {},
): Resolution {
  return {
    id: `res-${orderedTeamIds.join('-')}`,
    tournamentId: 't1',
    kind: 'tie_resolution',
    reason: 'Fair play record',
    createdAt: '2026-05-01T10:00:00.000Z',
    revokedAt: null,
    revokeReason: null,
    stageId: 'groups',
    poolId: null,
    orderedTeamIds,
    method,
    seed: method === 'draw_lots' ? 847291 : null,
    ...patch,
  };
}

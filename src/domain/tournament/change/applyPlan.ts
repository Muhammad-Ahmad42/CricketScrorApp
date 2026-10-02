import type {
  ChangePlan,
  Fixture,
  MatchEventInput,
  MatchId,
  MatchResult,
  MatchSummary,
  TournamentOverride,
  TournamentSnapshot,
  TournamentTeam,
  TournamentTeamView,
} from '../../types';
import { supersededAfterUpdate } from '../fixtureReplay';

function upsertById<T extends { readonly id: string }>(items: readonly T[], upserts: readonly T[], deleted: ReadonlySet<string>): T[] {
  const replacements = new Map(upserts.map((item) => [item.id, item]));
  const kept = items.filter((item) => !deleted.has(item.id)).map((item) => replacements.get(item.id) ?? item);
  const known = new Set(items.map((item) => item.id));
  return [...kept, ...upserts.filter((item) => !known.has(item.id) && !deleted.has(item.id))];
}

function applyTeams(teams: readonly TournamentTeamView[], upserts: readonly TournamentTeam[], at: string): TournamentTeamView[] {
  const byTeam = new Map(upserts.map((row) => [row.teamId, row]));
  const next = teams.map((view) => {
    const row = byTeam.get(view.team.id);
    return row ? { ...view, membership: row } : view;
  });
  const known = new Set(teams.map((view) => view.team.id));
  for (const row of upserts) {
    if (known.has(row.teamId)) continue;
    next.push({
      membership: row,
      team: { id: row.teamId, name: row.teamId, shortName: row.teamId.slice(0, 5), logoUri: null, captainId: null, createdAt: at, updatedAt: at, archivedAt: null },
    });
  }
  return next;
}

function endedResult(match: ChangePlan['matchesToCreate'][number]): MatchResult | null {
  const ended = [...match.events].reverse().find((event): event is Extract<MatchEventInput, { readonly kind: 'match_ended' }> => event.kind === 'match_ended');
  if (!ended) return null;
  const outcome = ended.outcome;
  const loserOf = (winner: string) => (winner === match.match.teamAId ? match.match.teamBId : match.match.teamAId);
  switch (outcome.type) {
    case 'walkover':
      return { type: 'walkover', winnerTeamId: outcome.winnerTeamId, loserTeamId: loserOf(outcome.winnerTeamId), reason: outcome.reason };
    case 'awarded':
      return {
        type: 'awarded',
        winnerTeamId: outcome.winnerTeamId,
        loserTeamId: outcome.winnerTeamId === null ? null : loserOf(outcome.winnerTeamId),
        reason: outcome.reason,
        margin: outcome.margin,
      };
    case 'no_result':
      return { type: 'no_result', reason: outcome.reason };
    case 'abandoned':
      return { type: 'abandoned', reason: outcome.reason };
    case 'natural':
    case 'tie_decided':
      return null;
    default: {
      const never: never = outcome;
      return never;
    }
  }
}

function createdSummary(matchId: MatchId, match: ChangePlan['matchesToCreate'][number]): MatchSummary | null {
  const result = endedResult(match);
  if (!result) return null;
  const winner = result.type === 'walkover' || result.type === 'awarded' ? result.winnerTeamId : null;
  return {
    summaryVersion: 2,
    matchId,
    teamAId: match.match.teamAId,
    teamBId: match.match.teamBId,
    status: result.type === 'abandoned' ? 'abandoned' : 'completed',
    result,
    winnerTeamId: winner,
    ballsPerOver: match.match.rules.ballsPerOver,
    innings: [],
    superOvers: [],
    squads: [],
    completedAt: null,
  };
}

function applyOverrides(overrides: readonly TournamentOverride[], plan: ChangePlan): TournamentOverride[] {
  const revocations = new Map(plan.overrides.revoke.map((entry) => [entry.overrideId, entry]));
  const revoked = overrides.map((override) => {
    const revocation = revocations.get(override.id);
    return revocation && override.revokedAt === null ? { ...override, revokedAt: revocation.at, revokeReason: revocation.reason } : override;
  });
  return [...revoked, ...plan.overrides.insert];
}

function fixtureStatusFor(summary: MatchSummary): Fixture['status'] {
  return summary.status === 'abandoned' ? 'abandoned' : 'completed';
}

export function applyChangePlan(snapshot: TournamentSnapshot, plan: ChangePlan): TournamentSnapshot {
  const at = snapshot.tournament.updatedAt;
  const deletedStages = new Set(plan.stages.delete);
  const stages = upsertById(snapshot.stages, plan.stages.upsert, deletedStages);
  const deletedPools = new Set(plan.pools.delete);
  const pools = upsertById(snapshot.pools, plan.pools.upsert, deletedPools).filter((pool) => !deletedStages.has(pool.stageId));
  const slots = upsertById(snapshot.slots, plan.slots.upsert, new Set(plan.slots.delete)).filter((slot) => !deletedStages.has(slot.stageId));
  const replacedStages = new Set(plan.poolEntries.map((group) => group.stageId));
  const poolEntries = [
    ...snapshot.poolEntries.filter((entry) => !replacedStages.has(entry.stageId)),
    ...plan.poolEntries.flatMap((group) => group.entries),
  ].filter((entry) => !deletedStages.has(entry.stageId) && !deletedPools.has(entry.poolId));
  const inserted: Fixture[] = plan.fixtures.insert.map((draft) => ({ ...draft, matchId: null, matchSides: null, createdAt: at, updatedAt: at }));
  let fixtures = upsertById(snapshot.fixtures, [...plan.fixtures.update, ...inserted], new Set(plan.fixtures.delete)).filter(
    (fixture) => !deletedStages.has(fixture.stageId),
  );
  const summaries: Record<MatchId, MatchSummary> = { ...snapshot.summaries };
  for (const created of plan.matchesToCreate) {
    const summary = createdSummary(created.matchId, created);
    fixtures = fixtures.map((fixture) =>
      fixture.id === created.fixtureId
        ? {
            ...fixture,
            matchId: created.matchId,
            matchSides: { teamAId: created.match.teamAId, teamBId: created.match.teamBId },
            status: summary ? fixtureStatusFor(summary) : 'live',
          }
        : fixture,
    );
    if (summary) summaries[created.matchId] = summary;
  }
  for (const change of plan.summaryChanges) {
    if (change.summary) summaries[change.matchId] = change.summary;
    else delete summaries[change.matchId];
    const summary = change.summary;
    fixtures = fixtures.map((fixture) =>
      fixture.matchId === change.matchId ? { ...fixture, status: summary ? fixtureStatusFor(summary) : 'live' } : fixture,
    );
  }
  const superseded = supersededAfterUpdate(snapshot, plan.fixtures.update);
  return {
    ...snapshot,
    ...(superseded.length > 0 ? { supersededMatches: superseded } : {}),
    rules: plan.rules ?? snapshot.rules,
    teams: applyTeams(snapshot.teams, plan.tournamentTeams.upsert, at),
    stages,
    pools,
    poolEntries,
    slots,
    fixtures,
    summaries,
    overrides: applyOverrides(snapshot.overrides, plan),
  };
}

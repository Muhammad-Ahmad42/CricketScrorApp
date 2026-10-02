import type { ScorecardSource, StandingsSource, TournamentPdfSource } from '@/export';
import type { Match, PlayerId, TeamRef, TournamentId, TournamentSnapshot, TournamentEvaluation } from '@/domain/types';
import { computeTournamentStats } from '@/domain/tournament';
import type { Repositories } from '@/db';
import type { ServiceContext } from '../core/context';
import { readMatchLog } from '../match/matchLog';
import { evaluateSnapshot, readSnapshot } from '../tournament/snapshots';

function teamRefs(snapshot: TournamentSnapshot): readonly TeamRef[] {
  return snapshot.teams.map((view) => ({ id: view.team.id, name: view.team.name, shortName: view.team.shortName }));
}

function tournamentContext(
  match: Match,
  snapshot: TournamentSnapshot,
  evaluation: TournamentEvaluation,
): Pick<ScorecardSource, 'tournament' | 'standings'> {
  const fixture = snapshot.fixtures.find((entry) => entry.id === match.fixtureId) ?? null;
  const stage = snapshot.stages.find((entry) => entry.id === fixture?.stageId) ?? null;
  const pool = snapshot.pools.find((entry) => entry.id === fixture?.poolId) ?? null;
  const table = evaluation.stages
    .find((entry) => entry.stageId === stage?.id)
    ?.tables.find((entry) => entry.poolId === (pool?.id ?? null));
  const standings: StandingsSource[] =
    table === undefined || table.rows.length === 0
      ? []
      : [{ title: pool === null ? `${stage?.name ?? 'Stage'} standings` : `${pool.name} standings`, table, teams: teamRefs(snapshot) }];
  return {
    tournament: {
      tournamentName: snapshot.tournament.name,
      stageName: stage?.name ?? null,
      poolName: pool?.name ?? null,
      fixtureLabel: fixture === null ? null : (fixture.label ?? `Match ${fixture.matchNumber}`),
    },
    standings,
  };
}

export async function scorecardSource(ctx: ServiceContext, repos: Repositories, matchId: string): Promise<ScorecardSource> {
  const log = await readMatchLog(repos, matchId);
  const venue = log.match.venueId === null ? null : await repos.venues.get(log.match.venueId);
  let context: Pick<ScorecardSource, 'tournament' | 'standings'> = { tournament: null, standings: [] };
  if (log.match.tournamentId !== null) {
    const { snapshot, evaluation } = evaluateSnapshot(await readSnapshot(ctx, repos, log.match.tournamentId));
    context = tournamentContext(log.match, snapshot, evaluation);
  }
  return {
    match: log.match,
    setup: log.setup,
    state: log.state,
    venue: venue === null ? null : { name: venue.name, location: venue.location },
    tournament: context.tournament,
    standings: context.standings,
  };
}

export async function tournamentSource(ctx: ServiceContext, repos: Repositories, tournamentId: TournamentId): Promise<TournamentPdfSource> {
  const { snapshot, evaluation } = evaluateSnapshot(await readSnapshot(ctx, repos, tournamentId));
  const venueIds = new Set([...snapshot.tournament.venueIds, ...snapshot.fixtures.flatMap((fixture) => (fixture.venueId === null ? [] : [fixture.venueId]))]);
  const venues = (await repos.venues.list({ includeArchived: true })).filter((venue) => venueIds.has(venue.id)).map((venue) => ({ id: venue.id, name: venue.name }));
  const playerIds = [...new Set(Object.values(snapshot.summaries).flatMap((summary) => summary.squads.flatMap((squad) => squad.playerIds)))];
  const players = await repos.players.getMany(playerIds);
  const playerNames: Record<PlayerId, string> = {};
  players.forEach((player) => {
    playerNames[player.id] = player.name;
  });
  return { snapshot, evaluation, stats: computeTournamentStats(snapshot, evaluation), venues, playerNames };
}

import type { BackupData, Id } from '@/domain/types';

export interface AggregateSelection {
  readonly tournamentIds: ReadonlySet<Id>;
  readonly matchIds: ReadonlySet<Id>;
}

export const COPY_SUFFIX = ' (copy)';

export function standaloneMatchIds(data: BackupData): readonly Id[] {
  return data.matches.filter((match) => match.tournamentId === null).map((match) => match.id);
}

export function withoutAggregates(data: BackupData, drop: AggregateSelection): BackupData {
  const inTournament = (tournamentId: Id | null) => tournamentId !== null && drop.tournamentIds.has(tournamentId);
  const stageIds = new Set(data.stages.filter((stage) => inTournament(stage.tournamentId)).map((stage) => stage.id));
  const matchIds = new Set(
    data.matches.filter((match) => inTournament(match.tournamentId) || (match.tournamentId === null && drop.matchIds.has(match.id))).map((match) => match.id),
  );
  return {
    ...data,
    tournaments: data.tournaments.filter((row) => !drop.tournamentIds.has(row.id)),
    tournamentRules: data.tournamentRules.filter((row) => !inTournament(row.tournamentId)),
    tournamentTeams: data.tournamentTeams.filter((row) => !inTournament(row.tournamentId)),
    stages: data.stages.filter((row) => !stageIds.has(row.id)),
    pools: data.pools.filter((row) => !stageIds.has(row.stageId)),
    slots: data.slots.filter((row) => !stageIds.has(row.stageId)),
    poolEntries: data.poolEntries.filter((row) => !stageIds.has(row.stageId)),
    fixtures: data.fixtures.filter((row) => !inTournament(row.tournamentId)),
    matches: data.matches.filter((row) => !matchIds.has(row.id)),
    matchPlayers: data.matchPlayers.filter((row) => !matchIds.has(row.matchId)),
    matchEvents: data.matchEvents.filter((row) => !matchIds.has(row.matchId)),
    overrides: data.overrides.filter((row) => !inTournament(row.tournamentId)),
    auditEvents: data.auditEvents.filter((row) => !inTournament(row.tournamentId) && !(row.matchId !== null && matchIds.has(row.matchId))),
  };
}

export function markAsCopies(data: BackupData, copies: AggregateSelection, suffix: string = COPY_SUFFIX): BackupData {
  return {
    ...data,
    tournaments: data.tournaments.map((row) => (copies.tournamentIds.has(row.id) ? { ...row, name: `${row.name}${suffix}` } : row)),
    matches: data.matches.map((row) => (row.tournamentId === null && copies.matchIds.has(row.id) ? { ...row, title: `${row.title}${suffix}` } : row)),
  };
}

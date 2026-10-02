import type { BackupData, EventId, Id, ImportAggregateKind, ImportConflict, MatchId } from '@/domain/types';
import { matchLabel } from './eventLogs';
import { plural, warningIssue, type IssueSink } from './issues';
import type { LocalData, LocalFootprint } from './context';

export type LocalLookupPlan = { readonly [K in ImportAggregateKind]: readonly Id[] };

function localOnly(footprint: LocalFootprint | null, fileMatchIds: ReadonlySet<MatchId>, data: BackupData, fileEventIds: ReadonlySet<EventId>): ImportConflict['localOnly'] {
  if (footprint === null) {
    return { matches: 0, events: 0 };
  }
  const matches = footprint.matchIds.filter((id) => !fileMatchIds.has(id)).length;
  if (footprint.eventIds !== undefined) {
    return { matches, events: footprint.eventIds.filter((id) => !fileEventIds.has(id)).length };
  }
  const local = new Set(footprint.matchIds);
  const shared = data.matchEvents.filter((event) => local.has(event.matchId)).length;
  return { matches, events: Math.max(0, footprint.events - shared) };
}

function aggregateConflicts(data: BackupData, local: LocalData, sink: IssueSink): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  const fileEventIds = new Set(data.matchEvents.map((event) => event.id));
  const existingTournaments = local.existingIds.tournament;
  data.tournaments.forEach((tournament) => {
    if (existingTournaments?.has(tournament.id) !== true) {
      return;
    }
    const fileMatchIds = new Set(data.matches.filter((match) => match.tournamentId === tournament.id).map((match) => match.id));
    const lost = localOnly(local.footprint('tournament', tournament.id), fileMatchIds, data, fileEventIds);
    conflicts.push({ entity: 'tournament', id: tournament.id, label: tournament.name, localOnly: lost });
    sink.add(warningIssue('ID_CONFLICT', `The tournament "${tournament.name}" is already on this device.`, null));
  });
  const existingMatches = local.existingIds.match;
  data.matches.forEach((match) => {
    if (match.tournamentId !== null || existingMatches?.has(match.id) !== true) {
      return;
    }
    const label = matchLabel(match, data);
    const lost = localOnly(local.footprint('match', match.id), new Set([match.id]), data, fileEventIds);
    conflicts.push({ entity: 'match', id: match.id, label, localOnly: lost });
    sink.add(warningIssue('ID_CONFLICT', `The match "${label}" is already on this device.`, null));
  });
  return conflicts;
}

function libraryConflicts(
  kind: ImportAggregateKind,
  rows: readonly { readonly id: Id; readonly label: string }[],
  local: LocalData,
  noun: readonly [string, string],
  sink: IssueSink,
): ImportConflict[] {
  const existing = local.existingIds[kind];
  const conflicts = rows
    .filter((row) => existing?.has(row.id) === true)
    .map((row): ImportConflict => ({ entity: kind, id: row.id, label: row.label, localOnly: { matches: 0, events: 0 } }));
  if (conflicts.length > 0) {
    const verb = conflicts.length === 1 ? 'is' : 'are';
    sink.add(warningIssue('ID_CONFLICT', `${plural(conflicts.length, noun[0], noun[1])} in this file ${verb} already on this device.`, null));
  }
  return conflicts;
}

export function detectConflicts(data: BackupData, local: LocalData, sink: IssueSink): readonly ImportConflict[] {
  const teamNames = new Map(data.teams.map((team) => [team.id, team.name]));
  return [
    ...aggregateConflicts(data, local, sink),
    ...libraryConflicts('team', data.teams.map((row) => ({ id: row.id, label: row.name })), local, ['team', 'teams'], sink),
    ...libraryConflicts(
      'player',
      data.players.map((row) => {
        const team = teamNames.get(row.teamId);
        return { id: row.id, label: team === undefined ? row.name : `${row.name} (${team})` };
      }),
      local,
      ['player', 'players'],
      sink,
    ),
    ...libraryConflicts('venue', data.venues.map((row) => ({ id: row.id, label: row.name })), local, ['venue', 'venues'], sink),
    ...libraryConflicts('template', data.templates.map((row) => ({ id: row.id, label: row.name })), local, ['tournament template', 'tournament templates'], sink),
    ...libraryConflicts('preset', data.formatPresets.map((row) => ({ id: row.id, label: row.label })), local, ['format preset', 'format presets'], sink),
  ];
}

export function lookupPlan(data: BackupData, missing: { readonly [K in 'team' | 'player' | 'venue']: readonly Id[] }): LocalLookupPlan {
  const unique = (ids: readonly Id[]): readonly Id[] => [...new Set(ids)];
  return {
    tournament: unique(data.tournaments.map((row) => row.id)),
    match: unique(data.matches.filter((row) => row.tournamentId === null).map((row) => row.id)),
    team: unique([...data.teams.map((row) => row.id), ...missing.team]),
    player: unique([...data.players.map((row) => row.id), ...missing.player]),
    venue: unique([...data.venues.map((row) => row.id), ...missing.venue]),
    template: unique(data.templates.map((row) => row.id)),
    preset: unique(data.formatPresets.map((row) => row.id)),
  };
}

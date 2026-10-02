import type { BackupScope } from '@/domain/types';
import type { SqlExecutor, SqlValue } from '../types';
import { IN_JSON_LIST, jsonList } from './sql';

export interface RowFilter {
  readonly where: string;
  readonly params: readonly SqlValue[];
}

export const ALL_ROWS: RowFilter = { where: '1', params: [] };
export const NO_ROWS: RowFilter = { where: '0', params: [] };

export interface ScopeFilters {
  readonly venues: RowFilter;
  readonly teams: RowFilter;
  readonly players: RowFilter;
  readonly tournaments: RowFilter;
  readonly tournamentChildren: RowFilter;
  readonly stageChildren: RowFilter;
  readonly matches: RowFilter;
  readonly matchChildren: RowFilter;
  readonly auditEvents: RowFilter;
  readonly configuration: RowFilter;
  readonly includeSettings: boolean;
}

function inList(column: string, ids: readonly string[]): RowFilter {
  return ids.length === 0 ? NO_ROWS : { where: `${column} ${IN_JSON_LIST}`, params: [jsonList(ids)] };
}

async function ids(db: SqlExecutor, sql: string, params: readonly SqlValue[]): Promise<string[]> {
  const rows = await db.getAllAsync<{ readonly id: string | null }>(sql, params);
  return rows.map((row) => row.id).filter((id): id is string => id !== null);
}

const TEAM_REFERENCES_SQL = `SELECT team_a_id AS id FROM matches WHERE id ${IN_JSON_LIST}
UNION SELECT team_b_id FROM matches WHERE id ${IN_JSON_LIST}
UNION SELECT p.team_id FROM match_players mp JOIN players p ON p.id = mp.player_id WHERE mp.match_id ${IN_JSON_LIST}
UNION SELECT team_id FROM tournament_teams WHERE tournament_id = ?
UNION SELECT sl.source_team_id FROM stage_slots sl JOIN tournament_stages s ON s.id = sl.stage_id WHERE s.tournament_id = ?
UNION SELECT team_id FROM tournament_overrides WHERE tournament_id = ?
UNION SELECT j.value FROM tournament_overrides o, json_each(o.payload_json, '$.teamIds') j WHERE o.tournament_id = ?
UNION SELECT j.value FROM tournament_overrides o, json_each(o.payload_json, '$.orderedTeamIds') j WHERE o.tournament_id = ?`;

const VENUE_REFERENCES_SQL = `SELECT venue_id AS id FROM matches WHERE id ${IN_JSON_LIST}
UNION SELECT venue_id FROM tournament_venues WHERE tournament_id = ?
UNION SELECT venue_id FROM fixtures WHERE tournament_id = ?`;

async function closeLibrary(
  db: SqlExecutor,
  matchIds: readonly string[],
  tournamentId: string | null,
): Promise<{ readonly teamIds: readonly string[]; readonly playerIds: readonly string[]; readonly venueIds: readonly string[] }> {
  const matchList = jsonList(matchIds);
  const t = tournamentId ?? '';
  const teamIds = new Set(await ids(db, TEAM_REFERENCES_SQL, [matchList, matchList, matchList, t, t, t, t, t]));
  const playerIds = new Set<string>(
    await ids(db, `SELECT player_id AS id FROM match_players WHERE match_id ${IN_JSON_LIST}`, [matchList]),
  );
  let previousSize = -1;
  while (teamIds.size + playerIds.size !== previousSize) {
    previousSize = teamIds.size + playerIds.size;
    const teamList = jsonList([...teamIds]);
    for (const id of await ids(db, `SELECT id FROM players WHERE team_id ${IN_JSON_LIST}`, [teamList])) {
      playerIds.add(id);
    }
    for (const id of await ids(db, `SELECT captain_id AS id FROM teams WHERE id ${IN_JSON_LIST}`, [teamList])) {
      playerIds.add(id);
    }
    for (const id of await ids(db, `SELECT team_id AS id FROM players WHERE id ${IN_JSON_LIST}`, [jsonList([...playerIds])])) {
      teamIds.add(id);
    }
  }
  const venueIds = await ids(db, VENUE_REFERENCES_SQL, [matchList, t, t]);
  return { teamIds: [...teamIds], playerIds: [...playerIds], venueIds };
}

export async function scopeFilters(db: SqlExecutor, scope: BackupScope): Promise<ScopeFilters> {
  switch (scope.kind) {
    case 'full':
      return {
        venues: ALL_ROWS,
        teams: ALL_ROWS,
        players: ALL_ROWS,
        tournaments: ALL_ROWS,
        tournamentChildren: ALL_ROWS,
        stageChildren: ALL_ROWS,
        matches: ALL_ROWS,
        matchChildren: ALL_ROWS,
        auditEvents: ALL_ROWS,
        configuration: ALL_ROWS,
        includeSettings: true,
      };
    case 'tournament': {
      const matchIds = await ids(db, 'SELECT id FROM matches WHERE tournament_id = ?', [scope.tournamentId]);
      const library = await closeLibrary(db, matchIds, scope.tournamentId);
      const byTournament: RowFilter = { where: 'tournament_id = ?', params: [scope.tournamentId] };
      return {
        venues: inList('id', library.venueIds),
        teams: inList('id', library.teamIds),
        players: inList('id', library.playerIds),
        tournaments: { where: 'id = ?', params: [scope.tournamentId] },
        tournamentChildren: byTournament,
        stageChildren: { where: 'stage_id IN (SELECT id FROM tournament_stages WHERE tournament_id = ?)', params: [scope.tournamentId] },
        matches: byTournament,
        matchChildren: inList('match_id', matchIds),
        auditEvents: {
          where: `(tournament_id = ? OR match_id ${IN_JSON_LIST})`,
          params: [scope.tournamentId, jsonList(matchIds)],
        },
        configuration: NO_ROWS,
        includeSettings: false,
      };
    }
    case 'match': {
      const matchIds = await ids(db, 'SELECT id FROM matches WHERE id = ?', [scope.matchId]);
      const library = await closeLibrary(db, matchIds, null);
      return {
        venues: inList('id', library.venueIds),
        teams: inList('id', library.teamIds),
        players: inList('id', library.playerIds),
        tournaments: NO_ROWS,
        tournamentChildren: NO_ROWS,
        stageChildren: NO_ROWS,
        matches: inList('id', matchIds),
        matchChildren: inList('match_id', matchIds),
        auditEvents: inList('match_id', matchIds),
        configuration: NO_ROWS,
        includeSettings: false,
      };
    }
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}

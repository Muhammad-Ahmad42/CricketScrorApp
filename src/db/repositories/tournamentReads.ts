import type {
  Fixture,
  MatchStatus,
  MatchSummary,
  Pool,
  PoolEntry,
  Stage,
  StageSlot,
  SupersededMatch,
  Team,
  Tournament,
  TournamentListItem,
  TournamentOverride,
  TournamentRules,
  TournamentSnapshot,
  TournamentStatus,
  TournamentTeamView,
} from '@/domain/types';
import { TEAM_COLUMNS, teamFromRow, type TeamRow } from '../mappers/library';
import { overrideFromRow, type OverrideRow } from '../mappers/override';
import {
  POOL_ENTRY_COLUMNS,
  POOL_COLUMNS,
  SLOT_COLUMNS,
  STAGE_COLUMNS,
  fixtureColumns,
  fixtureFromRow,
  poolEntryFromRow,
  poolFromRow,
  slotFromRow,
  stageFromRow,
  type FixtureWithSidesRow,
  type PoolEntryRow,
  type PoolRow,
  type SlotRow,
  type StageRow,
} from '../mappers/structure';
import {
  TOURNAMENT_COLUMNS,
  TOURNAMENT_RULES_COLUMNS,
  TOURNAMENT_TEAM_COLUMNS,
  championFromJson,
  rulesFromRow,
  tournamentFromRow,
  tournamentTeamFromRow,
  type TournamentRow,
  type TournamentRulesRow,
  type TournamentTeamRow,
} from '../mappers/tournament';
import { parseJson } from '../mappers/values';
import type { SqlExecutor, SqlValue } from '../types';
import { textMatcher } from './search';
import { IN_JSON_LIST, jsonList, placeholderList } from './sql';

function prefixed(columns: string, alias: string): string {
  return columns
    .split(',')
    .map((column) => `${alias}.${column.trim()}`)
    .join(', ');
}

export async function readVenueIds(db: SqlExecutor, tournamentId: string): Promise<readonly string[]> {
  const rows = await db.getAllAsync<{ readonly venue_id: string }>(
    'SELECT venue_id FROM tournament_venues WHERE tournament_id = ? ORDER BY order_index, venue_id',
    [tournamentId],
  );
  return rows.map((row) => row.venue_id);
}

export async function readTournamentRow(db: SqlExecutor, id: string): Promise<TournamentRow | null> {
  return db.getFirstAsync<TournamentRow>(`SELECT ${TOURNAMENT_COLUMNS} FROM tournaments WHERE id = ?`, [id]);
}

export async function readTournament(db: SqlExecutor, id: string): Promise<Tournament | null> {
  const row = await readTournamentRow(db, id);
  return row === null ? null : tournamentFromRow(row, await readVenueIds(db, id));
}

export async function readRules(db: SqlExecutor, tournamentId: string): Promise<TournamentRules | null> {
  const row = await db.getFirstAsync<TournamentRulesRow>(
    `SELECT ${TOURNAMENT_RULES_COLUMNS} FROM tournament_rules WHERE tournament_id = ?`,
    [tournamentId],
  );
  return row === null ? null : rulesFromRow(row);
}

async function readTeamViews(db: SqlExecutor, tournamentId: string): Promise<TournamentTeamView[]> {
  const memberships = await db.getAllAsync<TournamentTeamRow>(
    `SELECT ${prefixed(TOURNAMENT_TEAM_COLUMNS, 'tt')} FROM tournament_teams tt WHERE tt.tournament_id = ? ORDER BY tt.joined_at, tt.rowid`,
    [tournamentId],
  );
  const teams = await db.getAllAsync<TeamRow>(
    `SELECT ${TEAM_COLUMNS} FROM teams WHERE id IN (SELECT team_id FROM tournament_teams WHERE tournament_id = ?)`,
    [tournamentId],
  );
  const byId = new Map<string, Team>(teams.map((row) => [row.id, teamFromRow(row)]));
  return memberships.flatMap((row) => {
    const team = byId.get(row.team_id);
    return team === undefined ? [] : [{ membership: tournamentTeamFromRow(row), team }];
  });
}

export async function readStages(db: SqlExecutor, tournamentId: string): Promise<Stage[]> {
  const rows = await db.getAllAsync<StageRow>(
    `SELECT ${STAGE_COLUMNS} FROM tournament_stages WHERE tournament_id = ? ORDER BY order_index`,
    [tournamentId],
  );
  return rows.map(stageFromRow);
}

export async function readPools(db: SqlExecutor, tournamentId: string): Promise<Pool[]> {
  const rows = await db.getAllAsync<PoolRow>(
    `SELECT ${prefixed(POOL_COLUMNS, 'p')} FROM pools p JOIN tournament_stages s ON s.id = p.stage_id ` +
      'WHERE s.tournament_id = ? ORDER BY s.order_index, p.order_index',
    [tournamentId],
  );
  return rows.map(poolFromRow);
}

export async function readPoolEntries(db: SqlExecutor, tournamentId: string): Promise<PoolEntry[]> {
  const rows = await db.getAllAsync<PoolEntryRow>(
    `SELECT ${prefixed(POOL_ENTRY_COLUMNS, 'pt')} FROM pool_teams pt ` +
      'JOIN tournament_stages s ON s.id = pt.stage_id JOIN pools p ON p.id = pt.pool_id ' +
      'WHERE pt.tournament_id = ? ORDER BY s.order_index, p.order_index, pt.order_index, pt.rowid',
    [tournamentId],
  );
  return rows.map(poolEntryFromRow);
}

export async function readSlots(db: SqlExecutor, tournamentId: string): Promise<StageSlot[]> {
  const rows = await db.getAllAsync<SlotRow>(
    `SELECT ${prefixed(SLOT_COLUMNS, 'sl')} FROM stage_slots sl JOIN tournament_stages s ON s.id = sl.stage_id ` +
      'WHERE s.tournament_id = ? ORDER BY s.order_index, sl.slot_index',
    [tournamentId],
  );
  return rows.map(slotFromRow);
}

export async function readFixtures(db: SqlExecutor, where: string, params: readonly SqlValue[]): Promise<Fixture[]> {
  const rows = await db.getAllAsync<FixtureWithSidesRow>(
    `SELECT ${fixtureColumns('f')}, m.team_a_id AS match_team_a_id, m.team_b_id AS match_team_b_id ` +
      `FROM fixtures f LEFT JOIN matches m ON m.id = f.match_id WHERE ${where} ORDER BY f.match_number, f.rowid`,
    params,
  );
  return rows.map(fixtureFromRow);
}

export async function readOverrides(db: SqlExecutor, tournamentId: string): Promise<TournamentOverride[]> {
  const rows = await db.getAllAsync<OverrideRow>(
    'SELECT payload_json, revoked_at, revoke_reason FROM tournament_overrides WHERE tournament_id = ? ORDER BY created_at, rowid',
    [tournamentId],
  );
  return rows.map(overrideFromRow);
}

interface CurrentMatchRow {
  readonly id: string;
  readonly status: MatchStatus;
  readonly summary_json: string | null;
  readonly projection_version: number;
  readonly has_events: number;
}

async function readSummaries(
  db: SqlExecutor,
  tournamentId: string,
  projectionVersion: number,
): Promise<{ readonly summaries: Record<string, MatchSummary>; readonly stale: string[] }> {
  const rows = await db.getAllAsync<CurrentMatchRow>(
    'SELECT m.id, m.status, m.summary_json, m.projection_version, ' +
      'EXISTS (SELECT 1 FROM match_events e WHERE e.match_id = m.id) AS has_events ' +
      'FROM fixtures f JOIN matches m ON m.id = f.match_id WHERE f.tournament_id = ? ORDER BY f.match_number, f.rowid',
    [tournamentId],
  );
  const summaries: Record<string, MatchSummary> = {};
  const stale: string[] = [];
  for (const row of rows) {
    if (row.projection_version < projectionVersion && row.has_events === 1) {
      stale.push(row.id);
    } else if ((row.status === 'completed' || row.status === 'abandoned') && row.summary_json !== null) {
      summaries[row.id] = parseJson<MatchSummary>(row.summary_json);
    }
  }
  return { summaries, stale };
}

export async function readSupersededMatches(db: SqlExecutor, tournamentId: string): Promise<SupersededMatch[]> {
  const rows = await db.getAllAsync<{ readonly fixture_id: string; readonly match_id: string }>(
    'SELECT m.fixture_id AS fixture_id, m.id AS match_id FROM matches m ' +
      'JOIN fixtures f ON f.id = m.fixture_id AND f.tournament_id = m.tournament_id ' +
      'WHERE f.tournament_id = ? AND f.match_id IS NOT m.id ORDER BY m.created_at, m.rowid',
    [tournamentId],
  );
  return rows.map((row) => ({ fixtureId: row.fixture_id, matchId: row.match_id }));
}

export async function readSnapshot(
  db: SqlExecutor,
  tournamentId: string,
  projectionVersion: number,
): Promise<TournamentSnapshot | null> {
  const row = await readTournamentRow(db, tournamentId);
  const rules = row === null ? null : await readRules(db, tournamentId);
  if (row === null || rules === null) {
    return null;
  }
  const { summaries, stale } = await readSummaries(db, tournamentId, projectionVersion);
  return {
    version: String(row.revision),
    tournament: tournamentFromRow(row, await readVenueIds(db, tournamentId)),
    rules,
    teams: await readTeamViews(db, tournamentId),
    stages: await readStages(db, tournamentId),
    pools: await readPools(db, tournamentId),
    poolEntries: await readPoolEntries(db, tournamentId),
    slots: await readSlots(db, tournamentId),
    fixtures: await readFixtures(db, 'f.tournament_id = ?', [tournamentId]),
    summaries,
    staleSummaryMatchIds: stale,
    overrides: await readOverrides(db, tournamentId),
    supersededMatches: await readSupersededMatches(db, tournamentId),
  };
}

interface TournamentListRow {
  readonly id: string;
  readonly name: string;
  readonly season: string | null;
  readonly status: TournamentStatus;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly updated_at: string;
  readonly champion_json: string | null;
  readonly team_count: number;
  readonly fixtures_total: number;
  readonly fixtures_done: number;
}

const TOURNAMENT_LIST_SQL = `SELECT t.id, t.name, t.season, t.status, t.start_date, t.end_date, t.updated_at, t.champion_json,
  (SELECT count(*) FROM tournament_teams tt WHERE tt.tournament_id = t.id AND tt.status <> 'replaced') AS team_count,
  (SELECT count(*) FROM fixtures f WHERE f.tournament_id = t.id) AS fixtures_total,
  (SELECT count(*) FROM fixtures f WHERE f.tournament_id = t.id AND f.status IN ('completed', 'abandoned', 'cancelled')) AS fixtures_done
FROM tournaments t`;

async function teamNames(db: SqlExecutor, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db.getAllAsync<{ readonly id: string; readonly name: string }>(
    `SELECT id, name FROM teams WHERE id ${IN_JSON_LIST}`,
    [jsonList(ids)],
  );
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function listTournaments(
  db: SqlExecutor,
  opts: { readonly statuses?: readonly TournamentStatus[]; readonly search?: string },
): Promise<TournamentListItem[]> {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (opts.statuses !== undefined) {
    clauses.push(opts.statuses.length === 0 ? '0' : `t.status IN (${placeholderList(opts.statuses.length)})`);
    params.push(...opts.statuses);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const listed = await db.getAllAsync<TournamentListRow>(`${TOURNAMENT_LIST_SQL} ${where} ORDER BY t.updated_at DESC, t.rowid DESC`, params);
  const matcher = textMatcher(opts.search);
  const rows = matcher === null ? listed : listed.filter((row) => matcher([row.name]));
  const champions = rows.map((row) => championFromJson(row.champion_json) ?? []);
  const names = await teamNames(db, [...new Set(champions.flat())]);
  return rows.map((row, index) => {
    const championIds = champions[index];
    const championNames = championIds.map((id) => names.get(id)).filter((name): name is string => name !== undefined);
    return {
      id: row.id,
      name: row.name,
      season: row.season,
      status: row.status,
      teamCount: row.team_count,
      fixturesDone: row.fixtures_done,
      fixturesTotal: row.fixtures_total,
      championName: championNames.length === 0 ? null : championNames.join(' & '),
      startDate: row.start_date,
      endDate: row.end_date,
      updatedAt: row.updated_at,
    };
  });
}

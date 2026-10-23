import { listChase } from '@/domain/scoring/listChase';
import type { InningsLine, ListChase, MatchListItem, MatchListQuery, MatchResult, MatchStatus } from '@/domain/types';
import { INNINGS_COLUMNS, inningsLineFromRow, type InningsRow } from '../mappers/projection';
import { parseJsonOrNull } from '../mappers/values';
import type { SqlExecutor, SqlValue } from '../types';
import { pageOf, textMatcher } from './search';
import { IN_JSON_LIST, jsonList, placeholderList } from './sql';

interface MatchListRow {
  readonly id: string;
  readonly title: string;
  readonly status: MatchStatus;
  readonly result_json: string | null;
  readonly overs_per_innings: number;
  readonly scheduled_date: string | null;
  readonly tournament_id: string | null;
  readonly tournament_name: string | null;
  readonly resume_dismissed_at: string | null;
  readonly updated_at: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly team_a_id: string;
  readonly team_a_name: string;
  readonly team_a_short: string;
  readonly team_b_id: string;
  readonly team_b_name: string;
  readonly team_b_short: string;
}

const LIST_SELECT = `SELECT m.id, m.title, m.status, m.result_json, m.overs_per_innings, m.scheduled_date, m.tournament_id,
  t.name AS tournament_name, m.resume_dismissed_at, m.updated_at, m.started_at, m.completed_at,
  ta.id AS team_a_id, ta.name AS team_a_name, ta.short_name AS team_a_short,
  tb.id AS team_b_id, tb.name AS team_b_name, tb.short_name AS team_b_short
FROM matches m
JOIN teams ta ON ta.id = m.team_a_id
JOIN teams tb ON tb.id = m.team_b_id
LEFT JOIN tournaments t ON t.id = m.tournament_id`;

interface SearchRow {
  readonly id: string;
  readonly title: string;
  readonly team_a_name: string;
  readonly team_a_short: string;
  readonly team_b_name: string;
  readonly team_b_short: string;
}

const SEARCH_SELECT = `SELECT m.id, m.title, ta.name AS team_a_name, ta.short_name AS team_a_short,
  tb.name AS team_b_name, tb.short_name AS team_b_short
FROM matches m
JOIN teams ta ON ta.id = m.team_a_id
JOIN teams tb ON tb.id = m.team_b_id`;

const SORTS: Readonly<Record<NonNullable<MatchListQuery['sort']>, string>> = {
  recent: 'COALESCE(m.started_at, m.completed_at, m.created_at) DESC, m.created_at DESC, m.rowid DESC',
  oldest: 'COALESCE(m.started_at, m.completed_at, m.created_at) ASC, m.created_at ASC, m.rowid ASC',
  scheduled:
    'm.scheduled_date IS NULL, m.scheduled_date ASC, m.scheduled_time IS NULL, m.scheduled_time ASC, m.created_at ASC, m.rowid ASC',
};

interface MatchInnings {
  readonly lines: ReadonlyMap<string, InningsLine[]>;
  readonly chases: ReadonlyMap<string, ListChase>;
}

async function inningsByMatch(db: SqlExecutor, matchIds: readonly string[]): Promise<MatchInnings> {
  const grouped = new Map<string, InningsLine[]>();
  const chases = new Map<string, ListChase>();
  if (matchIds.length === 0) {
    return { lines: grouped, chases };
  }
  const rows = await db.getAllAsync<InningsRow>(
    `SELECT ${INNINGS_COLUMNS} FROM innings WHERE match_id ${IN_JSON_LIST} ORDER BY match_id, innings_index`,
    [jsonList(matchIds)],
  );
  for (const row of rows) {
    const lines = grouped.get(row.match_id) ?? [];
    lines.push(inningsLineFromRow(row));
    grouped.set(row.match_id, lines);
    const chase = listChase({ status: row.status, target: row.target, runs: row.runs, legalBalls: row.legal_balls, maxBalls: row.max_balls });
    if (chase === null) {
      chases.delete(row.match_id);
    } else {
      chases.set(row.match_id, chase);
    }
  }
  return { lines: grouped, chases };
}

function chaseOf(chases: ReadonlyMap<string, ListChase>, matchId: string, status: MatchStatus): { readonly chase?: ListChase } {
  const chase = status === 'live' || status === 'paused' ? chases.get(matchId) : undefined;
  return chase === undefined ? {} : { chase };
}

async function listItems(db: SqlExecutor, sql: string, params: readonly SqlValue[]): Promise<MatchListItem[]> {
  const rows = await db.getAllAsync<MatchListRow>(sql, params);
  const innings = await inningsByMatch(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    result: parseJsonOrNull<MatchResult>(row.result_json),
    teamA: { id: row.team_a_id, name: row.team_a_name, shortName: row.team_a_short },
    teamB: { id: row.team_b_id, name: row.team_b_name, shortName: row.team_b_short },
    oversPerInnings: row.overs_per_innings,
    innings: innings.lines.get(row.id) ?? [],
    scheduledDate: row.scheduled_date,
    tournamentId: row.tournament_id,
    tournamentName: row.tournament_name,
    resumeDismissedAt: row.resume_dismissed_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    ...chaseOf(innings.chases, row.id, row.status),
  }));
}

function listFilters(query: MatchListQuery): { readonly where: string; readonly params: SqlValue[] } {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (query.statuses !== undefined) {
    if (query.statuses.length === 0) {
      clauses.push('0');
    } else {
      clauses.push(`m.status IN (${placeholderList(query.statuses.length)})`);
      params.push(...query.statuses);
    }
  }
  if (query.tournamentId === null) {
    clauses.push('m.tournament_id IS NULL');
  } else if (query.tournamentId !== undefined) {
    clauses.push('m.tournament_id = ?');
    params.push(query.tournamentId);
  }
  if (query.teamId !== undefined) {
    clauses.push('(m.team_a_id = ? OR m.team_b_id = ?)');
    params.push(query.teamId, query.teamId);
  }
  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function listMatches(db: SqlExecutor, query: MatchListQuery): Promise<MatchListItem[]> {
  const filters = listFilters(query);
  const order = SORTS[query.sort ?? 'recent'];
  const matcher = textMatcher(query.search);
  if (matcher === null) {
    return listItems(db, `${LIST_SELECT} ${filters.where} ORDER BY ${order} LIMIT ? OFFSET ?`, [
      ...filters.params,
      query.limit ?? -1,
      query.offset ?? 0,
    ]);
  }
  const candidates = await db.getAllAsync<SearchRow>(`${SEARCH_SELECT} ${filters.where} ORDER BY ${order}`, filters.params);
  const found = candidates
    .filter((row) => matcher([row.title, row.team_a_name, row.team_a_short, row.team_b_name, row.team_b_short]))
    .map((row) => row.id);
  const page = pageOf(found, query.limit, query.offset);
  if (page.length === 0) {
    return [];
  }
  const items = await listItems(db, `${LIST_SELECT} WHERE m.id ${IN_JSON_LIST}`, [jsonList(page)]);
  const byId = new Map(items.map((item) => [item.id, item]));
  return page.map((id) => byId.get(id)).filter((item): item is MatchListItem => item !== undefined);
}

export function findResumableMatches(db: SqlExecutor, forPrompt: boolean): Promise<MatchListItem[]> {
  const dismissed = forPrompt ? 'AND m.resume_dismissed_at IS NULL' : '';
  return listItems(
    db,
    `${LIST_SELECT} WHERE m.status IN ('live', 'paused') ${dismissed} ORDER BY m.updated_at DESC, m.rowid DESC`,
    [],
  );
}

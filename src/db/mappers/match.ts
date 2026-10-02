import type {
  Match,
  MatchPlayer,
  MatchResult,
  MatchRules,
  MatchSquadEntry,
  MatchStatus,
  PlayerRole,
  Toss,
  TossDecision,
} from '@/domain/types';
import { fromFlag, parseJson, parseJsonOrNull, toFlag, toJson, toJsonOrNull, type SqlRecord } from './values';

export interface MatchRow {
  readonly id: string;
  readonly title: string;
  readonly tournament_id: string | null;
  readonly fixture_id: string | null;
  readonly team_a_id: string;
  readonly team_b_id: string;
  readonly team_a_players: number | null;
  readonly team_b_players: number | null;
  readonly venue_id: string | null;
  readonly scheduled_date: string | null;
  readonly scheduled_time: string | null;
  readonly format_id: string;
  readonly rules_json: string;
  readonly toss_winner_team_id: string | null;
  readonly toss_decision: TossDecision | null;
  readonly status: MatchStatus;
  readonly result_json: string | null;
  readonly winner_team_id: string | null;
  readonly resume_dismissed_at: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export const MATCH_COLUMNS = [
  'id',
  'title',
  'tournament_id',
  'fixture_id',
  'team_a_id',
  'team_b_id',
  'team_a_players',
  'team_b_players',
  'venue_id',
  'scheduled_date',
  'scheduled_time',
  'format_id',
  'rules_json',
  'toss_winner_team_id',
  'toss_decision',
  'status',
  'result_json',
  'winner_team_id',
  'resume_dismissed_at',
  'started_at',
  'completed_at',
  'created_at',
  'updated_at',
] as const;

export function matchColumns(alias: string): string {
  return MATCH_COLUMNS.map((column) => `${alias}.${column}`).join(', ');
}

function tossFromRow(row: MatchRow): Toss | null {
  if (row.toss_winner_team_id === null || row.toss_decision === null) {
    return null;
  }
  return { winnerTeamId: row.toss_winner_team_id, decision: row.toss_decision };
}

export function matchFromRow(row: MatchRow): Match {
  return {
    id: row.id,
    title: row.title,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    venueId: row.venue_id,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    formatId: row.format_id,
    rules: parseJson<MatchRules>(row.rules_json),
    toss: tossFromRow(row),
    status: row.status,
    result: parseJsonOrNull<MatchResult>(row.result_json),
    winnerTeamId: row.winner_team_id,
    tournamentId: row.tournament_id,
    fixtureId: row.fixture_id,
    teamAPlayers: row.team_a_players,
    teamBPlayers: row.team_b_players,
    resumeDismissedAt: row.resume_dismissed_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function matchConfigRecord(match: Match): SqlRecord {
  return {
    title: match.title,
    tournament_id: match.tournamentId,
    fixture_id: match.fixtureId,
    team_a_players: match.teamAPlayers,
    team_b_players: match.teamBPlayers,
    venue_id: match.venueId,
    scheduled_date: match.scheduledDate,
    scheduled_time: match.scheduledTime,
    format_id: match.formatId,
    rules_json: toJson(match.rules),
    toss_winner_team_id: match.toss?.winnerTeamId ?? null,
    toss_decision: match.toss?.decision ?? null,
    resume_dismissed_at: match.resumeDismissedAt,
    updated_at: match.updatedAt,
  };
}

export function matchToRecord(match: Match): SqlRecord {
  return {
    id: match.id,
    team_a_id: match.teamAId,
    team_b_id: match.teamBId,
    ...matchConfigRecord(match),
    status: match.status,
    result_json: toJsonOrNull(match.result),
    winner_team_id: match.winnerTeamId,
    started_at: match.startedAt,
    completed_at: match.completedAt,
    created_at: match.createdAt,
  };
}

export interface MatchPlayerRow {
  readonly match_id: string;
  readonly player_id: string;
  readonly team_id: string;
  readonly batting_order: number | null;
  readonly is_captain: number;
  readonly is_wicket_keeper: number;
  readonly is_substitute: number;
}

export interface MatchPlayerDetailRow extends MatchPlayerRow {
  readonly name: string;
  readonly jersey_number: number | null;
  readonly role: PlayerRole;
}

export type MatchSquadRow = Omit<MatchPlayer, 'name' | 'jerseyNumber' | 'role'>;

export function squadEntryToRecord(matchId: string, teamId: string, entry: MatchSquadEntry): SqlRecord {
  return {
    match_id: matchId,
    player_id: entry.playerId,
    team_id: teamId,
    batting_order: entry.battingOrder,
    is_captain: toFlag(entry.isCaptain),
    is_wicket_keeper: toFlag(entry.isWicketKeeper),
    is_substitute: toFlag(entry.isSubstitute),
  };
}

export function squadRowFromRow(row: MatchPlayerRow): MatchSquadRow {
  return {
    matchId: row.match_id,
    playerId: row.player_id,
    teamId: row.team_id,
    battingOrder: row.batting_order,
    isCaptain: fromFlag(row.is_captain),
    isWicketKeeper: fromFlag(row.is_wicket_keeper),
    isSubstitute: fromFlag(row.is_substitute),
  };
}

export function matchPlayerFromRow(row: MatchPlayerDetailRow): MatchPlayer {
  return {
    ...squadRowFromRow(row),
    name: row.name,
    jerseyNumber: row.jersey_number,
    role: row.role,
  };
}

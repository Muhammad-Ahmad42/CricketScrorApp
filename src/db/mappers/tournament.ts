import type {
  BonusPointRule,
  MatchRules,
  NrrConfig,
  TieBreakerKind,
  Tournament,
  TournamentRules,
  TournamentStatus,
  TournamentStructureKind,
  TournamentTeam,
} from '@/domain/types';
import { parseJson, parseJsonOrNull, toJson, toJsonOrNull, type SqlRecord } from './values';

export interface TournamentRow {
  readonly id: string;
  readonly name: string;
  readonly season: string | null;
  readonly description: string | null;
  readonly logo_uri: string | null;
  readonly organizer: string | null;
  readonly contact: string | null;
  readonly location: string | null;
  readonly notes: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly structure_kind: TournamentStructureKind;
  readonly status: TournamentStatus;
  readonly revision: number;
  readonly champion_json: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export const TOURNAMENT_COLUMNS =
  'id, name, season, description, logo_uri, organizer, contact, location, notes, start_date, end_date, ' +
  'structure_kind, status, revision, champion_json, created_at, updated_at';

export function tournamentFromRow(row: TournamentRow, venueIds: readonly string[]): Tournament {
  return {
    id: row.id,
    name: row.name,
    season: row.season,
    description: row.description,
    logoUri: row.logo_uri,
    organizer: row.organizer,
    contact: row.contact,
    location: row.location,
    notes: row.notes,
    startDate: row.start_date,
    endDate: row.end_date,
    venueIds,
    structureKind: row.structure_kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function tournamentInfoRecord(tournament: Tournament): SqlRecord {
  return {
    name: tournament.name,
    season: tournament.season,
    description: tournament.description,
    logo_uri: tournament.logoUri,
    organizer: tournament.organizer,
    contact: tournament.contact,
    location: tournament.location,
    notes: tournament.notes,
    start_date: tournament.startDate,
    end_date: tournament.endDate,
    structure_kind: tournament.structureKind,
    status: tournament.status,
    updated_at: tournament.updatedAt,
  };
}

export function tournamentToRecord(tournament: Tournament): SqlRecord {
  return { id: tournament.id, ...tournamentInfoRecord(tournament), created_at: tournament.createdAt };
}

export function championFromJson(json: string | null): readonly string[] | null {
  return parseJsonOrNull<readonly string[]>(json);
}

export interface TournamentRulesRow {
  readonly tournament_id: string;
  readonly points_win: number;
  readonly points_tie: number;
  readonly points_no_result: number;
  readonly points_loss: number;
  readonly points_abandoned: number | null;
  readonly points_walkover_win: number | null;
  readonly points_walkover_loss: number | null;
  readonly super_over_decided_tie: 'win_loss' | 'tie';
  readonly bonus_json: string | null;
  readonly nrr_mode: NrrConfig['mode'];
  readonly nrr_options_json: string;
  readonly tie_breakers_json: string;
  readonly default_format_id: string;
  readonly default_match_rules_json: string;
  readonly updated_at: string;
}

export const TOURNAMENT_RULES_COLUMNS =
  'tournament_id, points_win, points_tie, points_no_result, points_loss, points_abandoned, points_walkover_win, ' +
  'points_walkover_loss, super_over_decided_tie, bonus_json, nrr_mode, nrr_options_json, tie_breakers_json, ' +
  'default_format_id, default_match_rules_json, updated_at';

type NrrOptions = Omit<NrrConfig, 'mode'>;

export function rulesFromRow(row: TournamentRulesRow): TournamentRules {
  const options = parseJson<NrrOptions>(row.nrr_options_json);
  return {
    tournamentId: row.tournament_id,
    pointsSystem: {
      win: row.points_win,
      tie: row.points_tie,
      noResult: row.points_no_result,
      loss: row.points_loss,
      abandoned: row.points_abandoned,
      walkoverWin: row.points_walkover_win,
      walkoverLoss: row.points_walkover_loss,
      superOverDecidedTie: row.super_over_decided_tie,
      bonus: parseJsonOrNull<BonusPointRule>(row.bonus_json),
    },
    nrr: { ...options, mode: row.nrr_mode },
    tieBreakers: parseJson<readonly TieBreakerKind[]>(row.tie_breakers_json),
    defaultFormatId: row.default_format_id,
    defaultMatchRules: parseJson<MatchRules>(row.default_match_rules_json),
    updatedAt: row.updated_at,
  };
}

export function rulesToRecord(tournamentId: string, rules: TournamentRules): SqlRecord {
  const { mode, ...options } = rules.nrr;
  const points = rules.pointsSystem;
  return {
    tournament_id: tournamentId,
    points_win: points.win,
    points_tie: points.tie,
    points_no_result: points.noResult,
    points_loss: points.loss,
    points_abandoned: points.abandoned,
    points_walkover_win: points.walkoverWin,
    points_walkover_loss: points.walkoverLoss,
    super_over_decided_tie: points.superOverDecidedTie,
    bonus_json: toJsonOrNull(points.bonus),
    nrr_mode: mode,
    nrr_options_json: toJson(options),
    tie_breakers_json: toJson(rules.tieBreakers),
    default_format_id: rules.defaultFormatId,
    default_match_rules_json: toJson(rules.defaultMatchRules),
    updated_at: rules.updatedAt,
  };
}

export interface TournamentTeamRow {
  readonly id: string;
  readonly tournament_id: string;
  readonly team_id: string;
  readonly seed: number | null;
  readonly status: TournamentTeam['status'];
  readonly replaced_by_team_id: string | null;
  readonly inherits_from_team_id: string | null;
  readonly joined_at: string;
}

export const TOURNAMENT_TEAM_COLUMNS =
  'id, tournament_id, team_id, seed, status, replaced_by_team_id, inherits_from_team_id, joined_at';

export function tournamentTeamFromRow(row: TournamentTeamRow): TournamentTeam {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    teamId: row.team_id,
    seed: row.seed,
    status: row.status,
    replacedByTeamId: row.replaced_by_team_id,
    inheritsFromTeamId: row.inherits_from_team_id,
    joinedAt: row.joined_at,
  };
}

export function tournamentTeamToRecord(row: TournamentTeam): SqlRecord {
  return {
    id: row.id,
    tournament_id: row.tournamentId,
    team_id: row.teamId,
    seed: row.seed,
    status: row.status,
    replaced_by_team_id: row.replacedByTeamId,
    inherits_from_team_id: row.inheritsFromTeamId,
    joined_at: row.joinedAt,
  };
}

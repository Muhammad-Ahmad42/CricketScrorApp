import type { ExtrasBreakdown, InningsCompletionReason, InningsKind, InningsLine, Partnership } from '@/domain/types';
import type { MatchProjection } from '../repositories/contracts';
import { fromFlag, parseJson, toFlag, toJson, type SqlRecord } from './values';

export type ProjectedInnings = MatchProjection['innings'][number];
export type ProjectedPartnership = MatchProjection['partnerships'][number];

export interface InningsRow {
  readonly match_id: string;
  readonly innings_index: number;
  readonly kind: InningsKind;
  readonly super_over_round: number | null;
  readonly batting_team_id: string;
  readonly bowling_team_id: string;
  readonly runs: number;
  readonly wickets: number;
  readonly legal_balls: number;
  readonly max_balls: number;
  readonly balls_per_over: number;
  readonly target: number | null;
  readonly target_revised: number;
  readonly extras_json: string;
  readonly status: 'in_progress' | 'complete';
  readonly completion_reason: InningsCompletionReason | null;
  readonly updated_at: string;
}

export interface PartnershipRow {
  readonly match_id: string;
  readonly innings_index: number;
  readonly partnership_index: number;
  readonly wicket_number: number;
  readonly batter_a_id: string;
  readonly batter_b_id: string | null;
  readonly runs: number;
  readonly balls: number;
  readonly batter_a_runs: number;
  readonly batter_a_balls: number;
  readonly batter_b_runs: number;
  readonly batter_b_balls: number;
  readonly extras: number;
  readonly ended_by: Partnership['endedBy'];
}

export const INNINGS_COLUMNS =
  'match_id, innings_index, kind, super_over_round, batting_team_id, bowling_team_id, runs, wickets, legal_balls, ' +
  'max_balls, balls_per_over, target, target_revised, extras_json, status, completion_reason, updated_at';

export const PARTNERSHIP_COLUMNS =
  'match_id, innings_index, partnership_index, wicket_number, batter_a_id, batter_b_id, runs, balls, batter_a_runs, ' +
  'batter_a_balls, batter_b_runs, batter_b_balls, extras, ended_by';

export function inningsToRecord(matchId: string, innings: ProjectedInnings, updatedAt: string): SqlRecord {
  return {
    match_id: matchId,
    innings_index: innings.inningsIndex,
    kind: innings.kind,
    super_over_round: innings.superOverRound,
    batting_team_id: innings.battingTeamId,
    bowling_team_id: innings.bowlingTeamId,
    runs: innings.runs,
    wickets: innings.wickets,
    legal_balls: innings.legalBalls,
    max_balls: innings.maxBalls,
    balls_per_over: innings.ballsPerOver,
    target: innings.target,
    target_revised: toFlag(innings.targetRevised),
    extras_json: toJson(innings.extras),
    status: innings.status,
    completion_reason: innings.completionReason,
    updated_at: updatedAt,
  };
}

export function inningsLineFromRow(row: InningsRow): InningsLine {
  return {
    inningsIndex: row.innings_index,
    kind: row.kind,
    battingTeamId: row.batting_team_id,
    runs: row.runs,
    wickets: row.wickets,
    legalBalls: row.legal_balls,
    ballsPerOver: row.balls_per_over,
    status: row.status,
    completionReason: row.completion_reason,
  };
}

export function projectedInningsFromRow(row: InningsRow): ProjectedInnings {
  return {
    ...inningsLineFromRow(row),
    superOverRound: row.super_over_round,
    bowlingTeamId: row.bowling_team_id,
    maxBalls: row.max_balls,
    target: row.target,
    targetRevised: fromFlag(row.target_revised),
    extras: parseJson<ExtrasBreakdown>(row.extras_json),
  };
}

export function partnershipToRecord(matchId: string, partnership: ProjectedPartnership): SqlRecord {
  return {
    match_id: matchId,
    innings_index: partnership.inningsIndex,
    partnership_index: partnership.index,
    wicket_number: partnership.wicketNumber,
    batter_a_id: partnership.batterAId,
    batter_b_id: partnership.batterBId,
    runs: partnership.runs,
    balls: partnership.balls,
    batter_a_runs: partnership.batterARuns,
    batter_a_balls: partnership.batterABalls,
    batter_b_runs: partnership.batterBRuns,
    batter_b_balls: partnership.batterBBalls,
    extras: partnership.extras,
    ended_by: partnership.endedBy,
  };
}

export function partnershipFromRow(row: PartnershipRow): ProjectedPartnership {
  return {
    inningsIndex: row.innings_index,
    index: row.partnership_index,
    wicketNumber: row.wicket_number,
    batterAId: row.batter_a_id,
    batterBId: row.batter_b_id,
    runs: row.runs,
    balls: row.balls,
    batterARuns: row.batter_a_runs,
    batterABalls: row.batter_a_balls,
    batterBRuns: row.batter_b_runs,
    batterBBalls: row.batter_b_balls,
    extras: row.extras,
    endedBy: row.ended_by,
  };
}

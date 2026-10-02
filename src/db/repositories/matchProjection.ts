import type { MatchResult, MatchStatus, MatchSummary } from '@/domain/types';
import { NotFoundError } from '../errors';
import {
  INNINGS_COLUMNS,
  PARTNERSHIP_COLUMNS,
  inningsToRecord,
  partnershipFromRow,
  partnershipToRecord,
  projectedInningsFromRow,
  type InningsRow,
  type PartnershipRow,
} from '../mappers/projection';
import { parseJsonOrNull, toJsonOrNull } from '../mappers/values';
import type { SqlExecutor } from '../types';
import type { MatchProjection } from './contracts';
import { insertRow } from './sql';

export async function writeMatchProjection(db: SqlExecutor, projection: MatchProjection): Promise<void> {
  const updated = await db.runAsync(
    'UPDATE matches SET status = ?, result_json = ?, winner_team_id = ?, summary_json = ?, projection_version = ?, ' +
      'started_at = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    [
      projection.status,
      toJsonOrNull(projection.result),
      projection.winnerTeamId,
      toJsonOrNull(projection.summary),
      projection.projectionVersion,
      projection.startedAt,
      projection.completedAt,
      projection.updatedAt,
      projection.matchId,
    ],
  );
  if (updated.changes === 0) {
    throw new NotFoundError('match', projection.matchId);
  }
  await db.runAsync('DELETE FROM partnerships WHERE match_id = ?', [projection.matchId]);
  await db.runAsync('DELETE FROM innings WHERE match_id = ?', [projection.matchId]);
  for (const innings of projection.innings) {
    await insertRow(db, 'innings', inningsToRecord(projection.matchId, innings, projection.updatedAt));
  }
  for (const partnership of projection.partnerships) {
    await insertRow(db, 'partnerships', partnershipToRecord(projection.matchId, partnership));
  }
}

interface ProjectionMatchRow {
  readonly id: string;
  readonly projection_version: number;
  readonly status: MatchStatus;
  readonly result_json: string | null;
  readonly winner_team_id: string | null;
  readonly summary_json: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly updated_at: string;
}

export async function readMatchProjection(db: SqlExecutor, matchId: string): Promise<MatchProjection | null> {
  const row = await db.getFirstAsync<ProjectionMatchRow>(
    'SELECT id, projection_version, status, result_json, winner_team_id, summary_json, started_at, completed_at, updated_at ' +
      'FROM matches WHERE id = ?',
    [matchId],
  );
  if (row === null) {
    return null;
  }
  const innings = await db.getAllAsync<InningsRow>(
    `SELECT ${INNINGS_COLUMNS} FROM innings WHERE match_id = ? ORDER BY innings_index`,
    [matchId],
  );
  const partnerships = await db.getAllAsync<PartnershipRow>(
    `SELECT ${PARTNERSHIP_COLUMNS} FROM partnerships WHERE match_id = ? ORDER BY innings_index, partnership_index`,
    [matchId],
  );
  return {
    matchId: row.id,
    projectionVersion: row.projection_version,
    status: row.status,
    result: parseJsonOrNull<MatchResult>(row.result_json),
    winnerTeamId: row.winner_team_id,
    summary: parseJsonOrNull<MatchSummary>(row.summary_json),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    innings: innings.map(projectedInningsFromRow),
    partnerships: partnerships.map(partnershipFromRow),
    updatedAt: row.updated_at,
  };
}

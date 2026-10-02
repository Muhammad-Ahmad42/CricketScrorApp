import type { TournamentOverride } from '@/domain/types';
import { parseJson, toJson } from './values';

export interface OverrideRow {
  readonly payload_json: string;
  readonly revoked_at: string | null;
  readonly revoke_reason: string | null;
}

export interface OverrideRefs {
  readonly stageId: string | null;
  readonly poolId: string | null;
  readonly slotId: string | null;
  readonly teamId: string | null;
}

export function overrideRefs(override: TournamentOverride): OverrideRefs {
  switch (override.kind) {
    case 'qualification':
      return { stageId: override.stageId, poolId: override.poolId, slotId: override.slotId, teamId: override.teamId };
    case 'points_adjustment':
      return { stageId: override.stageId, poolId: override.poolId, slotId: null, teamId: override.teamId };
    case 'tie_resolution':
      return { stageId: override.stageId, poolId: override.poolId, slotId: null, teamId: null };
    case 'slot_assignment':
      return { stageId: null, poolId: null, slotId: override.slotId, teamId: override.teamId };
    case 'expunge_results':
      return { stageId: override.stageId, poolId: null, slotId: null, teamId: override.teamId };
    case 'champion':
      return { stageId: null, poolId: null, slotId: null, teamId: null };
    default: {
      const unreachable: never = override;
      return unreachable;
    }
  }
}

export const INSERT_OVERRIDE_SQL =
  'INSERT INTO tournament_overrides (id, tournament_id, kind, stage_id, pool_id, slot_id, team_id, payload_json, ' +
  'reason, created_at, revoked_at, revoke_reason) VALUES (?, ?, ?, ' +
  '(SELECT id FROM tournament_stages WHERE id = ?), (SELECT id FROM pools WHERE id = ?), ' +
  '(SELECT id FROM stage_slots WHERE id = ?), ?, ?, ?, ?, ?, ?)';

export function overrideInsertParams(override: TournamentOverride): readonly (string | null)[] {
  const refs = overrideRefs(override);
  return [
    override.id,
    override.tournamentId,
    override.kind,
    refs.stageId,
    refs.poolId,
    refs.slotId,
    refs.teamId,
    toJson(override),
    override.reason,
    override.createdAt,
    override.revokedAt,
    override.revokeReason,
  ];
}

export function overrideFromRow(row: OverrideRow): TournamentOverride {
  const stored = parseJson<TournamentOverride>(row.payload_json);
  return { ...stored, revokedAt: row.revoked_at, revokeReason: row.revoke_reason };
}

import type { AuditEntityType, AuditEvent, TournamentOverride } from '@/domain/types';
import type { BackupEntity } from '../remap';
import { key, link, optionalLink, optionalRef, ref, refList, type Cursor } from './cursor';

function visitOverridePayload(row: TournamentOverride, c: Cursor): TournamentOverride {
  switch (row.kind) {
    case 'qualification': {
      const stageId = link(c, 'stageId', 'stages', row.stageId);
      const teamId = ref(c, 'teamId', 'teams', row.teamId);
      const slotId = optionalLink(c, 'slotId', 'slots', row.slotId);
      const poolId = optionalLink(c, 'poolId', 'pools', row.poolId);
      return { ...row, stageId, teamId, slotId, poolId };
    }
    case 'points_adjustment': {
      const stageId = link(c, 'stageId', 'stages', row.stageId);
      const poolId = optionalLink(c, 'poolId', 'pools', row.poolId);
      const teamId = ref(c, 'teamId', 'teams', row.teamId);
      return { ...row, stageId, poolId, teamId };
    }
    case 'tie_resolution': {
      const stageId = link(c, 'stageId', 'stages', row.stageId);
      const poolId = optionalLink(c, 'poolId', 'pools', row.poolId);
      const orderedTeamIds = refList(c, 'orderedTeamIds', 'teams', row.orderedTeamIds);
      return { ...row, stageId, poolId, orderedTeamIds };
    }
    case 'slot_assignment': {
      const slotId = link(c, 'slotId', 'slots', row.slotId);
      const teamId = ref(c, 'teamId', 'teams', row.teamId);
      return { ...row, slotId, teamId };
    }
    case 'expunge_results': {
      const stageId = optionalLink(c, 'stageId', 'stages', row.stageId);
      const teamId = ref(c, 'teamId', 'teams', row.teamId);
      return { ...row, stageId, teamId };
    }
    case 'champion':
      return { ...row, teamIds: refList(c, 'teamIds', 'teams', row.teamIds) };
    default: {
      const unreachable: never = row;
      return unreachable;
    }
  }
}

export function visitOverride(row: TournamentOverride, c: Cursor): TournamentOverride {
  const id = key(c, 'id', 'overrides', row.id);
  const tournamentId = ref(c, 'tournamentId', 'tournaments', row.tournamentId);
  const payload = visitOverridePayload(row, c);
  return { ...payload, id, tournamentId };
}

export function auditEntityCollection(type: AuditEntityType): BackupEntity | null {
  switch (type) {
    case 'tournament':
    case 'rules':
      return 'tournaments';
    case 'team':
      return 'teams';
    case 'stage':
      return 'stages';
    case 'pool':
      return 'pools';
    case 'slot':
      return 'slots';
    case 'fixture':
      return 'fixtures';
    case 'match':
      return 'matches';
    case 'override':
      return 'overrides';
    case 'backup':
    case 'app':
      return null;
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
}

export function visitAuditEvent(row: AuditEvent, c: Cursor): AuditEvent {
  const id = key(c, 'id', 'auditEvents', row.id);
  const tournamentId = optionalRef(c, 'tournamentId', 'tournaments', row.tournamentId);
  const matchId = optionalRef(c, 'matchId', 'matches', row.matchId);
  const collection = auditEntityCollection(row.entityType);
  const entityId = collection === null ? row.entityId : link(c, 'entityId', collection, row.entityId);
  return { ...row, id, tournamentId, matchId, entityId };
}

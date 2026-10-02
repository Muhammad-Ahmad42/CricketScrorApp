import { isFixtureReplay } from '@/domain/tournament';
import type { AuditAction, AuditEntityType, FixtureSide, Id, MatchId, ProposedChange, TeamId, TournamentSnapshot } from '@/domain/types';

export interface ChangeAudit {
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: Id;
  readonly summary: string;
  readonly matchId?: MatchId | null;
  readonly previousValue?: unknown;
}

function replayAudit(snapshot: TournamentSnapshot, change: Extract<ProposedChange, { readonly kind: 'fixture_update' }>): ChangeAudit | null {
  const fixture = snapshot.fixtures.find((entry) => entry.id === change.fixtureId);
  if (fixture === undefined || !isFixtureReplay(fixture, change.patch)) {
    return null;
  }
  return {
    action: 'fixture_status_changed',
    entityType: 'fixture',
    entityId: fixture.id,
    summary: `Match ${fixture.matchNumber} will be replayed. Its abandoned match stays on record and no longer counts.`,
    matchId: fixture.matchId,
    previousValue: { status: fixture.status, matchId: fixture.matchId, scheduledDate: fixture.scheduledDate, scheduledTime: fixture.scheduledTime, venueId: fixture.venueId },
  };
}

function teamName(snapshot: TournamentSnapshot, teamId: TeamId): string {
  return snapshot.teams.find((view) => view.team.id === teamId)?.team.name ?? 'A team';
}

function sideName(snapshot: TournamentSnapshot, side: FixtureSide): string {
  if (side.kind === 'team') {
    return teamName(snapshot, side.teamId);
  }
  return snapshot.slots.find((slot) => slot.id === side.slotId)?.label ?? 'A qualification place';
}

function sideEntity(side: FixtureSide): { readonly entityType: AuditEntityType; readonly entityId: Id } {
  return side.kind === 'team' ? { entityType: 'team', entityId: side.teamId } : { entityType: 'slot', entityId: side.slotId };
}

function poolName(snapshot: TournamentSnapshot, poolId: string): string {
  return snapshot.pools.find((pool) => pool.id === poolId)?.name ?? 'another pool';
}

function stageName(snapshot: TournamentSnapshot, stageId: string | null): string {
  return snapshot.stages.find((stage) => stage.id === stageId)?.name ?? 'the tournament';
}

function fixtureLabel(snapshot: TournamentSnapshot, fixtureId: string): string {
  const fixture = snapshot.fixtures.find((entry) => entry.id === fixtureId);
  return fixture === undefined ? 'A fixture' : `Match ${fixture.matchNumber}`;
}

const SCHEDULE_KEYS = ['scheduledDate', 'scheduledTime', 'venueId'];

export function auditForChange(snapshot: TournamentSnapshot, change: ProposedChange): ChangeAudit {
  const tournamentId = snapshot.tournament.id;
  switch (change.kind) {
    case 'pool_move':
      return { action: 'team_moved', ...sideEntity(change.member), summary: `${sideName(snapshot, change.member)} moved to ${poolName(snapshot, change.toPoolId)}.` };
    case 'pool_swap':
      return {
        action: 'team_swapped',
        ...sideEntity(change.memberA),
        summary: `${sideName(snapshot, change.memberA)} and ${sideName(snapshot, change.memberB)} swapped pools.`,
      };
    case 'team_replace':
      return {
        action: 'team_replaced',
        entityType: 'team',
        entityId: change.outTeamId,
        summary: `${teamName(snapshot, change.outTeamId)} were replaced by ${teamName(snapshot, change.inTeamId)}.`,
      };
    case 'team_withdraw':
      return { action: 'team_withdrawn', entityType: 'team', entityId: change.teamId, summary: `${teamName(snapshot, change.teamId)} withdrew.` };
    case 'pools_replace':
      return { action: 'pools_replaced', entityType: 'stage', entityId: change.stageId, summary: `The pools of ${stageName(snapshot, change.stageId)} were replaced.` };
    case 'team_seeds_change':
      return { action: 'team_seed_changed', entityType: 'tournament', entityId: tournamentId, summary: 'Team seeds were changed.' };
    case 'stage_upsert': {
      const exists = snapshot.stages.some((stage) => stage.id === change.stage.id);
      return {
        action: exists ? 'stage_changed' : 'stage_created',
        entityType: 'stage',
        entityId: change.stage.id,
        summary: exists ? `Stage "${change.stage.name}" was changed.` : `Stage "${change.stage.name}" was added.`,
      };
    }
    case 'stage_delete':
      return { action: 'stage_deleted', entityType: 'stage', entityId: change.stageId, summary: `Stage "${stageName(snapshot, change.stageId)}" was removed.` };
    case 'fixture_add':
      return { action: 'fixture_created', entityType: 'fixture', entityId: change.fixture.id, summary: `Match ${change.fixture.matchNumber} was added.` };
    case 'fixture_update': {
      const replay = replayAudit(snapshot, change);
      if (replay !== null) {
        return replay;
      }
      const keys = Object.keys(change.patch);
      const schedule = keys.length > 0 && keys.every((key) => SCHEDULE_KEYS.includes(key));
      const action: AuditAction = schedule ? 'fixture_rescheduled' : keys.length === 1 && keys[0] === 'status' ? 'fixture_status_changed' : 'fixture_changed';
      return { action, entityType: 'fixture', entityId: change.fixtureId, summary: `${fixtureLabel(snapshot, change.fixtureId)} was changed.` };
    }
    case 'fixture_delete':
      return { action: 'fixture_deleted', entityType: 'fixture', entityId: change.fixtureId, summary: `${fixtureLabel(snapshot, change.fixtureId)} was deleted.` };
    case 'fixtures_replace':
      return {
        action: 'fixtures_generated',
        entityType: 'stage',
        entityId: change.stageId,
        summary: `${change.fixtures.length} fixtures were generated for ${stageName(snapshot, change.stageId)}.`,
      };
    case 'match_result_change':
      return { action: 'result_corrected', entityType: 'match', entityId: change.matchId, summary: 'A match result was corrected.' };
    case 'rules_change':
      return {
        action: 'rules_changed',
        entityType: change.stageId === null ? 'rules' : 'stage',
        entityId: change.stageId ?? tournamentId,
        summary: `The rules of ${stageName(snapshot, change.stageId)} were changed.`,
      };
    case 'slot_change':
      return { action: 'slot_changed', entityType: 'slot', entityId: change.slotId, summary: 'A qualification place was changed.' };
    case 'override_apply':
      return { action: 'override_applied', entityType: 'override', entityId: change.override.id, summary: `Manual override: ${change.override.reason}` };
    case 'override_revoke':
      return { action: 'override_revoked', entityType: 'override', entityId: change.overrideId, summary: 'A manual override was revoked.' };
    default: {
      const unreachable: never = change;
      return unreachable;
    }
  }
}

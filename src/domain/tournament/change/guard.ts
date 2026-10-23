import type { ChangePlan, Fixture, ProposedChange, TournamentEvaluation, TournamentSnapshot } from '../../types';
import { entrantsOf } from '../evaluation/entrants';
import { countedSummaryOf, hasMatchHistory, isTerminalStatus, sideKey } from '../evaluation/sides';
import type { SnapshotIndex } from '../evaluation/snapshotIndex';
import { fixtureReplayGuard, isFixtureReplay } from '../fixtureReplay';
import { tournamentEditPolicy } from '../stateMachine';
import type { EditPermission, TournamentEditPolicy, TournamentGuardContext } from '../stateMachine';
import type { PlanContext } from './plan';

function guardContext(index: SnapshotIndex, evaluation: TournamentEvaluation): TournamentGuardContext {
  const snapshot = index.snapshot;
  const pooled = index.stagesOrdered.filter((stage) => (index.poolsByStage.get(stage.id) ?? []).length > 0);
  const poolsComplete = pooled.every((stage) => {
    const assigned = new Set(snapshot.poolEntries.filter((entry) => entry.stageId === stage.id).map((entry) => sideKey(entry.side)));
    return entrantsOf(index, stage.id).every((side) => assigned.has(sideKey(side)));
  });
  const first = index.stagesOrdered[0];
  return {
    activeTeamCount: snapshot.teams.filter((view) => view.membership.status === 'active').length,
    stageCount: snapshot.stages.length,
    poolsComplete,
    firstStageFixturesConfirmed: !!first && (index.fixturesByStage.get(first.id) ?? []).length > 0,
    matchesStarted: snapshot.fixtures.filter((fixture) => hasMatchHistory(snapshot, fixture)).length,
    matchesCompleted: snapshot.fixtures.filter((fixture) => countedSummaryOf(snapshot.summaries, fixture) !== null).length,
    allStagesComplete: evaluation.stages.length > 0 && evaluation.stages.every((stage) => stage.complete),
    championDecided: evaluation.champion !== null,
  };
}

function policyField(change: ProposedChange): keyof TournamentEditPolicy {
  switch (change.kind) {
    case 'pool_move':
    case 'pool_swap':
    case 'pools_replace':
      return 'pools';
    case 'team_replace':
    case 'team_withdraw':
      return 'removeTeams';
    case 'team_seeds_change':
      return 'seeds';
    case 'stage_upsert':
    case 'stage_delete':
    case 'slot_change':
      return 'stages';
    case 'fixture_add':
    case 'fixture_delete':
    case 'fixtures_replace':
      return 'generateFixtures';
    case 'fixture_update':
      return change.patch.sideA || change.patch.sideB ? 'fixtureTeams' : 'fixtureSchedule';
    case 'match_result_change':
      return 'matchResults';
    case 'rules_change':
      return 'rules';
    case 'override_apply':
    case 'override_revoke':
      return 'overrides';
    default: {
      const never: never = change;
      return never;
    }
  }
}

function statusReason(snapshot: TournamentSnapshot): string {
  switch (snapshot.tournament.status) {
    case 'archived':
      return 'The tournament is archived. Unarchive it first.';
    case 'completed':
      return 'The tournament is completed. Reopen it for corrections first.';
    default:
      return "This change isn't possible at this stage.";
  }
}

function fixtureName(fixture: Fixture): string {
  return fixture.label ? `Match ${fixture.matchNumber} (${fixture.label})` : `Match ${fixture.matchNumber}`;
}

function hasMatch(fixture: Fixture | undefined): fixture is Fixture {
  return !!fixture && fixture.matchId !== null;
}

function isLive(snapshot: TournamentSnapshot, fixture: Fixture): boolean {
  return fixture.matchId !== null && snapshot.summaries[fixture.matchId] === undefined && !isTerminalStatus(fixture.status);
}

function deletionBlock(snapshot: TournamentSnapshot, deleted: readonly (Fixture | undefined)[]): string | null {
  const played = deleted.find(hasMatch);
  if (played) return `${fixtureName(played)} already has a match. Delete or detach that match first.`;
  const replayed = deleted.find((fixture): fixture is Fixture => !!fixture && hasMatchHistory(snapshot, fixture));
  return replayed ? `${fixtureName(replayed)} can't be deleted. It keeps an abandoned match on record.` : null;
}

function structuralBlock(ctx: PlanContext, change: ProposedChange, plan: ChangePlan): string | null {
  const byId = ctx.index.fixtureById;
  const deleted = plan.fixtures.delete.map((id) => byId.get(id));
  switch (change.kind) {
    case 'fixture_delete':
    case 'pool_move':
    case 'stage_delete':
    case 'stage_upsert':
    case 'pools_replace':
    case 'fixtures_replace':
      return deletionBlock(ctx.snapshot, deleted);
    case 'fixture_update': {
      const fixture = byId.get(change.fixtureId);
      if (!hasMatch(fixture)) return null;
      const patch = change.patch;
      if (patch.sideA || patch.sideB) return `${fixtureName(fixture)} has been played. Its teams can't change.`;
      if (isFixtureReplay(fixture, patch)) {
        const guard = fixtureReplayGuard(ctx.snapshot, fixture);
        return guard.ok ? null : guard.reason;
      }
      const scheduling = patch.scheduledDate !== undefined || patch.scheduledTime !== undefined || patch.venueId !== undefined || patch.status !== undefined;
      return scheduling ? `${fixtureName(fixture)} has been played. It can't be rescheduled.` : null;
    }
    case 'team_withdraw': {
      const live = ctx.snapshot.fixtures.find(
        (fixture) =>
          isLive(ctx.snapshot, fixture) &&
          (fixture.matchSides?.teamAId === change.teamId || fixture.matchSides?.teamBId === change.teamId),
      );
      return live ? `${fixtureName(live)} is being played. End the live match first.` : null;
    }
    case 'match_result_change':
      return ctx.snapshot.fixtures.some((fixture) => fixture.matchId === change.matchId) ? null : 'That match is not part of this tournament.';
    default:
      return null;
  }
}

export function blockedReason(ctx: PlanContext, change: ProposedChange, plan: ChangePlan, evaluation: TournamentEvaluation): string | null {
  const policy = tournamentEditPolicy(ctx.snapshot.tournament.status, guardContext(ctx.index, evaluation));
  const permission: EditPermission = policy[policyField(change)];
  if (permission === 'forbidden') return statusReason(ctx.snapshot);
  return structuralBlock(ctx, change, plan);
}

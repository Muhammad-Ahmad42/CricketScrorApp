import { fixtureHasMatchHistory, stageAllowsReplay, stageEntrants } from '@/domain/tournament';
import type { TournamentGuardContext } from '@/domain/tournament';
import type { Fixture, FixtureSide, FixtureStatus, MatchStatus, Stage, StageStatus, TournamentEvaluation, TournamentSnapshot } from '@/domain/types';

const SETTLED: readonly FixtureStatus[] = ['completed', 'abandoned', 'cancelled'];
const REVERTED: readonly FixtureStatus[] = ['live', 'completed', 'abandoned', 'cancelled'];

export function isSettled(status: FixtureStatus): boolean {
  return SETTLED.includes(status);
}

export function mirrorFixtureStatus(matchStatus: MatchStatus, current: FixtureStatus): FixtureStatus {
  switch (matchStatus) {
    case 'live':
    case 'paused':
      return 'live';
    case 'completed':
      return 'completed';
    case 'abandoned':
      return 'abandoned';
    case 'postponed':
      return 'postponed';
    case 'cancelled':
      return 'cancelled';
    case 'scheduled':
      if (current === 'postponed') {
        return 'rescheduled';
      }
      return REVERTED.includes(current) ? 'scheduled' : current;
    default: {
      const unreachable: never = matchStatus;
      return unreachable;
    }
  }
}

export function isMirrorRevert(from: FixtureStatus, to: FixtureStatus): boolean {
  return to === 'scheduled' && ['live', 'completed', 'abandoned'].includes(from);
}

export function replayAllowed(stage: Stage | undefined): boolean {
  return stageAllowsReplay(stage);
}

export function desiredStageStatus(stage: Stage, fixtures: readonly Fixture[]): StageStatus {
  const own = fixtures.filter((fixture) => fixture.stageId === stage.id);
  const started = own.some((fixture) => fixture.matchId !== null);
  const settled = own.length > 0 && own.every((fixture) => isSettled(fixture.status));
  if (stage.status === 'pending') {
    if (!started) {
      return 'pending';
    }
    return settled ? 'completed' : 'active';
  }
  return settled ? 'completed' : 'active';
}

function sideKey(side: FixtureSide): string {
  return side.kind === 'team' ? `team:${side.teamId}` : `slot:${side.slotId}`;
}

export function poolsComplete(snapshot: TournamentSnapshot): boolean {
  return snapshot.stages.every((stage) => {
    const pools = snapshot.pools.filter((pool) => pool.stageId === stage.id);
    if (pools.length === 0) {
      return true;
    }
    const assigned = new Set(snapshot.poolEntries.filter((entry) => entry.stageId === stage.id).map((entry) => sideKey(entry.side)));
    return stageEntrants(snapshot, stage.id).every((side) => assigned.has(sideKey(side)));
  });
}

export function firstStage(snapshot: TournamentSnapshot): Stage | null {
  return [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex)[0] ?? null;
}

export function guardContext(snapshot: TournamentSnapshot, evaluation: TournamentEvaluation): TournamentGuardContext {
  const first = firstStage(snapshot);
  const started = snapshot.fixtures.filter((fixture) => fixture.matchId !== null);
  return {
    activeTeamCount: snapshot.teams.filter((view) => view.membership.status === 'active').length,
    stageCount: snapshot.stages.length,
    poolsComplete: poolsComplete(snapshot),
    firstStageFixturesConfirmed: first !== null && snapshot.fixtures.some((fixture) => fixture.stageId === first.id),
    matchesStarted: snapshot.fixtures.filter((fixture) => fixtureHasMatchHistory(snapshot, fixture)).length,
    matchesCompleted: started.filter((fixture) => fixture.status === 'completed' || fixture.status === 'abandoned').length,
    allStagesComplete:
      snapshot.stages.length > 0 &&
      snapshot.stages.every((stage) => stage.status === 'completed' || evaluation.stages.find((entry) => entry.stageId === stage.id)?.complete === true),
    championDecided: evaluation.champion !== null,
  };
}

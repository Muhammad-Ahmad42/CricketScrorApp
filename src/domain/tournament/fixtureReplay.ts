import type { Fixture, FixtureId, FixturePatch, IsoDateTime, MatchId, MatchSummary, Stage, SupersededMatch, TournamentSnapshot } from '../types';
import { countedSummaryOf, hasMatchHistory, supersededMatchIdsOf } from './evaluation/sides';
import { canTransitionFixture, type Guard } from './stateMachine';

export function stageAllowsReplay(stage: Stage | undefined): boolean {
  if (stage === undefined) return false;
  return stage.config.abandonedMatches === 'replay' || stage.config.knockout?.noResult === 'replay';
}

export function isFixtureReplay(fixture: Fixture, patch: Pick<FixturePatch, 'status'>): boolean {
  return fixture.status === 'abandoned' && patch.status === 'rescheduled';
}

export function fixtureReplayGuard(snapshot: TournamentSnapshot, fixture: Fixture): Guard {
  const stage = snapshot.stages.find((candidate) => candidate.id === fixture.stageId);
  return canTransitionFixture(fixture.status, 'rescheduled', { hasMatch: fixture.matchId !== null, replayAllowed: stageAllowsReplay(stage) });
}

export function supersedeFixtureMatch(fixture: Fixture, now: IsoDateTime): Fixture {
  return { ...fixture, status: 'rescheduled', matchId: null, matchSides: null, updatedAt: now };
}

export function supersededAfterUpdate(
  snapshot: TournamentSnapshot,
  updated: readonly Fixture[],
): readonly SupersededMatch[] {
  const before = new Map(snapshot.fixtures.map((fixture) => [fixture.id, fixture]));
  const added = updated.flatMap((fixture): SupersededMatch[] => {
    const previous = before.get(fixture.id)?.matchId ?? null;
    return previous !== null && fixture.matchId === null ? [{ fixtureId: fixture.id, matchId: previous }] : [];
  });
  return [...(snapshot.supersededMatches ?? []), ...added];
}

export function fixtureSupersededMatchIds(snapshot: TournamentSnapshot, fixtureId: FixtureId): readonly MatchId[] {
  return supersededMatchIdsOf(snapshot, fixtureId);
}

export function fixtureHasMatchHistory(snapshot: TournamentSnapshot, fixture: Fixture): boolean {
  return hasMatchHistory(snapshot, fixture);
}

export function countedFixtureSummary(snapshot: TournamentSnapshot, fixture: Fixture): MatchSummary | null {
  return countedSummaryOf(snapshot.summaries, fixture);
}

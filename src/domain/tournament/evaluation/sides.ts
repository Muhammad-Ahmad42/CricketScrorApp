import type { Fixture, FixtureId, FixtureSide, FixtureStatus, MatchId, MatchSummary, TournamentOverride, TournamentSnapshot } from '../../types';

export function sideEquals(a: FixtureSide, b: FixtureSide): boolean {
  if (a.kind === 'team' && b.kind === 'team') return a.teamId === b.teamId;
  if (a.kind === 'slot' && b.kind === 'slot') return a.slotId === b.slotId;
  return false;
}

export function sideKey(side: FixtureSide): string {
  return side.kind === 'team' ? `team:${side.teamId}` : `slot:${side.slotId}`;
}

export function isTerminalStatus(status: FixtureStatus): boolean {
  return status === 'completed' || status === 'abandoned';
}

export function isSettledStatus(status: FixtureStatus): boolean {
  return isTerminalStatus(status) || status === 'cancelled';
}

export function isActiveOverride(override: TournamentOverride): boolean {
  return override.revokedAt === null;
}

export function fixtureHasMatch(fixture: Fixture): boolean {
  return fixture.matchId !== null;
}

export function supersededMatchIdsOf(snapshot: Pick<TournamentSnapshot, 'supersededMatches'>, fixtureId: FixtureId): readonly MatchId[] {
  return (snapshot.supersededMatches ?? []).filter((entry) => entry.fixtureId === fixtureId).map((entry) => entry.matchId);
}

export function hasMatchHistory(snapshot: Pick<TournamentSnapshot, 'supersededMatches'>, fixture: Fixture): boolean {
  return fixture.matchId !== null || (snapshot.supersededMatches ?? []).some((entry) => entry.fixtureId === fixture.id);
}

export function countedMatchId(fixture: Fixture): MatchId | null {
  return isTerminalStatus(fixture.status) ? fixture.matchId : null;
}

export function countedSummaryOf(summaries: Readonly<Record<MatchId, MatchSummary>>, fixture: Fixture): MatchSummary | null {
  const matchId = countedMatchId(fixture);
  return matchId === null ? null : (summaries[matchId] ?? null);
}

export function byMatchOrder<T extends { readonly completedAt: string | null; readonly matchNumber: number }>(a: T, b: T): number {
  if (a.completedAt !== b.completedAt) {
    if (a.completedAt === null) return 1;
    if (b.completedAt === null) return -1;
    return a.completedAt < b.completedAt ? -1 : 1;
  }
  return a.matchNumber - b.matchNumber;
}

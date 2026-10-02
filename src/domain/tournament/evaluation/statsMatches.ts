import type { Fixture, MatchSummary, PlayerId, TeamId, TournamentSnapshot } from '../../types';
import { countedSummaryOf } from './sides';

export interface CountedMatch {
  readonly fixture: Fixture;
  readonly summary: MatchSummary;
}

export function countedMatches(snapshot: TournamentSnapshot): readonly CountedMatch[] {
  const matches: CountedMatch[] = [];
  for (const fixture of snapshot.fixtures) {
    const summary = countedSummaryOf(snapshot.summaries, fixture);
    if (summary && !summary.hypothetical) matches.push({ fixture, summary });
  }
  return matches.sort(
    (a, b) =>
      a.fixture.matchNumber - b.fixture.matchNumber ||
      (a.summary.completedAt ?? '').localeCompare(b.summary.completedAt ?? '') ||
      a.fixture.id.localeCompare(b.fixture.id),
  );
}

export function squadTeamOf(summary: MatchSummary, playerId: PlayerId): TeamId | null {
  return summary.squads.find((squad) => squad.playerIds.includes(playerId))?.teamId ?? null;
}

export function opponentOf(summary: MatchSummary, teamId: TeamId): TeamId {
  return summary.teamAId === teamId ? summary.teamBId : summary.teamAId;
}

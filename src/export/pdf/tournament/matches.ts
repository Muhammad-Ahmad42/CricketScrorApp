import { formatOvers, formatScore } from '@/domain/scoring';
import type { Fixture, MatchSummary } from '@/domain/types';
import { formatPrintDate } from '../dates';
import type { FixtureLine, ResultLine, TournamentPdfSource } from './model';
import { fixtureStatusLabel } from './stages';
import type { TournamentNames } from './naming';

const UPCOMING: ReadonlySet<Fixture['status']> = new Set(['scheduled', 'postponed', 'rescheduled', 'live']);

function byNumber(a: Fixture, b: Fixture): number {
  return a.matchNumber - b.matchNumber || a.id.localeCompare(b.id);
}

function scoresLine(summary: MatchSummary, names: TournamentNames): string {
  return summary.innings
    .map((innings) => `${names.team(innings.battingTeamId)} ${formatScore(innings.runs, innings.wickets)} (${formatOvers(innings.legalBalls, innings.ballsPerOver)})`)
    .join(' · ');
}

export function resultLines(source: TournamentPdfSource, names: TournamentNames): readonly ResultLine[] {
  return [...source.snapshot.fixtures].sort(byNumber).flatMap((fixture) => {
    const summary = names.summaryOf(fixture);
    if (summary === null) {
      return [];
    }
    return [
      {
        number: String(fixture.matchNumber),
        date: formatPrintDate(summary.completedAt ?? fixture.scheduledDate) ?? '',
        stage: names.stageLabel(fixture),
        teams: `${names.side(fixture, 'A')} v ${names.side(fixture, 'B')}`,
        scores: scoresLine(summary, names),
        result: names.resultText(summary),
      },
    ];
  });
}

export function fixtureLines(source: TournamentPdfSource, names: TournamentNames): readonly FixtureLine[] {
  const venues = new Map(source.venues.map((venue) => [venue.id, venue.name]));
  return [...source.snapshot.fixtures]
    .filter((fixture) => UPCOMING.has(fixture.status) && names.summaryOf(fixture) === null)
    .sort(byNumber)
    .map((fixture) => ({
      number: String(fixture.matchNumber),
      date: joinDate(fixture),
      stage: names.stageLabel(fixture),
      teams: `${names.side(fixture, 'A')} v ${names.side(fixture, 'B')}`,
      venue: fixture.venueId === null ? '' : venues.get(fixture.venueId) ?? '',
      status: fixtureStatusLabel(fixture.status),
    }));
}

function joinDate(fixture: Fixture): string {
  const date = formatPrintDate(fixture.scheduledDate);
  if (date === null) {
    return 'Date to be confirmed';
  }
  return fixture.scheduledTime === null ? date : `${date}, ${fixture.scheduledTime}`;
}

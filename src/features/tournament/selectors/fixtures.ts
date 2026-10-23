import { formatOvers, formatScore } from '@/domain/scoring/format';
import { formatResult } from '@/domain/scoring/result';
import type { Fixture, FixtureStatus, MatchSummary, MatchTeam, PoolId, StageId, TeamId, TournamentSnapshot } from '@/domain/types';
import { formatShortDate } from '@/features/scoring/selectors/dates';
import { plural } from '@/features/shared/text';
import { FIXTURE_STATUS_LABEL } from '../labels';
import { compareDates, formatDate, formatDateTime } from './dates';
import { sidesText, type SideVM, type TournamentIndex } from './names';

export type VenueLookup = (venueId: string) => string | null;

export interface FixtureRowVM {
  readonly key: string;
  readonly fixtureId: string;
  readonly matchNumber: number;
  readonly label: string;
  readonly title: string;
  readonly a: SideVM;
  readonly b: SideVM;
  readonly teamsText: string;
  readonly status: FixtureStatus;
  readonly statusLabel: string;
  readonly result: string | null;
  readonly scoreline: ScorelineVM | null;
  readonly when: string | null;
  readonly venue: string | null;
  readonly detail: string;
  readonly meta: string;
  readonly note: string | null;
  readonly stageId: StageId;
  readonly poolId: PoolId | null;
  readonly round: number | null;
  readonly scheduledDate: string | null;
  readonly matchId: string | null;
  readonly resolved: boolean;
  readonly provisional: boolean;
}

export interface ScoreSideVM {
  readonly teamId: TeamId;
  readonly short: string;
  readonly name: string;
  readonly score: string;
  readonly overs: string;
  readonly winner: boolean;
}

export interface ScorelineVM {
  readonly sides: readonly ScoreSideVM[];
  readonly text: string;
  readonly spoken: string;
}

export type FixtureStatusFilter = 'all' | 'upcoming' | 'live' | 'completed' | 'off' | 'postponed' | 'cancelled';

const FILTER_STATUSES: { readonly [K in FixtureStatusFilter]: readonly FixtureStatus[] | null } = {
  all: null,
  upcoming: ['scheduled', 'rescheduled'],
  live: ['live'],
  completed: ['completed', 'abandoned'],
  off: ['postponed', 'cancelled'],
  postponed: ['postponed'],
  cancelled: ['cancelled'],
};

export const UNPLAYED_STATUSES: readonly FixtureStatus[] = ['scheduled', 'rescheduled'];
export const TERMINAL_STATUSES: readonly FixtureStatus[] = ['completed', 'abandoned', 'cancelled'];

export function matchTeams(index: TournamentIndex, summary: MatchSummary): readonly MatchTeam[] {
  return [summary.teamAId, summary.teamBId].map((teamId) => ({
    id: teamId,
    name: index.teamName(teamId),
    shortName: index.teamShort(teamId),
    playersInSide: 0,
  }));
}

export function fixtureSummary(snapshot: TournamentSnapshot, fixture: Fixture): MatchSummary | null {
  if (fixture.matchId === null) {
    return null;
  }
  return snapshot.summaries[fixture.matchId] ?? null;
}

export function fixtureResultText(index: TournamentIndex, fixture: Fixture): string | null {
  const summary = fixtureSummary(index.snapshot, fixture);
  if (summary === null) {
    return null;
  }
  return formatResult(summary.result, matchTeams(index, summary));
}

export function fixtureScoreline(index: TournamentIndex, fixture: Fixture): ScorelineVM | null {
  const summary = fixtureSummary(index.snapshot, fixture);
  if (summary === null || summary.innings.length === 0) {
    return null;
  }
  const order: TeamId[] = [];
  for (const innings of summary.innings) {
    if (!order.includes(innings.battingTeamId)) {
      order.push(innings.battingTeamId);
    }
  }
  const sides = order.map((teamId): ScoreSideVM => {
    const innings = summary.innings.filter((entry) => entry.battingTeamId === teamId);
    const last = innings[innings.length - 1];
    return {
      teamId,
      short: index.teamShort(teamId),
      name: index.teamName(teamId),
      score: formatScore(last.runs, last.wickets),
      overs: formatOvers(last.legalBalls, last.ballsPerOver),
      winner: summary.winnerTeamId === teamId,
    };
  });
  return {
    sides,
    text: sides.map((side) => `${side.short} ${side.score} (${side.overs})`).join(' · '),
    spoken: sides.map((side) => `${side.name} ${side.score.replace('/', ' for ')} in ${plural(side.overs, 'over')}`).join(', '),
  };
}

function waitingText(a: SideVM, b: SideVM): string {
  const waiting = [a, b].filter((side) => !side.resolved).map((side) => side.meaning ?? side.slotLabel ?? side.text);
  return `Waiting for ${waiting.join(' and ')}`;
}

type RowBase = Omit<FixtureRowVM, 'detail' | 'meta' | 'note'>;

function metaLine(row: RowBase): string {
  const parts = [row.when, row.venue].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : 'Date to be set';
}

function noteLine(row: RowBase, fixture: Fixture): string | null {
  if (row.result) {
    return row.result;
  }
  if (fixture.status === 'scheduled' || fixture.status === 'rescheduled') {
    return row.resolved ? null : waitingText(row.a, row.b);
  }
  return null;
}

function detailLine(row: RowBase, fixture: Fixture): string {
  if (row.result) {
    return row.result;
  }
  switch (fixture.status) {
    case 'live':
      return 'Live now';
    case 'postponed':
      return row.when ? `Postponed · was ${row.when}` : 'Postponed';
    case 'cancelled':
      return 'Cancelled';
    case 'abandoned':
      return 'Abandoned';
    default:
      break;
  }
  if (!row.resolved) {
    return waitingText(row.a, row.b);
  }
  const parts = [row.when, row.venue].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : 'Date to be set';
}

export function fixturePlayedOn(index: TournamentIndex, fixture: Fixture): string | null {
  const playedAt = fixtureSummary(index.snapshot, fixture)?.completedAt ?? null;
  return playedAt === null ? null : formatShortDate(playedAt);
}

export function fixtureWhen(index: TournamentIndex, fixture: Fixture): string | null {
  const played = fixturePlayedOn(index, fixture);
  return played !== null ? `Played ${played}` : formatDateTime(fixture.scheduledDate, fixture.scheduledTime);
}

export function fixtureRow(index: TournamentIndex, fixture: Fixture, venueName: VenueLookup = () => null): FixtureRowVM {
  const sides = index.fixtureSides(fixture);
  const result = fixtureResultText(index, fixture);
  const base = {
    key: fixture.id,
    fixtureId: fixture.id,
    matchNumber: fixture.matchNumber,
    label: index.fixtureLabel(fixture),
    title: index.fixtureTitle(fixture),
    a: sides.a,
    b: sides.b,
    teamsText: sidesText(sides.a, sides.b),
    status: fixture.status,
    statusLabel: FIXTURE_STATUS_LABEL[fixture.status],
    result,
    scoreline: fixtureScoreline(index, fixture),
    when: fixtureWhen(index, fixture),
    venue: fixture.venueId ? venueName(fixture.venueId) : null,
    stageId: fixture.stageId,
    poolId: fixture.poolId,
    round: fixture.round,
    scheduledDate: fixture.scheduledDate,
    matchId: fixture.matchId,
    resolved: sides.a.resolved && sides.b.resolved,
    provisional: sides.a.provisional || sides.b.provisional,
  };
  return { ...base, detail: detailLine(base, fixture), meta: metaLine(base), note: noteLine(base, fixture) };
}

export function sortFixtures(fixtures: readonly Fixture[], index: TournamentIndex): readonly Fixture[] {
  const stageOrder = new Map(index.stages.map((stage, position) => [stage.id, position]));
  return [...fixtures].sort(
    (a, b) => (stageOrder.get(a.stageId) ?? 0) - (stageOrder.get(b.stageId) ?? 0) || a.matchNumber - b.matchNumber,
  );
}

export function filterFixtures(
  index: TournamentIndex,
  fixtures: readonly Fixture[],
  filter: FixtureStatusFilter,
  search: string,
): readonly Fixture[] {
  const statuses = FILTER_STATUSES[filter];
  const needle = search.trim().toLowerCase();
  return fixtures.filter((fixture) => {
    if (statuses !== null && !statuses.includes(fixture.status)) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }
    const sides = index.fixtureSides(fixture);
    return `${sides.a.text} ${sides.b.text} ${index.fixtureLabel(fixture)}`.toLowerCase().includes(needle);
  });
}

export interface FixtureSection {
  readonly key: string;
  readonly title: string;
  readonly data: readonly FixtureRowVM[];
}

function sectionTitleByRound(index: TournamentIndex, row: FixtureRowVM, fixture: Fixture): string {
  const stage = index.stageName(row.stageId);
  const pool = index.poolName(row.poolId);
  const head = pool ? `${stage} · ${pool}` : stage;
  if (fixture.bracket) {
    return `${stage} · ${fixture.bracket.roundName}`;
  }
  return row.round === null ? head : `${head} · Round ${row.round}`;
}

export function fixtureSections(
  index: TournamentIndex,
  fixtures: readonly Fixture[],
  mode: 'round' | 'date',
  venueName: VenueLookup = () => null,
): readonly FixtureSection[] {
  const ordered =
    mode === 'round'
      ? sortFixtures(fixtures, index)
      : [...fixtures].sort((a, b) => compareDates(a.scheduledDate, b.scheduledDate) || a.matchNumber - b.matchNumber);
  const sections: { key: string; title: string; data: FixtureRowVM[] }[] = [];
  for (const fixture of ordered) {
    const row = fixtureRow(index, fixture, venueName);
    const title = mode === 'round' ? sectionTitleByRound(index, row, fixture) : formatDate(fixture.scheduledDate) ?? 'Date to be set';
    const last = sections[sections.length - 1];
    if (last && last.title === title) {
      last.data.push(row);
    } else {
      sections.push({ key: `${title}:${sections.length}`, title, data: [row] });
    }
  }
  return sections;
}

export function isUnplayed(fixture: Fixture): boolean {
  return UNPLAYED_STATUSES.includes(fixture.status) && fixture.matchId === null;
}

export function nextFixture(index: TournamentIndex): Fixture | null {
  const candidates = [...index.snapshot.fixtures]
    .filter(isUnplayed)
    .sort((a, b) => compareDates(a.scheduledDate, b.scheduledDate) || a.matchNumber - b.matchNumber);
  const resolved = candidates.find((fixture) => {
    const sides = index.fixtureSides(fixture);
    return sides.a.resolved && sides.b.resolved;
  });
  return resolved ?? candidates[0] ?? null;
}

export function liveFixtures(index: TournamentIndex): readonly Fixture[] {
  return index.snapshot.fixtures.filter((fixture) => fixture.status === 'live' && fixture.matchId !== null);
}

export function recentResults(index: TournamentIndex, limit: number): readonly Fixture[] {
  const completedAt = (fixture: Fixture): string => fixtureSummary(index.snapshot, fixture)?.completedAt ?? fixture.updatedAt;
  return index.snapshot.fixtures
    .filter((fixture) => fixture.status === 'completed' && fixtureSummary(index.snapshot, fixture) !== null)
    .sort((a, b) => (completedAt(a) < completedAt(b) ? 1 : completedAt(a) > completedAt(b) ? -1 : b.matchNumber - a.matchNumber))
    .slice(0, limit);
}

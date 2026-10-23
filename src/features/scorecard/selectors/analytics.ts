import type { ManhattanInnings, PartnershipBarItem, WormSeries } from '@/ui';
import type { LiveMatch } from '@/services/contracts';
import { boundaryCounts, manhattan, worm } from '@/domain/scoring/stats';
import { formatOvers, formatRate, formatScore } from '@/domain/scoring/format';
import { teamShortName } from '@/features/scoring/selectors/names';
import { plural } from '@/features/shared/text';
import { selectInningsCard } from './innings';

export interface SummaryRowVM {
  readonly key: string;
  readonly metric: string;
  readonly values: readonly string[];
}

export interface AnalyticsVM {
  readonly hasData: boolean;
  readonly worm: readonly WormSeries[];
  readonly wormLabel: string;
  readonly manhattan: readonly ManhattanInnings[];
  readonly manhattanLabel: string;
  readonly partnerships: readonly { readonly key: string; readonly title: string; readonly series: number; readonly rows: readonly PartnershipBarItem[] }[];
  readonly teams: readonly string[];
  readonly summary: readonly SummaryRowVM[];
}

export function selectAnalytics(live: LiveMatch): AnalyticsVM {
  const { setup, state } = live;
  const bpo = setup.rules.ballsPerOver;
  const regular = state.innings.filter((innings) => innings.kind === 'regular');
  const wormLines = worm(state);
  const wormInnings = wormLines.map((line) => regular.find((entry) => entry.index === line.inningsIndex));
  const wormSeries: WormSeries[] = wormLines.map((line, position) => {
    const innings = wormInnings[position];
    const bars = innings === undefined ? [] : manhattan(innings);
    return {
      label: teamShortName(setup, line.teamId),
      points: bars.map((bar, at) => ({ over: bar.overIndex + 1, runs: line.points[at + 1]?.runs ?? 0, wickets: bar.wickets })),
    };
  });
  const manhattanInnings: ManhattanInnings[] = regular.map((innings) => ({
    label: teamShortName(setup, innings.battingTeamId),
    overs: manhattan(innings).map((bar) => ({ over: bar.overIndex + 1, runs: bar.runs, wickets: bar.wickets })),
  }));
  const battingOrder = [...new Set(regular.map((innings) => innings.battingTeamId))];
  const partnerships = regular.map((innings) => {
    const card = selectInningsCard(setup, state, innings, 'zero');
    return {
      key: `${innings.index}`,
      title: `Partnerships · ${teamShortName(setup, innings.battingTeamId)}`,
      series: Math.max(0, battingOrder.indexOf(innings.battingTeamId)),
      rows: card.partnerships.map((partnership) => ({
        key: partnership.key,
        wicketLabel: partnership.wicketLabel,
        batters: partnership.batters,
        runs: partnership.runs,
        balls: partnership.balls,
        accessibilityLabel: partnership.accessibilityLabel,
      })),
    };
  });
  const boundaries = boundaryCounts(state);
  const teams = setup.teams.map((team) => team.id);
  const inningsOf = (teamId: string) => regular.find((innings) => innings.battingTeamId === teamId);
  const counts = (teamId: string) => boundaries.find((entry) => entry.teamId === teamId);
  const summary: SummaryRowVM[] = [
    { key: 'score', metric: 'Score', values: teams.map((id) => { const innings = inningsOf(id); return innings === undefined ? '–' : `${formatScore(innings.runs, innings.wickets)} (${formatOvers(innings.legalBalls, bpo)})`; }) },
    { key: 'rr', metric: 'Run rate', values: teams.map((id) => formatRate(inningsOf(id)?.runRate ?? null)) },
    { key: 'fours', metric: 'Fours', values: teams.map((id) => `${counts(id)?.fours ?? 0}`) },
    { key: 'sixes', metric: 'Sixes', values: teams.map((id) => `${counts(id)?.sixes ?? 0}`) },
    { key: 'extras', metric: 'Extras received', values: teams.map((id) => { const innings = inningsOf(id); return innings === undefined ? '–' : `${innings.extras.total}`; }) },
  ];
  const describe = wormSeries
    .map((line, position) => {
      const last = line.points[line.points.length - 1];
      const innings = wormInnings[position];
      if (last === undefined || innings === undefined) {
        return `${line.label} no overs yet`;
      }
      return `${line.label} ${last.runs} after ${plural(formatOvers(innings.legalBalls, bpo), 'over')}`;
    })
    .join(', ');
  return {
    hasData: regular.some((innings) => innings.balls.length > 0),
    worm: wormSeries,
    wormLabel: `Runs by over: ${describe}`,
    manhattan: manhattanInnings,
    manhattanLabel: `Runs per over for ${manhattanInnings.map((entry) => `${entry.label}, ${plural(entry.overs.length, 'over')}`).join(' and ')}`,
    partnerships,
    teams: setup.teams.map((team) => team.shortName),
    summary,
  };
}

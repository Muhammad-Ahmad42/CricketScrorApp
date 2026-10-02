import { formatNrr, formatOvers, formatRate } from '@/domain/scoring/format';
import type { PlayerTournamentStats, TeamTournamentStats, TournamentRecordLine, TournamentStats } from '@/domain/types';
import type { TournamentIndex } from './names';

export type RecordKey = 'highest-team-score' | 'highest-individual-score' | 'best-bowling' | 'most-sixes' | 'most-fours' | 'highest-partnership';

export interface RecordVM {
  readonly key: RecordKey;
  readonly title: string;
  readonly value: string;
  readonly detail: string;
  readonly matchId: string | null;
}

export interface TotalsVM {
  readonly matches: string;
  readonly runsWickets: string;
  readonly boundaries: string;
}

type PlayerNames = ReadonlyMap<string, string>;

function playerName(names: PlayerNames, playerId: string | null): string | null {
  if (playerId === null) {
    return null;
  }
  return names.get(playerId) ?? 'Player';
}

function withThousands(value: number): string {
  return value.toLocaleString('en-US');
}

function recordVM(index: TournamentIndex, names: PlayerNames, key: RecordKey, title: string, line: TournamentRecordLine | null, value: (line: TournamentRecordLine) => string): RecordVM {
  if (line === null) {
    return { key, title, value: '–', detail: 'No record yet', matchId: null };
  }
  const who = playerName(names, line.playerId);
  const team = index.teamShort(line.teamId);
  const detail = who ? `${who} (${team}) · ${line.detail}` : line.detail;
  return { key, title, value: value(line), detail, matchId: line.matchId };
}

export function totalsVM(stats: TournamentStats): TotalsVM {
  return {
    matches: `${stats.completedMatches} of ${stats.totalMatches} played`,
    runsWickets: `${withThousands(stats.totalRuns)} · ${withThousands(stats.totalWickets)}`,
    boundaries: `${withThousands(stats.totalFours)} · ${withThousands(stats.totalSixes)}`,
  };
}

export function recordsVM(index: TournamentIndex, stats: TournamentStats, names: PlayerNames): readonly RecordVM[] {
  const plain = (line: TournamentRecordLine) => String(line.value);
  return [
    recordVM(index, names, 'highest-team-score', 'Highest score', stats.highestTeamScore, plain),
    recordVM(index, names, 'highest-individual-score', 'Best batting', stats.highestIndividualScore, plain),
    recordVM(index, names, 'best-bowling', 'Best bowling', stats.bestBowling, (line) => `${line.value} wkts`),
    recordVM(index, names, 'most-sixes', 'Most sixes', stats.mostSixes, plain),
    recordVM(index, names, 'most-fours', 'Most fours', stats.mostFours, plain),
    recordVM(index, names, 'highest-partnership', 'Best partnership', stats.highestPartnership, plain),
  ];
}

export type BattingSort = 'runs' | 'average' | 'strike_rate';
export type BowlingSort = 'wickets' | 'economy';

export interface BattingRowVM {
  readonly key: string;
  readonly name: string;
  readonly team: string;
  readonly matches: string;
  readonly runs: string;
  readonly average: string;
  readonly strikeRate: string;
  readonly fours: string;
  readonly sixes: string;
  readonly best: string;
}

export interface BowlingRowVM {
  readonly key: string;
  readonly name: string;
  readonly team: string;
  readonly matches: string;
  readonly overs: string;
  readonly wickets: string;
  readonly runs: string;
  readonly economy: string;
  readonly best: string;
}

export interface TeamStatsRowVM {
  readonly key: string;
  readonly team: string;
  readonly matches: string;
  readonly wins: string;
  readonly losses: string;
  readonly points: string;
  readonly nrr: string;
  readonly runsScored: string;
  readonly runsConceded: string;
}

function compareNullable(a: number | null, b: number | null, descending: boolean): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return descending ? b - a : a - b;
}

export function battingRows(index: TournamentIndex, players: readonly PlayerTournamentStats[], names: PlayerNames, sort: BattingSort): readonly BattingRowVM[] {
  const batted = players.filter((player) => player.innings > 0);
  const sorted = [...batted].sort((a, b) => {
    if (sort === 'average') {
      return compareNullable(a.battingAverage, b.battingAverage, true) || b.runs - a.runs;
    }
    if (sort === 'strike_rate') {
      return compareNullable(a.strikeRate, b.strikeRate, true) || b.runs - a.runs;
    }
    return b.runs - a.runs || compareNullable(a.strikeRate, b.strikeRate, true);
  });
  return sorted.map((player) => ({
    key: player.playerId,
    name: playerName(names, player.playerId) ?? 'Player',
    team: index.teamShort(player.teamId),
    matches: String(player.matches),
    runs: String(player.runs),
    average: formatRate(player.battingAverage),
    strikeRate: formatRate(player.strikeRate),
    fours: String(player.fours),
    sixes: String(player.sixes),
    best: player.highestScore ? `${player.highestScore.runs}${player.highestScore.notOut ? '*' : ''}` : '–',
  }));
}

export function bowlingRows(
  index: TournamentIndex,
  players: readonly PlayerTournamentStats[],
  names: PlayerNames,
  sort: BowlingSort,
  ballsPerOver: number,
): readonly BowlingRowVM[] {
  const bowled = players.filter((player) => player.ballsBowled > 0);
  const sorted = [...bowled].sort((a, b) =>
    sort === 'economy'
      ? compareNullable(a.economy, b.economy, false) || b.wickets - a.wickets
      : b.wickets - a.wickets || compareNullable(a.economy, b.economy, false),
  );
  return sorted.map((player) => ({
    key: player.playerId,
    name: playerName(names, player.playerId) ?? 'Player',
    team: index.teamShort(player.teamId),
    matches: String(player.matches),
    overs: formatOvers(player.ballsBowled, ballsPerOver),
    wickets: String(player.wickets),
    runs: String(player.runsConceded),
    economy: formatRate(player.economy),
    best: player.bestBowling ? `${player.bestBowling.wickets}-${player.bestBowling.runs}` : '–',
  }));
}

export function teamStatsRows(index: TournamentIndex, teams: readonly TeamTournamentStats[]): readonly TeamStatsRowVM[] {
  return [...teams]
    .sort((a, b) => b.points - a.points || compareNullable(a.nrr, b.nrr, true))
    .map((team) => ({
      key: team.teamId,
      team: index.teamName(team.teamId),
      matches: String(team.matches),
      wins: String(team.wins),
      losses: String(team.losses),
      points: String(team.points),
      nrr: formatNrr(team.nrr),
      runsScored: String(team.runsScored),
      runsConceded: String(team.runsConceded),
    }));
}

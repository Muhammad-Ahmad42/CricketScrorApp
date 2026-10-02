import { formatRate } from '@/domain/scoring';
import type { PlayerTournamentStats, TournamentRecordLine, TournamentStats } from '@/domain/types';
import type { NameLookup } from '../text';
import type { LeaderTable, RecordLine, TournamentPdfSource } from './model';

export const LEADERS_SHOWN = 5;

type RecordKey = { readonly [K in keyof TournamentStats]: TournamentStats[K] extends TournamentRecordLine | null ? K : never }[keyof TournamentStats];

const RECORDS: readonly (readonly [RecordKey, string])[] = [
  ['highestTeamScore', 'Highest team score'],
  ['highestIndividualScore', 'Highest individual score'],
  ['bestBowling', 'Best bowling'],
  ['highestPartnership', 'Highest partnership'],
  ['mostSixes', 'Most sixes'],
  ['mostFours', 'Most fours'],
];

export function recordLines(source: TournamentPdfSource, team: NameLookup): readonly RecordLine[] {
  const stats = source.stats;
  if (stats === null) {
    return [];
  }
  return RECORDS.flatMap(([key, label]) => {
    const record = stats[key];
    if (record === null) {
      return [];
    }
    const player = record.playerId === null ? null : source.playerNames[record.playerId] ?? 'Unknown player';
    const holder = player === null ? team(record.teamId) : `${player} (${team(record.teamId)})`;
    return [{ label, holder, detail: record.detail.trim().length > 0 ? record.detail : String(record.value) }];
  });
}

function playerName(source: TournamentPdfSource, player: PlayerTournamentStats): string {
  return source.playerNames[player.playerId] ?? 'Unknown player';
}

export function leaderTables(source: TournamentPdfSource, team: NameLookup): readonly LeaderTable[] {
  const stats = source.stats;
  if (stats === null) {
    return [];
  }
  const batters = stats.players
    .filter((player) => player.runs > 0 || player.innings > 0)
    .sort((a, b) => b.runs - a.runs || a.ballsFaced - b.ballsFaced || playerName(source, a).localeCompare(playerName(source, b)))
    .slice(0, LEADERS_SHOWN);
  const bowlers = stats.players
    .filter((player) => player.wickets > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded || playerName(source, a).localeCompare(playerName(source, b)))
    .slice(0, LEADERS_SHOWN);
  const tables: LeaderTable[] = [];
  if (batters.length > 0) {
    tables.push({
      title: 'Most runs',
      columns: ['Inns', 'Runs', 'HS', 'Avg', 'SR', '4s', '6s'],
      rows: batters.map((player) => ({
        name: playerName(source, player),
        team: team(player.teamId),
        matches: String(player.matches),
        figures: [
          String(player.innings),
          String(player.runs),
          player.highestScore === null ? '–' : `${player.highestScore.runs}${player.highestScore.notOut ? '*' : ''}`,
          formatRate(player.battingAverage),
          formatRate(player.strikeRate),
          String(player.fours),
          String(player.sixes),
        ],
      })),
    });
  }
  if (bowlers.length > 0) {
    tables.push({
      title: 'Most wickets',
      columns: ['Wkts', 'Runs', 'Econ', 'Best'],
      rows: bowlers.map((player) => ({
        name: playerName(source, player),
        team: team(player.teamId),
        matches: String(player.matches),
        figures: [
          String(player.wickets),
          String(player.runsConceded),
          formatRate(player.economy),
          player.bestBowling === null ? '–' : `${player.bestBowling.wickets}/${player.bestBowling.runs}`,
        ],
      })),
    });
  }
  return tables;
}

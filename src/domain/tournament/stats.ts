import type { TournamentEvaluation, TournamentSnapshot, TournamentStats } from '../types';
import { aggregatePlayers } from './evaluation/playerStats';
import { boundaryRecords, inningsRecords } from './evaluation/records';
import { indexSnapshot } from './evaluation/snapshotIndex';
import { countedMatches } from './evaluation/statsMatches';
import { aggregateTeams } from './evaluation/teamStats';

export { recordHolderText, recordHoldersText, recordValueText, type RecordNames } from './evaluation/records';

export function computeTournamentStats(snapshot: TournamentSnapshot, evaluation: TournamentEvaluation): TournamentStats {
  const matches = countedMatches(snapshot);
  const innings = matches.flatMap((match) => match.summary.innings);
  const players = aggregatePlayers(matches);
  return {
    totalMatches: snapshot.fixtures.filter((fixture) => fixture.status !== 'cancelled').length,
    completedMatches: matches.length,
    totalRuns: innings.reduce((sum, entry) => sum + entry.runs, 0),
    totalWickets: innings.reduce((sum, entry) => sum + entry.wickets, 0),
    totalFours: innings.reduce((sum, entry) => sum + entry.fours, 0),
    totalSixes: innings.reduce((sum, entry) => sum + entry.sixes, 0),
    ...inningsRecords(indexSnapshot(snapshot), matches),
    ...boundaryRecords(matches, players),
    teams: aggregateTeams(snapshot, evaluation, matches),
    players,
  };
}

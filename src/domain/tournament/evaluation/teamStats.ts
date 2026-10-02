import type { StandingRow, TeamId, TeamTournamentStats, TournamentEvaluation, TournamentSnapshot } from '../../types';
import type { CountedMatch } from './statsMatches';

interface Totals {
  matches: number;
  wins: number;
  losses: number;
  runsScored: number;
  runsConceded: number;
  points: number;
  nrr: number | null;
}

function tableRow(evaluation: TournamentEvaluation, stageId: string, teamId: TeamId): StandingRow | null {
  const stage = evaluation.stages.find((candidate) => candidate.stageId === stageId);
  for (const table of stage?.tables ?? []) {
    const row = table.rows.find((candidate) => candidate.teamId === teamId);
    if (row) return row;
  }
  return null;
}

function addMatch(totals: Totals, match: CountedMatch, teamId: TeamId): void {
  const summary = match.summary;
  if (summary.teamAId !== teamId && summary.teamBId !== teamId) return;
  totals.matches += 1;
  if (summary.winnerTeamId === teamId) totals.wins += 1;
  else if (summary.winnerTeamId !== null) totals.losses += 1;
  for (const innings of summary.innings) {
    if (innings.battingTeamId === teamId) totals.runsScored += innings.runs;
    if (innings.bowlingTeamId === teamId) totals.runsConceded += innings.runs;
  }
}

export function aggregateTeams(snapshot: TournamentSnapshot, evaluation: TournamentEvaluation, matches: readonly CountedMatch[]): readonly TeamTournamentStats[] {
  const order = [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex);
  return snapshot.teams.map((view) => {
    const teamId = view.team.id;
    const totals: Totals = { matches: 0, wins: 0, losses: 0, runsScored: 0, runsConceded: 0, points: 0, nrr: null };
    for (const stage of order) {
      const hasTables = (evaluation.stages.find((candidate) => candidate.stageId === stage.id)?.tables.length ?? 0) > 0;
      if (!hasTables) {
        matches.filter((match) => match.fixture.stageId === stage.id).forEach((match) => addMatch(totals, match, teamId));
        continue;
      }
      const row = tableRow(evaluation, stage.id, teamId);
      if (!row) continue;
      totals.matches += row.played;
      totals.wins += row.won;
      totals.losses += row.lost;
      totals.runsScored += row.runsScored;
      totals.runsConceded += row.runsConceded;
      totals.points = row.points;
      totals.nrr = row.nrr;
    }
    return { teamId, ...totals };
  });
}

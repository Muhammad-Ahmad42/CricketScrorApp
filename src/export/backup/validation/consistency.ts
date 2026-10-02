import type { BackupData, Fixture, FixtureSide, Id, Match, Tournament, TournamentTeam } from '@/domain/types';
import type { BackupMatchPlayer } from '../ids';
import { errorIssue, type IssueSink } from './issues';

interface Problem {
  readonly field: string;
  readonly message: string;
}

function matchProblems(row: Match): readonly Problem[] {
  const problems: Problem[] = [];
  const sides = [row.teamAId, row.teamBId];
  if (row.teamAId === row.teamBId) {
    problems.push({ field: 'teamBId', message: 'A match needs two different teams.' });
  }
  if (row.toss !== null && !sides.includes(row.toss.winnerTeamId)) {
    problems.push({ field: 'toss.winnerTeamId', message: 'The toss was won by a team that is not playing this match.' });
  }
  if (row.winnerTeamId !== null && !sides.includes(row.winnerTeamId)) {
    problems.push({ field: 'winnerTeamId', message: 'The winner is not one of the teams in this match.' });
  }
  const finished = row.status === 'completed' || row.status === 'abandoned';
  if (finished !== (row.result !== null)) {
    problems.push({ field: 'result', message: finished ? 'A finished match must have a result.' : 'Only a finished match can have a result.' });
  } else if ((row.status === 'abandoned') !== (row.result?.type === 'abandoned')) {
    problems.push({ field: 'status', message: 'An abandoned match must have the result "abandoned", and only an abandoned match can.' });
  }
  if (row.fixtureId !== null && row.tournamentId === null) {
    problems.push({ field: 'fixtureId', message: 'A match played for a fixture must belong to that tournament.' });
  }
  return problems;
}

function sameSide(a: FixtureSide, b: FixtureSide): boolean {
  if (a.kind === 'team' && b.kind === 'team') {
    return a.teamId === b.teamId;
  }
  return a.kind === 'slot' && b.kind === 'slot' && a.slotId === b.slotId;
}

function fixtureProblems(row: Fixture): readonly Problem[] {
  const problems: Problem[] = [];
  if (sameSide(row.sideA, row.sideB)) {
    problems.push({ field: 'sideB', message: 'A fixture cannot have the same side twice.' });
  }
  if ((row.status === 'live' || row.status === 'completed' || row.status === 'abandoned') && row.matchId === null) {
    problems.push({ field: 'matchId', message: 'A fixture that has been played must be linked to its match.' });
  }
  return problems;
}

function membershipProblems(row: TournamentTeam): readonly Problem[] {
  if ((row.status === 'replaced') !== (row.replacedByTeamId !== null)) {
    return [{ field: 'replacedByTeamId', message: 'A replaced team must name its replacement, and only a replaced team can.' }];
  }
  if (row.replacedByTeamId === row.teamId || row.inheritsFromTeamId === row.teamId) {
    return [{ field: 'teamId', message: 'A team cannot replace or inherit from itself.' }];
  }
  return [];
}

function tournamentProblems(row: Tournament): readonly Problem[] {
  return row.startDate !== null && row.endDate !== null && row.startDate > row.endDate
    ? [{ field: 'endDate', message: 'The tournament ends before it starts.' }]
    : [];
}

function squadProblems(row: BackupMatchPlayer): readonly Problem[] {
  return row.isSubstitute && (row.battingOrder !== null || row.isCaptain)
    ? [{ field: 'isSubstitute', message: 'A substitute fielder cannot have a batting position or be captain.' }]
    : [];
}

function report<T>(rows: readonly T[], collection: string, problemsOf: (row: T) => readonly Problem[], sink: IssueSink, onProblem: (row: T) => void): void {
  rows.forEach((row, index) => {
    const problems = problemsOf(row);
    problems.forEach((problem) => sink.add(errorIssue('INVALID_VALUE', problem.message, `data.${collection}[${index}].${problem.field}`)));
    if (problems.length > 0) {
      onProblem(row);
    }
  });
}

export function checkRowConsistency(data: BackupData, sink: IssueSink): ReadonlySet<Id> {
  const tainted = new Set<Id>();
  const ignore = () => undefined;
  report(data.tournaments, 'tournaments', tournamentProblems, sink, ignore);
  report(data.tournamentTeams, 'tournamentTeams', membershipProblems, sink, ignore);
  report(data.fixtures, 'fixtures', fixtureProblems, sink, ignore);
  report(data.matches, 'matches', matchProblems, sink, (row) => tainted.add(row.id));
  report(data.matchPlayers, 'matchPlayers', squadProblems, sink, (row) => tainted.add(row.matchId));
  return tainted;
}

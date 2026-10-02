import type { MatchId, PlayerId, PlayerTournamentStats, TeamId } from '../../types';
import type { CountedMatch } from './statsMatches';

interface Accumulator {
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  readonly matches: Set<MatchId>;
  innings: number;
  runs: number;
  ballsFaced: number;
  notOuts: number;
  dismissals: number;
  fours: number;
  sixes: number;
  highest: { readonly runs: number; readonly notOut: boolean; readonly matchId: MatchId } | null;
  ballsBowled: number;
  oversBowled: number;
  runsConceded: number;
  wickets: number;
  best: { readonly wickets: number; readonly runs: number; readonly matchId: MatchId } | null;
}

function accumulator(playerId: PlayerId, teamId: TeamId): Accumulator {
  return {
    playerId,
    teamId,
    matches: new Set(),
    innings: 0,
    runs: 0,
    ballsFaced: 0,
    notOuts: 0,
    dismissals: 0,
    fours: 0,
    sixes: 0,
    highest: null,
    ballsBowled: 0,
    oversBowled: 0,
    runsConceded: 0,
    wickets: 0,
    best: null,
  };
}

function betterScore(candidate: NonNullable<Accumulator['highest']>, current: Accumulator['highest']): boolean {
  if (!current) return true;
  if (candidate.runs !== current.runs) return candidate.runs > current.runs;
  return candidate.notOut && !current.notOut;
}

function betterFigures(candidate: NonNullable<Accumulator['best']>, current: Accumulator['best']): boolean {
  if (!current) return true;
  if (candidate.wickets !== current.wickets) return candidate.wickets > current.wickets;
  return candidate.runs < current.runs;
}

function toStats(entry: Accumulator): PlayerTournamentStats {
  return {
    playerId: entry.playerId,
    teamId: entry.teamId,
    matches: entry.matches.size,
    innings: entry.innings,
    runs: entry.runs,
    ballsFaced: entry.ballsFaced,
    notOuts: entry.notOuts,
    battingAverage: entry.dismissals > 0 ? entry.runs / entry.dismissals : null,
    strikeRate: entry.ballsFaced > 0 ? (entry.runs * 100) / entry.ballsFaced : null,
    fours: entry.fours,
    sixes: entry.sixes,
    highestScore: entry.highest,
    ballsBowled: entry.ballsBowled,
    runsConceded: entry.runsConceded,
    wickets: entry.wickets,
    economy: entry.oversBowled > 0 ? entry.runsConceded / entry.oversBowled : null,
    bestBowling: entry.best,
  };
}

export function aggregatePlayers(matches: readonly CountedMatch[]): readonly PlayerTournamentStats[] {
  const players = new Map<PlayerId, Accumulator>();
  const touch = (playerId: PlayerId, teamId: TeamId, matchId: MatchId): Accumulator => {
    const entry = players.get(playerId) ?? accumulator(playerId, teamId);
    players.set(playerId, entry);
    entry.matches.add(matchId);
    return entry;
  };
  for (const { summary } of matches) {
    for (const squad of summary.squads) squad.playerIds.forEach((playerId) => touch(playerId, squad.teamId, summary.matchId));
    for (const innings of summary.innings) {
      for (const line of innings.batting) {
        const entry = touch(line.playerId, innings.battingTeamId, summary.matchId);
        entry.innings += 1;
        entry.runs += line.runs;
        entry.ballsFaced += line.balls;
        entry.fours += line.fours;
        entry.sixes += line.sixes;
        if (line.out) entry.dismissals += 1;
        else entry.notOuts += 1;
        const score = { runs: line.runs, notOut: !line.out, matchId: summary.matchId };
        if (betterScore(score, entry.highest)) entry.highest = score;
      }
      for (const line of innings.bowling) {
        const entry = touch(line.playerId, innings.bowlingTeamId, summary.matchId);
        entry.ballsBowled += line.legalBalls;
        entry.oversBowled += line.legalBalls / innings.ballsPerOver;
        entry.runsConceded += line.runsConceded;
        entry.wickets += line.wickets;
        const figures = { wickets: line.wickets, runs: line.runsConceded, matchId: summary.matchId };
        if (betterFigures(figures, entry.best)) entry.best = figures;
      }
    }
  }
  return [...players.values()].map(toStats);
}

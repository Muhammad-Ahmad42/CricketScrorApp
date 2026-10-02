import type { InningsSummary, PlayerTournamentStats, TeamId, TournamentRecordLine } from '../../types';
import { plural } from './format';
import type { SnapshotIndex } from './snapshotIndex';
import { teamName } from './snapshotIndex';
import { opponentOf } from './statsMatches';
import type { CountedMatch } from './statsMatches';

export interface TournamentRecords {
  readonly highestTeamScore: TournamentRecordLine | null;
  readonly highestIndividualScore: TournamentRecordLine | null;
  readonly bestBowling: TournamentRecordLine | null;
  readonly mostSixes: TournamentRecordLine | null;
  readonly mostFours: TournamentRecordLine | null;
  readonly highestPartnership: TournamentRecordLine | null;
}

interface Candidate {
  readonly line: TournamentRecordLine;
  readonly secondary: number;
}

type Better = (candidate: Candidate, current: Candidate) => boolean;

class RecordKeeper {
  private current: Candidate | null = null;

  constructor(private readonly better: Better) {}

  offer(line: TournamentRecordLine, secondary = 0): void {
    const candidate = { line, secondary };
    if (this.current === null || this.better(candidate, this.current)) this.current = candidate;
  }

  get value(): TournamentRecordLine | null {
    return this.current?.line ?? null;
  }
}

const higher: Better = (candidate, current) => candidate.line.value > current.line.value;

const moreWicketsFewerRuns: Better = (candidate, current) =>
  candidate.line.value !== current.line.value ? candidate.line.value > current.line.value : candidate.secondary < current.secondary;

function oversText(balls: number, ballsPerOver: number): string {
  return `${Math.floor(balls / ballsPerOver)}.${balls % ballsPerOver}`;
}

function scoreText(innings: InningsSummary): string {
  return innings.allOut ? `${innings.runs} all out` : `${innings.runs}/${innings.wickets}`;
}

export function inningsRecords(index: SnapshotIndex, matches: readonly CountedMatch[]): Omit<TournamentRecords, 'mostSixes' | 'mostFours'> {
  const team = new RecordKeeper(higher);
  const individual = new RecordKeeper(higher);
  const partnership = new RecordKeeper(higher);
  const bowling = new RecordKeeper(moreWicketsFewerRuns);
  for (const { summary } of matches) {
    for (const innings of summary.innings) {
      const against = teamName(index, opponentOf(summary, innings.battingTeamId));
      team.offer({
        matchId: summary.matchId,
        teamId: innings.battingTeamId,
        playerId: null,
        value: innings.runs,
        detail: `${teamName(index, innings.battingTeamId)} ${scoreText(innings)} (${oversText(innings.legalBalls, innings.ballsPerOver)} ov) v ${against}`,
      });
      for (const line of innings.batting) {
        individual.offer({
          matchId: summary.matchId,
          teamId: innings.battingTeamId,
          playerId: line.playerId,
          value: line.runs,
          detail: `${line.runs}${line.out ? '' : '*'} (${plural(line.balls, 'ball')}) v ${against}`,
        });
      }
      for (const line of innings.bowling) {
        bowling.offer(
          {
            matchId: summary.matchId,
            teamId: innings.bowlingTeamId,
            playerId: line.playerId,
            value: line.wickets,
            detail: `${line.wickets}/${line.runsConceded} v ${teamName(index, innings.battingTeamId)}`,
          },
          line.runsConceded,
        );
      }
      const best = innings.bestPartnership;
      if (best) {
        partnership.offer({
          matchId: summary.matchId,
          teamId: innings.battingTeamId,
          playerId: best.batterAId,
          value: best.runs,
          detail: `${plural(best.runs, 'run')} (${plural(best.balls, 'ball')}) v ${against}`,
        });
      }
    }
  }
  return { highestTeamScore: team.value, highestIndividualScore: individual.value, bestBowling: bowling.value, highestPartnership: partnership.value };
}

function matchOrder(matches: readonly CountedMatch[]): ReadonlyMap<string, number> {
  return new Map(matches.map((match, position) => [match.summary.matchId, position]));
}

function boundaryRecord(
  matches: readonly CountedMatch[],
  players: readonly PlayerTournamentStats[],
  pick: (player: PlayerTournamentStats) => number,
  perLine: (line: InningsSummary['batting'][number]) => number,
  noun: readonly [string, string],
): TournamentRecordLine | null {
  const order = matchOrder(matches);
  const firstReached = (playerId: string, total: number): { readonly matchId: string; readonly teamId: TeamId } | null => {
    let running = 0;
    for (const { summary } of matches) {
      for (const innings of summary.innings) {
        for (const line of innings.batting) {
          if (line.playerId !== playerId) continue;
          running += perLine(line);
          if (running >= total) return { matchId: summary.matchId, teamId: innings.battingTeamId };
        }
      }
    }
    return null;
  };
  let best: TournamentRecordLine | null = null;
  for (const player of players) {
    const total = pick(player);
    if (total <= 0) continue;
    const reached = firstReached(player.playerId, total);
    if (!reached) continue;
    const line = {
      matchId: reached.matchId,
      teamId: player.teamId,
      playerId: player.playerId,
      value: total,
      detail: `${plural(total, noun[0], noun[1])} in ${plural(player.matches, 'match', 'matches')}`,
    };
    const earlier = best !== null && (order.get(line.matchId) ?? 0) < (order.get(best.matchId) ?? 0);
    if (best === null || line.value > best.value || (line.value === best.value && earlier)) best = line;
  }
  return best;
}

export function boundaryRecords(
  matches: readonly CountedMatch[],
  players: readonly PlayerTournamentStats[],
): Pick<TournamentRecords, 'mostSixes' | 'mostFours'> {
  return {
    mostSixes: boundaryRecord(matches, players, (player) => player.sixes, (line) => line.sixes, ['six', 'sixes']),
    mostFours: boundaryRecord(matches, players, (player) => player.fours, (line) => line.fours, ['four', 'fours']),
  };
}

import type {
  BoundaryAllowance,
  DeliveryPayload,
  DeliveryWicket,
  MatchEvent,
  MatchEventPayload,
  MatchResult,
  MatchSummary,
  PlayerId,
  RunsTo,
  TeamId,
} from '@/domain/types';
import type { MatchProjection } from '../repositories/contracts';
import { isoAt, T0 } from './builders';

export interface GoldenSide {
  readonly teamId: TeamId;
  readonly playerIds: readonly PlayerId[];
}

export interface GoldenMatchOptions {
  readonly matchId: string;
  readonly batFirst: GoldenSide;
  readonly bowlFirst: GoldenSide;
  readonly idPrefix?: string;
  readonly start?: string;
  readonly includeMatchEnd?: boolean;
}

interface BallSpec {
  readonly runs?: number;
  readonly boundary?: BoundaryAllowance;
  readonly call?: 'fair' | 'no_ball' | 'wide';
  readonly runsTo?: RunsTo;
  readonly wicket?: DeliveryWicket | null;
}

export function ball(strikerId: PlayerId, nonStrikerId: PlayerId, bowlerId: PlayerId, spec: BallSpec = {}): DeliveryPayload {
  const common = {
    kind: 'delivery' as const,
    strikerId,
    nonStrikerId,
    bowlerId,
    runsRun: spec.runs ?? 0,
    shortRuns: 0,
    boundary: spec.boundary ?? 0,
    wicket: spec.wicket ?? null,
  };
  if (spec.call === 'wide') {
    return { ...common, call: 'wide' };
  }
  return { ...common, call: spec.call ?? 'fair', runsTo: spec.runsTo ?? 'bat' };
}

export class EventLogBuilder {
  private readonly log: MatchEvent[] = [];
  private actions = 0;

  constructor(
    private readonly matchId: string,
    private readonly idPrefix: string,
    private readonly start: string = T0,
  ) {}

  act(...payloads: readonly MatchEventPayload[]): this {
    this.actions += 1;
    const actionId = `${this.idPrefix}a${this.actions}`;
    for (const payload of payloads) {
      const seq = this.log.length + 1;
      this.log.push({
        ...payload,
        id: `${this.idPrefix}e${seq}`,
        matchId: this.matchId,
        seq,
        actionId,
        recordedAt: isoAt(seq, this.start),
      });
    }
    return this;
  }

  events(): MatchEvent[] {
    return [...this.log];
  }
}

export function goldenMatchEvents(options: GoldenMatchOptions): MatchEvent[] {
  const L = (n: number): PlayerId => options.batFirst.playerIds[n - 1];
  const T = (n: number): PlayerId => options.bowlFirst.playerIds[n - 1];
  const log = new EventLogBuilder(options.matchId, options.idPrefix ?? `${options.matchId}-`, options.start ?? T0);
  log
    .act({
      kind: 'innings_started',
      inningsIndex: 0,
      battingTeamId: options.batFirst.teamId,
      strikerId: L(1),
      nonStrikerId: L(2),
      bowlerId: T(7),
    })
    .act(ball(L(1), L(2), T(7), { runs: 1 }))
    .act(ball(L(2), L(1), T(7), { boundary: 4 }))
    .act(ball(L(2), L(1), T(7), { call: 'wide' }))
    .act(ball(L(2), L(1), T(7)))
    .act(ball(L(2), L(1), T(7), { runs: 2 }))
    .act(ball(L(2), L(1), T(7), { boundary: 6 }))
    .act(ball(L(2), L(1), T(7), { runs: 1 }))
    .act({ kind: 'bowler_selected', bowlerId: T(8), reason: 'over_start' })
    .act(ball(L(2), L(1), T(8)))
    .act(
      ball(L(2), L(1), T(8), { wicket: { type: 'bowled', playerOutId: L(2), fielderIds: [], dismissalEnd: null } }),
      { kind: 'batter_in', playerId: L(3), position: 'striker' },
    )
    .act(ball(L(3), L(1), T(8), { runs: 1 }))
    .act(ball(L(1), L(3), T(8), { call: 'no_ball', runs: 1 }))
    .act(ball(L(3), L(1), T(8)))
    .act(ball(L(3), L(1), T(8), { runs: 1, runsTo: 'leg_bye' }))
    .act(ball(L(1), L(3), T(8), { runs: 2 }))
    .act({ kind: 'bowler_selected', bowlerId: T(7), reason: 'over_start' })
    .act(ball(L(3), L(1), T(7), { runs: 1 }))
    .act(ball(L(1), L(3), T(7), { runs: 1 }))
    .act(ball(L(3), L(1), T(7), { runs: 1 }))
    .act(ball(L(1), L(3), T(7), { runs: 1 }))
    .act(ball(L(3), L(1), T(7), { runs: 1 }))
    .act(ball(L(1), L(3), T(7), { runs: 1 }))
    .act({
      kind: 'innings_started',
      inningsIndex: 1,
      battingTeamId: options.bowlFirst.teamId,
      strikerId: T(1),
      nonStrikerId: T(2),
      bowlerId: L(10),
    })
    .act(ball(T(1), T(2), L(10), { boundary: 4 }))
    .act(ball(T(1), T(2), L(10), { boundary: 4 }))
    .act(ball(T(1), T(2), L(10), { runs: 1 }))
    .act(ball(T(2), T(1), L(10), { runs: 1 }))
    .act(ball(T(1), T(2), L(10), { runs: 2 }))
    .act(ball(T(1), T(2), L(10), { boundary: 6 }))
    .act({ kind: 'bowler_selected', bowlerId: L(11), reason: 'over_start' })
    .act(ball(T(2), T(1), L(11), { runs: 1 }))
    .act(ball(T(1), T(2), L(11)))
    .act(
      ball(T(1), T(2), L(11), { wicket: { type: 'caught', playerOutId: T(1), fielderIds: [L(7)], dismissalEnd: null } }),
      { kind: 'batter_in', playerId: T(3), position: 'striker' },
    )
    .act(ball(T(3), T(2), L(11), { runs: 2 }))
    .act(ball(T(3), T(2), L(11), { runs: 1 }))
    .act(ball(T(2), T(3), L(11), { boundary: 4 }))
    .act({ kind: 'bowler_selected', bowlerId: L(10), reason: 'over_start' })
    .act(ball(T(3), T(2), L(10), { runs: 1 }))
    .act(ball(T(2), T(3), L(10), { runs: 1 }));
  if (options.includeMatchEnd ?? true) {
    log.act({ kind: 'match_ended', outcome: { type: 'natural' } });
  }
  return log.events();
}

export function goldenResult(options: GoldenMatchOptions): MatchResult {
  return {
    type: 'win',
    winnerTeamId: options.bowlFirst.teamId,
    loserTeamId: options.batFirst.teamId,
    margin: { kind: 'wickets', wickets: 9, ballsRemaining: 4 },
    method: 'normal',
  };
}

export function goldenSummary(options: GoldenMatchOptions, teamAId: TeamId, completedAt: string): MatchSummary {
  const innings = (index: number, batting: GoldenSide, bowling: GoldenSide, runs: number, legalBalls: number) => ({
    inningsIndex: index,
    battingTeamId: batting.teamId,
    bowlingTeamId: bowling.teamId,
    runs,
    wickets: 1,
    legalBalls,
    allottedBalls: 18,
    ballsPerOver: 6,
    allOut: false,
    completion: index === 0 ? ('overs_complete' as const) : ('target_reached' as const),
    target: index === 0 ? null : 28,
    targetRevised: false,
    extras: index === 0 ? 3 : 0,
    fours: index === 0 ? 1 : 3,
    sixes: 1,
    batting: [],
    bowling: [],
    bestPartnership: null,
  });
  const teamBId = teamAId === options.batFirst.teamId ? options.bowlFirst.teamId : options.batFirst.teamId;
  return {
    summaryVersion: 2,
    matchId: options.matchId,
    teamAId,
    teamBId,
    status: 'completed',
    result: goldenResult(options),
    winnerTeamId: options.bowlFirst.teamId,
    ballsPerOver: 6,
    innings: [innings(0, options.batFirst, options.bowlFirst, 27, 18), innings(1, options.bowlFirst, options.batFirst, 28, 14)],
    superOvers: [],
    squads: [
      { teamId: options.batFirst.teamId, playerIds: options.batFirst.playerIds.slice(0, 11) },
      { teamId: options.bowlFirst.teamId, playerIds: options.bowlFirst.playerIds.slice(0, 11) },
    ],
    completedAt,
  };
}

export function goldenProjection(
  options: GoldenMatchOptions,
  input: { readonly projectionVersion: number; readonly teamAId: TeamId; readonly at: string; readonly completed: boolean },
): MatchProjection {
  const L = (n: number): PlayerId => options.batFirst.playerIds[n - 1];
  const T = (n: number): PlayerId => options.bowlFirst.playerIds[n - 1];
  const result = input.completed ? goldenResult(options) : null;
  return {
    matchId: options.matchId,
    projectionVersion: input.projectionVersion,
    status: input.completed ? 'completed' : 'live',
    result,
    winnerTeamId: result !== null && result.type === 'win' ? result.winnerTeamId : null,
    summary: input.completed ? goldenSummary(options, input.teamAId, input.at) : null,
    startedAt: isoAt(1, options.start ?? T0),
    completedAt: input.completed ? input.at : null,
    innings: [
      {
        inningsIndex: 0,
        kind: 'regular',
        battingTeamId: options.batFirst.teamId,
        runs: 27,
        wickets: 1,
        legalBalls: 18,
        ballsPerOver: 6,
        status: 'complete',
        completionReason: 'overs_complete',
        superOverRound: null,
        bowlingTeamId: options.bowlFirst.teamId,
        maxBalls: 18,
        target: null,
        targetRevised: false,
        extras: { wides: 1, noBalls: 1, byes: 0, legByes: 1, penalty: 0, total: 3 },
      },
      {
        inningsIndex: 1,
        kind: 'regular',
        battingTeamId: options.bowlFirst.teamId,
        runs: 28,
        wickets: 1,
        legalBalls: 14,
        ballsPerOver: 6,
        status: input.completed ? 'complete' : 'in_progress',
        completionReason: input.completed ? 'target_reached' : null,
        superOverRound: null,
        bowlingTeamId: options.batFirst.teamId,
        maxBalls: 18,
        target: 28,
        targetRevised: false,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0, total: 0 },
      },
    ],
    partnerships: [
      partnership(0, 0, 1, L(1), L(2), 15, 8, 'wicket'),
      partnership(0, 1, 2, L(1), L(3), 12, 10, 'innings_end'),
      partnership(1, 0, 1, T(1), T(2), 19, 8, 'wicket'),
      partnership(1, 1, 2, T(2), T(3), 9, 6, input.completed ? 'innings_end' : null),
    ],
    updatedAt: input.at,
  };
}

function partnership(
  inningsIndex: number,
  index: number,
  wicketNumber: number,
  batterAId: PlayerId,
  batterBId: PlayerId,
  runs: number,
  balls: number,
  endedBy: 'wicket' | 'retirement' | 'innings_end' | null,
): MatchProjection['partnerships'][number] {
  const batterARuns = Math.floor(runs / 2);
  const batterABalls = Math.floor(balls / 2);
  return {
    inningsIndex,
    index,
    wicketNumber,
    batterAId,
    batterBId,
    runs,
    balls,
    batterARuns,
    batterABalls,
    batterBRuns: runs - batterARuns - 1,
    batterBBalls: balls - batterABalls,
    extras: 1,
    endedBy,
  };
}

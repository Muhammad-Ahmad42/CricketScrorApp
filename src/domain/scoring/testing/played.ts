import type { BallCount, IsoDateTime, MatchEndOutcome, MatchEvent, MatchSetup, MatchState, MatchSummary, TeamId } from '../../types';
import { scoreRuns, wicket, type ScoringIntent } from '../commands';
import { battingSquad, otherTeamId } from '../internal/squad';
import { currentInnings } from '../replay';
import { buildMatchSummary } from '../summary';
import { matchSetup } from './fixtures';
import { declare, endMatch, reviseOvers, suspendPlay } from './intents';
import { bowlingPreference, ScriptRunner } from './script';

export interface InningsPlan {
  readonly runs: number;
  readonly wickets?: number;
  readonly balls?: BallCount;
  readonly revision?: { readonly balls: BallCount; readonly target?: number | null };
  readonly terminated?: { readonly target: number };
}

export interface PlayedMatchPlan {
  readonly setup?: MatchSetup;
  readonly battingFirst?: TeamId;
  readonly first: InningsPlan;
  readonly second?: InningsPlan | null;
  readonly end?: MatchEndOutcome | null;
  readonly completedAt?: IsoDateTime | null;
}

export interface PlayedMatch {
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
  readonly summary: MatchSummary | null;
}

function wicketPositions(balls: number, wickets: number, allOut: boolean, keepLastFree: boolean): ReadonlySet<number> {
  const positions = new Set<number>();
  let remaining = wickets;
  let span = balls;
  if (allOut && wickets > 0) {
    positions.add(balls - 1);
    remaining -= 1;
    span = balls - 1;
  } else if (keepLastFree) {
    span = balls - 1;
  }
  if (remaining > span) {
    throw new Error(`Cannot fit ${wickets} wickets into ${balls} balls`);
  }
  const step = remaining === 0 ? 0 : span / remaining;
  for (let index = 0; index < remaining; index += 1) {
    positions.add(Math.floor(index * step + step / 2));
  }
  return positions;
}

function spread(total: number, slots: number): number[] {
  if (slots === 0) {
    if (total > 0) {
      throw new Error(`Cannot score ${total} runs without a scoring ball`);
    }
    return [];
  }
  const base = Math.floor(total / slots);
  const extra = total % slots;
  const values = Array.from({ length: slots }, (_, index) => base + (index >= slots - extra ? 1 : 0));
  if (values.some((value) => value > 6)) {
    throw new Error(`Cannot score ${total} runs in ${slots} balls`);
  }
  return values;
}

export function planInningsBalls(
  plan: { readonly runs: number; readonly wickets: number; readonly balls: number },
  maxWickets: number,
  target: number | null,
  runsAlready = 0,
): readonly ('W' | number)[] {
  const allOut = plan.wickets >= maxWickets;
  const toScore = plan.runs - runsAlready;
  const winsChase = target !== null && plan.runs >= target;
  const positions = wicketPositions(plan.balls, plan.wickets, allOut, winsChase);
  const scoringSlots = plan.balls - positions.size;
  let values: number[];
  if (winsChase) {
    const needed = plan.runs - (target - 1);
    const last = Math.max(needed, toScore - 6 * (scoringSlots - 1));
    if (last > 6 || last < 1) {
      throw new Error(`Cannot finish the chase on ${plan.runs} with one ball`);
    }
    values = [...spread(toScore - last, scoringSlots - 1), last];
  } else {
    values = spread(toScore, scoringSlots);
  }
  const sequence: ('W' | number)[] = [];
  let next = 0;
  for (let index = 0; index < plan.balls; index += 1) {
    if (positions.has(index)) {
      sequence.push('W');
    } else {
      sequence.push(values[next]);
      next += 1;
    }
  }
  return sequence;
}

function startIntent(setup: MatchSetup, battingTeamId: TeamId): ScoringIntent {
  const openers = battingSquad(setup, battingTeamId).map((player) => player.playerId);
  const bowlerId = bowlingPreference(setup, otherTeamId(setup, battingTeamId))[0];
  return { type: 'start_innings', strikerId: openers[0], nonStrikerId: openers[1], bowlerId, battingTeamId };
}

function playInnings(runner: ScriptRunner, setup: MatchSetup, index: number, plan: InningsPlan, battingTeamId: TeamId): void {
  if (plan.revision !== undefined) {
    runner.apply(reviseOvers(index, { balls: plan.revision.balls, target: plan.revision.target ?? null }), `revise innings ${index}`);
  }
  runner.apply(startIntent(setup, battingTeamId), `start innings ${index}`);
  const innings = currentInnings(runner.result.state);
  if (innings === null) {
    throw new Error('Innings did not start');
  }
  const balls = plan.balls ?? innings.limits.maxBalls;
  const sequence = planInningsBalls(
    { runs: plan.runs, wickets: plan.wickets ?? 0, balls },
    innings.limits.maxWickets,
    innings.target?.runs ?? null,
    innings.runs,
  );
  runner.run(sequence.map((entry) => (entry === 'W' ? wicket({ dismissal: 'bowled' }) : scoreRuns(entry))));
  const after = currentInnings(runner.result.state);
  if (after === null || after.status === 'complete') {
    return;
  }
  if (plan.terminated !== undefined) {
    runner.apply(suspendPlay('rain'), 'suspend');
    runner.apply(reviseOvers(index, { balls: after.legalBalls, target: plan.terminated.target, terminal: true }), 'terminate');
    return;
  }
  runner.apply(declare(), `close innings ${index}`);
}

export function playedMatch(plan: PlayedMatchPlan): PlayedMatch {
  const setup = plan.setup ?? matchSetup();
  const runner = new ScriptRunner(setup, { autoBatters: true, autoBowlers: true });
  const toss = setup.toss;
  const tossBats = toss === null ? null : toss.decision === 'bat' ? toss.winnerTeamId : otherTeamId(setup, toss.winnerTeamId);
  const battingFirst = plan.battingFirst ?? tossBats ?? setup.teams[0].id;
  playInnings(runner, setup, 0, plan.first, battingFirst);
  if (plan.second !== undefined && plan.second !== null) {
    playInnings(runner, setup, 1, plan.second, otherTeamId(setup, battingFirst));
  }
  const state = runner.result.state;
  const outcome = plan.end === undefined ? (state.naturalResult !== null ? { type: 'natural' as const } : null) : plan.end;
  if (outcome !== null) {
    runner.apply(endMatch(outcome), 'end match');
  }
  const finalState = runner.result.state;
  return {
    setup,
    events: runner.result.events,
    state: finalState,
    summary: buildMatchSummary(setup, finalState, { completedAt: plan.completedAt ?? null }),
  };
}

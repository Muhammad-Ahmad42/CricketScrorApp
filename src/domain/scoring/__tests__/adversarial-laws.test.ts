import type {
  BowlerSelectionReason,
  CreaseEnd,
  CreasePosition,
  DeliveryDismissalType,
  DeliveryPayload,
  InningsState,
  MatchEndOutcome,
  MatchEvent,
  MatchEventInput,
  MatchResult,
  MatchRules,
  MatchSetup,
  MatchState,
  PlayerId,
  RunsTo,
  TeamId,
  ValidationResult,
} from '@/domain/types';
import {
  BASE_MATCH_RULES,
  allowedDismissals,
  applyEvent,
  boundaryCounts,
  buildMatchSummary,
  bowlerEligibility,
  currentInnings,
  formatBowlingFigures,
  formatOvers,
  formatRequirement,
  formatResult,
  matchStatusLabel,
  replayMatch,
  suggestRevisedTarget,
  validateEvent,
} from '@/domain/scoring';
import { LIONS, TIGERS, matchSetup, type MatchSetupOverrides } from '@/domain/scoring/testing';

interface WicketSpec {
  readonly type: DeliveryDismissalType;
  readonly playerOutId?: PlayerId;
  readonly fielderIds?: readonly PlayerId[];
  readonly dismissalEnd?: CreaseEnd | null;
}

interface BallSpec {
  readonly call?: 'fair' | 'wide' | 'no_ball';
  readonly runsTo?: RunsTo;
  readonly runsRun?: number;
  readonly shortRuns?: number;
  readonly boundary?: 0 | 4 | 6;
  readonly wicket?: WicketSpec;
}

const CREDITED = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'];

class Game {
  readonly events: MatchEvent[] = [];
  state: MatchState;

  constructor(readonly setup: MatchSetup) {
    this.state = replayMatch(setup, []);
  }

  get inn(): InningsState {
    const innings = currentInnings(this.state);
    if (innings === null) {
      throw new Error('No innings has started');
    }
    return innings;
  }

  at(index: number): InningsState {
    const innings = this.state.innings[index];
    if (innings === undefined) {
      throw new Error(`Innings ${index} has not started`);
    }
    return innings;
  }

  row(playerId: PlayerId, index?: number) {
    const innings = index === undefined ? this.inn : this.at(index);
    const found = innings.batting.find((entry) => entry.playerId === playerId);
    if (found === undefined) {
      throw new Error(`No batting row for ${playerId}`);
    }
    return found;
  }

  bowler(playerId: PlayerId, index?: number) {
    const innings = index === undefined ? this.inn : this.at(index);
    const found = innings.bowling.find((entry) => entry.playerId === playerId);
    if (found === undefined) {
      throw new Error(`No bowling row for ${playerId}`);
    }
    return found;
  }

  get lastBall() {
    const balls = this.inn.balls;
    return balls[balls.length - 1];
  }

  check(payload: MatchEventInput): ValidationResult {
    return validateEvent(this.setup, this.state, payload, 'append');
  }

  code(payload: MatchEventInput): string {
    const verdict = this.check(payload);
    return verdict.ok ? 'OK' : verdict.code;
  }

  push(payload: MatchEventInput): this {
    const verdict = this.check(payload);
    if (!verdict.ok) {
      throw new Error(`${payload.kind} rejected with ${verdict.code}: ${verdict.message}`);
    }
    const seq = this.state.lastSeq + 1;
    const event = {
      ...payload,
      id: `ev${seq}`,
      matchId: this.setup.matchId,
      seq,
      actionId: `act${seq}`,
      recordedAt: new Date(Date.UTC(2026, 4, 1, 10, 0, seq)).toISOString(),
    } as MatchEvent;
    this.events.push(event);
    this.state = applyEvent(this.setup, this.state, event);
    return this;
  }

  delivery(spec: BallSpec = {}): DeliveryPayload {
    const innings = this.inn;
    const striker = innings.strikerId ?? 'nobody';
    const wicket =
      spec.wicket === undefined
        ? null
        : {
            type: spec.wicket.type,
            playerOutId: spec.wicket.playerOutId ?? striker,
            fielderIds: spec.wicket.fielderIds ?? [],
            dismissalEnd: spec.wicket.dismissalEnd ?? null,
          };
    const common = {
      kind: 'delivery' as const,
      strikerId: striker,
      nonStrikerId: innings.nonStrikerId,
      bowlerId: innings.bowlerId ?? 'nobody',
      runsRun: spec.runsRun ?? 0,
      shortRuns: spec.shortRuns ?? 0,
      boundary: spec.boundary ?? 0,
      wicket,
    };
    if (spec.call === 'wide') {
      return { ...common, call: 'wide' };
    }
    return { ...common, call: spec.call ?? 'fair', runsTo: spec.runsTo ?? 'bat' };
  }

  ball(spec: BallSpec = {}): this {
    this.autoBowler();
    return this.push(this.delivery(spec));
  }

  ballCode(spec: BallSpec = {}): string {
    this.autoBowler();
    return this.code(this.delivery(spec));
  }

  hits(...values: number[]): this {
    for (const value of values) {
      if (value === 4 || value === 6) {
        this.ball({ boundary: value });
      } else {
        this.ball({ runsRun: value });
      }
    }
    return this;
  }

  dots(count: number): this {
    for (let index = 0; index < count; index += 1) {
      this.ball();
    }
    return this;
  }

  startPayload(inningsIndex: number, battingTeamId: TeamId, strikerId: PlayerId, nonStrikerId: PlayerId, bowlerId: PlayerId): MatchEventInput {
    return { kind: 'innings_started', inningsIndex, battingTeamId, strikerId, nonStrikerId, bowlerId };
  }

  start(inningsIndex: number, battingTeamId: TeamId, strikerId: PlayerId, nonStrikerId: PlayerId, bowlerId: PlayerId): this {
    return this.push(this.startPayload(inningsIndex, battingTeamId, strikerId, nonStrikerId, bowlerId));
  }

  bowlPayload(bowlerId: PlayerId, reason: BowlerSelectionReason = 'over_start'): MatchEventInput {
    return { kind: 'bowler_selected', bowlerId, reason };
  }

  bowl(bowlerId: PlayerId, reason: BowlerSelectionReason = 'over_start'): this {
    return this.push(this.bowlPayload(bowlerId, reason));
  }

  batPayload(playerId: PlayerId, position?: CreasePosition): MatchEventInput {
    const pending = this.state.pendingAction;
    const vacancy = pending !== null && pending.type === 'select_next_batter' ? pending.position : 'striker';
    return { kind: 'batter_in', playerId, position: position ?? vacancy };
  }

  bat(playerId: PlayerId, position?: CreasePosition): this {
    return this.push(this.batPayload(playerId, position));
  }

  nextBatter(): this {
    const pending = this.state.pendingAction;
    if (pending === null || pending.type !== 'select_next_batter' || pending.candidates.length === 0) {
      throw new Error('No incoming batter available');
    }
    return this.bat(pending.candidates[0]);
  }

  wicketThenNext(spec: WicketSpec = { type: 'bowled' }): this {
    this.ball({ wicket: spec });
    const pending = this.state.pendingAction;
    if (pending !== null && pending.type === 'select_next_batter') {
      this.nextBatter();
    }
    return this;
  }

  penaltyPayload(teamId: TeamId, inningsIndex: number, runs = 5): MatchEventInput {
    return { kind: 'penalty_awarded', teamId, inningsIndex, runs, reason: 'Law 41 penalty' };
  }

  penalty(teamId: TeamId, inningsIndex: number, runs = 5): this {
    return this.push(this.penaltyPayload(teamId, inningsIndex, runs));
  }

  revisePayload(inningsIndex: number, maxBalls: number, target: number | null = null, terminal = false): MatchEventInput {
    return { kind: 'overs_revised', inningsIndex, maxBalls, target, terminal, reason: 'Rain' };
  }

  revise(inningsIndex: number, maxBalls: number, target: number | null = null, terminal = false): this {
    return this.push(this.revisePayload(inningsIndex, maxBalls, target, terminal));
  }

  suspend(): this {
    return this.push({ kind: 'play_suspended', reason: 'rain', note: null });
  }

  resume(): this {
    return this.push({ kind: 'play_resumed' });
  }

  endPayload(outcome: MatchEndOutcome): MatchEventInput {
    return { kind: 'match_ended', outcome };
  }

  end(outcome: MatchEndOutcome = { type: 'natural' }): this {
    return this.push(this.endPayload(outcome));
  }

  superOver(round: number): this {
    return this.push({ kind: 'super_over_started', round });
  }

  private autoBowler(): void {
    const pending = this.state.pendingAction;
    if (pending === null || pending.type !== 'select_next_bowler') {
      return;
    }
    const innings = this.inn;
    const used = (id: PlayerId): number => innings.bowling.find((entry) => entry.playerId === id)?.oversUsed ?? 0;
    const preference = this.setup.players
      .filter((player) => player.teamId === innings.bowlingTeamId && !player.isSubstitute)
      .map((player) => player.playerId)
      .reverse();
    const choice = preference
      .filter((id) => pending.eligible.includes(id))
      .sort((a, b) => used(a) - used(b) || preference.indexOf(a) - preference.indexOf(b))[0];
    if (choice === undefined) {
      throw new Error('No eligible bowler');
    }
    this.bowl(choice);
  }
}

function setupFor(rules: Partial<MatchRules> = {}, overrides: MatchSetupOverrides = {}): MatchSetup {
  return matchSetup({ ...overrides, rules: { oversPerInnings: 5, maxOversPerBowler: null, powerplays: [], ...rules } });
}

function lionsBatting(setup: MatchSetup = setupFor(), bowlerId: PlayerId = 'T11'): Game {
  return new Game(setup).start(0, LIONS, 'L1', 'L2', bowlerId);
}

function tigersChase(g: Game, bowlerId: PlayerId = 'L11'): Game {
  return g.start(1, TIGERS, 'T1', 'T2', bowlerId);
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function expectBooksBalance(innings: InningsState): void {
  expect(total(innings.batting.map((entry) => entry.runs)) + innings.extras.total).toBe(innings.runs);
  expect(innings.extras.wides + innings.extras.noBalls + innings.extras.byes + innings.extras.legByes + innings.extras.penalty).toBe(
    innings.extras.total,
  );
  expect(total(innings.bowling.map((entry) => entry.runsConceded))).toBe(
    innings.runs - innings.extras.byes - innings.extras.legByes - innings.extras.penalty,
  );
  expect(total(innings.bowling.map((entry) => entry.legalBalls))).toBe(innings.legalBalls);
  expect(total(innings.batting.map((entry) => entry.balls))).toBe(innings.balls.filter((ball) => ball.isBallFaced).length);
  expect(innings.fallOfWickets).toHaveLength(innings.wickets);
  expect(total(innings.bowling.map((entry) => entry.wickets))).toBe(
    innings.fallOfWickets.filter((fow) => CREDITED.includes(fow.dismissalType)).length,
  );
}

function expectReplayMatches(g: Game): void {
  expect(replayMatch(g.setup, g.events)).toEqual(g.state);
}

const ALL_DISMISSALS: readonly DeliveryDismissalType[] = [
  'bowled',
  'caught',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
  'hit_ball_twice',
  'obstructing_field',
  'handled_ball',
];

const LEGAL_ON_CALL: Readonly<Record<'fair' | 'wide' | 'no_ball', readonly DeliveryDismissalType[]>> = {
  fair: ALL_DISMISSALS,
  wide: ['stumped', 'hit_wicket', 'run_out', 'obstructing_field', 'handled_ball'],
  no_ball: ['run_out', 'hit_ball_twice', 'obstructing_field', 'handled_ball'],
};

const LEGAL_ON_FREE_HIT: readonly DeliveryDismissalType[] = ['run_out', 'hit_ball_twice', 'obstructing_field', 'handled_ball'];

function wicketFor(type: DeliveryDismissalType, striker: PlayerId): WicketSpec {
  const needsEnd = type === 'run_out' || type === 'obstructing_field' || type === 'handled_ball';
  const fielderIds = type === 'caught' ? ['T5'] : type === 'stumped' ? ['T1'] : [];
  return { type, playerOutId: striker, fielderIds, dismissalEnd: needsEnd ? 'striker_end' : null };
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function tiedMainMatch(rules: Partial<MatchRules> = {}, lionsHits: readonly number[] = [1, 1, 1, 1, 1, 1]): Game {
  const g = lionsBatting(setupFor({ oversPerInnings: 1, ...rules }));
  g.hits(...lionsHits);
  tigersChase(g).hits(1, 1, 1, 1, 1, 1);
  return g;
}

function tiedFirstSuperOver(g: Game): Game {
  g.superOver(1);
  g.start(2, TIGERS, 'T1', 'T2', 'L10');
  g.wicketThenNext({ type: 'bowled' });
  g.hits(4).dots(4);
  g.start(3, LIONS, 'L1', 'L2', 'T10');
  g.hits(4).dots(5);
  return g;
}

function lionsThirtyInFive(): Game {
  const g = lionsBatting(setupFor({ oversPerInnings: 5 }));
  g.hits(...Array.from({ length: 30 }, () => 1));
  return g;
}

describe('Laws 21/22/25/32–39 — which dismissals a delivery can carry', () => {
  it('allowedDismissals matches the Laws for every call and for a free hit', () => {
    expect(sorted(allowedDismissals('fair', false))).toEqual(sorted(ALL_DISMISSALS));
    expect(sorted(allowedDismissals('wide', false))).toEqual(sorted(LEGAL_ON_CALL.wide));
    expect(sorted(allowedDismissals('no_ball', false))).toEqual(sorted(LEGAL_ON_CALL.no_ball));
    expect(sorted(allowedDismissals('fair', true))).toEqual(sorted(LEGAL_ON_FREE_HIT));
    expect(sorted(allowedDismissals('wide', true))).toEqual(sorted(['run_out', 'obstructing_field', 'handled_ball']));
    expect(sorted(allowedDismissals('no_ball', true))).toEqual(sorted(LEGAL_ON_FREE_HIT));
  });

  const calls = ['fair', 'wide', 'no_ball'] as const;
  const matrix = calls.flatMap((call) => ALL_DISMISSALS.map((type) => [call, type] as const));

  it.each(matrix)('a %s delivery carrying %s is accepted only when the Laws allow it', (call, type) => {
    const g = lionsBatting();
    const verdict = g.ballCode({ call, wicket: wicketFor(type, 'L1') });
    expect(verdict).toBe(LEGAL_ON_CALL[call].includes(type) ? 'OK' : 'DISMISSAL_NOT_ALLOWED_ON_CALL');
  });

  it.each(ALL_DISMISSALS)('on a free hit (fair call) %s is accepted only for the four free-hit modes', (type) => {
    const g = lionsBatting();
    g.ball({ call: 'no_ball' });
    expect(g.inn.isFreeHitNext).toBe(true);
    const verdict = g.ballCode({ wicket: wicketFor(type, 'L1') });
    expect(verdict).toBe(LEGAL_ON_FREE_HIT.includes(type) ? 'OK' : 'DISMISSAL_NOT_ALLOWED_ON_FREE_HIT');
  });

  it('a wide bowled as the free hit keeps the free hit and still forbids a stumping or hit wicket (EC-W-02, EC-SB-03)', () => {
    const g = lionsBatting();
    g.ball({ call: 'no_ball' });
    g.ball({ call: 'wide' });
    expect(g.lastBall.isFreeHit).toBe(true);
    expect(g.inn.isFreeHitNext).toBe(true);
    expect(g.ballCode({ call: 'wide', wicket: { type: 'stumped', fielderIds: ['T1'] } })).toBe('DISMISSAL_NOT_ALLOWED_ON_FREE_HIT');
    expect(g.ballCode({ call: 'wide', wicket: { type: 'hit_wicket' } })).toBe('DISMISSAL_NOT_ALLOWED_ON_FREE_HIT');
    expect(g.ballCode({ call: 'wide', wicket: { type: 'run_out', playerOutId: 'L2', dismissalEnd: 'non_striker_end' } })).toBe('OK');
    g.ball({ call: 'fair', runsTo: 'leg_bye', runsRun: 1 });
    expect(g.lastBall.isFreeHit).toBe(true);
    expect(g.inn.isFreeHitNext).toBe(false);
  });

  it('noBall.freeHit off means the ball after a no-ball is not a free hit (EC-SB-06)', () => {
    const g = lionsBatting(setupFor({ noBall: { ...BASE_MATCH_RULES.noBall, freeHit: false } }));
    g.ball({ call: 'no_ball' });
    expect(g.inn.isFreeHitNext).toBe(false);
    expect(g.ballCode({ wicket: { type: 'bowled' } })).toBe('OK');
  });
});

describe('extras combined with wickets — arithmetic, credit and ends', () => {
  it('stumped off a wide: 1 wide scored, not a ball, not faced, bowler credited and charged (EC-W-01)', () => {
    const g = lionsBatting();
    g.ball({ call: 'wide', wicket: { type: 'stumped', fielderIds: ['T1'] } });
    const inn = g.inn;
    expect(inn.runs).toBe(1);
    expect(inn.wickets).toBe(1);
    expect(inn.legalBalls).toBe(0);
    expect(inn.extras.wides).toBe(1);
    expect(g.lastBall.isLegal).toBe(false);
    expect(g.lastBall.isBallFaced).toBe(false);
    expect(g.lastBall.token.text).toBe('WD+W');
    expect(g.lastBall.label).toBe('0.1');
    const out = g.row('L1');
    expect(out.status).toBe('out');
    expect(out.balls).toBe(0);
    expect(out.strikeRate).toBeNull();
    expect(out.dismissalText).toBe('st Rizwan b Haris');
    const bowler = g.bowler('T11');
    expect(bowler.wickets).toBe(1);
    expect(bowler.runsConceded).toBe(1);
    expect(bowler.legalBalls).toBe(0);
    expect(bowler.wideDeliveries).toBe(1);
    expect(inn.fallOfWickets[0]).toMatchObject({ wicketNumber: 1, playerOutId: 'L1', teamRuns: 1, legalBalls: 0, overLabel: '0.1' });
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'striker' });
    expectBooksBalance(inn);
  });

  it('hit wicket off a wide is credited to the bowler (Law 35.1)', () => {
    const g = lionsBatting();
    g.ball({ call: 'wide', wicket: { type: 'hit_wicket' } });
    expect(g.row('L1').dismissalText).toBe('hit wicket b Haris');
    expect(g.bowler('T11').wickets).toBe(1);
    expect(g.inn.runs).toBe(1);
  });

  it('run out off a no-ball after one run off the bat: runner out at the striker end, not-out batter at the other end, free hit next (EC-W-03)', () => {
    const g = lionsBatting();
    g.ball({ call: 'no_ball', runsRun: 1, wicket: { type: 'run_out', playerOutId: 'L2', fielderIds: ['T5', 'T1'], dismissalEnd: 'striker_end' } });
    const inn = g.inn;
    expect(inn.runs).toBe(2);
    expect(inn.extras.noBalls).toBe(1);
    expect(inn.legalBalls).toBe(0);
    expect(inn.wickets).toBe(1);
    expect(g.row('L1')).toMatchObject({ runs: 1, balls: 1, status: 'not_out' });
    expect(g.row('L2')).toMatchObject({ runs: 0, balls: 0, status: 'out', dismissalText: 'run out (Azam/Rizwan)' });
    expect(g.bowler('T11')).toMatchObject({ wickets: 0, runsConceded: 2, legalBalls: 0, noBallDeliveries: 1 });
    expect(g.lastBall.token.text).toBe('NB+1+W');
    expect(inn.strikerId).toBeNull();
    expect(inn.nonStrikerId).toBe('L1');
    expect(inn.isFreeHitNext).toBe(true);
    g.nextBatter();
    expect(g.inn.strikerId).toBe('L3');
    g.ball();
    expect(g.lastBall.isFreeHit).toBe(true);
    expect(g.lastBall.strikerId).toBe('L3');
    expectBooksBalance(g.inn);
  });

  it('run out off a wide after one completed run: both runs are wides, the striker faced nothing', () => {
    const g = lionsBatting();
    g.ball({ call: 'wide', runsRun: 1, wicket: { type: 'run_out', playerOutId: 'L1', dismissalEnd: 'striker_end' } });
    const inn = g.inn;
    expect(inn.extras.wides).toBe(2);
    expect(inn.runs).toBe(2);
    expect(inn.legalBalls).toBe(0);
    expect(g.row('L1')).toMatchObject({ status: 'out', balls: 0, runs: 0 });
    expect(g.bowler('T11')).toMatchObject({ wickets: 0, runsConceded: 2 });
    expect(inn.strikerId).toBeNull();
    expect(inn.nonStrikerId).toBe('L2');
    expect(g.lastBall.token.text).toBe('WD+1+W');
    expectBooksBalance(inn);
  });

  it('two leg-byes then the striker run out at the non-striker end: bowler dot, not-out batter keeps strike', () => {
    const g = lionsBatting();
    g.ball({ runsTo: 'leg_bye', runsRun: 2, wicket: { type: 'run_out', playerOutId: 'L1', dismissalEnd: 'non_striker_end' } });
    const inn = g.inn;
    expect(inn.extras.legByes).toBe(2);
    expect(inn.runs).toBe(2);
    expect(inn.legalBalls).toBe(1);
    expect(g.row('L1')).toMatchObject({ balls: 1, runs: 0, status: 'out' });
    expect(g.bowler('T11')).toMatchObject({ runsConceded: 0, dots: 1, wickets: 0, legalBalls: 1 });
    expect(inn.strikerId).toBe('L2');
    expect(inn.nonStrikerId).toBeNull();
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'non_striker' });
    expectBooksBalance(inn);
  });

  it('hit the ball twice off a no-ball: striker out, not credited to the bowler, the no-ball was faced', () => {
    const g = lionsBatting();
    g.ball({ call: 'no_ball', wicket: { type: 'hit_ball_twice' } });
    expect(g.row('L1')).toMatchObject({ status: 'out', balls: 1, dismissalText: 'hit the ball twice' });
    expect(g.bowler('T11')).toMatchObject({ wickets: 0, runsConceded: 1 });
    expect(g.inn.isFreeHitNext).toBe(true);
    expect(g.inn.strikerId).toBeNull();
  });

  it('non-striker obstructing the field on a wide: wide scored, vacancy at the non-striker end, no bowler credit', () => {
    const g = lionsBatting();
    g.ball({ call: 'wide', wicket: { type: 'obstructing_field', playerOutId: 'L2', dismissalEnd: 'non_striker_end' } });
    expect(g.inn.runs).toBe(1);
    expect(g.inn.strikerId).toBe('L1');
    expect(g.inn.nonStrikerId).toBeNull();
    expect(g.row('L2').dismissalText).toBe('obstructing the field');
    expect(g.bowler('T11').wickets).toBe(0);
  });

  it('handled the ball needs a dismissal end; caught forbids one; run out needs one (EC-W-10, EC-W-19)', () => {
    const g = lionsBatting();
    expect(g.ballCode({ call: 'no_ball', wicket: { type: 'handled_ball', playerOutId: 'L1', dismissalEnd: null } })).toBe('DISMISSAL_END_REQUIRED');
    expect(g.ballCode({ runsRun: 1, wicket: { type: 'run_out', playerOutId: 'L2', dismissalEnd: null } })).toBe('DISMISSAL_END_REQUIRED');
    expect(g.ballCode({ wicket: { type: 'caught', fielderIds: ['T5'], dismissalEnd: 'striker_end' } })).toBe('DISMISSAL_END_NOT_ALLOWED');
    g.ball({ call: 'no_ball', wicket: { type: 'handled_ball', playerOutId: 'L1', dismissalEnd: 'striker_end' } });
    expect(g.row('L1').dismissalText).toBe('handled the ball');
    expect(g.bowler('T11').wickets).toBe(0);
  });

  it('striker-only dismissals refuse runs and refuse the non-striker as the player out (EC-W-11)', () => {
    const g = lionsBatting();
    expect(g.ballCode({ runsRun: 1, wicket: { type: 'bowled' } })).toBe('RUNS_NOT_ALLOWED_WITH_DISMISSAL');
    expect(g.ballCode({ boundary: 6, wicket: { type: 'caught', fielderIds: ['T5'] } })).toBe('RUNS_NOT_ALLOWED_WITH_DISMISSAL');
    expect(g.ballCode({ call: 'wide', runsRun: 1, wicket: { type: 'stumped', fielderIds: ['T1'] } })).toBe('RUNS_NOT_ALLOWED_WITH_DISMISSAL');
    expect(g.ballCode({ wicket: { type: 'caught', playerOutId: 'L2', fielderIds: ['T5'] } })).toBe('DISMISSED_PLAYER_NOT_AT_CREASE');
    expect(g.ballCode({ wicket: { type: 'lbw', playerOutId: 'L2' } })).toBe('DISMISSED_PLAYER_NOT_AT_CREASE');
    expect(g.ballCode({ wicket: { type: 'run_out', playerOutId: 'L5', dismissalEnd: 'striker_end' } })).toBe('DISMISSED_PLAYER_NOT_AT_CREASE');
  });

  it('fielders: substitute may catch, a batting-side player may not, at most two, catcher unknown warns (EC-W-07/08/09)', () => {
    const g = lionsBatting();
    expect(g.ballCode({ wicket: { type: 'caught', fielderIds: ['L5'] } })).toBe('FIELDER_NOT_IN_FIELDING_SIDE');
    expect(g.ballCode({ runsRun: 1, wicket: { type: 'run_out', playerOutId: 'L2', dismissalEnd: 'striker_end', fielderIds: ['T5', 'T1', 'T3'] } })).toBe(
      'TOO_MANY_FIELDERS',
    );
    const unknown = g.check(g.delivery({ wicket: { type: 'caught', fielderIds: [] } }));
    expect(unknown.ok).toBe(true);
    expect(unknown.ok ? unknown.warnings.map((warning) => warning.code) : []).toContain('FIELDER_UNKNOWN');
    g.ball({ wicket: { type: 'caught', fielderIds: ['T12'] } });
    expect(g.row('L1').dismissalText).toBe('c sub (Ali) b Haris');
    expect(g.inn.batting.some((entry) => entry.playerId === 'T12')).toBe(false);
    g.nextBatter();
    g.ball({ wicket: { type: 'caught', fielderIds: ['T11'] } });
    expect(g.row('L3').dismissalText).toBe('c & b Haris');
    g.nextBatter();
    g.ball({ wicket: { type: 'caught', fielderIds: [] } });
    expect(g.row('L4').dismissalText).toBe('c ? b Haris');
    expect(g.bowler('T11').wickets).toBe(3);
  });

  it('a whole over with every extra and a free hit balances the books to the run (hand-scored)', () => {
    const g = lionsBatting();
    g.ball({ call: 'no_ball', runsTo: 'bye', runsRun: 2 });
    g.ball({ runsTo: 'leg_bye', runsRun: 1 });
    g.ball({ call: 'no_ball', runsRun: 1, boundary: 4 });
    g.ball({ call: 'wide', boundary: 4 });
    g.ball({ boundary: 6 });
    g.ball({ runsTo: 'bye', boundary: 4 });
    g.ball();
    g.ball({ runsRun: 3, shortRuns: 1 });
    g.ball({ runsRun: 1 });
    const inn = g.inn;
    expect(inn.runs).toBe(28);
    expect(inn.legalBalls).toBe(6);
    expect(inn.extras).toEqual({ wides: 5, noBalls: 2, byes: 6, legByes: 1, penalty: 0, total: 14 });
    expect(g.row('L1')).toMatchObject({ runs: 8, balls: 6, fours: 0, sixes: 1, dots: 4 });
    expect(g.row('L2')).toMatchObject({ runs: 6, balls: 2, fours: 0, sixes: 0 });
    expect(g.bowler('T11')).toMatchObject({
      legalBalls: 6,
      runsConceded: 21,
      wideDeliveries: 1,
      noBallDeliveries: 2,
      dots: 3,
      maidens: 0,
      sixesConceded: 1,
      foursConceded: 0,
    });
    expect(inn.balls.map((ball) => ball.label)).toEqual(['0.1', '0.1', '0.2', '0.2', '0.2', '0.3', '0.4', '0.5', '0.6']);
    expect(inn.balls.map((ball) => ball.deliveryInOver)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(inn.balls.map((ball) => ball.isFreeHit)).toEqual([false, true, false, true, true, false, false, false, false]);
    expect(inn.balls.map((ball) => ball.token.text)).toEqual(['NB+2B', 'LB1', 'NB+5', 'WD+4', '6', 'B4', '0', '2s', '1']);
    expect(inn.balls.map((ball) => ball.bowlerRuns)).toEqual([1, 0, 6, 5, 6, 0, 0, 2, 1]);
    expect(inn.overs[0]).toMatchObject({ runs: 28, bowlerRuns: 21, extras: 14, legalBalls: 6, isComplete: true, isMaiden: false });
    expect(inn.strikerId).toBe('L2');
    expect(inn.nonStrikerId).toBe('L1');
    expect(g.state.currentRunRate).toBe(28);
    expect(g.state.pendingAction?.type).toBe('select_next_bowler');
    const partnership = inn.currentPartnership;
    expect(partnership).not.toBeNull();
    expect(partnership === null ? null : partnership.runs).toBe(28);
    expect(partnership === null ? null : partnership.extras).toBe(14);
    expect(partnership === null ? null : partnership.batterARuns + partnership.batterBRuns).toBe(14);
    expectBooksBalance(inn);
    expectReplayMatches(g);
  });
});

describe('Law 18 — strike after a delivery', () => {
  const rows: readonly (readonly [string, BallSpec, PlayerId, number, number, number, boolean])[] = [
    ['one run', { runsRun: 1 }, 'L2', 1, 1, 1, true],
    ['ran two, one short', { runsRun: 2, shortRuns: 1 }, 'L1', 1, 1, 1, true],
    ['ran three, one short', { runsRun: 3, shortRuns: 1 }, 'L2', 2, 2, 2, true],
    ['one plus four overthrows', { runsRun: 1, boundary: 4 }, 'L2', 5, 5, 5, true],
    ['four', { boundary: 4 }, 'L1', 4, 4, 4, true],
    ['all-run four', { runsRun: 4 }, 'L1', 4, 4, 4, true],
    ['wide plus one', { call: 'wide', runsRun: 1 }, 'L2', 0, 2, 2, false],
    ['wide plus two', { call: 'wide', runsRun: 2 }, 'L1', 0, 3, 3, false],
    ['no-ball plus two byes', { call: 'no_ball', runsTo: 'bye', runsRun: 2 }, 'L1', 0, 3, 1, false],
    ['no-ball plus one leg-bye', { call: 'no_ball', runsTo: 'leg_bye', runsRun: 1 }, 'L2', 0, 2, 1, false],
    ['three byes', { runsTo: 'bye', runsRun: 3 }, 'L2', 0, 3, 0, true],
    ['four leg-byes', { runsTo: 'leg_bye', boundary: 4 }, 'L1', 0, 4, 0, true],
    ['no-ball hit for six', { call: 'no_ball', boundary: 6 }, 'L1', 6, 7, 7, false],
  ];

  it.each(rows)('%s', (_label, spec, nextStriker, batterRuns, teamRuns, bowlerRuns, legal) => {
    const g = lionsBatting();
    g.ball(spec);
    expect(g.inn.strikerId).toBe(nextStriker);
    expect(g.row('L1').runs).toBe(batterRuns);
    expect(g.inn.runs).toBe(teamRuns);
    expect(g.lastBall.bowlerRuns).toBe(bowlerRuns);
    expect(g.lastBall.isLegal).toBe(legal);
    expect(g.row('L1').fours).toBe(spec.boundary === 4 && spec.runsRun === undefined && (spec.runsTo ?? 'bat') === 'bat' && spec.call === undefined ? 1 : 0);
    expectBooksBalance(g.inn);
  });

  it('a single off the last ball keeps the same batter on strike for the next over (EC-SB-01)', () => {
    const g = lionsBatting();
    g.dots(5).hits(1);
    expect(g.inn.strikerId).toBe('L1');
    expect(g.inn.nonStrikerId).toBe('L2');
  });

  it('caught off the last ball: the not-out batter faces the next over, the new batter goes to the non-striker end (Law 18.11, EC-W-05)', () => {
    const g = lionsBatting();
    g.dots(5).ball({ wicket: { type: 'caught', fielderIds: ['T5'] } });
    expect(g.inn.strikerId).toBe('L2');
    expect(g.inn.nonStrikerId).toBeNull();
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'non_striker' });
    g.nextBatter();
    expect(g.inn.nonStrikerId).toBe('L3');
    expect(g.state.pendingAction?.type).toBe('select_next_bowler');
  });

  it('caught mid-over: the new batter faces the next ball (EC-W-06)', () => {
    const g = lionsBatting();
    g.dots(2).ball({ wicket: { type: 'caught', fielderIds: ['T5'] } });
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'striker' });
    g.nextBatter();
    expect(g.inn.strikerId).toBe('L3');
    expect(g.inn.nonStrikerId).toBe('L2');
  });

  it('crossed but not completed, the striker run out at the non-striker end: the non-striker faces next', () => {
    const g = lionsBatting();
    g.ball({ wicket: { type: 'run_out', playerOutId: 'L1', dismissalEnd: 'non_striker_end' } });
    expect(g.inn.strikerId).toBe('L2');
    expect(g.inn.nonStrikerId).toBeNull();
    expect(g.inn.runs).toBe(0);
  });

  it('run out going for the second off the last ball: the run counts, the over-end swap puts the not-out batter on strike', () => {
    const g = lionsBatting();
    g.dots(5).ball({ runsRun: 1, wicket: { type: 'run_out', playerOutId: 'L2', dismissalEnd: 'striker_end' } });
    expect(g.inn.runs).toBe(1);
    expect(g.row('L1').runs).toBe(1);
    expect(g.inn.strikerId).toBe('L1');
    expect(g.inn.nonStrikerId).toBeNull();
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'non_striker' });
    expect(g.inn.fallOfWickets[0]).toMatchObject({ teamRuns: 1, legalBalls: 6, overLabel: '0.6' });
  });

  it('manual strike swap between deliveries exchanges the batters (BR-SF-04)', () => {
    const g = lionsBatting();
    g.push({ kind: 'strike_swapped' });
    expect(g.inn.strikerId).toBe('L2');
    expect(g.inn.nonStrikerId).toBe('L1');
  });
});

describe('Laws 38/40 — off-ball dismissals', () => {
  it('non-striker run out backing up: a wicket with no ball counted, no bowler credit, FoW at the last legal ball (EC-W-12)', () => {
    const g = lionsBatting();
    g.dots(2);
    g.push({ kind: 'batter_dismissed', playerId: 'L2', type: 'run_out', fielderIds: ['T11'] });
    const inn = g.inn;
    expect(inn.wickets).toBe(1);
    expect(inn.legalBalls).toBe(2);
    expect(inn.balls).toHaveLength(2);
    expect(inn.fallOfWickets[0]).toMatchObject({ wicketNumber: 1, playerOutId: 'L2', overLabel: '0.2', teamRuns: 0 });
    expect(g.row('L2').dismissal?.onDelivery).toBe(false);
    expect(g.bowler('T11')).toMatchObject({ wickets: 0, legalBalls: 2 });
    expect(inn.strikerId).toBe('L1');
    expect(inn.nonStrikerId).toBeNull();
    expectBooksBalance(inn);
  });

  it('timed out names the incoming batter, counts as a wicket, and leaves the vacancy open (EC-W-13)', () => {
    const g = lionsBatting();
    g.ball({ wicket: { type: 'bowled' } });
    expect(g.code({ kind: 'batter_dismissed', playerId: 'L2', type: 'timed_out', fielderIds: [] })).toBe('BATTER_ALREADY_BATTING');
    g.push({ kind: 'batter_dismissed', playerId: 'L3', type: 'timed_out', fielderIds: [] });
    expect(g.inn.wickets).toBe(2);
    expect(g.row('L3')).toMatchObject({ status: 'out', dismissalText: 'timed out', balls: 0 });
    expect(g.bowler('T11').wickets).toBe(1);
    const pending = g.state.pendingAction;
    expect(pending).toMatchObject({ type: 'select_next_batter', position: 'striker' });
    expect(pending !== null && pending.type === 'select_next_batter' ? pending.candidates[0] : null).toBe('L4');
    expect(pending !== null && pending.type === 'select_next_batter' ? pending.candidates.includes('L3') : true).toBe(false);
    g.nextBatter();
    expect(g.code({ kind: 'batter_dismissed', playerId: 'L5', type: 'timed_out', fielderIds: [] })).toBe('NO_VACANCY');
  });
});

describe('Law 17 / maidens', () => {
  it('six dots by one bowler is a maiden: 1-1-0-0', () => {
    const g = lionsBatting();
    g.dots(6);
    expect(g.inn.overs[0].isMaiden).toBe(true);
    expect(formatBowlingFigures(g.bowler('T11'), 6)).toBe('1-1-0-0');
  });

  it('byes and leg-byes do not spoil a maiden (EC-D-16)', () => {
    const g = lionsBatting();
    g.dots(2).ball({ runsTo: 'leg_bye', runsRun: 1 }).ball({ runsTo: 'bye', boundary: 4 }).dots(2);
    expect(g.inn.overs[0]).toMatchObject({ runs: 5, bowlerRuns: 0, isMaiden: true });
    expect(g.bowler('T11')).toMatchObject({ maidens: 1, runsConceded: 0, dots: 6 });
  });

  it('a wicket maiden reads 1-1-0-1', () => {
    const g = lionsBatting();
    g.dots(5).ball({ wicket: { type: 'bowled' } });
    expect(g.inn.overs[0].isMaiden).toBe(true);
    expect(formatBowlingFigures(g.bowler('T11'), 6)).toBe('1-1-0-1');
  });

  it('a wide in an otherwise run-less over breaks the maiden (EC-D-17)', () => {
    const g = lionsBatting();
    g.ball({ call: 'wide' }).dots(6);
    expect(g.inn.overs[0]).toMatchObject({ isMaiden: false, legalBalls: 6, bowlerRuns: 1 });
    expect(formatBowlingFigures(g.bowler('T11'), 6)).toBe('1-0-1-0');
  });

  it('a no-ball whose runs are byes still breaks the maiden (the no-ball penalty is charged)', () => {
    const g = lionsBatting();
    g.ball({ call: 'no_ball', runsTo: 'bye', runsRun: 2 }).dots(6);
    expect(g.inn.overs[0].isMaiden).toBe(false);
    expect(g.bowler('T11')).toMatchObject({ runsConceded: 1, maidens: 0 });
  });

  it('an over split by an injury replacement is nobody’s maiden, both bowl their part (EC-SB-08, BR-BW-05)', () => {
    const g = lionsBatting();
    g.dots(3).bowl('T10', 'injury').dots(3);
    expect(g.inn.overs[0]).toMatchObject({ isMaiden: false, isComplete: true, bowlerIds: ['T11', 'T10'] });
    expect(g.bowler('T11')).toMatchObject({ legalBalls: 3, oversUsed: 1, maidens: 0 });
    expect(g.bowler('T10')).toMatchObject({ legalBalls: 3, oversUsed: 1, maidens: 0 });
  });

  it('an incomplete over (declaration after 5 dots) is never a maiden', () => {
    const g = lionsBatting();
    g.dots(5);
    g.push({ kind: 'innings_ended', reason: 'declared', absentees: [] });
    expect(g.at(0).completion?.reason).toBe('declared');
    expect(g.at(0).overs[0]).toMatchObject({ isComplete: false, isMaiden: false });
    expect(g.bowler('T11', 0).maidens).toBe(0);
    expect(formatBowlingFigures(g.bowler('T11', 0), 6)).toBe('0.5-0-0-0');
  });
});

describe('Law 17.6 / bowler changes and quotas', () => {
  it('the same bowler cannot bowl consecutive overs unless the rules allow it (EC-SB-07)', () => {
    const g = lionsBatting();
    g.dots(6);
    const pending = g.state.pendingAction;
    expect(pending !== null && pending.type === 'select_next_bowler' ? pending.ineligible : []).toContainEqual({
      playerId: 'T11',
      reason: 'bowled_previous_over',
    });
    expect(g.code(g.bowlPayload('T11'))).toBe('BOWLER_CONSECUTIVE_OVERS');
    const relaxed = lionsBatting(setupFor({ allowBowlerConsecutiveOvers: true }));
    relaxed.dots(6);
    expect(relaxed.code(relaxed.bowlPayload('T11'))).toBe('OK');
  });

  it('mid-over injury: both bowlers of the split over sit out the next over, the injured one may bowl later', () => {
    const g = lionsBatting();
    g.dots(3);
    expect(g.code(g.bowlPayload('T10', 'over_start'))).toBe('BOWLER_CHANGE_REASON_INVALID');
    g.bowl('T10', 'injury');
    expect(g.code(g.bowlPayload('T11', 'injury'))).toBe('BOWLER_ALREADY_REPLACED');
    g.dots(3);
    expect(g.code(g.bowlPayload('T9', 'injury'))).toBe('BOWLER_CHANGE_REASON_INVALID');
    expect(g.code(g.bowlPayload('T11'))).toBe('BOWLER_CONSECUTIVE_OVERS');
    expect(g.code(g.bowlPayload('T10'))).toBe('BOWLER_CONSECUTIVE_OVERS');
    g.bowl('T9').dots(6);
    expect(g.code(g.bowlPayload('T11'))).toBe('OK');
  });

  it('a bowler replaced as suspended (Law 41) is removed from the attack for the rest of the innings (EC-SB-09)', () => {
    const g = lionsBatting();
    g.dots(2).bowl('T10', 'suspended').dots(4);
    expect(g.inn.removedBowlerIds).toEqual(['T11']);
    g.bowl('T9').dots(6);
    expect(g.code(g.bowlPayload('T11'))).toBe('BOWLER_REMOVED_FROM_ATTACK');
    expect(bowlerEligibility(g.setup, g.state).ineligible).toContainEqual({ playerId: 'T11', reason: 'removed_from_attack' });
  });

  it('uniform quota: last-over warning then quota reached', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 5, maxOversPerBowler: 2 }));
    g.dots(6).bowl('T10').dots(6);
    const lastOver = g.check(g.bowlPayload('T11'));
    expect(lastOver.ok).toBe(true);
    expect(lastOver.ok ? lastOver.warnings.map((warning) => warning.code) : []).toContain('BOWLER_QUOTA_LAST_OVER');
    g.bowl('T11').dots(6).bowl('T10').dots(6);
    expect(g.code(g.bowlPayload('T11'))).toBe('BOWLER_QUOTA_REACHED');
    expect(bowlerEligibility(g.setup, g.state).ineligible).toContainEqual({ playerId: 'T11', reason: 'quota_reached' });
  });

  it('a part-over from a mid-over replacement uses a whole over of quota for both bowlers', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 5, maxOversPerBowler: 1 }));
    g.dots(3).bowl('T10', 'injury').dots(3);
    g.bowl('T9').dots(6);
    expect(g.code(g.bowlPayload('T11'))).toBe('BOWLER_QUOTA_REACHED');
    expect(g.code(g.bowlPayload('T10'))).toBe('BOWLER_QUOTA_REACHED');
    const ineligible = bowlerEligibility(g.setup, g.state).ineligible;
    expect(ineligible).toContainEqual({ playerId: 'T11', reason: 'quota_reached' });
    expect(ineligible).toContainEqual({ playerId: 'T10', reason: 'quota_reached' });
  });

  it('icc_one_fifth with 17 overs: 3 overs each, only two bowlers may take a 4th (EC-SB-13)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 17, bowlerQuotaMode: 'icc_one_fifth' }));
    expect(g.inn.limits).toMatchObject({ maxOversPerBowler: 3, extraOverBowlers: 2 });
    const order = ['T11', 'T10', 'T11', 'T10', 'T11', 'T10', 'T11', 'T10', 'T9', 'T8', 'T9', 'T8', 'T9', 'T8', 'T7'];
    order.forEach((bowlerId, index) => {
      if (index > 0) {
        g.bowl(bowlerId);
      }
      g.dots(6);
    });
    expect(g.bowler('T11').oversUsed).toBe(4);
    expect(g.bowler('T10').oversUsed).toBe(4);
    expect(g.bowler('T9').oversUsed).toBe(3);
    expect(g.code(g.bowlPayload('T9'))).toBe('BOWLER_QUOTA_REACHED');
    expect(g.code(g.bowlPayload('T11'))).toBe('BOWLER_QUOTA_REACHED');
    const ineligible = bowlerEligibility(g.setup, g.state).ineligible;
    expect(ineligible).toContainEqual({ playerId: 'T9', reason: 'quota_reached' });
    expect(ineligible).toContainEqual({ playerId: 'T8', reason: 'quota_reached' });
    expect(g.code(g.bowlPayload('T6'))).toBe('OK');
  });

  it('icc_one_fifth quota is recomputed after an overs revision 20 → 13 (EC-SB-14)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 20, bowlerQuotaMode: 'icc_one_fifth' }));
    expect(g.inn.limits).toMatchObject({ maxOversPerBowler: 4, extraOverBowlers: 0 });
    g.dots(6);
    g.revise(0, 78);
    expect(g.inn.limits).toMatchObject({ maxBalls: 78, maxOversPerBowler: 2, extraOverBowlers: 3 });
  });

  it('substitute fielders never bowl and are never listed as candidates (EC-SB-15)', () => {
    const g = lionsBatting();
    g.dots(6);
    expect(g.code(g.bowlPayload('T12'))).toBe('SUBSTITUTE_NOT_ALLOWED');
    const eligibility = bowlerEligibility(g.setup, g.state);
    expect(eligibility.eligible).not.toContain('T12');
    expect(eligibility.ineligible.map((entry) => entry.playerId)).not.toContain('T12');
    expect(g.code(g.startPayload(0, LIONS, 'L1', 'L2', 'T12'))).not.toBe('OK');
  });

  it('a delivery with no bowler selected at the over start, or with a vacancy open, is refused as a pending action (U-VAL-05)', () => {
    const g = lionsBatting();
    g.dots(6);
    expect(g.code(g.delivery())).toBe('PENDING_ACTION_REQUIRED');
    g.bowl('T10').ball({ wicket: { type: 'bowled' } });
    expect(g.code(g.delivery())).toBe('PENDING_ACTION_REQUIRED');
  });

  it('one-ball overs force bowlers to alternate (EC-D-22)', () => {
    const g = lionsBatting(setupFor({ ballsPerOver: 1, oversPerInnings: 6 }));
    g.ball();
    expect(g.inn.legalBalls).toBe(1);
    expect(g.state.pendingAction?.type).toBe('select_next_bowler');
    expect(g.code(g.bowlPayload('T11'))).toBe('BOWLER_CONSECUTIVE_OVERS');
    g.bowl('T10').ball();
    expect(g.code(g.bowlPayload('T11'))).toBe('OK');
  });
});

describe('over structure — re-bowls, counting variants and odd over lengths', () => {
  it('a wide after two legal balls is x.3 and so is the next ball (EC-D-23)', () => {
    const g = lionsBatting();
    g.dots(2).ball({ call: 'wide' }).ball();
    expect(g.inn.balls.map((ball) => ball.label)).toEqual(['0.1', '0.2', '0.3', '0.3']);
    expect(g.inn.balls.map((ball) => ball.deliveryInOver)).toEqual([1, 2, 3, 4]);
  });

  it('a no-ball on the sixth scheduled ball is re-bowled as a free hit in the same over (EC-D-20)', () => {
    const g = lionsBatting();
    g.dots(5).ball({ call: 'no_ball' });
    expect(g.inn.legalBalls).toBe(5);
    expect(g.inn.bowlerId).toBe('T11');
    expect(g.state.pendingAction).toBeNull();
    g.ball();
    expect(g.lastBall).toMatchObject({ label: '0.6', isFreeHit: true, endsOver: true, bowlerId: 'T11' });
  });

  it('wide counting as a ball on the sixth ball ends the over but is still not a ball faced (EC-D-09)', () => {
    const g = lionsBatting(setupFor({ wide: { penaltyRuns: 1, countsAsBall: true } }));
    g.dots(5).ball({ call: 'wide' });
    expect(g.inn.legalBalls).toBe(6);
    expect(g.lastBall).toMatchObject({ isLegal: true, isBallFaced: false, endsOver: true });
    expect(g.row('L1').balls).toBe(5);
    expect(g.inn.strikerId).toBe('L2');
    expect(g.state.pendingAction?.type).toBe('select_next_bowler');
  });

  it('a counted no-ball that ends the over still makes the first ball of the next over a free hit', () => {
    const g = lionsBatting(setupFor({ noBall: { penaltyRuns: 1, freeHit: true, countsAsBall: true } }));
    g.dots(5).ball({ call: 'no_ball' });
    expect(g.inn.legalBalls).toBe(6);
    expect(g.inn.isFreeHitNext).toBe(true);
    g.bowl('T10');
    expect(g.code(g.delivery({ wicket: { type: 'bowled' } }))).toBe('DISMISSAL_NOT_ALLOWED_ON_FREE_HIT');
    g.ball();
    expect(g.lastBall.isFreeHit).toBe(true);
  });

  it('a gully zero-run wide is still a wide: no runs, re-bowled, shown as WD (EC-D-08)', () => {
    const g = lionsBatting(setupFor({ wide: { penaltyRuns: 0, countsAsBall: false } }));
    g.ball({ call: 'wide' });
    expect(g.inn.runs).toBe(0);
    expect(g.inn.legalBalls).toBe(0);
    expect(g.lastBall).toMatchObject({ isLegal: false, call: 'wide' });
    expect(g.lastBall.token.text).toBe('WD');
  });

  it('eight-ball overs: numbering to x.8, overs notation and economy per eight balls (EC-D-21)', () => {
    const g = lionsBatting(setupFor({ ballsPerOver: 8 }));
    g.dots(7).hits(4);
    expect(g.lastBall).toMatchObject({ label: '0.8', endsOver: true });
    expect(g.bowler('T11').economy).toBe(4);
    expect(formatOvers(10, 8)).toBe('1.2');
    expect(formatBowlingFigures(g.bowler('T11'), 8)).toBe('1-0-4-0');
  });

  it('six off a bye, leg-bye or wide is impossible; 10 runs run is invalid; 7 run warns (EC-D-14/18/19)', () => {
    const g = lionsBatting();
    expect(g.ballCode({ runsTo: 'bye', boundary: 6 })).toBe('SIX_NOT_OFF_BAT');
    expect(g.ballCode({ runsTo: 'leg_bye', boundary: 6 })).toBe('SIX_NOT_OFF_BAT');
    expect(g.ballCode({ call: 'wide', boundary: 6 })).toBe('SIX_NOT_OFF_BAT');
    expect(g.ballCode({ call: 'no_ball', runsTo: 'bye', boundary: 6 })).toBe('SIX_NOT_OFF_BAT');
    expect(g.ballCode({ runsRun: 10 })).toBe('INVALID_RUNS');
    expect(g.ballCode({ runsRun: 1, shortRuns: 2 })).toBe('INVALID_SHORT_RUNS');
    const lost = g.check(g.delivery({ runsRun: 7 }));
    expect(lost.ok ? lost.warnings.map((warning) => warning.code) : ['rejected']).toContain('UNUSUAL_RUNS');
    const overthrow = g.check(g.delivery({ runsRun: 1, boundary: 4 }));
    expect(overthrow.ok ? overthrow.warnings.map((warning) => warning.code) : ['rejected']).not.toContain('UNUSUAL_RUNS');
  });
});

describe('Law 16 / all out, last man stands and uneven sides', () => {
  it('11-a-side is all out at 10 wickets with no prompt for an 11th batter (EC-W-14)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 20 }));
    for (let wicket = 1; wicket <= 10; wicket += 1) {
      g.wicketThenNext({ type: 'bowled' });
    }
    const inn = g.at(0);
    expect(inn.status).toBe('complete');
    expect(inn.completion?.reason).toBe('all_out');
    expect(inn.wickets).toBe(10);
    expect(inn.legalBalls).toBe(10);
    expect(g.row('L8', 0).status).toBe('not_out');
    expect(g.row('L11', 0).status).toBe('out');
    expect(g.state.pendingAction).toMatchObject({ type: 'start_next_innings', inningsIndex: 1, suggestedBattingTeamId: TIGERS });
  });

  it('last man stands: the survivor bats alone, keeps strike through odd runs and over ends, and the 8th wicket is all out (EC-B-06)', () => {
    const g = lionsBatting(setupFor({ playersPerSide: 8, lastManStands: true }));
    expect(g.inn.limits.maxWickets).toBe(8);
    for (let wicket = 1; wicket <= 6; wicket += 1) {
      g.wicketThenNext({ type: 'bowled' });
    }
    expect(g.inn.strikerId).toBe('L2');
    expect(g.inn.nonStrikerId).toBe('L8');
    g.ball({ wicket: { type: 'bowled' } });
    expect(g.inn.wickets).toBe(7);
    expect(g.inn.status).toBe('in_progress');
    expect(g.inn.strikerId).toBe('L8');
    expect(g.inn.nonStrikerId).toBeNull();
    expect(g.state.pendingAction).toBeNull();
    expect(g.state.canRecordDelivery).toBe(true);
    expect(g.inn.currentPartnership?.batterBId ?? null).toBeNull();
    expect(g.code({ kind: 'strike_swapped' })).toBe('NOTHING_TO_SWAP');
    g.hits(1);
    expect(g.inn.strikerId).toBe('L8');
    expect(g.lastBall.nonStrikerId).toBeNull();
    g.dots(3).hits(1);
    expect(g.inn.legalBalls).toBe(12);
    expect(g.inn.strikerId).toBe('L8');
    expect(g.inn.nonStrikerId).toBeNull();
    g.ball({ runsRun: 1, wicket: { type: 'run_out', playerOutId: 'L8', dismissalEnd: 'non_striker_end' } });
    const inn = g.at(0);
    expect(inn.wickets).toBe(8);
    expect(inn.runs).toBe(3);
    expect(inn.completion?.reason).toBe('all_out');
    expectBooksBalance(inn);
    expectReplayMatches(g);
  });

  it('last man stands chase won by the lone batter is "won by 1 wicket"', () => {
    const g = lionsBatting(setupFor({ playersPerSide: 8, lastManStands: true, oversPerInnings: 2 }));
    g.dots(12);
    tigersChase(g);
    for (let wicket = 1; wicket <= 7; wicket += 1) {
      g.wicketThenNext({ type: 'bowled' });
    }
    expect(g.inn.nonStrikerId).toBeNull();
    g.hits(1);
    expect(g.state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: TIGERS,
      loserTeamId: LIONS,
      margin: { kind: 'wickets', wickets: 1, ballsRemaining: 4 },
      method: 'normal',
    });
    expect(g.state.resultText).toBe('Tigers won by 1 wicket (4 balls left)');
  });

  it('8 v 7: each side has its own all-out threshold and the chasing side’s wickets margin uses its own (EC-B-07)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1, playersPerSide: 8 }, { teamBPlayers: 7 }));
    expect(g.inn.limits.maxWickets).toBe(7);
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g);
    expect(g.inn.limits.maxWickets).toBe(6);
    g.wicketThenNext().wicketThenNext().wicketThenNext();
    g.hits(4, 4);
    expect(g.state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: TIGERS,
      loserTeamId: LIONS,
      margin: { kind: 'wickets', wickets: 3, ballsRemaining: 1 },
      method: 'normal',
    });
    expect(g.state.resultText).toBe('Tigers won by 3 wickets (1 ball left)');
  });

  it('8 v 7: the seven-player side is all out at its 6th wicket (EC-B-07)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1, playersPerSide: 8 }, { teamBPlayers: 7 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g);
    for (let wicket = 1; wicket <= 6; wicket += 1) {
      g.wicketThenNext();
    }
    expect(g.at(1).completion?.reason).toBe('all_out');
    expect(g.state.naturalResult).toMatchObject({ type: 'win', winnerTeamId: LIONS, margin: { kind: 'runs', runs: 6 } });
    expect(g.state.resultText).toBe('Lions won by 6 runs');
    expect(g.state.pendingAction?.type).toBe('confirm_result');
  });

  it('a side batting short ends by batters_unavailable with absentees marked absent, never an already-out batter (EC-B-08/09)', () => {
    const g = lionsBatting(setupFor({ playersPerSide: 4 }, { squadSize: 4 }), 'T4');
    g.wicketThenNext().ball({ wicket: { type: 'bowled' } });
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: ['L4'] });
    expect(g.code({ kind: 'innings_ended', reason: 'batters_unavailable', absentees: [{ playerId: 'L1', hurt: false }] })).toBe('INVALID_ABSENTEE');
    expect(g.code({ kind: 'innings_ended', reason: 'declared', absentees: [{ playerId: 'L4', hurt: false }] })).toBe('INVALID_ABSENTEE');
    g.push({ kind: 'innings_ended', reason: 'batters_unavailable', absentees: [{ playerId: 'L4', hurt: true }] });
    expect(g.at(0).completion?.reason).toBe('batters_unavailable');
    expect(g.row('L4', 0)).toMatchObject({ status: 'absent', dismissalText: 'absent hurt' });
  });
});

describe('Law 25.4 — retirements', () => {
  it('retired hurt is not a wicket, splits the partnership with the same wicket number, and the batter resumes the same score (EC-B-01/02)', () => {
    const g = lionsBatting(setupFor({ playersPerSide: 4 }, { squadSize: 4 }), 'T4');
    g.hits(4);
    g.push({ kind: 'batter_retired', playerId: 'L1', retirement: 'retired_hurt' });
    expect(g.inn.wickets).toBe(0);
    expect(g.inn.fallOfWickets).toHaveLength(0);
    expect(g.row('L1')).toMatchObject({ status: 'retired_hurt', dismissalText: 'retired hurt', runs: 4 });
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'striker', candidates: ['L3', 'L4', 'L1'], canEndInnings: false });
    g.bat('L3');
    g.ball({ wicket: { type: 'bowled' } });
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: ['L4', 'L1'] });
    g.bat('L4');
    g.ball({ wicket: { type: 'bowled' } });
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: ['L1'], canEndInnings: true });
    g.bat('L1');
    expect(g.row('L1')).toMatchObject({ status: 'not_out', returnedFromRetirement: true });
    g.hits(2);
    expect(g.row('L1')).toMatchObject({ runs: 6, balls: 2 });
    g.ball({ wicket: { type: 'bowled' } });
    const inn = g.at(0);
    expect(inn.completion?.reason).toBe('all_out');
    expect(inn.wickets).toBe(3);
    expect(inn.partnerships.map((partnership) => partnership.wicketNumber)).toEqual([1, 1, 2, 3]);
    expect(inn.partnerships.map((partnership) => partnership.endedBy)).toEqual(['retirement', 'wicket', 'wicket', 'wicket']);
    expectBooksBalance(inn);
  });

  it('retired not out may not come back while a yet-to-bat batter remains (EC-B-03)', () => {
    const g = lionsBatting(setupFor({ playersPerSide: 4 }, { squadSize: 4 }), 'T4');
    g.push({ kind: 'batter_retired', playerId: 'L1', retirement: 'retired_not_out' });
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: ['L3', 'L4'] });
    expect(g.code(g.batPayload('L1'))).toBe('BATTER_NOT_ELIGIBLE');
  });

  it('retired out is a wicket in the fall of wickets, not credited to the bowler, and final (EC-W-18)', () => {
    const g = lionsBatting();
    g.dots(1);
    g.push({ kind: 'batter_retired', playerId: 'L2', retirement: 'retired_out' });
    expect(g.inn.wickets).toBe(1);
    expect(g.inn.fallOfWickets[0]).toMatchObject({ playerOutId: 'L2', dismissalType: 'retired_out', overLabel: '0.1' });
    expect(g.row('L2')).toMatchObject({ status: 'out', dismissalText: 'retired out' });
    expect(g.bowler('T11').wickets).toBe(0);
    const pending = g.state.pendingAction;
    expect(pending !== null && pending.type === 'select_next_batter' ? pending.candidates.includes('L2') : true).toBe(false);
    expect(g.code(g.batPayload('L2'))).not.toBe('OK');
  });

  it('mandatory retirement at the end of the over is advisory and appears only when the over ends (EC-B-04)', () => {
    const g = lionsBatting(setupFor({ mandatoryRetirement: { atRuns: 10, mayReturn: true, timing: 'end_of_over' } }));
    g.hits(4, 4, 4);
    expect(g.row('L1').runs).toBe(12);
    expect(g.state.retirementsDue).toEqual([]);
    expect(g.state.canRecordDelivery).toBe(true);
    g.dots(3);
    expect(g.state.retirementsDue).toEqual([{ playerId: 'L1', atRuns: 10 }]);
  });

  it('mandatory retirement "immediately" lists the batter on the ball the mark is reached', () => {
    const g = lionsBatting(setupFor({ mandatoryRetirement: { atRuns: 10, mayReturn: true, timing: 'immediately' } }));
    g.hits(4, 4);
    expect(g.state.retirementsDue).toEqual([]);
    g.hits(4);
    expect(g.state.retirementsDue).toEqual([{ playerId: 'L1', atRuns: 10 }]);
    expect(g.state.canRecordDelivery).toBe(true);
  });
});

describe('Law 16.6 — the match ends the moment the winning run is scored', () => {
  function needOneWithBallsLeft(): Game {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(4, 2);
    expect(g.state.chase).toMatchObject({ target: 7, runsRequired: 1, ballsRemaining: 4 });
    return g;
  }

  it('need 1: any wicket after runs that already reach the target is refused (EC-W-15/16)', () => {
    const g = needOneWithBallsLeft();
    const nonStriker = g.inn.nonStrikerId ?? '';
    expect(g.ballCode({ runsRun: 1, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'striker_end' } })).toBe('WICKET_AFTER_RESULT');
    expect(g.ballCode({ call: 'wide', wicket: { type: 'stumped', fielderIds: ['L6'] } })).toBe('WICKET_AFTER_RESULT');
    expect(g.ballCode({ call: 'no_ball', wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'non_striker_end' } })).toBe(
      'WICKET_AFTER_RESULT',
    );
    expect(g.ballCode({ runsTo: 'bye', runsRun: 1, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'striker_end' } })).toBe(
      'WICKET_AFTER_RESULT',
    );
    expect(g.ballCode({ runsRun: 2, shortRuns: 1, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'non_striker_end' } })).toBe(
      'WICKET_AFTER_RESULT',
    );
    expect(g.ballCode({ wicket: { type: 'bowled' } })).toBe('OK');
    expect(g.ballCode({ wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'non_striker_end' } })).toBe('OK');
  });

  it('need 1: the single without the wicket wins by 10 wickets with the balls then left (§13.2)', () => {
    const g = needOneWithBallsLeft();
    g.hits(1);
    expect(g.at(1).completion?.reason).toBe('target_reached');
    expect(g.state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: TIGERS,
      loserTeamId: LIONS,
      margin: { kind: 'wickets', wickets: 10, ballsRemaining: 3 },
      method: 'normal',
    });
    expect(g.state.resultText).toBe('Tigers won by 10 wickets (3 balls left)');
    expect(g.state.pendingAction?.type).toBe('confirm_result');
    expect(g.state.canRecordDelivery).toBe(false);
    expect(g.code(g.delivery())).not.toBe('OK');
  });

  it('need 2: a wicket that falls with the scores merely level counts', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(4, 1);
    const nonStriker = g.inn.nonStrikerId ?? '';
    expect(g.ballCode({ call: 'no_ball', wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'non_striker_end' } })).toBe('OK');
    expect(g.ballCode({ runsRun: 2, shortRuns: 1, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'striker_end' } })).toBe('OK');
    expect(g.ballCode({ call: 'wide', runsRun: 1, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'striker_end' } })).toBe(
      'WICKET_AFTER_RESULT',
    );
    g.ball({ runsRun: 1, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'striker_end' } });
    expect(g.inn.runs).toBe(6);
    expect(g.inn.wickets).toBe(1);
    expect(g.inn.status).toBe('in_progress');
  });

  it('last ball, need 2, run out going for the second as the last wicket: all out and the match is tied (EC-W-17)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1, playersPerSide: 3 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g);
    g.wicketThenNext();
    g.hits(1, 1, 1, 2);
    expect(g.state.chase).toMatchObject({ runsRequired: 2, ballsRemaining: 1 });
    const nonStriker = g.inn.nonStrikerId ?? '';
    g.ball({ runsRun: 1, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'striker_end' } });
    const chase = g.at(1);
    expect(chase.runs).toBe(6);
    expect(chase.wickets).toBe(2);
    expect(chase.completion?.reason).toBe('all_out');
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: null });
    expect(g.state.resultText).toBe('Match tied');
    expect(g.state.pendingAction?.type).toBe('resolve_tie');
  });

  it('need 1 off the last ball and a no-ball is bowled: won with 1 ball left (the no-ball was not a legal ball)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1, 1, 1, 1, 2);
    g.ball({ call: 'no_ball' });
    expect(g.at(1).completion?.reason).toBe('target_reached');
    expect(g.state.naturalResult).toMatchObject({ margin: { kind: 'wickets', wickets: 10, ballsRemaining: 1 } });
    expect(g.state.resultText).toBe('Tigers won by 10 wickets (1 ball left)');
  });

  it('need 2 off the last ball and a no-ball: scores level, the chase goes on with a free hit (EC-I-16)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1, 1, 1, 1, 1);
    g.ball({ call: 'no_ball' });
    expect(g.inn.status).toBe('in_progress');
    expect(g.inn.runs).toBe(6);
    expect(g.inn.isFreeHitNext).toBe(true);
    expect(g.state.canRecordDelivery).toBe(true);
    expect(g.state.chase).toMatchObject({ runsRequired: 1, ballsRemaining: 1 });
    g.ball();
    expect(g.at(1).completion?.reason).toBe('overs_complete');
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: null });
  });

  it('need 5 and the batter hits a six: all six runs count (EC-I-03)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(2);
    g.hits(6);
    expect(g.at(1).runs).toBe(8);
    expect(g.row('T1', 1)).toMatchObject({ runs: 8, sixes: 1 });
    expect(g.state.naturalResult).toMatchObject({ type: 'win', winnerTeamId: TIGERS, margin: { kind: 'wickets', wickets: 10, ballsRemaining: 4 } });
  });

  it('Law 16.6 does not apply to the first innings: runs then a run out on the same ball both count', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.ball({ runsRun: 3, wicket: { type: 'run_out', playerOutId: 'L1', dismissalEnd: 'striker_end' } });
    expect(g.inn.runs).toBe(3);
    expect(g.inn.wickets).toBe(1);
  });
});

describe('Law 41 — penalty runs', () => {
  it('penalty to the side that has not batted yet is carried into its innings (EC-PN-02)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1);
    expect(g.code(g.penaltyPayload(TIGERS, 0))).toBe('INVALID_PENALTY_INNINGS');
    g.penalty(TIGERS, 1);
    expect(g.inn.runs).toBe(2);
    expect(g.state.carriedPenalties).toEqual([{ inningsIndex: 1, teamId: TIGERS, runs: 5 }]);
    g.hits(1, 1, 1, 1);
    tigersChase(g);
    const chase = g.at(1);
    expect(chase.runs).toBe(5);
    expect(chase.extras).toMatchObject({ penalty: 5, total: 5 });
    expect(chase.target?.runs).toBe(7);
    expect(g.state.chase).toMatchObject({ runsRequired: 2, ballsRemaining: 6 });
    expect(g.state.carriedPenalties).toEqual([]);
  });

  it('penalty to the batting side goes to its innings as extras p and is never charged to the bowler', () => {
    const g = lionsBatting();
    g.hits(1);
    g.penalty(LIONS, 0);
    expect(g.inn.runs).toBe(6);
    expect(g.inn.legalBalls).toBe(1);
    expect(g.inn.extras).toMatchObject({ penalty: 5, total: 5 });
    expect(g.bowler('T11').runsConceded).toBe(1);
    expectBooksBalance(g.inn);
  });

  it('penalty to the fielding side during the chase raises the target by 5 (EC-PN-03)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1, 1);
    g.penalty(LIONS, 0);
    expect(g.at(0).runs).toBe(11);
    expect(g.at(0).status).toBe('complete');
    expect(g.at(1).target?.runs).toBe(12);
    expect(g.state.chase).toMatchObject({ target: 12, runsRequired: 10, ballsRemaining: 4 });
  });

  it('penalty that takes the chase past the target completes it (EC-PN-01)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1, 1);
    g.penalty(TIGERS, 1);
    expect(g.at(1).completion?.reason).toBe('target_reached');
    expect(g.state.naturalResult).toMatchObject({ type: 'win', winnerTeamId: TIGERS, margin: { kind: 'wickets', wickets: 10, ballsRemaining: 4 } });
    expect(g.state.pendingAction?.type).toBe('confirm_result');
  });

  it('Law 28.3 helmet penalty recorded after the last ball of a tied chase turns the tie into a win without reopening the innings (EC-PN-04, §13.5)', () => {
    const g = tiedMainMatch();
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: null });
    g.penalty(TIGERS, 1);
    const chase = g.at(1);
    expect(chase.runs).toBe(11);
    expect(chase.status).toBe('complete');
    expect(chase.extras.penalty).toBe(5);
    expect(g.state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: TIGERS,
      loserTeamId: LIONS,
      margin: { kind: 'wickets', wickets: 10, ballsRemaining: 0 },
      method: 'normal',
    });
    expect(g.state.pendingAction?.type).toBe('confirm_result');
    expect(g.state.canRecordDelivery).toBe(false);
  });

  it('penalty validation: runs 1..99 integer, team in the match, valid while suspended, refused after the match ended (EC-PN-06/07)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    expect(g.code(g.penaltyPayload(LIONS, 0, 0))).toBe('INVALID_PENALTY');
    expect(g.code(g.penaltyPayload(LIONS, 0, 100))).toBe('INVALID_PENALTY');
    expect(g.code(g.penaltyPayload(LIONS, 0, 2.5))).toBe('INVALID_PENALTY');
    expect(g.code(g.penaltyPayload('XYZ', 0))).toBe('TEAM_NOT_IN_MATCH');
    expect(g.code(g.penaltyPayload(LIONS, 1))).toBe('INVALID_PENALTY_INNINGS');
    g.suspend();
    expect(g.code(g.penaltyPayload(LIONS, 0))).toBe('OK');
    g.end({ type: 'no_result', reason: 'Rain' });
    expect(g.code(g.penaltyPayload(LIONS, 0))).toBe('MATCH_ALREADY_ENDED');
  });
});

describe('rain — overs revisions, revised targets and par scores', () => {
  it('suggestRevisedTarget average run rate (BR-RV-06)', () => {
    expect(suggestRevisedTarget('average_run_rate', 150, 120, 72)).toBe(91);
    expect(suggestRevisedTarget('average_run_rate', 180, 120, 90)).toBe(136);
    expect(suggestRevisedTarget('average_run_rate', 150, 0, 72)).toBeNull();
  });

  it('revision errors: below balls bowled, a target on the first innings, a terminal first innings (EC-I-06/09/12)', () => {
    const g = lionsBatting();
    g.dots(12);
    expect(g.code(g.revisePayload(0, 11))).toBe('INVALID_OVERS_REVISION');
    expect(g.code(g.revisePayload(0, 24, 50))).toBe('INVALID_TARGET');
    expect(g.code(g.revisePayload(0, 12, 50, true))).not.toBe('OK');
    expect(g.code(g.revisePayload(0, 0))).not.toBe('OK');
  });

  it('revising the first innings to the balls already bowled ends it and warns about the chase (EC-I-07)', () => {
    const g = lionsBatting();
    g.hits(...Array.from({ length: 12 }, () => 1));
    const verdict = g.check(g.revisePayload(0, 12));
    expect(verdict.ok ? verdict.warnings.map((warning) => warning.code) : ['rejected']).toContain('CHASE_OVERS_NOT_REVISED');
    g.revise(0, 12);
    expect(g.at(0).status).toBe('complete');
    expect(g.at(0).completion?.reason).toBe('overs_complete');
    expect(g.state.pendingAction).toMatchObject({ type: 'start_next_innings', inningsIndex: 1 });
    tigersChase(g);
    expect(g.at(1).target?.runs).toBe(13);
    expect(g.at(1).limits.maxBalls).toBe(30);
    expect(g.code(g.revisePayload(0, 24))).not.toBe('OK');
  });

  it('powerplay phases are clamped to a reduced limit (EC-I-10)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 20, powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 6 }] }));
    g.dots(1);
    g.revise(0, 30);
    expect(g.inn.powerplay.phases[0].rule).toMatchObject({ fromOver: 1, toOver: 5 });
  });

  it('a planned chase revision with a revised target, played out and missed by 2 (revised target)', () => {
    const g = lionsThirtyInFive();
    g.revise(1, 18, 20);
    tigersChase(g);
    expect(g.inn.limits.maxBalls).toBe(18);
    expect(g.inn.target).toEqual({ runs: 20, revised: true, source: 'revision' });
    g.hits(4, 4, 4, 4, 1).dots(13);
    expect(g.at(1).completion?.reason).toBe('overs_complete');
    expect(g.at(1).runs).toBe(17);
    expect(g.state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: LIONS,
      loserTeamId: TIGERS,
      margin: { kind: 'runs', runs: 2 },
      method: 'revised_target',
    });
    expect(g.state.resultText).toBe('Lions won by 2 runs (revised target)');
  });

  it('target revised mid-chase and reached: wickets margin with balls left, method revised_target (EC-I-04)', () => {
    const g = lionsThirtyInFive();
    tigersChase(g).hits(4, 4, 1, 1).dots(8);
    g.suspend();
    g.revise(1, 24, 25);
    g.resume();
    expect(g.state.chase).toEqual({ target: 25, runsRequired: 15, ballsRemaining: 12, requiredRunRate: 7.5 });
    g.hits(4, 4, 4, 4);
    expect(g.at(1).completion?.reason).toBe('target_reached');
    expect(g.state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: TIGERS,
      loserTeamId: LIONS,
      margin: { kind: 'wickets', wickets: 10, ballsRemaining: 8 },
      method: 'revised_target',
    });
    expect(g.state.resultText).toBe('Tigers won by 10 wickets (8 balls left) (revised target)');
  });

  it('a revised target at or below the runs already scored completes the chase at once (EC-I-05)', () => {
    const g = lionsThirtyInFive();
    tigersChase(g).hits(4, 4, 1, 1).dots(8);
    g.suspend();
    g.revise(1, 18, 9);
    expect(g.at(1).completion?.reason).toBe('target_reached');
    expect(g.state.naturalResult).toMatchObject({
      type: 'win',
      winnerTeamId: TIGERS,
      margin: { kind: 'wickets', wickets: 10, ballsRemaining: 6 },
      method: 'revised_target',
    });
    expect(g.state.pendingAction?.type).toBe('confirm_result');
  });

  const parCases: readonly (readonly [string, readonly number[], MatchResult, string])[] = [
    [
      'ahead of par',
      [4, 4, 4, 4, 4],
      { type: 'win', winnerTeamId: TIGERS, loserTeamId: LIONS, margin: { kind: 'runs', runs: 5 }, method: 'par_score' },
      'Tigers won by 5 runs (par score)',
    ],
    [
      'behind par',
      [4, 4, 4],
      { type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 3 }, method: 'par_score' },
      'Lions won by 3 runs (par score)',
    ],
    ['level with par', [4, 4, 4, 1, 1, 1], { type: 'tie', decider: null }, 'Match tied (par score)'],
  ];

  it.each(parCases)('rain-terminated chase %s is decided on the par score while play is suspended (EC-I-11)', (_label, tigerHits, expected, text) => {
    const g = lionsThirtyInFive();
    tigersChase(g).hits(...tigerHits).dots(14 - tigerHits.length);
    expect(g.inn.legalBalls).toBe(14);
    g.suspend();
    expect(g.code(g.revisePayload(1, 15, 16, true))).not.toBe('OK');
    expect(g.code(g.revisePayload(1, 14, null, true))).not.toBe('OK');
    g.revise(1, 14, 16, true);
    expect(g.at(1).completion?.reason).toBe('terminated');
    expect(g.state.naturalResult).toEqual(expected);
    expect(g.state.resultText).toBe(text);
    expect(g.state.pendingAction?.type).toBe(expected.type === 'tie' ? 'resolve_tie' : 'confirm_result');
    expect(g.state.lifecycle).toBe('paused');
    if (expected.type !== 'tie') {
      g.end();
      expect(g.state.lifecycle).toBe('completed');
      expect(g.state.result).toEqual(expected);
      expect(g.state.suspension).toBeNull();
    }
  });
});

describe('Law 16.3 / §21 — ties and super overs', () => {
  it('a tied main match offers a super over first (EC-R-03 start)', () => {
    const g = tiedMainMatch();
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: null });
    expect(g.state.resultText).toBe('Match tied');
    const pending = g.state.pendingAction;
    expect(pending?.type).toBe('resolve_tie');
    expect(pending !== null && pending.type === 'resolve_tie' ? sorted(pending.options) : []).toEqual(sorted(['super_over', 'accept_tie', 'decide_other']));
    expect(pending !== null && pending.type === 'resolve_tie' ? pending.nextSuperOverRound : null).toBe(1);
  });

  it('super overs disabled: a tie offers only accept or decide otherwise (EC-R-02)', () => {
    const g = tiedMainMatch({ superOver: { ...BASE_MATCH_RULES.superOver, enabled: false } });
    const pending = g.state.pendingAction;
    expect(pending !== null && pending.type === 'resolve_tie' ? sorted(pending.options) : []).toEqual(sorted(['accept_tie', 'decide_other']));
    expect(g.code({ kind: 'super_over_started', round: 1 })).toBe('SUPER_OVER_NOT_ALLOWED');
    g.end({ type: 'tie_decided', method: 'coin_toss', winnerTeamId: LIONS });
    expect(g.state.result).toMatchObject({ type: 'tie', decider: { method: 'coin_toss', winnerTeamId: LIONS } });
    expect(matchStatusLabel('completed', g.state.result)).toBe('Tied');
  });

  it('super over innings: one over, two wickets end it, the side that batted second bats first (BR-MC-05, BR-RS-07, EC-R-07)', () => {
    const g = tiedMainMatch();
    g.superOver(1);
    expect(g.state.pendingAction).toMatchObject({ type: 'start_next_innings', inningsIndex: 2, kind: 'super_over', superOverRound: 1, suggestedBattingTeamId: TIGERS });
    g.start(2, TIGERS, 'T1', 'T2', 'L10');
    expect(g.inn.limits).toMatchObject({ maxBalls: 6, maxWickets: 2 });
    expect(g.inn.kind).toBe('super_over');
    g.wicketThenNext().ball({ wicket: { type: 'bowled' } });
    expect(g.at(2).completion?.reason).toBe('all_out');
    expect(g.at(2).legalBalls).toBe(2);
    g.start(3, LIONS, 'L1', 'L2', 'T10');
    expect(g.inn.target).toEqual({ runs: 1, revised: false, source: 'super_over' });
  });

  it('two-a-side: the super over allows min(2, 1) = 1 wicket (EC-B-13)', () => {
    const g = tiedMainMatch({ playersPerSide: 2 });
    expect(g.at(0).limits.maxWickets).toBe(1);
    g.superOver(1).start(2, TIGERS, 'T1', 'T2', 'L10');
    expect(g.inn.limits.maxWickets).toBe(1);
  });

  it('super over tied, repeated: round-1 dismissed batters and the previous super-over bowlers are barred; the winner is recorded as a decided tie (EC-R-03)', () => {
    const g = tiedFirstSuperOver(tiedMainMatch());
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: null });
    const pending = g.state.pendingAction;
    expect(pending !== null && pending.type === 'resolve_tie' ? pending.nextSuperOverRound : null).toBe(2);
    expect(pending !== null && pending.type === 'resolve_tie' ? pending.options.includes('super_over') : false).toBe(true);
    g.superOver(2);
    expect(g.state.pendingAction).toMatchObject({ type: 'start_next_innings', inningsIndex: 4, superOverRound: 2, suggestedBattingTeamId: LIONS });
    expect(g.code(g.startPayload(4, LIONS, 'L1', 'L2', 'T10'))).toBe('PLAYER_INELIGIBLE_SUPER_OVER');
    g.start(4, LIONS, 'L1', 'L2', 'T9').dots(6);
    expect(g.code(g.startPayload(5, TIGERS, 'T1', 'T4', 'L9'))).toBe('PLAYER_INELIGIBLE_SUPER_OVER');
    expect(g.code(g.startPayload(5, TIGERS, 'T2', 'T3', 'L10'))).toBe('PLAYER_INELIGIBLE_SUPER_OVER');
    g.start(5, TIGERS, 'T2', 'T3', 'L9');
    expect(g.inn.target).toEqual({ runs: 1, revised: false, source: 'super_over' });
    expect(g.code(g.penaltyPayload(LIONS, 0))).toBe('INVALID_PENALTY_INNINGS');
    expect(g.code(g.penaltyPayload(TIGERS, 1))).toBe('INVALID_PENALTY_INNINGS');
    const nonStriker = g.inn.nonStrikerId ?? '';
    expect(g.ballCode({ runsRun: 1, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'striker_end' } })).toBe('WICKET_AFTER_RESULT');
    g.hits(1);
    const decided: MatchResult = { type: 'tie', decider: { method: 'super_over', winnerTeamId: TIGERS, superOverRounds: 2 } };
    expect(g.state.naturalResult).toEqual(decided);
    expect(g.state.resultText).toBe('Match tied — Tigers won the Super Over');
    expect(g.at(0).runs).toBe(6);
    expect(g.at(1).runs).toBe(6);
    expect(g.at(1).wickets).toBe(0);
    g.end();
    expect(g.state.result).toEqual(decided);
    expect(g.state.lifecycle).toBe('completed');
    expect(matchStatusLabel('completed', g.state.result)).toBe('Tied');
    expectReplayMatches(g);
  });

  it('super over tied with tie_stands: no further super over is offered (EC-R-05)', () => {
    const g = tiedFirstSuperOver(tiedMainMatch({ superOver: { ...BASE_MATCH_RULES.superOver, ifTiedAgain: 'tie_stands' } }));
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: null });
    const pending = g.state.pendingAction;
    expect(pending !== null && pending.type === 'resolve_tie' ? sorted(pending.options) : []).toEqual(sorted(['accept_tie', 'decide_other']));
    expect(g.code({ kind: 'super_over_started', round: 2 })).not.toBe('OK');
  });

  it('maxRounds 1 reached and still tied: SUPER_OVER_LIMIT_REACHED (EC-R-06)', () => {
    const g = tiedFirstSuperOver(tiedMainMatch({ superOver: { ...BASE_MATCH_RULES.superOver, maxRounds: 1 } }));
    const pending = g.state.pendingAction;
    expect(pending !== null && pending.type === 'resolve_tie' ? pending.options.includes('super_over') : true).toBe(false);
    expect(g.code({ kind: 'super_over_started', round: 2 })).toBe('SUPER_OVER_LIMIT_REACHED');
  });

  it('super over tied with boundary_count: more 4s + 6s over the match and super over wins (EC-R-04)', () => {
    const g = tiedFirstSuperOver(tiedMainMatch({ superOver: { ...BASE_MATCH_RULES.superOver, ifTiedAgain: 'boundary_count' } }, [4, 1, 1, 0, 0, 0]));
    const counts = boundaryCounts(g.state);
    const lions = counts.find((entry) => entry.teamId === LIONS);
    const tigers = counts.find((entry) => entry.teamId === TIGERS);
    expect(lions === undefined ? null : lions.fours + lions.sixes).toBe(2);
    expect(tigers === undefined ? null : tigers.fours + tigers.sixes).toBe(1);
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: { method: 'boundary_count', winnerTeamId: LIONS, superOverRounds: 1 } });
    expect(g.state.resultText).toBe('Match tied — Lions won on boundary count');
    expect(g.state.pendingAction?.type).toBe('confirm_result');
  });

  it('super over needs play resumed first but accepting the tie does not (EC-I-15)', () => {
    const g = tiedMainMatch();
    g.suspend();
    expect(g.state.pendingAction?.type).toBe('resolve_tie');
    expect(g.code({ kind: 'super_over_started', round: 1 })).toBe('PLAY_SUSPENDED');
    expect(g.code(g.endPayload({ type: 'natural' }))).toBe('OK');
  });
});

describe('results — closing a match and result wording', () => {
  it('walkover only before any delivery; allowed after innings_started with no ball bowled (EC-R-13/14/15)', () => {
    const fresh = new Game(setupFor());
    expect(fresh.code(fresh.endPayload({ type: 'walkover', winnerTeamId: TIGERS, reason: null }))).toBe('OK');
    fresh.end({ type: 'walkover', winnerTeamId: TIGERS, reason: null });
    expect(fresh.state.result).toEqual({ type: 'walkover', winnerTeamId: TIGERS, loserTeamId: LIONS, reason: null });
    expect(fresh.state.innings).toHaveLength(0);
    expect(fresh.state.resultText).toBe('Tigers won by walkover');
    expect(matchStatusLabel('completed', fresh.state.result)).toBe('Walkover');
    const started = lionsBatting();
    expect(started.code(started.endPayload({ type: 'walkover', winnerTeamId: TIGERS, reason: null }))).toBe('OK');
    started.dots(1);
    expect(started.code(started.endPayload({ type: 'walkover', winnerTeamId: TIGERS, reason: null }))).toBe('WALKOVER_AFTER_PLAY');
  });

  it('natural end before any result and tie_decided on a non-tie are refused', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    expect(g.code(g.endPayload({ type: 'natural' }))).toBe('NATURAL_RESULT_NOT_REACHED');
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(6, 1);
    expect(g.state.naturalResult?.type).toBe('win');
    expect(g.code(g.endPayload({ type: 'tie_decided', method: 'coin_toss', winnerTeamId: LIONS }))).toBe('RESULT_NOT_TIED');
  });

  it('abandoned mid-innings closes the innings with match_ended and nothing may follow (EC-R-10)', () => {
    const g = lionsBatting();
    g.dots(3);
    g.end({ type: 'abandoned', reason: 'Rain' });
    expect(g.state.lifecycle).toBe('abandoned');
    expect(g.at(0).completion?.reason).toBe('match_ended');
    expect(g.state.result).toEqual({ type: 'abandoned', reason: 'Rain' });
    expect(g.state.resultText).toBe('Match abandoned');
    expect(matchStatusLabel('abandoned', g.state.result)).toBe('Abandoned');
    expect(g.code(g.delivery())).toBe('MATCH_ALREADY_ENDED');
  });

  it('a declared first innings sets the target from the declared total (EC-B-14)', () => {
    const g = lionsBatting();
    g.hits(...Array.from({ length: 12 }, () => 1));
    g.push({ kind: 'innings_ended', reason: 'declared', absentees: [] });
    expect(g.at(0).completion?.reason).toBe('declared');
    tigersChase(g);
    expect(g.inn.target).toEqual({ runs: 13, revised: false, source: 'first_innings' });
  });

  it('the first innings must follow the toss (Law 13)', () => {
    const g = new Game(setupFor());
    expect(g.code(g.startPayload(0, TIGERS, 'T1', 'T2', 'L11'))).toBe('TOSS_MISMATCH');
    expect(g.code(g.startPayload(0, LIONS, 'L1', 'L1', 'T11'))).toBe('SAME_PLAYER_BOTH_ENDS');
    expect(g.code(g.startPayload(0, LIONS, 'L1', 'T2', 'T11'))).not.toBe('OK');
  });

  const texts: readonly (readonly [MatchResult, string])[] = [
    [{ type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 1 }, method: 'normal' }, 'Lions won by 1 run'],
    [{ type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 3 }, method: 'normal' }, 'Lions won by 3 runs'],
    [
      { type: 'win', winnerTeamId: TIGERS, loserTeamId: LIONS, margin: { kind: 'wickets', wickets: 1, ballsRemaining: 1 }, method: 'normal' },
      'Tigers won by 1 wicket (1 ball left)',
    ],
    [
      { type: 'win', winnerTeamId: TIGERS, loserTeamId: LIONS, margin: { kind: 'wickets', wickets: 3, ballsRemaining: 8 }, method: 'normal' },
      'Tigers won by 3 wickets (8 balls left)',
    ],
    [{ type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 12 }, method: 'revised_target' }, 'Lions won by 12 runs (revised target)'],
    [{ type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 21 }, method: 'par_score' }, 'Lions won by 21 runs (par score)'],
    [{ type: 'tie', decider: null }, 'Match tied'],
    [{ type: 'tie', decider: { method: 'super_over', winnerTeamId: TIGERS, superOverRounds: 1 } }, 'Match tied — Tigers won the Super Over'],
    [{ type: 'tie', decider: { method: 'boundary_count', winnerTeamId: TIGERS, superOverRounds: 1 } }, 'Match tied — Tigers won on boundary count'],
    [{ type: 'no_result', reason: 'Rain' }, 'No result'],
    [{ type: 'abandoned', reason: null }, 'Match abandoned'],
    [{ type: 'walkover', winnerTeamId: TIGERS, loserTeamId: LIONS, reason: null }, 'Tigers won by walkover'],
    [{ type: 'awarded', winnerTeamId: TIGERS, loserTeamId: LIONS, reason: 'Conceded', margin: null }, 'Match awarded to Tigers'],
  ];

  it.each(texts)('formatResult %j', (result, text) => {
    expect(formatResult(result, setupFor().teams)).toBe(text);
  });

  it('matchStatusLabel maps status + result to the §22 labels', () => {
    const win: MatchResult = { type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 3 }, method: 'normal' };
    expect(matchStatusLabel('completed', win)).toBe('Completed');
    expect(matchStatusLabel('completed', { type: 'awarded', winnerTeamId: LIONS, loserTeamId: TIGERS, reason: 'x', margin: null })).toBe('Completed');
    expect(matchStatusLabel('completed', { type: 'tie', decider: null })).toBe('Tied');
    expect(matchStatusLabel('completed', { type: 'no_result', reason: null })).toBe('No Result');
    expect(matchStatusLabel('live', null)).toBe('Live');
    expect(matchStatusLabel('paused', null)).toBe('Paused');
    expect(matchStatusLabel('scheduled', null)).toBe('Scheduled');
  });

  it('a chase lost with wickets in hand is a runs margin for the side batting first', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(4, 4, 4, 1, 1, 1);
    tigersChase(g).hits(1, 1, 1, 1, 1).ball({ wicket: { type: 'bowled' } });
    expect(g.at(1).completion?.reason).toBe('overs_complete');
    expect(g.state.naturalResult).toEqual({ type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 10 }, method: 'normal' });
    expect(g.state.resultText).toBe('Lions won by 10 runs');
    g.end();
    expect(matchStatusLabel('completed', g.state.result)).toBe('Completed');
    expectReplayMatches(g);
  });
});

describe('second wave — rarer situations a club scorer meets', () => {
  it('Law 16.10 (statement of result): a side all out that passes the target only through a 5-run penalty wins "by penalty runs", never "by 0 wickets"', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1, playersPerSide: 3 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1, 1);
    g.wicketThenNext().ball({ wicket: { type: 'bowled' } });
    expect(g.at(1).completion?.reason).toBe('all_out');
    expect(g.state.naturalResult).toMatchObject({ type: 'win', winnerTeamId: LIONS, margin: { kind: 'runs', runs: 4 } });
    g.penalty(TIGERS, 1);
    expect(g.at(1).runs).toBe(7);
    expect(g.at(1).status).toBe('complete');
    expect(g.state.naturalResult).toMatchObject({ type: 'win', winnerTeamId: TIGERS });
    expect(g.state.resultText).not.toMatch(/\b0 wickets\b/);
    expect(g.state.naturalResult).toEqual({ type: 'win', winnerTeamId: TIGERS, loserTeamId: LIONS, margin: { kind: 'runs', runs: 1 }, method: 'penalty_runs' });
    expect(g.state.resultText).toBe('Tigers won by penalty runs');
  });

  it('a penalty to the side batting first after a won chase raises the target and flips the result without reopening the chase (§7.3)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(6, 1);
    expect(g.state.naturalResult).toMatchObject({ winnerTeamId: TIGERS });
    g.penalty(LIONS, 0);
    expect(g.at(0).runs).toBe(11);
    expect(g.at(1).target?.runs).toBe(12);
    expect(g.at(1).status).toBe('complete');
    expect(g.state.naturalResult).toEqual({ type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 4 }, method: 'normal' });
    expect(g.state.canRecordDelivery).toBe(false);
  });

  it('a carried penalty that already equals the target completes the chase the moment it starts', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1);
    g.penalty(TIGERS, 1);
    g.dots(2);
    expect(g.at(0).runs).toBe(4);
    tigersChase(g);
    const chase = g.at(1);
    expect(chase.runs).toBe(5);
    expect(chase.target?.runs).toBe(5);
    expect(chase.completion?.reason).toBe('target_reached');
    expect(g.state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: TIGERS,
      loserTeamId: LIONS,
      margin: { kind: 'wickets', wickets: 10, ballsRemaining: 6 },
      method: 'normal',
    });
    expect(g.state.canRecordDelivery).toBe(false);
    expectReplayMatches(g);
  });

  it('last man stands: when the penultimate wicket falls on the last ball of an over the survivor still faces, alone', () => {
    const g = lionsBatting(setupFor({ playersPerSide: 8, lastManStands: true }));
    for (let wicket = 1; wicket <= 6; wicket += 1) {
      g.wicketThenNext();
    }
    g.dots(5);
    expect(g.inn.strikerId).toBe('L2');
    g.ball({ wicket: { type: 'bowled' } });
    expect(g.inn.legalBalls).toBe(12);
    expect(g.inn.wickets).toBe(7);
    expect(g.inn.strikerId).toBe('L8');
    expect(g.inn.nonStrikerId).toBeNull();
    expect(g.state.pendingAction?.type).toBe('select_next_bowler');
    g.ball();
    expect(g.lastBall.strikerId).toBe('L8');
    expect(g.lastBall.nonStrikerId).toBeNull();
  });

  it('last man stands with uneven sides: the 7-player side bats alone after 6 down and is all out at 7', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 2, playersPerSide: 8, lastManStands: true }, { teamBPlayers: 7 }));
    g.dots(12);
    tigersChase(g);
    expect(g.inn.limits.maxWickets).toBe(7);
    for (let wicket = 1; wicket <= 6; wicket += 1) {
      g.wicketThenNext();
    }
    expect(g.inn.wickets).toBe(6);
    expect(g.state.pendingAction?.type).not.toBe('select_next_batter');
    g.bowl('L10');
    expect(g.inn.nonStrikerId).toBeNull();
    g.ball({ wicket: { type: 'bowled' } });
    expect(g.at(1).completion?.reason).toBe('all_out');
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: null });
  });

  it('a batter returning from retirement keeps the original batting position', () => {
    const g = lionsBatting(setupFor({ playersPerSide: 4 }, { squadSize: 4 }), 'T4');
    g.hits(1);
    g.push({ kind: 'batter_retired', playerId: 'L2', retirement: 'retired_hurt' });
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'striker' });
    g.bat('L3').ball({ wicket: { type: 'bowled' } }).bat('L4').ball({ wicket: { type: 'bowled' } });
    g.bat('L2');
    const row = g.row('L2');
    expect(row.position).toBe(2);
    expect(row.returnedFromRetirement).toBe(true);
    expect(g.row('L3').position).toBe(3);
    expect(g.row('L4').position).toBe(4);
  });

  it('retired not out may return once nobody is left to bat, unless the mandatory-retirement rule forbids returning', () => {
    const free = lionsBatting(setupFor({ playersPerSide: 4 }, { squadSize: 4 }), 'T4');
    free.push({ kind: 'batter_retired', playerId: 'L1', retirement: 'retired_not_out' });
    free.bat('L3').ball({ wicket: { type: 'bowled' } }).bat('L4').ball({ wicket: { type: 'bowled' } });
    expect(free.state.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: ['L1'] });
    expect(free.code(free.batPayload('L1'))).toBe('OK');
    const strict = lionsBatting(
      setupFor({ playersPerSide: 4, mandatoryRetirement: { atRuns: 10, mayReturn: false, timing: 'immediately' } }, { squadSize: 4 }),
      'T4',
    );
    strict.push({ kind: 'batter_retired', playerId: 'L1', retirement: 'retired_not_out' });
    strict.bat('L3').ball({ wicket: { type: 'bowled' } }).bat('L4').ball({ wicket: { type: 'bowled' } });
    expect(strict.state.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: [], canEndInnings: true });
    expect(strict.code(strict.batPayload('L1'))).not.toBe('OK');
  });

  it('mandatory retirement is not listed once no yet-to-bat batter remains, nor for a batter who already came back (EC-B-05)', () => {
    const g = lionsBatting(
      setupFor({ playersPerSide: 3, mandatoryRetirement: { atRuns: 4, mayReturn: true, timing: 'immediately' } }, { squadSize: 3 }),
      'T3',
    );
    g.hits(4);
    expect(g.state.retirementsDue).toEqual([{ playerId: 'L1', atRuns: 4 }]);
    g.push({ kind: 'batter_retired', playerId: 'L1', retirement: 'retired_not_out' });
    g.bat('L3');
    g.hits(4);
    expect(g.row('L3').runs).toBe(4);
    expect(g.state.retirementsDue).toEqual([]);
    g.ball({ wicket: { type: 'bowled' } });
    g.bat('L1');
    expect(g.state.retirementsDue).toEqual([]);
  });

  it('incoming batter guards: vacancy position, substitutes, wrong side, already out, already batting', () => {
    const g = lionsBatting();
    g.dots(2).ball({ wicket: { type: 'caught', fielderIds: ['T5'] } });
    expect(g.code(g.batPayload('L3', 'non_striker'))).toBe('POSITION_NOT_VACANT');
    expect(g.code(g.batPayload('L12'))).toBe('SUBSTITUTE_NOT_ALLOWED');
    expect(g.code(g.batPayload('T3'))).toBe('PLAYER_WRONG_SIDE');
    expect(g.code(g.batPayload('L1'))).toBe('BATTER_ALREADY_OUT');
    expect(g.code(g.batPayload('L2'))).toBe('BATTER_ALREADY_BATTING');
    expect(g.code({ kind: 'strike_swapped' })).toBe('VACANCY_MUST_BE_FILLED');
    expect(g.code({ kind: 'batter_retired', playerId: 'L2', retirement: 'retired_hurt' })).toBe('VACANCY_MUST_BE_FILLED');
    g.bat('L3');
    expect(g.code(g.batPayload('L4'))).toBe('NO_VACANCY');
  });

  it('an off-ball run out between overs has no bowler at the time and is credited to nobody', () => {
    const g = lionsBatting();
    g.dots(6);
    expect(g.state.pendingAction?.type).toBe('select_next_bowler');
    g.push({ kind: 'batter_dismissed', playerId: 'L1', type: 'run_out', fielderIds: [] });
    const dismissal = g.row('L1').dismissal;
    expect(dismissal).toMatchObject({ onDelivery: false, creditedBowlerId: null, bowlerId: null, wicketNumber: 1 });
    expect(g.inn.fallOfWickets[0].overLabel).toBe('0.6');
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'non_striker' });
  });

  it('an over cut short by a revision is incomplete: no maiden, figures show the part-over', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.ball();
    g.revise(0, 4);
    g.dots(3);
    const inn = g.at(0);
    expect(inn.completion?.reason).toBe('overs_complete');
    expect(inn.legalBalls).toBe(4);
    expect(inn.overs[0].isMaiden).toBe(false);
    expect(g.bowler('T11', 0).maidens).toBe(0);
    expect(formatBowlingFigures(g.bowler('T11', 0), 6)).toBe('0.4-0-0-0');
    tigersChase(g);
    expect(g.at(1).limits.maxBalls).toBe(6);
  });

  it('a bowler who has only bowled wides has no economy and the team has no run rate yet', () => {
    const g = lionsBatting();
    g.ball({ call: 'wide' }).ball({ call: 'wide', boundary: 4 });
    const row = g.bowler('T11');
    expect(row).toMatchObject({ legalBalls: 0, runsConceded: 6, wideDeliveries: 2, wideRuns: 6 });
    expect(row.economy).toBeNull();
    expect(g.state.currentRunRate).toBeNull();
    expect(g.inn.runRate).toBeNull();
    expect(formatBowlingFigures(row, 6)).toBe('0-0-6-0');
  });

  it('no-ball plus four byes, and no-ball plus a bye with 4 overthrows, are byes charged only the no-ball', () => {
    const g = lionsBatting();
    g.ball({ call: 'no_ball', runsTo: 'bye', boundary: 4 });
    expect(g.lastBall.token.text).toBe('NB+4B');
    expect(g.inn.extras).toMatchObject({ noBalls: 1, byes: 4 });
    expect(g.inn.strikerId).toBe('L1');
    g.ball({ call: 'no_ball', runsTo: 'bye', runsRun: 1, boundary: 4 });
    expect(g.inn.extras).toMatchObject({ noBalls: 2, byes: 9 });
    expect(g.bowler('T11').runsConceded).toBe(2);
    expect(g.inn.strikerId).toBe('L2');
    expect(g.row('L1')).toMatchObject({ runs: 0, balls: 2 });
    expectBooksBalance(g.inn);
  });

  it('short runs off a wide and off a no-ball: scored runs drop, strike follows the crossings', () => {
    const g = lionsBatting();
    g.ball({ call: 'wide', runsRun: 2, shortRuns: 1 });
    expect(g.inn.extras.wides).toBe(2);
    expect(g.inn.strikerId).toBe('L1');
    g.ball({ call: 'no_ball', runsRun: 2, shortRuns: 1 });
    expect(g.row('L1').runs).toBe(1);
    expect(g.inn.extras.noBalls).toBe(1);
    expect(g.inn.runs).toBe(4);
    expect(g.inn.strikerId).toBe('L1');
    expectBooksBalance(g.inn);
  });

  it('a counted wide bowled as the free hit keeps the free hit alive', () => {
    const g = lionsBatting(setupFor({ wide: { penaltyRuns: 1, countsAsBall: true } }));
    g.ball({ call: 'no_ball' }).ball({ call: 'wide' });
    expect(g.lastBall).toMatchObject({ isFreeHit: true, isLegal: true });
    expect(g.inn.isFreeHitNext).toBe(true);
  });

  it('wide on the last ball when one is needed wins with a ball still left (EC-I-02)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1, 1, 1, 1, 2);
    g.ball({ call: 'wide' });
    expect(g.state.naturalResult).toMatchObject({ margin: { kind: 'wickets', wickets: 10, ballsRemaining: 1 } });
  });

  it('Law 16.6 uses the revised target, not the original one', () => {
    const g = lionsThirtyInFive();
    tigersChase(g).hits(4, 4, 1, 1).dots(8);
    g.suspend().revise(1, 24, 12).resume();
    expect(g.state.chase).toMatchObject({ target: 12, runsRequired: 2 });
    const nonStriker = g.inn.nonStrikerId ?? '';
    expect(g.ballCode({ runsRun: 2, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'striker_end' } })).toBe('WICKET_AFTER_RESULT');
    expect(g.ballCode({ runsRun: 1, wicket: { type: 'run_out', playerOutId: nonStriker, dismissalEnd: 'striker_end' } })).toBe('OK');
  });

  it('super over: the validator accepts either side batting first and requires the pair to alternate', () => {
    const g = tiedMainMatch();
    g.superOver(1);
    expect(g.code(g.startPayload(2, LIONS, 'L1', 'L2', 'T10'))).toBe('OK');
    g.start(2, LIONS, 'L1', 'L2', 'T10').dots(6);
    expect(g.code(g.startPayload(3, LIONS, 'L3', 'L4', 'T9'))).toBe('WRONG_BATTING_TEAM');
    expect(g.code(g.startPayload(1, TIGERS, 'T1', 'T2', 'L9'))).not.toBe('OK');
  });

  it('super over round 2: a batter dismissed in round 1 cannot come in later either, and is not offered', () => {
    const g = tiedFirstSuperOver(tiedMainMatch());
    g.superOver(2).start(4, LIONS, 'L1', 'L2', 'T9').dots(6);
    g.start(5, TIGERS, 'T2', 'T3', 'L9');
    g.ball({ wicket: { type: 'bowled' } });
    const pending = g.state.pendingAction;
    expect(pending?.type).toBe('select_next_batter');
    expect(pending !== null && pending.type === 'select_next_batter' ? pending.candidates.includes('T1') : true).toBe(false);
    expect(g.code(g.batPayload('T1'))).toBe('PLAYER_INELIGIBLE_SUPER_OVER');
    g.bat('T4').hits(1);
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: { method: 'super_over', winnerTeamId: TIGERS, superOverRounds: 2 } });
  });

  it('super over round 2 without restrictRepeatPlayers lets anyone bat and bowl again', () => {
    const g = tiedFirstSuperOver(tiedMainMatch({ superOver: { ...BASE_MATCH_RULES.superOver, restrictRepeatPlayers: false } }));
    g.superOver(2);
    expect(g.code(g.startPayload(4, LIONS, 'L1', 'L2', 'T10'))).toBe('OK');
    g.start(4, LIONS, 'L1', 'L2', 'T10').dots(6);
    expect(g.code(g.startPayload(5, TIGERS, 'T1', 'T3', 'L10'))).toBe('OK');
  });

  it('boundary_count with boundaries level stays an undecided tie and offers no further super over (U-RES-14)', () => {
    const g = tiedFirstSuperOver(tiedMainMatch({ superOver: { ...BASE_MATCH_RULES.superOver, ifTiedAgain: 'boundary_count' } }));
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: null });
    const pending = g.state.pendingAction;
    expect(pending?.type).toBe('resolve_tie');
    expect(pending !== null && pending.type === 'resolve_tie' ? pending.options.includes('super_over') : true).toBe(false);
  });

  it('a penalty to the fielding side during a super over is carried into its super-over innings only', () => {
    const g = tiedMainMatch();
    g.superOver(1).start(2, TIGERS, 'T1', 'T2', 'L10');
    g.hits(1);
    g.penalty(LIONS, 3);
    g.dots(5);
    g.start(3, LIONS, 'L1', 'L2', 'T10');
    expect(g.at(3).runs).toBe(5);
    expect(g.at(3).target?.runs).toBe(2);
    expect(g.at(3).completion?.reason).toBe('target_reached');
    expect(g.at(0).runs).toBe(6);
    expect(g.state.naturalResult).toEqual({ type: 'tie', decider: { method: 'super_over', winnerTeamId: LIONS, superOverRounds: 1 } });
  });

  it('no result declared mid-chase closes the innings and reads "No result" (EC-R-12)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1);
    g.end({ type: 'no_result', reason: 'Rain' });
    expect(g.state.lifecycle).toBe('completed');
    expect(g.at(1).completion?.reason).toBe('match_ended');
    expect(g.state.resultText).toBe('No result');
    expect(matchStatusLabel('completed', g.state.result)).toBe('No Result');
  });

  it('awarded mid-chase names the loser, and a winner outside the match is refused (EC-R-16)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1);
    expect(g.code(g.endPayload({ type: 'awarded', winnerTeamId: 'XYZ', reason: 'Conceded', margin: null }))).toBe('TEAM_NOT_IN_MATCH');
    expect(g.code(g.endPayload({ type: 'walkover', winnerTeamId: LIONS, reason: null }))).toBe('WALKOVER_AFTER_PLAY');
    g.end({ type: 'awarded', winnerTeamId: LIONS, reason: 'Tigers conceded', margin: null });
    expect(g.state.result).toEqual({ type: 'awarded', winnerTeamId: LIONS, loserTeamId: TIGERS, reason: 'Tigers conceded', margin: null });
    expect(g.state.resultText).toBe('Match awarded to Lions');
    expect(g.at(1).completion?.reason).toBe('match_ended');
  });

  it('innings order guards: the chase must be the other team and cannot start while the first innings runs', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1);
    expect(g.code(g.startPayload(1, TIGERS, 'T1', 'T2', 'L11'))).toBe('INNINGS_STILL_IN_PROGRESS');
    g.hits(1, 1, 1, 1, 1);
    expect(g.code(g.startPayload(1, LIONS, 'L3', 'L4', 'T11'))).toBe('WRONG_BATTING_TEAM');
    expect(g.code(g.startPayload(2, TIGERS, 'T1', 'T2', 'L11'))).toBe('WRONG_INNINGS_INDEX');
  });
});

describe('third wave — replacements, vacancies at over end, and what the tournament sees', () => {
  it('Law 17.8: the bowler finishing an injured bowler’s over may not be the bowler of the previous over', () => {
    const g = lionsBatting();
    g.dots(6).bowl('T10').dots(2);
    expect(g.code(g.bowlPayload('T11', 'injury'))).toBe('BOWLER_CONSECUTIVE_OVERS');
    expect(g.code(g.bowlPayload('T10', 'injury'))).not.toBe('OK');
    g.bowl('T9', 'injury').dots(4);
    const eligibility = bowlerEligibility(g.setup, g.state);
    expect(eligibility.eligible).not.toContain('T9');
    expect(eligibility.eligible).not.toContain('T10');
    expect(eligibility.eligible).toContain('T11');
    expect(g.inn.bowling.map((row) => [row.playerId, row.order])).toEqual([
      ['T11', 1],
      ['T10', 2],
      ['T9', 3],
    ]);
  });

  it('run out short of the non-striker end on the last ball: the vacancy swaps to the striker end for the next over', () => {
    const g = lionsBatting();
    g.dots(5).ball({ runsRun: 1, wicket: { type: 'run_out', playerOutId: 'L1', dismissalEnd: 'non_striker_end' } });
    expect(g.inn.strikerId).toBeNull();
    expect(g.inn.nonStrikerId).toBe('L2');
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', position: 'striker' });
    g.nextBatter();
    expect(g.inn.strikerId).toBe('L3');
  });

  it('run out by a substitute fielder and by the bowler render in scorebook notation', () => {
    const g = lionsBatting();
    g.ball({ runsRun: 1, wicket: { type: 'run_out', playerOutId: 'L2', dismissalEnd: 'striker_end', fielderIds: ['T12'] } });
    expect(g.row('L2').dismissalText).toBe('run out (sub (Ali))');
    g.nextBatter();
    g.ball({ wicket: { type: 'run_out', playerOutId: 'L1', dismissalEnd: 'non_striker_end', fielderIds: ['T11'] } });
    expect(g.row('L1').dismissalText).toBe('run out (Haris)');
    expect(g.bowler('T11').wickets).toBe(0);
  });

  it('overthrows off a wide are all wides and rotate strike on the completed run', () => {
    const g = lionsBatting();
    g.ball({ call: 'wide', runsRun: 1, boundary: 4 });
    expect(g.inn.extras.wides).toBe(6);
    expect(g.lastBall.bowlerRuns).toBe(6);
    expect(g.inn.strikerId).toBe('L2');
    expect(g.row('L1').balls).toBe(0);
  });

  it('accepting an undecided tie closes the match as a tie', () => {
    const g = tiedMainMatch();
    g.end();
    expect(g.state.result).toEqual({ type: 'tie', decider: null });
    expect(g.state.resultText).toBe('Match tied');
    expect(matchStatusLabel('completed', g.state.result)).toBe('Tied');
    expect(g.state.pendingAction).toBeNull();
  });

  it('a penalty to the side batting first after a tied chase breaks the tie in its favour', () => {
    const g = tiedMainMatch();
    g.penalty(LIONS, 0);
    expect(g.state.naturalResult).toEqual({ type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 5 }, method: 'normal' });
    expect(g.state.pendingAction?.type).toBe('confirm_result');
  });

  it('a penalty to the fielding side cannot name the innings its opponents are batting', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1);
    expect(g.code(g.penaltyPayload(LIONS, 1))).toBe('INVALID_PENALTY_INNINGS');
    expect(g.code(g.penaltyPayload(TIGERS, 0))).toBe('INVALID_PENALTY_INNINGS');
    expect(g.code(g.penaltyPayload(TIGERS, 2))).not.toBe('OK');
  });

  it('match summary: super overs are separate and never feed the main innings or player lines (BR-RS-06)', () => {
    const g = tiedFirstSuperOver(tiedMainMatch());
    g.superOver(2).start(4, LIONS, 'L1', 'L2', 'T9').dots(6);
    g.start(5, TIGERS, 'T2', 'T3', 'L9').hits(1);
    g.end();
    const summary = buildMatchSummary(g.setup, g.state, { completedAt: null });
    expect(summary).not.toBeNull();
    if (summary === null) {
      return;
    }
    expect(summary.innings.map((entry) => [entry.inningsIndex, entry.runs, entry.wickets, entry.legalBalls])).toEqual([
      [0, 6, 0, 6],
      [1, 6, 0, 6],
    ]);
    expect(summary.superOvers.map((entry) => entry.inningsIndex)).toEqual([2, 3, 4, 5]);
    expect(summary.winnerTeamId).toBe(TIGERS);
    expect(summary.innings[1].batting.map((line) => line.playerId).sort()).toEqual(['T1', 'T2']);
    expect(summary.innings[0].fours).toBe(0);
    expect(summary.innings[1].bowling.map((line) => line.playerId)).toEqual(['L11']);
  });

  it('match summary: batters unavailable counts as all out and a revised chase reports its allotted balls (NRR inputs)', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 5, playersPerSide: 4 }, { squadSize: 4 }), 'T4');
    g.hits(4).wicketThenNext().ball({ wicket: { type: 'bowled' } });
    g.push({ kind: 'innings_ended', reason: 'batters_unavailable', absentees: [{ playerId: 'L4', hurt: false }] });
    g.revise(1, 18, 10);
    g.start(1, TIGERS, 'T1', 'T2', 'L2');
    g.hits(1, 1).dots(4).bowl('L3').dots(6).bowl('L2').dots(6);
    g.end();
    const summary = buildMatchSummary(g.setup, g.state, { completedAt: null });
    expect(summary).not.toBeNull();
    if (summary === null) {
      return;
    }
    expect(summary.innings[0]).toMatchObject({ runs: 4, wickets: 2, legalBalls: 3, allottedBalls: 30, allOut: true, completion: 'batters_unavailable' });
    expect(summary.innings[1]).toMatchObject({ runs: 2, legalBalls: 18, allottedBalls: 18, allOut: false, target: 10, targetRevised: true });
    expect(summary.result).toEqual({ type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 7 }, method: 'revised_target' });
    expect(g.row('L4', 0)).toMatchObject({ status: 'absent', dismissalText: 'absent' });
  });
});

describe('fourth wave — short squads, powerplays, odd limits and edge formatting', () => {
  it('a side with fewer players present than it should field warns at the start and when a wicket leaves nobody to come in (EC-B-12)', () => {
    const setup = setupFor({}, { squadSize: 4 });
    const g = new Game(setup);
    const start = g.check(g.startPayload(0, LIONS, 'L1', 'L2', 'T4'));
    expect(start.ok ? start.warnings.map((warning) => warning.code) : ['rejected']).toContain('SQUAD_EXHAUSTED');
    g.start(0, LIONS, 'L1', 'L2', 'T4');
    expect(g.inn.limits.maxWickets).toBe(10);
    g.wicketThenNext().wicketThenNext();
    const last = g.check(g.delivery({ wicket: { type: 'bowled' } }));
    expect(last.ok ? last.warnings.map((warning) => warning.code) : ['rejected']).toContain('SQUAD_EXHAUSTED');
    g.ball({ wicket: { type: 'bowled' } });
    expect(g.inn.wickets).toBe(3);
    expect(g.inn.status).toBe('in_progress');
    expect(g.state.pendingAction).toMatchObject({ type: 'select_next_batter', candidates: [], canEndInnings: true });
  });

  it('powerplay phase totals and state follow the over boundary', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 3, powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 1 }] }));
    expect(g.inn.powerplay.active?.name).toBe('Powerplay');
    g.hits(4).wicketThenNext().ball({ call: 'wide' }).dots(4);
    expect(g.inn.balls.every((ball) => ball.powerplayName === 'Powerplay')).toBe(true);
    const phase = g.inn.powerplay.phases[0];
    expect(phase).toMatchObject({ state: 'complete', runs: 5, wickets: 1, legalBalls: 6 });
    expect(g.inn.powerplay.active).toBeNull();
    g.dots(1);
    expect(g.lastBall.powerplayName).toBeNull();
  });

  it('icc_one_fifth after a revision to 86 balls: ⌈86/6⌉ = 15 overs → 3 each, no extra-over bowlers', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 20, bowlerQuotaMode: 'icc_one_fifth' }));
    g.dots(1);
    g.revise(0, 86);
    expect(g.inn.limits).toMatchObject({ maxBalls: 86, maxOversPerBowler: 3, extraOverBowlers: 0 });
  });

  it('icc_one_fifth in a 3-over game still lets every bowler bowl at least one over', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 3, bowlerQuotaMode: 'icc_one_fifth' }));
    expect(g.inn.limits.maxOversPerBowler).toBe(1);
    expect(g.inn.limits.extraOverBowlers).toBe(3);
    g.dots(6).bowl('T10').dots(6);
    expect(g.code(g.bowlPayload('T11'))).toBe('OK');
  });

  it('penalties awarded between the innings go to the innings named, before the chase starts', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    expect(g.state.pendingAction?.type).toBe('start_next_innings');
    g.penalty(LIONS, 0);
    g.penalty(TIGERS, 1);
    expect(g.at(0).runs).toBe(11);
    tigersChase(g);
    expect(g.at(1).target?.runs).toBe(12);
    expect(g.at(1).runs).toBe(5);
    expect(g.state.chase).toMatchObject({ runsRequired: 7, ballsRemaining: 6 });
  });

  it('washout: abandoned before a ball, no result needs a started match (EC-R-11, U-RES-18)', () => {
    const g = new Game(setupFor());
    expect(g.code(g.endPayload({ type: 'no_result', reason: 'Rain' }))).toBe('MATCH_NOT_STARTED');
    expect(g.code(g.endPayload({ type: 'natural' }))).not.toBe('OK');
    g.end({ type: 'abandoned', reason: 'Waterlogged' });
    expect(g.state.lifecycle).toBe('abandoned');
    expect(g.state.innings).toHaveLength(0);
    expect(g.state.resultText).toBe('Match abandoned');
  });

  it('delivery before any innings is refused, and play cannot be suspended before it starts', () => {
    const g = new Game(setupFor());
    expect(g.code({ kind: 'strike_swapped' })).toBe('MATCH_NOT_STARTED');
    expect(g.code({ kind: 'play_suspended', reason: 'rain', note: null })).toBe('MATCH_NOT_STARTED');
  });

  it('a suspended match accepts no ball until play resumes (EC-I-14)', () => {
    const g = lionsBatting();
    g.dots(2).suspend();
    expect(g.state.pendingAction).toMatchObject({ type: 'resume_play', reason: 'rain' });
    expect(g.state.canRecordDelivery).toBe(false);
    expect(g.code(g.delivery())).toBe('PLAY_SUSPENDED');
    expect(g.code({ kind: 'play_resumed' })).toBe('OK');
    g.resume();
    expect(g.code({ kind: 'play_resumed' })).toBe('NOT_SUSPENDED');
    expect(g.state.canRecordDelivery).toBe(true);
  });

  it('edge formatting: overs notation and the chase requirement line', () => {
    expect(formatOvers(0, 6)).toBe('0');
    expect(formatOvers(100, 6)).toBe('16.4');
    expect(formatOvers(120, 6)).toBe('20');
    expect(formatOvers(120, 6, { alwaysShowBalls: true })).toBe('20.0');
    expect(formatOvers(86, 6)).toBe('14.2');
    expect(formatRequirement(23, 14)).toBe('Need 23 from 14 balls');
    expect(formatRequirement(1, 1)).toBe('Need 1 run from 1 ball');
  });

  it('declaring the chase short of the target loses by runs', () => {
    const g = lionsBatting(setupFor({ oversPerInnings: 1 }));
    g.hits(1, 1, 1, 1, 1, 1);
    tigersChase(g).hits(1, 1);
    g.push({ kind: 'innings_ended', reason: 'declared', absentees: [] });
    expect(g.at(1).completion?.reason).toBe('declared');
    expect(g.state.naturalResult).toEqual({ type: 'win', winnerTeamId: LIONS, loserTeamId: TIGERS, margin: { kind: 'runs', runs: 4 }, method: 'normal' });
  });
});

describe('attribution survives a stale stamp (EC-C-17, BR-SF-06)', () => {
  it('replay credits the runs to the derived striker and only warns', () => {
    const g = lionsBatting();
    g.hits(1).hits(2);
    const tampered = g.events.map((event) => (event.seq === 3 && event.kind === 'delivery' ? { ...event, strikerId: 'L1', nonStrikerId: 'L2' } : event));
    const state = replayMatch(g.setup, tampered);
    expect(state.needsRepair).toBe(false);
    expect(state.issues.map((issue) => [issue.seq, issue.severity, issue.code])).toEqual([[3, 'warning', 'CONTEXT_MISMATCH']]);
    const inn = state.innings[0];
    expect(inn.batting.find((row) => row.playerId === 'L2')?.runs).toBe(2);
    expect(inn.batting.find((row) => row.playerId === 'L1')?.runs).toBe(1);
    expect(inn.balls[1].strikerId).toBe('L2');
  });
});

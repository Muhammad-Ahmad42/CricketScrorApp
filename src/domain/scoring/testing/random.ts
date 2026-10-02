import type { MatchEvent, MatchRules, MatchSetup, MatchState } from '../../types';
import { buildEvents, type ScoringIntent } from '../commands';
import { battingSquad, otherTeamId } from '../internal/squad';
import { applyEvent, currentInnings, initialMatchState } from '../replay';
import { envelope } from './events';
import { matchSetup } from './fixtures';

export interface Random {
  readonly next: () => number;
  readonly int: (maxExclusive: number) => number;
  readonly pick: <T>(items: readonly T[]) => T;
  readonly chance: (probability: number) => boolean;
}

export function seededRandom(seed: number): Random {
  let value = seed >>> 0;
  const next = (): number => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive);
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => items[int(items.length)],
    chance: (probability: number): boolean => next() < probability,
  };
}

export function randomRules(random: Random): Partial<MatchRules> {
  const base = matchSetup().rules;
  return {
    oversPerInnings: 1 + random.int(4),
    ballsPerOver: random.pick([4, 5, 6, 6, 6, 8]),
    playersPerSide: random.pick([3, 5, 7, 11]),
    lastManStands: random.chance(0.3),
    maxOversPerBowler: random.pick([null, 1, 2]),
    bowlerQuotaMode: random.pick(['uniform', 'uniform', 'icc_one_fifth'] as const),
    allowBowlerConsecutiveOvers: random.chance(0.2),
    wide: { penaltyRuns: random.pick([0, 1, 1, 2]), countsAsBall: random.chance(0.2) },
    noBall: { penaltyRuns: random.pick([1, 1, 2]), freeHit: random.chance(0.7), countsAsBall: random.chance(0.2) },
    superOver: { ...base.superOver, ifTiedAgain: random.pick(['repeat', 'boundary_count', 'tie_stands'] as const), maxRounds: random.pick([null, 1, 2]) },
    mandatoryRetirement: random.chance(0.2) ? { atRuns: 6 + random.int(10), mayReturn: random.chance(0.5), timing: random.pick(['immediately', 'end_of_over'] as const) } : null,
  };
}

function deliveryIntent(random: Random, state: MatchState): ScoringIntent {
  const innings = currentInnings(state);
  const striker = innings?.strikerId ?? '';
  const nonStriker = innings?.nonStrikerId ?? striker;
  const roll = random.int(20);
  if (roll < 9) {
    return { type: 'runs', runsRun: random.pick([0, 0, 1, 1, 2, 3]), ...(random.chance(0.2) ? { boundary: random.pick([4, 6] as const), runsRun: 0 } : {}) };
  }
  switch (roll) {
    case 9:
      return { type: 'wide', runsRun: random.int(3), boundary: random.chance(0.1) };
    case 10:
      return { type: 'no_ball', runsTo: random.pick(['bat', 'bye', 'leg_bye'] as const), runsRun: random.int(3) };
    case 11:
      return { type: 'bye', runsRun: 1 + random.int(3) };
    case 12:
      return { type: 'leg_bye', runsRun: 1 + random.int(2), shortRuns: random.chance(0.2) ? 1 : 0 };
    case 13:
      return { type: 'wicket', dismissal: random.pick(['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'] as const), fielderIds: [] };
    case 14:
      return {
        type: 'wicket',
        dismissal: 'run_out',
        playerOutId: random.chance(0.5) ? striker : nonStriker,
        dismissalEnd: random.pick(['striker_end', 'non_striker_end'] as const),
        runsRun: random.int(3),
        call: random.pick(['fair', 'wide', 'no_ball'] as const),
      };
    case 15:
      return { type: 'runs', runsRun: 1 + random.int(3), shortRuns: 1 };
    default:
      return { type: 'runs', runsRun: random.int(4) };
  }
}

function sideIntent(random: Random, setup: MatchSetup, state: MatchState): ScoringIntent | null {
  const innings = currentInnings(state);
  if (innings === null) {
    return null;
  }
  switch (random.int(8)) {
    case 0:
      return { type: 'swap_strike' };
    case 1:
      return innings.strikerId === null ? null : { type: 'retire', playerId: innings.strikerId, retirement: random.pick(['retired_hurt', 'retired_not_out', 'retired_out'] as const) };
    case 2:
      return { type: 'penalty', teamId: random.pick([setup.teams[0].id, setup.teams[1].id]), runs: 5, reason: 'Penalty' };
    case 3:
      return { type: 'suspend_play', reason: 'rain' };
    case 4:
      return innings.nonStrikerId === null ? null : { type: 'off_ball_dismissal', playerId: innings.nonStrikerId, dismissal: 'run_out' };
    case 5:
      return innings.index <= 1 ? { type: 'revise_overs', inningsIndex: innings.index, balls: innings.legalBalls + 1 + random.int(12), reason: 'Rain' } : null;
    default:
      return null;
  }
}

function startIntent(random: Random, setup: MatchSetup, state: MatchState): ScoringIntent | null {
  const pending = state.pendingAction;
  if (pending?.type !== 'start_next_innings') {
    return null;
  }
  const battingTeamId = pending.suggestedBattingTeamId ?? random.pick([setup.teams[0].id, setup.teams[1].id]);
  const batters = battingSquad(setup, battingTeamId).map((player) => player.playerId);
  const bowlers = battingSquad(setup, otherTeamId(setup, battingTeamId)).map((player) => player.playerId);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const striker = random.pick(batters);
    const nonStriker = random.pick(batters);
    const intent: ScoringIntent = { type: 'start_innings', strikerId: striker, nonStrikerId: nonStriker, bowlerId: random.pick(bowlers), battingTeamId };
    if (striker !== nonStriker && buildEvents(setup, state, intent).ok) {
      return intent;
    }
  }
  return null;
}

function nextIntent(random: Random, setup: MatchSetup, state: MatchState): ScoringIntent | null {
  const pending = state.pendingAction;
  if (pending === null) {
    return random.chance(0.08) ? (sideIntent(random, setup, state) ?? deliveryIntent(random, state)) : deliveryIntent(random, state);
  }
  switch (pending.type) {
    case 'select_next_batter':
      if (pending.candidates.length === 0 || random.chance(0.03)) {
        return { type: 'end_innings', reason: 'batters_unavailable' };
      }
      return { type: 'batter_in', playerId: random.pick(pending.candidates), position: pending.position };
    case 'select_next_bowler':
      return pending.eligible.length === 0 ? { type: 'end_innings', reason: 'declared' } : { type: 'select_bowler', bowlerId: random.pick(pending.eligible) };
    case 'start_next_innings':
      return startIntent(random, setup, state);
    case 'resume_play':
      return random.chance(0.1) ? { type: 'revise_overs', inningsIndex: 1, balls: 6, reason: 'Rain' } : { type: 'resume_play' };
    case 'confirm_result':
      return { type: 'end_match', outcome: { type: 'natural' } };
    case 'resolve_tie':
      return pending.options.includes('super_over') && random.chance(0.7) ? { type: 'start_super_over' } : { type: 'end_match', outcome: { type: 'natural' } };
    default: {
      const unreachable: never = pending;
      return unreachable;
    }
  }
}

export interface RandomMatch {
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
}

export function randomMatch(seed: number, options: { readonly maxEvents?: number; readonly setup?: MatchSetup } = {}): RandomMatch {
  const random = seededRandom(seed);
  const setup = options.setup ?? matchSetup({ rules: randomRules(random) });
  const maxEvents = options.maxEvents ?? 400;
  const events: MatchEvent[] = [];
  let state = initialMatchState(setup);
  let stalls = 0;
  let action = 1;
  while (events.length < maxEvents && state.result === null && stalls < 50) {
    const intent = nextIntent(random, setup, state);
    const built = intent === null ? null : buildEvents(setup, state, intent);
    if (built === null || !built.ok) {
      stalls += 1;
      continue;
    }
    stalls = 0;
    const actionId = `a${action}`;
    action += 1;
    for (const payload of built.events) {
      const event = envelope(setup, payload, state.lastSeq + 1, actionId);
      events.push(event);
      state = applyEvent(setup, state, event);
    }
  }
  return { setup, events, state };
}

import type { InningsState, MatchEvent, MatchEventInput, MatchSetup, MatchState, PlayerId } from '../../types';
import { buildEvents, type ScoringIntent } from '../commands';
import { applyEvent, currentInnings, replayMatch } from '../replay';
import {
  envelope,
  m3Setup,
  matchSetup,
  playedMatch,
  playScript,
  type InningsPlan,
  type ScriptOptions,
  type ScriptStep,
} from '../testing';

export const G1_FIRST_INNINGS = ['start:L1:L2:T7', '1 4 wd 0 2 6 1', '@T8 0 W>L3 1 nb1 0 lb1 2', '@T7 1 1 1 1 1 1'];
export const G1_CHASE = ['start:T1:T2:L10', '4 4 1 1 2 6', '@L11 1 0 W:c:L7>T3 2 1 4', '@L10 1 1'];

export function g1(): { readonly setup: MatchSetup; readonly events: readonly MatchEvent[]; readonly state: MatchState } {
  const setup = m3Setup();
  const played = playScript(setup, [...G1_FIRST_INNINGS, ...G1_CHASE]);
  return { setup, events: played.events, state: played.state };
}

export function fresh(setup: MatchSetup = matchSetup()): { readonly setup: MatchSetup; readonly events: readonly MatchEvent[]; readonly state: MatchState } {
  const played = playScript(setup, ['start:L1:L2:T7']);
  return { setup, events: played.events, state: played.state };
}

export function play(setup: MatchSetup, steps: readonly ScriptStep[], options?: ScriptOptions): { readonly setup: MatchSetup; readonly events: readonly MatchEvent[]; readonly state: MatchState } {
  const played = playScript(setup, steps, options);
  return { setup, events: played.events, state: played.state };
}

export function firstInningsOnly(setup: MatchSetup, plan: InningsPlan): { readonly setup: MatchSetup; readonly events: readonly MatchEvent[]; readonly state: MatchState } {
  const played = playedMatch({ setup, first: plan, second: null });
  return { setup, events: played.events, state: played.state };
}

export function chaseAfter(
  setup: MatchSetup,
  plan: InningsPlan,
  chaseSteps: readonly ScriptStep[],
  options: ScriptOptions = { autoBowlers: true, autoBatters: true },
  openers: string = 'start:T1:T2:L10',
): { readonly setup: MatchSetup; readonly events: readonly MatchEvent[]; readonly state: MatchState } {
  const first = firstInningsOnly(setup, plan);
  const played = playScript(setup, [openers, ...chaseSteps], { ...options, prior: first.events });
  return { setup, events: played.events, state: played.state };
}

export function scoringSteps(runs: number, wickets: number): readonly ScriptStep[] {
  const sixes = Math.floor(runs / 6);
  const rest = runs % 6;
  return [...Array.from({ length: wickets }, () => 'W'), ...Array.from({ length: sixes }, () => '6'), ...(rest > 0 ? [`${rest}`] : [])];
}

export function chaseAt(
  setup: MatchSetup,
  spec: { readonly firstRuns: number; readonly runs: number; readonly wickets: number },
  extra: readonly ScriptStep[] = [],
): { readonly setup: MatchSetup; readonly events: readonly MatchEvent[]; readonly state: MatchState } {
  return chaseAfter(setup, { runs: spec.firstRuns }, [...scoringSteps(spec.runs, spec.wickets), ...extra]);
}

export function inn(state: MatchState, index?: number): InningsState {
  const innings = index === undefined ? currentInnings(state) : state.innings[index];
  if (innings === undefined || innings === null) {
    throw new Error('no innings');
  }
  return innings;
}

export function batter(state: MatchState, playerId: PlayerId, index?: number) {
  const row = inn(state, index).batting.find((candidate) => candidate.playerId === playerId);
  if (row === undefined) {
    throw new Error(`no batting row for ${playerId}`);
  }
  return row;
}

export function bowler(state: MatchState, playerId: PlayerId, index?: number) {
  const row = inn(state, index).bowling.find((candidate) => candidate.playerId === playerId);
  if (row === undefined) {
    throw new Error(`no bowling row for ${playerId}`);
  }
  return row;
}

export function lastBall(state: MatchState, index?: number) {
  const balls = inn(state, index).balls;
  return balls[balls.length - 1];
}

export function build(setup: MatchSetup, state: MatchState, intent: ScoringIntent): readonly MatchEventInput[] {
  const result = buildEvents(setup, state, intent);
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result.events;
}

export function step(setup: MatchSetup, state: MatchState, intent: ScoringIntent): MatchState {
  let next = state;
  for (const payload of build(setup, state, intent)) {
    next = applyEvent(setup, next, envelope(setup, payload, next.lastSeq + 1, `x${next.lastSeq + 1}`));
  }
  return next;
}

export function appendPayloads(setup: MatchSetup, events: readonly MatchEvent[], payloads: readonly MatchEventInput[]): { readonly events: readonly MatchEvent[]; readonly state: MatchState } {
  const extended = [...events];
  for (const payload of payloads) {
    const seq = extended.length + 1;
    extended.push(envelope(setup, payload, seq, `raw${seq}`));
  }
  return { events: extended, state: replayMatch(setup, extended) };
}

export function corrupted(payload: MatchEventInput, patch: Readonly<Record<string, unknown>>): MatchEventInput {
  return Object.assign({}, payload, patch);
}

export function delivery(state: MatchState, facts: Partial<Extract<MatchEventInput, { readonly kind: 'delivery' }>> = {}): MatchEventInput {
  const innings = inn(state);
  const base = {
    kind: 'delivery' as const,
    strikerId: innings.strikerId ?? '',
    nonStrikerId: innings.nonStrikerId,
    bowlerId: innings.bowlerId ?? '',
    runsRun: 0,
    shortRuns: 0,
    boundary: 0 as const,
    wicket: null,
  };
  return { ...base, call: 'fair', runsTo: 'bat', ...facts } as MatchEventInput;
}

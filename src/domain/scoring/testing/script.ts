import type { MatchEvent, MatchSetup, MatchState, PlayerId, TeamId } from '../../types';
import { buildEvents, type ScoringIntent } from '../commands';
import { dismissedInEarlierSuperOvers } from '../internal/eligibility';
import { battingSquad, otherTeamId } from '../internal/squad';
import { applyEvent, currentInnings, replayMatch } from '../replay';
import { envelope } from './events';
import { expandSteps, type ScriptStep } from './notation';

export interface ScriptOptions {
  readonly autoBowlers?: boolean;
  readonly autoBatters?: boolean;
  readonly autoStart?: boolean;
  readonly prior?: readonly MatchEvent[];
}

export interface ScriptResult {
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
}

const DELIVERY_INTENTS: readonly ScoringIntent['type'][] = ['runs', 'wide', 'no_ball', 'bye', 'leg_bye', 'wicket'];
const NEEDS_FULL_CREASE: readonly ScoringIntent['type'][] = [...DELIVERY_INTENTS, 'select_bowler', 'swap_strike', 'retire'];

function describe(intent: ScoringIntent): string {
  return JSON.stringify(intent);
}

export function bowlingPreference(setup: MatchSetup, fieldingTeamId: TeamId): readonly PlayerId[] {
  return battingSquad(setup, fieldingTeamId)
    .map((player) => player.playerId)
    .reverse();
}

function autoBowler(setup: MatchSetup, state: MatchState): PlayerId | null {
  const pending = state.pendingAction;
  const innings = currentInnings(state);
  if (pending?.type !== 'select_next_bowler' || innings === null) {
    return null;
  }
  const preference = bowlingPreference(setup, innings.bowlingTeamId);
  const overs = (playerId: PlayerId): number => innings.bowling.find((row) => row.playerId === playerId)?.oversUsed ?? 0;
  const ranked = pending.eligible
    .slice()
    .sort((a, b) => overs(a) - overs(b) || preference.indexOf(a) - preference.indexOf(b));
  return ranked[0] ?? null;
}

function autoStartIntent(setup: MatchSetup, state: MatchState): ScoringIntent | null {
  const pending = state.pendingAction;
  if (pending?.type !== 'start_next_innings') {
    return null;
  }
  const battingTeamId = pending.suggestedBattingTeamId ?? setup.teams[0].id;
  const barred = pending.superOverRound !== null && pending.superOverRound >= 2 ? dismissedInEarlierSuperOvers(state, pending.superOverRound) : new Set<PlayerId>();
  const openers = battingSquad(setup, battingTeamId)
    .map((player) => player.playerId)
    .filter((playerId) => !barred.has(playerId));
  if (openers.length < 2) {
    return null;
  }
  for (const bowlerId of bowlingPreference(setup, otherTeamId(setup, battingTeamId))) {
    const intent: ScoringIntent = { type: 'start_innings', strikerId: openers[0], nonStrikerId: openers[1], bowlerId, battingTeamId };
    if (buildEvents(setup, state, intent).ok) {
      return intent;
    }
  }
  return null;
}

function autoBatter(state: MatchState): ScoringIntent | null {
  const pending = state.pendingAction;
  if (pending?.type !== 'select_next_batter' || pending.candidates.length === 0) {
    return null;
  }
  return { type: 'batter_in', playerId: pending.candidates[0], position: pending.position };
}

export class ScriptRunner {
  private events: MatchEvent[];
  private state: MatchState;
  private action: number;

  constructor(
    private readonly setup: MatchSetup,
    private readonly options: ScriptOptions = {},
  ) {
    this.events = [...(options.prior ?? [])];
    this.state = replayMatch(setup, this.events);
    this.action = new Set(this.events.map((event) => event.actionId)).size + 1;
  }

  get result(): ScriptResult {
    return { events: this.events, state: this.state };
  }

  apply(intent: ScoringIntent, label: string): void {
    const built = buildEvents(this.setup, this.state, intent);
    if (!built.ok) {
      throw new Error(`Script step ${label} ${describe(intent)} was rejected: ${built.code} — ${built.message}`);
    }
    const actionId = `a${this.action}`;
    this.action += 1;
    for (const payload of built.events) {
      const event = envelope(this.setup, payload, this.state.lastSeq + 1, actionId);
      this.events.push(event);
      this.state = applyEvent(this.setup, this.state, event);
    }
  }

  private autoFill(intent: ScoringIntent, label: string): void {
    for (let guard = 0; guard < 4; guard += 1) {
      const delivery = DELIVERY_INTENTS.includes(intent.type);
      const start = this.options.autoStart === true && delivery ? autoStartIntent(this.setup, this.state) : null;
      if (start !== null) {
        this.apply(start, `${label} (auto start)`);
        continue;
      }
      const batter = this.options.autoBatters === true && NEEDS_FULL_CREASE.includes(intent.type) ? autoBatter(this.state) : null;
      if (batter !== null) {
        this.apply(batter, `${label} (auto batter)`);
        continue;
      }
      const bowler = this.options.autoBowlers === true && delivery ? autoBowler(this.setup, this.state) : null;
      if (bowler !== null) {
        this.apply({ type: 'select_bowler', bowlerId: bowler, reason: 'over_start' }, `${label} (auto bowler)`);
        continue;
      }
      return;
    }
  }

  run(steps: readonly ScriptStep[]): this {
    expandSteps(steps).forEach((step, index) => {
      const label = `#${index + 1}`;
      const draft = typeof step === 'function' ? step(this.state) : step;
      this.autoFill(draft, label);
      const intent = typeof step === 'function' ? step(this.state) : draft;
      this.apply(intent, label);
    });
    return this;
  }
}

export function playScript(setup: MatchSetup, steps: readonly ScriptStep[], options: ScriptOptions = {}): ScriptResult {
  return new ScriptRunner(setup, options).run(steps).result;
}

export function scriptedMatch(setup: MatchSetup, steps: readonly ScriptStep[], options: ScriptOptions = {}): MatchEvent[] {
  return [...playScript(setup, steps, options).events];
}

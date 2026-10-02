/** @jest-environment node */
import type {
  InningsState,
  MatchEvent,
  MatchEventInput,
  MatchPlayer,
  MatchSetup,
  MatchState,
  MatchSummary,
  PlayerId,
  ReplayIssue,
} from '../../types';
import { EVENT_VALIDATION_CODES, MATCH_EVENT_KINDS } from '../../types';
import { buildEvents } from '../commands';
import {
  applyHistoryEdits,
  editEvent,
  lastActionGroup,
  logFingerprint,
  normalizeLog,
  redoAction,
  undoLastAction,
  type EditContext,
  type HistoryEditOp,
} from '../history';
import { applyEvent, currentInnings, initialMatchState, replayMatch } from '../replay';
import { formatResult } from '../result';
import { buildMatchSummary } from '../summary';
import { validateEvent, validateLog } from '../validate';
import {
  battersUnavailable,
  declare,
  deepFreeze,
  endMatch,
  m3Setup,
  m8LmsSetup,
  m8v7Setup,
  matchSetup,
  penalty,
  playScript,
  randomMatch,
  reviseOvers,
  ScriptRunner,
  seededRandom,
  suspendPlay,
  type Random,
  type ScriptStep,
} from '../testing';

const NOW = '2026-06-01T12:00:00.000Z';
const STAMP = '2026-05-01T10:00:00.000Z';

const G1_STEPS: readonly ScriptStep[] = [
  'start:L1:L2:T7',
  '1 4 wd 0 2 6 1',
  '@T8 0 W>L3 1 nb1 0 lb1 2',
  '@T7 1 1 1 1 1 1',
  'start:T1:T2:L10',
  '4 4 1 1 2 6',
  '@L11 1 0 W:c:L7>T3 2 1 4',
  '@L10 1 1',
];

interface Played {
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
}

function g1(): Played {
  const setup = m3Setup();
  const played = playScript(setup, G1_STEPS);
  return { setup, events: played.events, state: played.state };
}

function play(setup: MatchSetup, steps: readonly ScriptStep[]): Played {
  const played = playScript(setup, steps, { autoBatters: true, autoBowlers: true });
  return { setup, events: played.events, state: played.state };
}

function editContext(prefix = 'n'): EditContext {
  let next = 0;
  return {
    ids: () => {
      next += 1;
      return `${prefix}${next}`;
    },
    now: NOW,
  };
}

function inn(state: MatchState, index?: number): InningsState {
  const innings = index === undefined ? currentInnings(state) : state.innings[index];
  if (innings === undefined || innings === null) {
    throw new Error('no innings');
  }
  return innings;
}

function battingRow(state: MatchState, playerId: PlayerId, index?: number) {
  const found = inn(state, index).batting.find((candidate) => candidate.playerId === playerId);
  if (found === undefined) {
    throw new Error(`no batting row for ${playerId}`);
  }
  return found;
}

function bowlingRow(state: MatchState, playerId: PlayerId, index?: number) {
  return inn(state, index).bowling.find((candidate) => candidate.playerId === playerId) ?? null;
}

function stateBefore(setup: MatchSetup, events: readonly MatchEvent[], seq: number): MatchState {
  return replayMatch(setup, events.filter((event) => event.seq < seq));
}

function fairBall(state: MatchState, facts: Readonly<Record<string, unknown>> = {}): MatchEventInput {
  const innings = inn(state);
  return {
    kind: 'delivery',
    call: 'fair',
    runsTo: 'bat',
    strikerId: innings.strikerId ?? '',
    nonStrikerId: innings.nonStrikerId,
    bowlerId: innings.bowlerId ?? '',
    runsRun: 0,
    shortRuns: 0,
    boundary: 0,
    wicket: null,
    ...facts,
  } as MatchEventInput;
}

function rawEvent(setup: MatchSetup, fields: object, seq: number, id = `x${seq}`): MatchEvent {
  return { id, matchId: setup.matchId, seq, actionId: `act-${id}`, recordedAt: STAMP, ...fields } as unknown as MatchEvent;
}

function append(setup: MatchSetup, events: readonly MatchEvent[], fields: object, id = 'bad'): readonly MatchEvent[] {
  return [...events, rawEvent(setup, fields, events.length + 1, id)];
}

function errorsOf(state: MatchState): readonly ReplayIssue[] {
  return state.issues.filter((issue) => issue.severity === 'error');
}

function withoutRepair(state: MatchState): MatchState {
  return { ...state, issues: [], lastSeq: 0, needsRepair: false, canRecordDelivery: false };
}

function contiguousActions(events: readonly MatchEvent[]): boolean {
  const closed = new Set<string>();
  for (let index = 0; index < events.length; index += 1) {
    const actionId = events[index].actionId;
    if (closed.has(actionId)) {
      return false;
    }
    if (index + 1 < events.length && events[index + 1].actionId !== actionId) {
      closed.add(actionId);
    }
  }
  return true;
}

function deliveriesOf(events: readonly MatchEvent[], inningsIndex: number): readonly MatchEvent[] {
  let current = -1;
  const found: MatchEvent[] = [];
  for (const event of events) {
    if (event.kind === 'innings_started') {
      current = event.inningsIndex;
    } else if (event.kind === 'delivery' && current === inningsIndex) {
      found.push(event);
    }
  }
  return found;
}

function fold(setup: MatchSetup, events: readonly MatchEvent[], from: MatchState = initialMatchState(setup)): MatchState {
  let state = from;
  for (const event of events) {
    state = applyEvent(setup, state, event);
  }
  return state;
}

function cloneState(state: MatchState): MatchState {
  return typeof structuredClone === 'function' ? structuredClone(state) : (JSON.parse(JSON.stringify(state)) as MatchState);
}

function projection(state: MatchState) {
  return {
    lifecycle: state.lifecycle,
    currentInningsIndex: state.currentInningsIndex,
    result: state.result,
    naturalResult: state.naturalResult,
    resultText: state.resultText,
    pendingAction: state.pendingAction,
    innings: state.innings.map((innings) => ({
      index: innings.index,
      battingTeamId: innings.battingTeamId,
      status: innings.status,
      completion: innings.completion?.reason ?? null,
      runs: innings.runs,
      wickets: innings.wickets,
      legalBalls: innings.legalBalls,
      extras: innings.extras,
      target: innings.target,
      strikerId: innings.strikerId,
      nonStrikerId: innings.nonStrikerId,
      batting: innings.batting.map((entry) => [entry.playerId, entry.status, entry.runs, entry.balls, entry.fours, entry.sixes]),
      bowling: innings.bowling.map((entry) => [entry.playerId, entry.legalBalls, entry.runsConceded, entry.wickets, entry.maidens]),
    })),
  };
}

function median(values: readonly number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function summaryOf(setup: MatchSetup, state: MatchState): MatchSummary {
  const summary = buildMatchSummary(setup, state, { completedAt: NOW });
  if (summary === null) {
    throw new Error('expected a summary');
  }
  return summary;
}

describe('adversarial: replay totality with hostile input', () => {
  const setup = matchSetup();
  const ready = playScript(setup, ['start:L1:L2:T7', '1 2']).events;

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 'delivery ', 'DELIVERY', ''])(
    'an event of kind %p is UNKNOWN_EVENT_KIND and changes nothing else',
    (kind) => {
      const clean = replayMatch(setup, ready);
      const events = append(setup, ready, { kind });
      expect(() => replayMatch(setup, events)).not.toThrow();
      const replayed = replayMatch(setup, events);
      expect(replayed.issues).toEqual([expect.objectContaining({ seq: 4, eventId: 'bad', severity: 'error', code: 'UNKNOWN_EVENT_KIND' })]);
      expect(replayed.needsRepair).toBe(true);
      expect(replayed.lastSeq).toBe(4);
      expect(replayed.lastAppliedSeq).toBe(3);
      expect(withoutRepair(replayed)).toEqual(withoutRepair(clean));
      expect(fold(setup, events)).toEqual(replayed);
    },
  );

  interface HostileCase {
    readonly name: string;
    readonly prefix: readonly ScriptStep[];
    readonly event: (state: MatchState) => object;
    readonly code?: string;
  }

  const hostile: readonly HostileCase[] = [
    { name: 'delivery call "constructor"', prefix: ['start:L1:L2:T7'], event: (s) => ({ ...fairBall(s), call: 'constructor' }) },
    { name: 'delivery runsTo "toString"', prefix: ['start:L1:L2:T7'], event: (s) => ({ ...fairBall(s), runsTo: 'toString' }) },
    {
      name: 'wicket type "constructor"',
      prefix: ['start:L1:L2:T7'],
      event: (s) => fairBall(s, { wicket: { type: 'constructor', playerOutId: 'L1', fielderIds: [], dismissalEnd: null } }),
    },
    {
      name: 'wicket fielderIds given as a string',
      prefix: ['start:L1:L2:T7'],
      event: (s) => fairBall(s, { wicket: { type: 'caught', playerOutId: 'L1', fielderIds: 'T1', dismissalEnd: null } }),
    },
    {
      name: 'wicket with three fielders',
      prefix: ['start:L1:L2:T7'],
      event: (s) => fairBall(s, { wicket: { type: 'run_out', playerOutId: 'L1', fielderIds: ['T1', 'T2', 'T3'], dismissalEnd: 'striker_end' } }),
      code: 'TOO_MANY_FIELDERS',
    },
    {
      name: 'fielder from the batting side',
      prefix: ['start:L1:L2:T7'],
      event: (s) => fairBall(s, { wicket: { type: 'caught', playerOutId: 'L1', fielderIds: ['L5'], dismissalEnd: null } }),
      code: 'FIELDER_NOT_IN_FIELDING_SIDE',
    },
    { name: 'retirement "valueOf"', prefix: ['start:L1:L2:T7'], event: () => ({ kind: 'batter_retired', playerId: 'L1', retirement: 'valueOf' }) },
    { name: 'off-ball dismissal type "toString"', prefix: ['start:L1:L2:T7'], event: () => ({ kind: 'batter_dismissed', playerId: 'L2', type: 'toString', fielderIds: [] }) },
    { name: 'innings_ended reason "constructor"', prefix: ['start:L1:L2:T7'], event: () => ({ kind: 'innings_ended', reason: 'constructor', absentees: [] }) },
    { name: 'bowler reason "hasOwnProperty"', prefix: ['start:L1:L2:T7', '1 1 1 1 1 1'], event: () => ({ kind: 'bowler_selected', bowlerId: 'T8', reason: 'hasOwnProperty' }) },
    {
      name: 'bowler "constructor" who is not in the squad',
      prefix: ['start:L1:L2:T7', '1 1 1 1 1 1'],
      event: () => ({ kind: 'bowler_selected', bowlerId: 'constructor', reason: 'over_start' }),
      code: 'PLAYER_NOT_IN_SQUAD',
    },
    { name: 'batter_in position "__proto__"', prefix: ['start:L1:L2:T7', 'W'], event: () => ({ kind: 'batter_in', playerId: 'L3', position: '__proto__' }) },
    {
      name: 'batter_in of "toString" who is not in the squad',
      prefix: ['start:L1:L2:T7', 'W'],
      event: () => ({ kind: 'batter_in', playerId: 'toString', position: 'striker' }),
      code: 'PLAYER_NOT_IN_SQUAD',
    },
    {
      name: 'penalty for team "constructor"',
      prefix: ['start:L1:L2:T7'],
      event: () => ({ kind: 'penalty_awarded', teamId: 'constructor', inningsIndex: 0, runs: 5, reason: 'x' }),
      code: 'TEAM_NOT_IN_MATCH',
    },
    { name: 'super over round "constructor"', prefix: ['start:L1:L2:T7'], event: () => ({ kind: 'super_over_started', round: 'constructor' }) },
    { name: 'innings_started with index "__proto__"', prefix: ['start:L1:L2:T7'], event: () => ({ kind: 'innings_started', inningsIndex: '__proto__', battingTeamId: 'TIG', strikerId: 'T1', nonStrikerId: 'T2', bowlerId: 'L10' }) },
  ];

  it.each(hostile.map((entry) => [entry.name, entry] as const))('%s is skipped as one error without side effects', (_name, entry) => {
    const prefix = playScript(setup, entry.prefix).events;
    const clean = replayMatch(setup, prefix);
    const events = append(setup, prefix, entry.event(clean));
    const replayed = replayMatch(setup, events);
    expect(errorsOf(replayed)).toEqual([expect.objectContaining({ seq: events.length, eventId: 'bad', severity: 'error' })]);
    if (entry.code !== undefined) {
      expect(errorsOf(replayed)[0].code).toBe(entry.code);
    }
    expect(withoutRepair(replayed)).toEqual(withoutRepair(clean));
    expect(fold(setup, events)).toEqual(replayed);
  });

  it('match_ended with a garbage or missing outcome on a chase awaiting confirmation is rejected', () => {
    const { setup: g1Setup, events, state } = g1();
    for (const outcome of [{ type: 'toString' }, null, 'natural', { type: 'walkover', winnerTeamId: 'constructor', reason: null }, {}]) {
      const damaged = append(g1Setup, events, { kind: 'match_ended', outcome });
      const replayed = replayMatch(g1Setup, damaged);
      expect(errorsOf(replayed)).toHaveLength(1);
      expect(replayed.lifecycle).toBe('live');
      expect(withoutRepair(replayed)).toEqual(withoutRepair(state));
    }
  });

  it.each([
    ['runsRun', NaN, 'INVALID_RUNS'],
    ['runsRun', Infinity, 'INVALID_RUNS'],
    ['runsRun', -1, 'INVALID_RUNS'],
    ['runsRun', 1.5, 'INVALID_RUNS'],
    ['runsRun', 10, 'INVALID_RUNS'],
    ['runsRun', 1e21, 'INVALID_RUNS'],
    ['runsRun', '1', null],
    ['runsRun', null, null],
    ['runsRun', undefined, null],
    ['boundary', 5, 'INVALID_BOUNDARY'],
    ['boundary', 2, 'INVALID_BOUNDARY'],
    ['boundary', -4, 'INVALID_BOUNDARY'],
    ['boundary', NaN, 'INVALID_BOUNDARY'],
    ['boundary', '4', null],
    ['shortRuns', 3, 'INVALID_SHORT_RUNS'],
    ['shortRuns', -1, 'INVALID_SHORT_RUNS'],
    ['shortRuns', 0.5, 'INVALID_SHORT_RUNS'],
    ['shortRuns', NaN, 'INVALID_SHORT_RUNS'],
  ] as const)('delivery with %s = %p is rejected (%p) and never pollutes totals', (field, value, code) => {
    const clean = replayMatch(setup, ready);
    const facts: Record<string, unknown> = { runsRun: 2, [field]: value };
    const events = append(setup, ready, fairBall(clean, facts) as unknown as Record<string, unknown>);
    const replayed = replayMatch(setup, events);
    expect(errorsOf(replayed)).toHaveLength(1);
    if (code !== null) {
      expect(errorsOf(replayed)[0].code).toBe(code);
    }
    expect(inn(replayed).runs).toBe(3);
    expect(Number.isFinite(inn(replayed).runs)).toBe(true);
    expect(withoutRepair(replayed)).toEqual(withoutRepair(clean));
  });

  it.each([0, 100, -5, 2.5, NaN, Infinity, '5'])('penalty of %p runs is INVALID_PENALTY-style garbage', (runs) => {
    const clean = replayMatch(setup, ready);
    const events = append(setup, ready, { kind: 'penalty_awarded', teamId: 'LIO', inningsIndex: 0, runs, reason: 'Helmet' });
    const replayed = replayMatch(setup, events);
    expect(errorsOf(replayed)).toHaveLength(1);
    if (typeof runs === 'number') {
      expect(errorsOf(replayed)[0].code).toBe('INVALID_PENALTY');
    }
    expect(inn(replayed).runs).toBe(3);
    expect(withoutRepair(replayed)).toEqual(withoutRepair(clean));
  });

  it.each([
    ['maxBalls 0', { inningsIndex: 0, maxBalls: 0, target: null }, 'INVALID_OVERS_REVISION'],
    ['maxBalls -6', { inningsIndex: 0, maxBalls: -6, target: null }, 'INVALID_OVERS_REVISION'],
    ['maxBalls 1.5', { inningsIndex: 0, maxBalls: 1.5, target: null }, 'INVALID_OVERS_REVISION'],
    ['maxBalls NaN', { inningsIndex: 0, maxBalls: NaN, target: null }, 'INVALID_OVERS_REVISION'],
    ['maxBalls Infinity', { inningsIndex: 0, maxBalls: Infinity, target: null }, 'INVALID_OVERS_REVISION'],
    ['maxBalls below balls bowled', { inningsIndex: 0, maxBalls: 1, target: null }, 'INVALID_OVERS_REVISION'],
    ['a target on the first innings', { inningsIndex: 0, maxBalls: 60, target: 50 }, 'INVALID_TARGET'],
    ['planned chase target 0', { inningsIndex: 1, maxBalls: 60, target: 0 }, 'INVALID_TARGET'],
    ['planned chase target -1', { inningsIndex: 1, maxBalls: 60, target: -1 }, 'INVALID_TARGET'],
    ['planned chase target 2.5', { inningsIndex: 1, maxBalls: 60, target: 2.5 }, 'INVALID_TARGET'],
    ['planned chase target NaN', { inningsIndex: 1, maxBalls: 60, target: NaN }, 'INVALID_TARGET'],
    ['innings index 7', { inningsIndex: 7, maxBalls: 60, target: null }, 'WRONG_INNINGS_INDEX'],
    ['innings index -1', { inningsIndex: -1, maxBalls: 60, target: null }, 'WRONG_INNINGS_INDEX'],
    ['a super-over innings index', { inningsIndex: 2, maxBalls: 6, target: null }, 'WRONG_INNINGS_INDEX'],
  ] as const)('overs_revised with %s is rejected', (_name, fields, code) => {
    const clean = replayMatch(setup, ready);
    const events = append(setup, ready, { kind: 'overs_revised', terminal: false, reason: 'Rain', ...fields });
    const replayed = replayMatch(setup, events);
    expect(errorsOf(replayed).map((issue) => issue.code)).toEqual([code]);
    expect(withoutRepair(replayed)).toEqual(withoutRepair(clean));
    expect(replayed.plannedRevisions).toEqual([]);
    expect(inn(replayed).limits.maxBalls).toBe(120);
  });

  it.each(['4', 4.5, NaN, null, -4, 0, 3])('an envelope with seq %p after seq 3 is SEQ_OUT_OF_ORDER and never applied', (seq) => {
    const clean = replayMatch(setup, ready);
    const bad = { ...rawEvent(setup, fairBall(clean, { runsRun: 1 }) as unknown as Record<string, unknown>, 4, 'bad'), seq } as unknown as MatchEvent;
    const replayed = replayMatch(setup, [...ready, bad]);
    expect(errorsOf(replayed)).toEqual([expect.objectContaining({ eventId: 'bad', code: 'SEQ_OUT_OF_ORDER' })]);
    expect(inn(replayed).runs).toBe(3);
    expect(inn(replayed).balls).toHaveLength(2);
    expect(replayed.lastAppliedSeq).toBe(3);
  });

  it('a healthy log followed by 3000 garbage events stays total and linear', () => {
    const { setup: g1Setup, events, state } = g1();
    const garbage = Array.from({ length: 3000 }, (_, index) =>
      rawEvent(g1Setup, index % 3 === 0 ? { kind: 'delivery', runsRun: 'x' } : index % 3 === 1 ? { kind: 'nonsense' } : { kind: 'strike_swapped' }, events.length + 1 + index, `g${index}`),
    );
    const log = [...events, ...garbage];
    const started = performance.now();
    const replayed = replayMatch(g1Setup, log);
    const measured = performance.now() - started;
    console.log(`adversarial: replay of ${events.length} valid + ${garbage.length} garbage events: ${measured.toFixed(2)} ms`);
    expect(errorsOf(replayed)).toHaveLength(3000);
    expect(replayed.lastSeq).toBe(log.length);
    expect(replayed.lastAppliedSeq).toBe(events.length);
    expect(withoutRepair(replayed)).toEqual(withoutRepair(state));
  });

  it('a valid delivery stored as a prototype-less object is applied like any other', () => {
    const clean = replayMatch(setup, ready);
    const plain = rawEvent(setup, fairBall(clean, { runsRun: 1 }) as unknown as Record<string, unknown>, 4, 'e4');
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, plain) as unknown as MatchEvent;
    const expected = replayMatch(setup, [...ready, plain]);
    let replayed: MatchState | null = null;
    expect(() => {
      replayed = replayMatch(setup, [...ready, bare]);
    }).not.toThrow();
    expect(replayed).toEqual(expected);
    expect(() => logFingerprint([...ready, bare])).not.toThrow();
    expect(logFingerprint([...ready, bare])).toBe(logFingerprint([...ready, plain]));
  });
});

describe('adversarial: player and team ids that collide with Object.prototype', () => {
  const WEIRD = [
    'constructor',
    'toString',
    '__proto__',
    'hasOwnProperty',
    'valueOf',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
    '__defineGetter__',
    '__lookupGetter__',
    'prototype',
  ];

  function weirdSetup(): MatchSetup {
    const base = matchSetup();
    const lions: MatchPlayer[] = WEIRD.map((playerId, index) => ({
      matchId: base.matchId,
      playerId,
      teamId: 'LIO',
      name: `Lion ${index + 1}`,
      jerseyNumber: index + 1,
      role: index === 5 ? 'wicket_keeper' : 'batter',
      battingOrder: index + 1,
      isCaptain: index === 0,
      isWicketKeeper: index === 5,
      isSubstitute: false,
    }));
    return matchSetup({ players: [...lions, ...base.players.filter((player) => player.teamId === 'TIG')] });
  }

  it('scores, cards and eligibility work when player ids are prototype keys', () => {
    const setup = weirdSetup();
    const played = playScript(setup, ['start:constructor:toString:T7', '1 4 2 W>__proto__ 1 6', '@T8 1 1']);
    const state = played.state;
    expect(state.issues).toEqual([]);
    expect(inn(state)).toMatchObject({ runs: 16, wickets: 1, legalBalls: 8 });
    expect(battingRow(state, 'constructor')).toMatchObject({ runs: 8, balls: 3, sixes: 1, status: 'not_out' });
    expect(battingRow(state, 'toString')).toMatchObject({ runs: 6, balls: 3, fours: 1, status: 'out' });
    expect(battingRow(state, '__proto__')).toMatchObject({ runs: 2, balls: 2, status: 'not_out' });
    expect(battingRow(state, 'hasOwnProperty').status).toBe('yet_to_bat');
    const ids = inn(state).batting.map((entry) => entry.playerId);
    expect(new Set(ids).size).toBe(11);
    expect(bowlingRow(state, 'T7')).toMatchObject({ legalBalls: 6, runsConceded: 14, wickets: 1 });
    expect(bowlingRow(state, 'T8')).toMatchObject({ legalBalls: 2, runsConceded: 2 });
    expect(fold(setup, played.events)).toEqual(state);
    const vacancy = playScript(setup, ['start:constructor:toString:T7', 'W']).state;
    expect(vacancy.pendingAction).toMatchObject({ type: 'select_next_batter' });
    if (vacancy.pendingAction?.type === 'select_next_batter') {
      expect([...vacancy.pendingAction.candidates].sort()).toEqual(WEIRD.filter((id) => id !== 'constructor' && id !== 'toString').sort());
    }
  });

  it('a whole match between teams with prototype-key ids produces the right result and summary', () => {
    const setup = matchSetup({
      rules: { oversPerInnings: 1, powerplays: [] },
      teamA: { id: 'constructor', name: 'Ctor' },
      teamB: { id: '__proto__', name: 'Proto' },
    });
    const played = play(setup, ['start:constructor-1:constructor-2:__proto__-7', '1 1 1 1 1 1', 'start:__proto__-1:__proto__-2:constructor-7', '4 4', 'end']);
    expect(played.state.issues).toEqual([]);
    expect(played.state.result).toEqual({
      type: 'win',
      winnerTeamId: '__proto__',
      loserTeamId: 'constructor',
      margin: { kind: 'wickets', wickets: 10, ballsRemaining: 4 },
      method: 'normal',
    });
    if (played.state.result !== null) {
      expect(formatResult(played.state.result, setup.teams)).toBe('Proto won by 10 wickets (4 balls left)');
    }
    const summary = summaryOf(setup, played.state);
    expect(summary.winnerTeamId).toBe('__proto__');
    expect(summary.squads.map((squad) => [squad.teamId, squad.playerIds.length]).sort()).toEqual([
      ['__proto__', 11],
      ['constructor', 11],
    ]);
  });
});

describe('adversarial: fuzzed mutations of valid logs', () => {
  const GARBAGE: readonly unknown[] = [
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    -1,
    0,
    1.5,
    10,
    1e21,
    '',
    'x',
    '1',
    'constructor',
    '__proto__',
    'toString',
    true,
    false,
    [],
    ['L1', 'L1', 'L1'],
    {},
    { type: 'constructor' },
    [null],
    'L12',
    'T12',
    'LIO',
    'TIG',
    'L1',
    'T7',
    'striker',
    'over_start',
    'natural',
  ];
  const ENVELOPE = new Set(['id', 'matchId', 'seq', 'actionId', 'recordedAt']);
  const PAYLOAD_FIELDS = ['runsRun', 'boundary', 'shortRuns', 'inningsIndex', 'runs', 'maxBalls', 'target', 'playerId', 'bowlerId', 'teamId', 'position', 'reason', 'outcome', 'round', 'call', 'runsTo'];

  function mutate(random: Random, event: MatchEvent): MatchEvent {
    const copy: Record<string, unknown> = { ...event };
    const keys = Object.keys(copy).filter((key) => !ENVELOPE.has(key));
    switch (random.int(5)) {
      case 0:
        copy[random.pick(keys)] = random.pick(GARBAGE);
        break;
      case 1: {
        const removable = keys.filter((key) => key !== 'kind');
        if (removable.length > 0) {
          delete copy[random.pick(removable)];
        }
        break;
      }
      case 2: {
        const wicket = copy.wicket;
        if (wicket !== null && typeof wicket === 'object') {
          const nested: Record<string, unknown> = { ...(wicket as Record<string, unknown>) };
          nested[random.pick(Object.keys(nested))] = random.pick(GARBAGE);
          copy.wicket = nested;
        } else {
          copy.wicket = random.pick<unknown>([
            { type: 'run_out', playerOutId: 'L1', fielderIds: [], dismissalEnd: 'striker_end' },
            { type: 'bowled', playerOutId: 'T1', fielderIds: [], dismissalEnd: null },
            { type: 'caught', playerOutId: 'L2', fielderIds: ['T12'], dismissalEnd: null },
            ...GARBAGE,
          ]);
        }
        break;
      }
      case 3:
        copy.kind = random.pick<unknown>([...MATCH_EVENT_KINDS, 'toString', 'constructor', 42, null]);
        break;
      default:
        copy[random.pick(PAYLOAD_FIELDS)] = random.pick(GARBAGE);
    }
    return copy as unknown as MatchEvent;
  }

  it('replay stays total, fold-equivalent and self-consistent over 150 mutated random matches', () => {
    let totalErrors = 0;
    for (let seed = 5001; seed <= 5150; seed += 1) {
      const match = randomMatch(seed, { maxEvents: 150 });
      if (match.events.length === 0) {
        continue;
      }
      const random = seededRandom(seed * 31);
      const events = [...match.events];
      const mutations = 1 + random.int(3);
      for (let count = 0; count < mutations; count += 1) {
        const index = random.int(events.length);
        events[index] = mutate(random, events[index]);
      }
      const label = `seed ${seed}`;
      let state = initialMatchState(match.setup);
      for (const event of events) {
        validateEvent(match.setup, state, event, 'append');
        validateEvent(match.setup, state, event, 'replay');
        state = applyEvent(match.setup, state, event);
      }
      const replayed = replayMatch(match.setup, events);
      expect({ label, equal: replayed }).toEqual({ label, equal: state });
      const errorSeqs = new Map<number, number>();
      for (const issue of replayed.issues) {
        expect(EVENT_VALIDATION_CODES).toContain(issue.code);
        expect(typeof issue.message === 'string' && issue.message.length > 0).toBe(true);
        const source = events.find((event) => event.seq === issue.seq);
        expect({ label, id: issue.eventId }).toEqual({ label, id: source?.id });
        if (issue.severity === 'error') {
          errorSeqs.set(issue.seq, (errorSeqs.get(issue.seq) ?? 0) + 1);
        } else {
          expect({ label, code: issue.code, kind: source?.kind }).toEqual({ label, code: 'CONTEXT_MISMATCH', kind: 'delivery' });
        }
      }
      expect([...errorSeqs.values()].every((count) => count === 1)).toBe(true);
      totalErrors += errorSeqs.size;
      expect(replayed.needsRepair).toBe(errorSeqs.size > 0);
      expect(validateLog(match.setup, events).ok).toBe(errorSeqs.size === 0);
      expect(replayed.lastSeq).toBe(events[events.length - 1].seq);
      const applied = events.filter((event) => !errorSeqs.has(event.seq));
      expect({ label, lastApplied: replayed.lastAppliedSeq }).toEqual({ label, lastApplied: applied.length === 0 ? 0 : applied[applied.length - 1].seq });
      const ballIds = replayed.innings.flatMap((innings) => innings.balls.map((ball) => ball.eventId)).sort();
      const appliedDeliveries = applied.filter((event) => event.kind === 'delivery').map((event) => event.id).sort();
      expect({ label, ballIds }).toEqual({ label, ballIds: appliedDeliveries });
      if (replayed.needsRepair) {
        expect(replayed.canRecordDelivery).toBe(false);
      }
      expect(() => normalizeLog(match.setup, events)).not.toThrow();
      expect(logFingerprint(events)).toMatch(/^[0-9a-f]{8}$/);
      expect(() => applyHistoryEdits(match.setup, events, [{ op: 'delete', seq: events[events.length - 1].seq }], editContext())).not.toThrow();
      expect(() => undoLastAction(events)).not.toThrow();
    }
    expect(totalErrors).toBeGreaterThan(50);
  });

  it('buildEvents rejects out-of-range intents with the validator codes instead of building them', () => {
    const setup = matchSetup();
    const state = playScript(setup, ['start:L1:L2:T7']).state;
    const cases: readonly [Record<string, unknown>, string][] = [
      [{ type: 'runs', runsRun: 10 }, 'INVALID_RUNS'],
      [{ type: 'runs', runsRun: -1 }, 'INVALID_RUNS'],
      [{ type: 'runs', runsRun: NaN }, 'INVALID_RUNS'],
      [{ type: 'runs', runsRun: 1.5 }, 'INVALID_RUNS'],
      [{ type: 'runs', runsRun: 2, shortRuns: 3 }, 'INVALID_SHORT_RUNS'],
      [{ type: 'runs', runsRun: 0, boundary: 5 }, 'INVALID_BOUNDARY'],
      [{ type: 'no_ball', runsTo: 'bye', runsRun: 0, boundary: 6 }, 'SIX_NOT_OFF_BAT'],
      [{ type: 'no_ball', runsTo: 'bat', runsRun: 0, boundary: 5 }, 'INVALID_BOUNDARY'],
      [{ type: 'penalty', teamId: 'LIO', runs: 0, reason: 'x' }, 'INVALID_PENALTY'],
      [{ type: 'penalty', teamId: 'LIO', runs: 100, reason: 'x' }, 'INVALID_PENALTY'],
      [{ type: 'penalty', teamId: 'NOPE', runs: 5, reason: 'x' }, 'TEAM_NOT_IN_MATCH'],
    ];
    for (const [intent, code] of cases) {
      let result: ReturnType<typeof buildEvents> | null = null;
      expect(() => {
        result = buildEvents(setup, state, intent as never);
      }).not.toThrow();
      expect({ intent, result }).toEqual({ intent, result: expect.objectContaining({ ok: false, code }) });
    }
  });
});

describe('adversarial: one invalid event never hides the rest of the log', () => {
  it('an always-invalid event spliced into 60 random matches skips only itself', () => {
    let checked = 0;
    for (let seed = 3001; seed <= 3060; seed += 1) {
      const match = randomMatch(seed, { maxEvents: 200 });
      if (match.events.length < 4) {
        continue;
      }
      const random = seededRandom(seed);
      const at = 1 + random.int(match.events.length - 1);
      const bad = rawEvent(match.setup, { kind: 'coin_flip', heads: true }, at + 1, 'bad');
      const damaged = [...match.events.slice(0, at), bad, ...match.events.slice(at).map((event) => ({ ...event, seq: event.seq + 1 }))];
      const state = replayMatch(match.setup, damaged);
      const label = `seed ${seed} at ${at + 1}`;
      expect({ label, errors: errorsOf(state).map((issue) => [issue.seq, issue.eventId, issue.code]) }).toEqual({ label, errors: [[at + 1, 'bad', 'UNKNOWN_EVENT_KIND']] });
      expect({ label, tail: [state.lastSeq, state.lastAppliedSeq] }).toEqual({ label, tail: [damaged.length, damaged.length] });
      expect({ label, projection: projection(state) }).toEqual({ label, projection: projection(match.state) });
      expect(state.needsRepair).toBe(true);
      expect(state.canRecordDelivery).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('an invalid tail leaves lastAppliedSeq behind lastSeq and blocks recording although nothing is pending', () => {
    const { setup, events } = g1();
    const prefix = events.slice(0, 3);
    const clean = replayMatch(setup, prefix);
    expect(clean.canRecordDelivery).toBe(true);
    const damaged = append(setup, prefix, fairBall(clean, { boundary: 5 }) as unknown as Record<string, unknown>);
    const state = replayMatch(setup, damaged);
    expect(state).toMatchObject({ lastSeq: 4, lastAppliedSeq: 3, needsRepair: true, canRecordDelivery: false, pendingAction: null, lifecycle: 'live' });
    expect(errorsOf(state)).toEqual([expect.objectContaining({ seq: 4, eventId: 'bad', code: 'INVALID_BOUNDARY' })]);
    expect(withoutRepair(state)).toEqual(withoutRepair(clean));
    const verdict = validateLog(setup, damaged);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.issues.map((issue) => issue.code)).toEqual(['INVALID_BOUNDARY']);
      expect(verdict.state).toEqual(state);
    }
    const undone = undoLastAction(damaged);
    expect(undone?.undone.map((event) => event.id)).toEqual(['bad']);
    expect(replayMatch(setup, undone?.events ?? [])).toEqual(clean);
  });

  it('a mid-log invalid event is repaired by deleting it through a history edit, and only that way', () => {
    const setup = matchSetup();
    const clean = playScript(setup, ['start:L1:L2:T7', '1 2 3']).events;
    const bad = rawEvent(setup, fairBall(stateBefore(setup, clean, 3), { boundary: 5 }) as unknown as Record<string, unknown>, 3, 'bad');
    const damaged = [...clean.slice(0, 2), bad, ...clean.slice(2).map((event) => ({ ...event, seq: event.seq + 1 }))];
    const broken = replayMatch(setup, damaged);
    expect(broken.needsRepair).toBe(true);
    expect(inn(broken).runs).toBe(6);
    expect(broken.canRecordDelivery).toBe(false);
    const repaired = applyHistoryEdits(setup, damaged, [{ op: 'delete', seq: 3 }], editContext());
    expect(repaired).toMatchObject({ ok: true });
    if (repaired.ok) {
      expect(repaired.before.needsRepair).toBe(true);
      expect(repaired.after.needsRepair).toBe(false);
      expect(repaired.after.issues).toEqual([]);
      expect(repaired.events).toEqual(clean);
      expect(repaired.after).toEqual(replayMatch(setup, clean));
      expect(repaired.diff.removedIds).toEqual(['bad']);
    }
    const unrelated = editEvent(setup, damaged, 2, [fairBall(stateBefore(setup, damaged, 2))], editContext());
    expect(unrelated).toMatchObject({ ok: false, code: 'INVALID_BOUNDARY' });
  });
});

describe('adversarial: incremental equivalence without hidden state', () => {
  it('applyEvent never mutates frozen states and works from structurally cloned states (40 random matches)', () => {
    for (let seed = 7001; seed <= 7040; seed += 1) {
      const match = randomMatch(seed, { maxEvents: 250 });
      const label = `seed ${seed}`;
      let state = deepFreeze(initialMatchState(match.setup));
      for (const event of match.events) {
        state = deepFreeze(applyEvent(match.setup, state, event));
      }
      const replayed = replayMatch(match.setup, match.events);
      expect({ label, state }).toEqual({ label, state: replayed });
      const random = seededRandom(seed);
      for (let sample = 0; sample < 3 && match.events.length > 0; sample += 1) {
        const k = random.int(match.events.length);
        const resumed = fold(match.setup, match.events.slice(k), cloneState(replayMatch(match.setup, match.events.slice(0, k))));
        expect({ label, k, resumed }).toEqual({ label, k, resumed: replayed });
      }
    }
  });

  it('replay of JSON round-tripped setup and events is deep-equal (no identity or prototype dependence)', () => {
    for (const match of [g1(), randomMatch(42), randomMatch(4242)]) {
      const setupCopy = JSON.parse(JSON.stringify(match.setup)) as MatchSetup;
      const eventsCopy = JSON.parse(JSON.stringify(match.events)) as MatchEvent[];
      expect(replayMatch(setupCopy, eventsCopy)).toEqual(replayMatch(match.setup, match.events));
      const reordered = eventsCopy.map((event) => Object.fromEntries(Object.entries(event).reverse()) as unknown as MatchEvent);
      expect(replayMatch(setupCopy, reordered)).toEqual(replayMatch(match.setup, match.events));
    }
  });

  it('replay does not depend on the order of setup.players: same scores, cards of batters who batted, and prompt order', () => {
    const { setup, events, state } = g1();
    const random = seededRandom(77);
    const shuffled = setup.players.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = random.int(index + 1);
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    const reordered: MatchSetup = { ...setup, players: shuffled };
    const replayed = replayMatch(reordered, events);
    expect(replayed.naturalResult).toEqual(state.naturalResult);
    for (const index of [0, 1]) {
      const batted = (s: MatchState) => inn(s, index).batting.filter((entry) => entry.position !== null);
      expect(batted(replayed)).toEqual(batted(state));
      expect(inn(replayed, index).bowling).toEqual(inn(state, index).bowling);
      expect(inn(replayed, index).runs).toBe(inn(state, index).runs);
    }
    const vacancy = events.slice(0, events.findIndex((event) => event.kind === 'batter_in'));
    const original = replayMatch(setup, vacancy).pendingAction;
    const permuted = replayMatch(reordered, vacancy).pendingAction;
    expect(original?.type).toBe('select_next_batter');
    expect(permuted).toEqual(original);
    if (original?.type === 'select_next_batter') {
      expect(original.candidates).toEqual(['L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11']);
    }
  });

  it('stale stamps in 60 random matches are warnings only, applied with the derived context, and normalizeLog restores them', () => {
    for (let seed = 4001; seed <= 4060; seed += 1) {
      const match = randomMatch(seed, { maxEvents: 200 });
      const random = seededRandom(seed * 13);
      const regulars = (teamId: string): PlayerId[] =>
        match.setup.players.filter((player) => player.teamId === teamId && !player.isSubstitute).map((player) => player.playerId);
      let state = initialMatchState(match.setup);
      const staleIds: string[] = [];
      const scrambled = match.events.map((event) => {
        const before = state;
        state = applyEvent(match.setup, state, event);
        const innings = currentInnings(before);
        if (event.kind !== 'delivery' || innings === null || innings.kind !== 'regular' || !random.chance(0.3)) {
          return event;
        }
        const batters = regulars(innings.battingTeamId);
        const striker = random.pick(batters);
        const nonStriker = event.nonStrikerId === null ? null : random.pick(batters.filter((id) => id !== striker));
        const bowler = random.pick(regulars(innings.bowlingTeamId));
        const changed = { ...event, strikerId: striker, nonStrikerId: nonStriker, bowlerId: bowler };
        if (striker !== event.strikerId || nonStriker !== event.nonStrikerId || bowler !== event.bowlerId) {
          staleIds.push(event.id);
        }
        return changed as MatchEvent;
      });
      const label = `seed ${seed}`;
      const replayed = replayMatch(match.setup, scrambled);
      expect({ label, errors: errorsOf(replayed) }).toEqual({ label, errors: [] });
      expect({ label, warned: replayed.issues.map((issue) => [issue.eventId, issue.code]) }).toEqual({ label, warned: staleIds.map((id) => [id, 'CONTEXT_MISMATCH']) });
      expect({ label, state: { ...replayed, issues: [] } }).toEqual({ label, state: { ...match.state, issues: [] } });
      expect(fold(match.setup, scrambled)).toEqual(replayed);
      const normalized = normalizeLog(match.setup, scrambled);
      expect({ label, events: normalized.events }).toEqual({ label, events: match.events });
      expect({ label, restamped: [...normalized.restampedIds].sort() }).toEqual({ label, restamped: [...staleIds].sort() });
      expect(normalized.reanchoredIds).toEqual([]);
      expect(normalizeLog(match.setup, normalized.events)).toEqual({ events: normalized.events, reanchoredIds: [], restampedIds: [] });
    }
  });
});

describe('adversarial: undo and redo', () => {
  it('undoing 30 random matches to empty and redoing every group restores the identical log and state', () => {
    for (let seed = 8001; seed <= 8030; seed += 1) {
      const match = randomMatch(seed, { maxEvents: 150 });
      const label = `seed ${seed}`;
      let events: readonly MatchEvent[] = match.events;
      const stack: (readonly MatchEvent[])[] = [];
      while (events.length > 0) {
        const group = lastActionGroup(events);
        const undo = undoLastAction(events);
        if (undo === null) {
          throw new Error('undo returned null for a non-empty log');
        }
        expect(undo.undone).toEqual(group);
        expect(new Set(group.map((event) => event.actionId)).size).toBe(1);
        expect([...undo.events, ...undo.undone]).toEqual(events);
        const previous = undo.events[undo.events.length - 1];
        if (previous !== undefined) {
          expect(previous.actionId).not.toBe(group[0].actionId);
        }
        stack.push(undo.undone);
        events = undo.events;
      }
      expect({ label, groups: stack.length }).toEqual({ label, groups: new Set(match.events.map((event) => event.actionId)).size });
      let finalState: MatchState | null = null;
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const redo = redoAction(match.setup, events, stack[index]);
        if (!redo.ok) {
          throw new Error(`${label}: redo of group ${index} failed with ${redo.code}`);
        }
        events = redo.events;
        finalState = redo.state;
      }
      expect({ label, events }).toEqual({ label, events: match.events });
      expect({ label, finalState }).toEqual({ label, finalState: match.state });
    }
  });

  it('undo and redo never mutate a frozen log', () => {
    const { setup, events } = g1();
    const frozen = deepFreeze(events.map((event) => ({ ...event })));
    const snapshot = JSON.stringify(frozen);
    const undo = undoLastAction(frozen);
    expect(undo).not.toBeNull();
    const redo = redoAction(setup, undo?.events ?? [], undo?.undone ?? []);
    expect(redo.ok).toBe(true);
    expect(JSON.stringify(frozen)).toBe(snapshot);
    if (redo.ok) {
      expect(redo.events).toEqual(frozen);
      expect(redo.events).not.toBe(frozen);
    }
  });

  it('lastActionGroup takes only the trailing contiguous run of an actionId that also appears earlier', () => {
    const setup = matchSetup();
    const base = playScript(setup, ['start:L1:L2:T7', '1 1 1']).events;
    const relabelled = base.map((event, index) => ({ ...event, actionId: ['x', 'y', 'x', 'x'][index] }));
    expect(lastActionGroup(relabelled).map((event) => event.seq)).toEqual([3, 4]);
    const undo = undoLastAction(relabelled);
    expect(undo?.events.map((event) => event.seq)).toEqual([1, 2]);
  });

  it('redo out of order, a double redo and a redo after divergence are REDO_STALE; the right order works', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '1', '2', '3']);
    const first = undoLastAction(played.events);
    const second = first === null ? null : undoLastAction(first.events);
    if (first === null || second === null) {
      throw new Error('undo failed');
    }
    expect(redoAction(setup, second.events, first.undone)).toMatchObject({ ok: false, code: 'REDO_STALE' });
    const back = redoAction(setup, second.events, second.undone);
    expect(back.ok).toBe(true);
    if (!back.ok) {
      return;
    }
    expect(redoAction(setup, back.events, second.undone)).toMatchObject({ ok: false, code: 'REDO_STALE' });
    const full = redoAction(setup, back.events, first.undone);
    expect(full).toMatchObject({ ok: true });
    if (full.ok) {
      expect(full.events).toEqual(played.events);
      expect(full.state).toEqual(played.state);
    }
    const diverged = playScript(setup, ['4'], { prior: second.events }).events;
    expect(redoAction(setup, diverged, second.undone)).toMatchObject({ ok: false, code: 'REDO_STALE' });
  });

  it('redo of an older undone group after a different action refilled the same seq is REDO_STALE', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '1', '2', '3']);
    const first = undoLastAction(played.events);
    const second = first === null ? null : undoLastAction(first.events);
    if (first === null || second === null) {
      throw new Error('undo failed');
    }
    const diverged = playScript(setup, ['4'], { prior: second.events }).events;
    expect(diverged[diverged.length - 1].seq).toBe(second.undone[0].seq);
    const divergedWithNewIdentity = diverged.map((event, index) => (index === diverged.length - 1 ? { ...event, id: 'other-3', actionId: 'other' } : event));
    expect(first.tailId).toBe(second.undone[second.undone.length - 1].id);
    expect(second.tailId).toBe(second.events[second.events.length - 1].id);
    expect(redoAction(setup, divergedWithNewIdentity, first.undone, first.tailId)).toMatchObject({ ok: false, code: 'REDO_STALE' });
    const back = redoAction(setup, second.events, second.undone, second.tailId);
    expect(back.ok).toBe(true);
    if (!back.ok) {
      return;
    }
    const full = redoAction(setup, back.events, first.undone, first.tailId);
    expect(full.ok).toBe(true);
    if (full.ok) {
      expect(full.events).toEqual(played.events);
    }
    expect(redoAction(setup, [], played.events.slice(0, 1), null)).toMatchObject({ ok: true });
    expect(redoAction(setup, played.events.slice(0, 1), played.events.slice(1, 2), null)).toMatchObject({ ok: false, code: 'REDO_STALE' });
  });

  it('redo re-validates the group and reports the validator code of a tampered event', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '1', '2']);
    const undo = undoLastAction(played.events);
    if (undo === null) {
      throw new Error('undo failed');
    }
    const tampered = undo.undone.map((event) => ({ ...event, boundary: 5 }) as unknown as MatchEvent);
    expect(redoAction(setup, undo.events, tampered)).toMatchObject({ ok: false, code: 'INVALID_BOUNDARY' });
    const staleStamp = undo.undone.map((event) => ({ ...event, strikerId: 'L9' }) as MatchEvent);
    expect(redoAction(setup, undo.events, staleStamp)).toMatchObject({ ok: false, code: 'CONTEXT_MISMATCH' });
  });

  it('redo works from an empty log and restores a confirmed result', () => {
    const setup = matchSetup();
    const opening = playScript(setup, ['start:L1:L2:T7']);
    const undoneStart = undoLastAction(opening.events);
    expect(undoneStart?.events).toEqual([]);
    const restarted = redoAction(setup, [], undoneStart?.undone ?? []);
    expect(restarted).toMatchObject({ ok: true });
    if (restarted.ok) {
      expect(restarted.state.lifecycle).toBe('live');
    }
    const { setup: g1Setup, events } = g1();
    const confirmed = playScript(g1Setup, ['end'], { prior: events });
    const reopen = undoLastAction(confirmed.events);
    if (reopen === null) {
      throw new Error('undo failed');
    }
    expect(replayMatch(g1Setup, reopen.events).result).toBeNull();
    const redone = redoAction(g1Setup, reopen.events, reopen.undone);
    expect(redone).toMatchObject({ ok: true });
    if (redone.ok) {
      expect(redone.state.lifecycle).toBe('completed');
      expect(redone.state.result).toEqual(confirmed.state.result);
      expect(buildMatchSummary(g1Setup, redone.state, { completedAt: NOW })).toEqual(buildMatchSummary(g1Setup, confirmed.state, { completedAt: NOW }));
    }
  });

  it('a both-innings revision is one action: undo removes both events and redo restores both', () => {
    const setup = matchSetup();
    const runner = new ScriptRunner(setup, { autoBatters: true, autoBowlers: true });
    runner.run(['start:L1:L2:T7', '1 1 1 1 1 1']);
    runner.apply(reviseOvers(0, { overs: 10, scope: 'both_innings' }), 'revise');
    const { events, state } = runner.result;
    const group = lastActionGroup(events);
    expect(group.map((event) => event.kind)).toEqual(['overs_revised', 'overs_revised']);
    expect(state.plannedRevisions.map((entry) => [entry.inningsIndex, entry.revision.maxBalls])).toEqual([[1, 60]]);
    expect(inn(state, 0).limits.maxBalls).toBe(60);
    const undo = undoLastAction(events);
    if (undo === null) {
      throw new Error('undo failed');
    }
    const reverted = replayMatch(setup, undo.events);
    expect(reverted.plannedRevisions).toEqual([]);
    expect(inn(reverted, 0).limits).toMatchObject({ maxBalls: 120, revised: false });
    const redo = redoAction(setup, undo.events, undo.undone);
    expect(redo).toMatchObject({ ok: true });
    if (redo.ok) {
      expect(redo.state).toEqual(state);
    }
  });
});

describe('adversarial: historical edits', () => {
  it('SCORING_ENGINE 11.2: a 1 -> 2 run edit makes a later bowled wicket of the recorded batter fail at that seq; keeping strike fixes it', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '1 0 0 W']);
    const wicketSeq = played.events[played.events.length - 1].seq;
    expect(wicketSeq).toBe(5);
    const replacement = fairBall(stateBefore(setup, played.events, 2), { runsRun: 2 });
    const plain = editEvent(setup, played.events, 2, [replacement], editContext());
    expect(plain).toMatchObject({ ok: false, code: 'DISMISSED_PLAYER_NOT_AT_CREASE', atSeq: 5 });
    const kept = applyHistoryEdits(
      setup,
      played.events,
      [
        { op: 'replace', seq: 2, with: [replacement] },
        { op: 'insert_after', seq: 2, events: [{ kind: 'strike_swapped' }] },
      ],
      editContext(),
    );
    expect(kept).toMatchObject({ ok: true });
    if (kept.ok) {
      expect(kept.diff.restampedIds).toEqual([]);
      expect(battingRow(kept.after, 'L1')).toMatchObject({ runs: 2, balls: 1 });
      expect(battingRow(kept.after, 'L2')).toMatchObject({ runs: 0, balls: 3, status: 'out' });
      expect(inn(kept.after)).toMatchObject({ runs: 2, wickets: 1 });
    }
  });

  it('inserting a forgotten legal ball re-anchors the next over one delivery earlier and hands the displaced ball to the next bowler', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '0 0 0 0 0 0', '@T8 1 1']);
    const selection = played.events[7];
    const displaced = played.events[6];
    expect(selection.kind).toBe('bowler_selected');
    const inserted = fairBall(stateBefore(setup, played.events, 4));
    const outcome = applyHistoryEdits(setup, played.events, [{ op: 'insert_before', seq: 4, events: [inserted] }], editContext());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const order = outcome.events.map((event) => event.id);
    expect(order.indexOf(selection.id)).toBe(order.indexOf(displaced.id) - 1);
    expect(outcome.diff.reanchoredIds).toEqual([selection.id]);
    expect(outcome.diff.restampedIds).toEqual([displaced.id]);
    expect(outcome.events.find((event) => event.id === displaced.id)).toMatchObject({ bowlerId: 'T8', strikerId: 'L2', nonStrikerId: 'L1' });
    expect(outcome.diff.insertedIds).toHaveLength(1);
    const added = outcome.events.find((event) => event.id === outcome.diff.insertedIds[0]);
    expect(added).toMatchObject({ kind: 'delivery', seq: 4, recordedAt: NOW });
    expect(played.events.some((event) => event.id === added?.id || event.actionId === added?.actionId)).toBe(false);
    expect(outcome.events.map((event) => event.seq)).toEqual(outcome.events.map((_, index) => index + 1));
    expect(bowlingRow(outcome.after, 'T7')).toMatchObject({ legalBalls: 6, runsConceded: 0, maidens: 1 });
    expect(bowlingRow(outcome.after, 'T8')).toMatchObject({ legalBalls: 3, runsConceded: 2 });
    expect(inn(outcome.after).overs[0]).toMatchObject({ isMaiden: true, bowlerIds: ['T7'], legalBalls: 6 });
    expect(inn(outcome.after)).toMatchObject({ runs: 2, legalBalls: 9 });
  });

  it('deleting a legal ball moves the selection one delivery later and gives the first ball of the next over back to the old bowler', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '0 0 0 0 0 0', '@T8 1 1']);
    const selection = played.events[7];
    const firstOfNext = played.events[8];
    const secondOfNext = played.events[9];
    const outcome = applyHistoryEdits(setup, played.events, [{ op: 'delete', seq: 3 }], editContext());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const order = outcome.events.map((event) => event.id);
    expect(order.indexOf(selection.id)).toBe(order.indexOf(firstOfNext.id) + 1);
    expect(outcome.diff.reanchoredIds).toEqual([selection.id]);
    expect(outcome.diff.restampedIds).toEqual([firstOfNext.id]);
    expect(outcome.events.find((event) => event.id === firstOfNext.id)).toMatchObject({ bowlerId: 'T7', strikerId: 'L1' });
    expect(outcome.events.find((event) => event.id === secondOfNext.id)).toMatchObject({ bowlerId: 'T8', strikerId: 'L1' });
    expect(bowlingRow(outcome.after, 'T7')).toMatchObject({ legalBalls: 6, runsConceded: 1, maidens: 0 });
    expect(bowlingRow(outcome.after, 'T8')).toMatchObject({ legalBalls: 1, runsConceded: 1 });
    expect(battingRow(outcome.after, 'L1')).toMatchObject({ runs: 2, balls: 7 });
    expect(battingRow(outcome.after, 'L2')).toMatchObject({ runs: 0, balls: 0 });
  });

  it('deleting an over-start bowler selection whose over was bowled fails with BOWLER_NOT_SELECTED', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '0 0 0 0 0 0', '@T8 1 1']);
    expect(applyHistoryEdits(setup, played.events, [{ op: 'delete', seq: 8 }], editContext())).toMatchObject({ ok: false, code: 'BOWLER_NOT_SELECTED' });
  });

  it('replacing the over-start selection re-stamps that over to the new bowler', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '0 0 0 0 0 0', '@T8 1 1']);
    const outcome = editEvent(setup, played.events, 8, [{ kind: 'bowler_selected', bowlerId: 'T9', reason: 'over_start' }], editContext());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.events.slice(8).every((event) => event.kind === 'delivery' && event.bowlerId === 'T9')).toBe(true);
    expect([...outcome.diff.restampedIds].sort()).toEqual([played.events[8].id, played.events[9].id].sort());
    expect(bowlingRow(outcome.after, 'T8')).toBeNull();
    expect(bowlingRow(outcome.after, 'T9')).toMatchObject({ legalBalls: 2, runsConceded: 2 });
    expect(outcome.affectedInnings).toEqual([0]);
    expect(outcome.resultChanged).toBe(false);
  });

  it('ops address the original seqs, so their order in the request does not matter', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '1 1 1 1']);
    const dot = fairBall(stateBefore(setup, played.events, 5));
    const forward: HistoryEditOp[] = [
      { op: 'delete', seq: 3 },
      { op: 'replace', seq: 5, with: [dot] },
    ];
    const a = applyHistoryEdits(setup, played.events, forward, editContext());
    const b = applyHistoryEdits(setup, played.events, [...forward].reverse(), editContext());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.events).toEqual(a.events);
      expect(b.after).toEqual(a.after);
      expect(inn(a.after)).toMatchObject({ runs: 2, legalBalls: 3 });
    }
  });

  it('editEvent is exactly a single replace op', () => {
    const { setup, events } = g1();
    const seq = deliveriesOf(events, 0)[3].seq;
    const replacement = fairBall(stateBefore(setup, events, seq), { runsRun: 3 });
    expect(editEvent(setup, events, seq, [replacement], editContext())).toEqual(
      applyHistoryEdits(setup, events, [{ op: 'replace', seq, with: [replacement] }], editContext()),
    );
  });

  it('EC-C-11: raising the first-innings total of an unconfirmed chase simply resumes the chase', () => {
    const { setup, events, state } = g1();
    expect(state.naturalResult).toMatchObject({ type: 'win', winnerTeamId: 'TIG' });
    const dot = deliveriesOf(events, 0)[3];
    expect(dot).toMatchObject({ runsRun: 0, boundary: 0, call: 'fair' });
    const four = fairBall(stateBefore(setup, events, dot.seq), { boundary: 4 });
    const outcome = editEvent(setup, events, dot.seq, [four], editContext());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(inn(outcome.after, 0).runs).toBe(31);
    expect(inn(outcome.after, 1)).toMatchObject({ status: 'in_progress', runs: 28, legalBalls: 14, completion: null });
    expect(inn(outcome.after, 1).target?.runs).toBe(32);
    expect(outcome.after.naturalResult).toBeNull();
    expect(outcome.after.pendingAction).toBeNull();
    expect(outcome.after.canRecordDelivery).toBe(true);
    expect(outcome.after.chase).toMatchObject({ target: 32, runsRequired: 4, ballsRemaining: 4 });
    expect(outcome.resultChanged).toBe(true);
    expect([...outcome.affectedInnings].sort()).toEqual([0, 1]);
  });

  it('EC-C-12: lowering the first-innings total fails at the first event after the new target_reached; trimming the tail gives the earlier win', () => {
    const { setup, events } = g1();
    const six = deliveriesOf(events, 0).find((event) => event.kind === 'delivery' && event.boundary === 6);
    if (six === undefined) {
      throw new Error('no six');
    }
    const chase = deliveriesOf(events, 1);
    const winningNow = chase[10];
    expect(winningNow).toMatchObject({ runsRun: 1 });
    const firstAfter = chase[11];
    const dot = fairBall(stateBefore(setup, events, six.seq));
    const refused = editEvent(setup, events, six.seq, [dot], editContext());
    expect(refused).toMatchObject({ ok: false, atSeq: firstAfter.seq });
    const tail = events.filter((event) => event.seq >= firstAfter.seq);
    const trimmed = applyHistoryEdits(
      setup,
      events,
      [{ op: 'replace', seq: six.seq, with: [dot] }, ...tail.map((event): HistoryEditOp => ({ op: 'delete', seq: event.seq }))],
      editContext(),
    );
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) {
      return;
    }
    expect(inn(trimmed.after, 0).runs).toBe(21);
    expect(inn(trimmed.after, 1)).toMatchObject({ runs: 22, wickets: 1, legalBalls: 11, status: 'complete' });
    expect(inn(trimmed.after, 1).completion?.reason).toBe('target_reached');
    expect(trimmed.after.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: 'TIG',
      loserTeamId: 'LIO',
      margin: { kind: 'wickets', wickets: 9, ballsRemaining: 7 },
      method: 'normal',
    });
    expect(trimmed.after.resultText).toBe('Tigers won by 9 wickets (7 balls left)');
    expect(trimmed.after.pendingAction?.type).toBe('confirm_result');
    expect(trimmed.resultChanged).toBe(true);
    expect([...trimmed.affectedInnings].sort()).toEqual([0, 1]);
  });

  it('changing the winning single into a four keeps the result (resultChanged false) but affects the chase innings', () => {
    const { setup, events, state } = g1();
    const chase = deliveriesOf(events, 1);
    const last = chase[chase.length - 1];
    const four = fairBall(stateBefore(setup, events, last.seq), { boundary: 4 });
    const outcome = editEvent(setup, events, last.seq, [four], editContext());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(inn(outcome.after, 1).runs).toBe(31);
    expect(outcome.after.naturalResult).toEqual(state.naturalResult);
    expect(outcome.after.resultText).toBe('Tigers won by 9 wickets (4 balls left)');
    expect(outcome.resultChanged).toBe(false);
    expect(outcome.affectedInnings).toEqual([1]);
  });

  it('adding a run-out into the chase changes only the wickets margin: resultChanged true, one fresh actionId for the replacement pair', () => {
    const { setup, events } = g1();
    const chase = deliveriesOf(events, 1);
    const dot = chase[7];
    expect(dot).toMatchObject({ runsRun: 0, boundary: 0, strikerId: 'T1', nonStrikerId: 'T2' });
    const runOut = fairBall(stateBefore(setup, events, dot.seq), {
      wicket: { type: 'run_out', playerOutId: 'T2', fielderIds: [], dismissalEnd: 'non_striker_end' },
    });
    const outcome = editEvent(setup, events, dot.seq, [runOut, { kind: 'batter_in', playerId: 'T4', position: 'non_striker' }], editContext());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.after.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: 'TIG',
      loserTeamId: 'LIO',
      margin: { kind: 'wickets', wickets: 8, ballsRemaining: 4 },
      method: 'normal',
    });
    expect(outcome.resultChanged).toBe(true);
    expect(outcome.affectedInnings).toEqual([1]);
    const pair = outcome.events.filter((event) => event.seq === dot.seq || event.seq === dot.seq + 1);
    expect(pair.map((event) => event.kind)).toEqual(['delivery', 'batter_in']);
    expect(pair[0].actionId).toBe(pair[1].actionId);
    expect(events.some((event) => event.actionId === pair[0].actionId)).toBe(false);
    expect(contiguousActions(outcome.events)).toBe(true);
    expect(battingRow(outcome.after, 'T4', 1)).toMatchObject({ status: 'not_out' });
    expect(battingRow(outcome.after, 'T2', 1)).toMatchObject({ status: 'out' });
  });

  it('an op that inserts several events gives them one shared fresh actionId; separate ops never share one', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '1 1 1']);
    const outcome = applyHistoryEdits(
      setup,
      played.events,
      [
        { op: 'insert_after', seq: 2, events: [{ kind: 'strike_swapped' }, { kind: 'strike_swapped' }] },
        { op: 'insert_before', seq: 4, events: [{ kind: 'strike_swapped' }] },
      ],
      editContext(),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const inserted = outcome.events.filter((event) => outcome.diff.insertedIds.includes(event.id));
    expect(inserted).toHaveLength(3);
    expect(inserted[0].actionId).toBe(inserted[1].actionId);
    expect(inserted[2].actionId).not.toBe(inserted[0].actionId);
    expect(new Set(inserted.map((event) => event.id)).size).toBe(3);
    expect(contiguousActions(outcome.events)).toBe(true);
    expect(inn(outcome.after).strikerId).toBe(inn(played.state).nonStrikerId);
  });

  it('an action group is never split by an edit (penalty inserted between a wicket and its incoming batter)', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '1', 'W>L3', '1']);
    expect(played.events[2].actionId).toBe(played.events[3].actionId);
    const outcome = applyHistoryEdits(
      setup,
      played.events,
      [{ op: 'insert_before', seq: 4, events: [{ kind: 'penalty_awarded', teamId: 'LIO', inningsIndex: 0, runs: 5, reason: 'Ball hit helmet' }] }],
      editContext(),
    );
    if (outcome.ok) {
      expect(inn(outcome.after).extras.penalty).toBe(5);
      expect(contiguousActions(outcome.events)).toBe(true);
    }
  });

  it('insert_before, replace and insert_after on the same original seq land in that order whatever the op order', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '1 1 1']);
    const dot = fairBall(stateBefore(setup, played.events, 3));
    const before: HistoryEditOp = { op: 'insert_before', seq: 3, events: [{ kind: 'strike_swapped' }] };
    const replace: HistoryEditOp = { op: 'replace', seq: 3, with: [dot] };
    const after: HistoryEditOp = { op: 'insert_after', seq: 3, events: [{ kind: 'strike_swapped' }] };
    for (const ops of [[before, replace, after], [after, replace, before], [replace, after, before]]) {
      const outcome = applyHistoryEdits(setup, played.events, ops, editContext());
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) {
        continue;
      }
      expect(outcome.events.map((event) => event.kind)).toEqual(['innings_started', 'delivery', 'strike_swapped', 'delivery', 'strike_swapped', 'delivery']);
      expect(outcome.events[3]).toMatchObject({ runsRun: 0 });
      expect(new Set([outcome.events[2].actionId, outcome.events[3].actionId, outcome.events[4].actionId]).size).toBe(3);
      expect(inn(outcome.after)).toMatchObject({ runs: 2, legalBalls: 3 });
    }
  });

  it('re-anchoring moves only the selection: a manual strike swap at the old over end keeps its relative position', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '0 0 0 0 0 0', 'sw', '@T8', '1 1']);
    const swap = played.events[7];
    const selection = played.events[8];
    const sixth = played.events[9];
    expect([swap.kind, selection.kind]).toEqual(['strike_swapped', 'bowler_selected']);
    const outcome = applyHistoryEdits(setup, played.events, [{ op: 'delete', seq: 3 }], editContext());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const ids = outcome.events.map((event) => event.id);
    expect(ids.indexOf(swap.id)).toBe(ids.indexOf(sixth.id) - 1);
    expect(ids.indexOf(selection.id)).toBe(ids.indexOf(sixth.id) + 1);
    expect(outcome.events.find((event) => event.id === sixth.id)).toMatchObject({ bowlerId: 'T7', strikerId: 'L2' });
    expect(outcome.diff.reanchoredIds).toEqual([selection.id]);
    expect(bowlingRow(outcome.after, 'T7')).toMatchObject({ legalBalls: 6, runsConceded: 1 });
    expect(bowlingRow(outcome.after, 'T8')).toMatchObject({ legalBalls: 1, runsConceded: 1 });
  });

  it('a wide made legal in a completed innings pushes its last ball past the allotted overs: refused at that ball', () => {
    const { setup, events } = g1();
    const firstInnings = deliveriesOf(events, 0);
    const wideBall = firstInnings.find((event) => event.kind === 'delivery' && event.call === 'wide');
    if (wideBall === undefined) {
      throw new Error('no wide');
    }
    const lastBall = firstInnings[firstInnings.length - 1];
    const outcome = editEvent(setup, events, wideBall.seq, [fairBall(stateBefore(setup, events, wideBall.seq))], editContext());
    expect(outcome).toMatchObject({ ok: false, atSeq: lastBall.seq });
  });

  it('a legal ball made a wide in the last over of a completed innings leaves it one ball short: the chase start is refused', () => {
    const { setup, events } = g1();
    const firstInnings = deliveriesOf(events, 0);
    const lastBall = firstInnings[firstInnings.length - 1];
    const chaseStart = events.find((event) => event.kind === 'innings_started' && event.inningsIndex === 1);
    if (chaseStart === undefined) {
      throw new Error('no chase');
    }
    const outcome = editEvent(setup, events, lastBall.seq, [{ ...fairBall(stateBefore(setup, events, lastBall.seq)), call: 'wide' } as MatchEventInput], editContext());
    expect(outcome).toMatchObject({ ok: false, atSeq: chaseStart.seq });
  });

  it('an empty edit is a clean no-op and an edit after match_ended is refused', () => {
    const { setup, events, state } = g1();
    const noop = applyHistoryEdits(setup, events, [], editContext());
    expect(noop).toMatchObject({ ok: true, resultChanged: false, affectedInnings: [] });
    if (noop.ok) {
      expect(noop.events).toEqual(events);
      expect(noop.after).toEqual(state);
      expect(noop.diff).toEqual({ insertedIds: [], removedIds: [], replacedIds: [], reanchoredIds: [], restampedIds: [] });
    }
    const confirmed = playScript(setup, ['end'], { prior: events }).events;
    const tail = confirmed[confirmed.length - 1].seq;
    expect(applyHistoryEdits(setup, confirmed, [{ op: 'insert_after', seq: tail, events: [{ kind: 'strike_swapped' }] }], editContext())).toMatchObject({
      ok: false,
      code: 'MATCH_ALREADY_ENDED',
      atSeq: tail + 1,
    });
  });

  it('property: random single-ball edits of 40 random matches keep every documented invariant of the outcome', () => {
    let accepted = 0;
    for (let seed = 9001; seed <= 9040; seed += 1) {
      const match = randomMatch(seed, { maxEvents: 120 });
      const deliveries = match.events.filter((event) => event.kind === 'delivery');
      if (deliveries.length === 0) {
        continue;
      }
      const random = seededRandom(seed);
      const target = random.pick(deliveries);
      const before = stateBefore(match.setup, match.events, target.seq);
      const outcome = editEvent(match.setup, match.events, target.seq, [fairBall(before)], editContext(`s${seed}-`));
      const label = `seed ${seed} seq ${target.seq}`;
      if (!outcome.ok) {
        expect({ label, known: EVENT_VALIDATION_CODES.includes(outcome.code) }).toEqual({ label, known: true });
        expect(outcome.atSeq === null || (Number.isInteger(outcome.atSeq) && outcome.atSeq >= 1)).toBe(true);
        continue;
      }
      accepted += 1;
      expect({ label, before: outcome.before }).toEqual({ label, before: match.state });
      expect({ label, after: outcome.after }).toEqual({ label, after: replayMatch(match.setup, outcome.events) });
      expect(outcome.after.issues).toEqual([]);
      expect(outcome.events.map((event) => event.seq)).toEqual(outcome.events.map((_, index) => index + 1));
      expect(new Set(outcome.events.map((event) => event.id)).size).toBe(outcome.events.length);
      expect({ label, contiguous: contiguousActions(outcome.events) }).toEqual({ label, contiguous: true });
      expect(outcome.diff.replacedIds).toEqual([target.id]);
      expect(outcome.events.some((event) => event.id === target.id)).toBe(false);
      const originals = new Map(match.events.map((event) => [event.id, event]));
      for (const event of outcome.events) {
        const original = originals.get(event.id);
        if (original !== undefined) {
          expect([event.kind, event.actionId, event.recordedAt, event.matchId]).toEqual([original.kind, original.actionId, original.recordedAt, original.matchId]);
        }
      }
      expect({ label, normalized: normalizeLog(match.setup, outcome.events) }).toEqual({ label, normalized: { events: outcome.events, reanchoredIds: [], restampedIds: [] } });
      expect(validateLog(match.setup, outcome.events).ok).toBe(true);
      expect(logFingerprint(outcome.events)).not.toBe(logFingerprint(match.events));
    }
    expect(accepted).toBeGreaterThan(10);
  });
});

describe('adversarial: normalizeLog', () => {
  it('renumbers a log whose seqs were shifted or spaced out and is then a no-op', () => {
    const { setup, events } = g1();
    for (const renumber of [(seq: number) => seq + 100, (seq: number) => seq * 2, (seq: number) => seq + (seq > 20 ? 5 : 0)]) {
      const shifted = events.map((event) => ({ ...event, seq: renumber(event.seq) }));
      const normalized = normalizeLog(setup, shifted);
      expect(normalized.events).toEqual(events);
      expect(normalized.restampedIds).toEqual([]);
      expect(normalized.reanchoredIds).toEqual([]);
    }
  });

  it('is idempotent on a log with every stamp scrambled and never touches delivery facts', () => {
    const { setup, events } = g1();
    const chaseIds = new Set(deliveriesOf(events, 1).map((event) => event.id));
    const scrambled = events.map((event) => {
      if (event.kind !== 'delivery') {
        return event;
      }
      const stamps = chaseIds.has(event.id) ? { strikerId: 'T11', nonStrikerId: 'T10', bowlerId: 'L9' } : { strikerId: 'L11', nonStrikerId: 'L10', bowlerId: 'T11' };
      return { ...event, ...stamps } as MatchEvent;
    });
    const once = normalizeLog(setup, scrambled);
    expect(once.events).toEqual(events);
    expect([...once.restampedIds].sort()).toEqual(events.filter((event) => event.kind === 'delivery').map((event) => event.id).sort());
    expect(normalizeLog(setup, once.events)).toEqual({ events: once.events, reanchoredIds: [], restampedIds: [] });
    expect(validateLog(setup, once.events).ok).toBe(true);
  });
});

describe('adversarial: logFingerprint', () => {
  function bump(value: unknown): unknown {
    if (typeof value === 'string') {
      return `${value}x`;
    }
    if (typeof value === 'number') {
      return value + 1;
    }
    if (typeof value === 'boolean') {
      return !value;
    }
    if (value === null) {
      return 0;
    }
    if (Array.isArray(value)) {
      return [...(value as unknown[]), 'x'];
    }
    if (typeof value === 'object') {
      return { ...(value as Record<string, unknown>), extra: 1 };
    }
    return 'x';
  }

  it('every single-field change of any event (envelope, payload or nested wicket) changes the fingerprint', () => {
    const { events } = g1();
    const base = logFingerprint(events);
    const seen = new Set<string>([base]);
    let variants = 0;
    events.forEach((event, index) => {
      const record = event as unknown as Record<string, unknown>;
      const mutations: Record<string, unknown>[] = Object.keys(record).map((key) => ({ ...record, [key]: bump(record[key]) }));
      const wicket = record.wicket;
      if (wicket !== null && typeof wicket === 'object') {
        const nested = wicket as Record<string, unknown>;
        for (const key of Object.keys(nested)) {
          mutations.push({ ...record, wicket: { ...nested, [key]: bump(nested[key]) } });
        }
      }
      for (const mutated of mutations) {
        const log = events.map((candidate, position) => (position === index ? (mutated as unknown as MatchEvent) : candidate));
        const print = logFingerprint(log);
        expect(print).not.toBe(base);
        seen.add(print);
        variants += 1;
      }
    });
    expect(seen.size).toBe(variants + 1);
  });

  it('structural changes are detected: order, removal, duplication, undo + re-record', () => {
    const setup = matchSetup();
    const played = playScript(setup, ['start:L1:L2:T7', '1 2 3']);
    const base = logFingerprint(played.events);
    const swapped = [played.events[0], played.events[2], played.events[1], played.events[3]];
    expect(logFingerprint(swapped)).not.toBe(base);
    expect(logFingerprint(played.events.slice(0, 3))).not.toBe(base);
    expect(logFingerprint([...played.events, played.events[3]])).not.toBe(base);
    const undone = undoLastAction(played.events)?.events ?? [];
    const sameBallNewAction = playScript(setup, ['3'], { prior: undone }).events.map((event) => (event.seq === 4 ? { ...event, id: 'redo-4', actionId: 'zz' } : event));
    expect(sameBallNewAction[3]).toMatchObject({ runsRun: 3 });
    expect(logFingerprint(sameBallNewAction)).not.toBe(base);
    expect(logFingerprint([])).not.toBe(base);
  });

  it('is canonical: key order and a JSON round trip do not change it; array order and null-vs-absent do', () => {
    const { events } = g1();
    const base = logFingerprint(events);
    const reversed = events.map((event) => {
      const entries = Object.entries(event).reverse().map(([key, value]) => {
        if (key === 'wicket' && value !== null && typeof value === 'object') {
          return [key, Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse())];
        }
        return [key, value];
      });
      return Object.fromEntries(entries) as unknown as MatchEvent;
    });
    expect(logFingerprint(reversed)).toBe(base);
    expect(logFingerprint(JSON.parse(JSON.stringify(events)) as MatchEvent[])).toBe(base);
    const setup = matchSetup();
    const revision = { kind: 'overs_revised', inningsIndex: 0, maxBalls: 60, target: null, terminal: false, reason: 'Rain' };
    const absent = [rawEvent(setup, revision, 1, 'r')];
    const withUndefined = [rawEvent(setup, { ...revision, maxOversPerBowler: undefined }, 1, 'r')];
    const withNull = [rawEvent(setup, { ...revision, maxOversPerBowler: null }, 1, 'r')];
    expect(logFingerprint(withUndefined)).toBe(logFingerprint(absent));
    expect(logFingerprint(withNull)).not.toBe(logFingerprint(absent));
    const catchBy = (fielderIds: readonly string[]) => [
      rawEvent(setup, { kind: 'delivery', call: 'fair', runsTo: 'bat', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7', runsRun: 0, shortRuns: 0, boundary: 0, wicket: { type: 'run_out', playerOutId: 'L1', fielderIds, dismissalEnd: 'striker_end' } }, 1, 'd'),
    ];
    expect(logFingerprint(catchBy(['T1', 'T2']))).not.toBe(logFingerprint(catchBy(['T2', 'T1'])));
  });

  it('distinguishes non-ASCII text that differs only above the low byte', () => {
    const setup = matchSetup();
    const withReason = (reason: string) => [rawEvent(setup, { kind: 'penalty_awarded', teamId: 'LIO', inningsIndex: 0, runs: 5, reason }, 1, 'p')];
    const prints = ['A', 'Ł', '䅁', 'ĀA', 'é', 'é', '🌧'].map((reason) => logFingerprint(withReason(reason)));
    for (const print of prints) {
      expect(print).toMatch(/^[0-9a-f]{8}$/);
    }
    expect(new Set(prints).size).toBe(prints.length);
  });
});

describe('adversarial: buildMatchSummary', () => {
  const SUMMARY_KEYS = ['summaryVersion', 'matchId', 'teamAId', 'teamBId', 'status', 'result', 'winnerTeamId', 'ballsPerOver', 'innings', 'superOvers', 'squads', 'completedAt'];
  const INNINGS_KEYS = [
    'inningsIndex',
    'battingTeamId',
    'bowlingTeamId',
    'runs',
    'wickets',
    'legalBalls',
    'allottedBalls',
    'ballsPerOver',
    'allOut',
    'completion',
    'target',
    'targetRevised',
    'extras',
    'fours',
    'sixes',
    'batting',
    'bowling',
    'bestPartnership',
  ];

  it('is null for every non-terminal state, including a chase awaiting confirmation and a paused match', () => {
    const setup = matchSetup();
    expect(buildMatchSummary(setup, initialMatchState(setup), { completedAt: NOW })).toBeNull();
    const { setup: g1Setup, state } = g1();
    expect(state.pendingAction?.type).toBe('confirm_result');
    expect(buildMatchSummary(g1Setup, state, { completedAt: NOW })).toBeNull();
    const paused = playScript(setup, ['start:L1:L2:T7', '1', suspendPlay('rain')]).state;
    expect(paused.lifecycle).toBe('paused');
    expect(buildMatchSummary(setup, paused, { completedAt: NOW })).toBeNull();
  });

  it('G1 summary: exact shape, only players who batted/bowled, best partnership, extras and boundaries', () => {
    const { setup, events } = g1();
    const confirmed = playScript(setup, ['end'], { prior: events }).state;
    const summary = summaryOf(setup, confirmed);
    const plain = JSON.parse(JSON.stringify(summary)) as MatchSummary;
    expect(plain).toEqual(summary);
    expect(Object.keys(plain).sort()).toEqual([...SUMMARY_KEYS].sort());
    for (const innings of plain.innings) {
      expect(Object.keys(innings).sort()).toEqual([...INNINGS_KEYS].sort());
    }
    expect(summary).toMatchObject({ summaryVersion: 2, status: 'completed', winnerTeamId: 'TIG', ballsPerOver: 6, completedAt: NOW, superOvers: [] });
    expect(summary.innings[0]).toMatchObject({ battingTeamId: 'LIO', bowlingTeamId: 'TIG', runs: 27, wickets: 1, legalBalls: 18, allottedBalls: 18, allOut: false, completion: 'overs_complete', target: null, targetRevised: false, extras: 3, fours: 1, sixes: 1 });
    expect(summary.innings[1]).toMatchObject({ battingTeamId: 'TIG', runs: 28, wickets: 1, legalBalls: 14, allottedBalls: 18, allOut: false, completion: 'target_reached', target: 28, targetRevised: false, extras: 0, fours: 3, sixes: 1 });
    expect(summary.innings[0].batting.map((line) => line.playerId).sort()).toEqual(['L1', 'L2', 'L3']);
    expect(summary.innings[1].batting.map((line) => line.playerId).sort()).toEqual(['T1', 'T2', 'T3']);
    expect(summary.innings[0].bowling.map((line) => line.playerId).sort()).toEqual(['T7', 'T8']);
    expect(summary.innings[1].bowling.map((line) => line.playerId).sort()).toEqual(['L10', 'L11']);
    expect(summary.innings[0].batting.find((line) => line.playerId === 'L2')).toMatchObject({ out: true, dismissalType: 'bowled' });
    expect(summary.innings[1].batting.find((line) => line.playerId === 'T1')).toMatchObject({ out: true, dismissalType: 'caught' });
    for (const innings of summary.innings) {
      expect(innings.batting.reduce((sum, line) => sum + line.runs, 0)).toBe(innings.runs - innings.extras);
    }
    expect(summary.innings[0].bestPartnership).toMatchObject({ wicketNumber: 1, runs: 15, balls: 8 });
    expect([summary.innings[0].bestPartnership?.batterAId, summary.innings[0].bestPartnership?.batterBId].sort()).toEqual(['L1', 'L2']);
    expect(summary.innings[1].bestPartnership).toMatchObject({ wicketNumber: 1, runs: 19, balls: 9 });
    expect(summary.squads.map((squad) => [squad.teamId, [...squad.playerIds].sort()]).sort()).toEqual([
      ['LIO', ['L1', 'L10', 'L11', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9']],
      ['TIG', ['T1', 'T10', 'T11', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9']],
    ]);
    expect(buildMatchSummary(setup, confirmed, { completedAt: NOW })).toEqual(summary);
    expect(buildMatchSummary(setup, confirmed, { completedAt: null })?.completedAt).toBeNull();
  });

  it('allotted balls follow a both-innings revision and a revised chase target sets targetRevised and revised_target', () => {
    const setup = matchSetup();
    const runner = new ScriptRunner(setup, { autoBatters: true, autoBowlers: true });
    runner.run(['start:L1:L2:T7', ...Array.from({ length: 54 }, () => '1')]);
    runner.apply(reviseOvers(0, { overs: 12, scope: 'both_innings' }), 'revise both');
    runner.run(Array.from({ length: 18 }, () => '1'));
    expect(inn(runner.result.state, 0)).toMatchObject({ status: 'complete', runs: 72, legalBalls: 72 });
    runner.apply(reviseOvers(1, { overs: 12, target: 60 }), 'revise chase target');
    runner.run(['start:T1:T2:L10', ...Array.from({ length: 60 }, () => '1')]);
    expect(runner.result.state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: 'TIG',
      loserTeamId: 'LIO',
      margin: { kind: 'wickets', wickets: 10, ballsRemaining: 12 },
      method: 'revised_target',
    });
    runner.run(['end']);
    const summary = summaryOf(setup, runner.result.state);
    expect(summary.innings[0]).toMatchObject({ runs: 72, legalBalls: 72, allottedBalls: 72, completion: 'overs_complete', allOut: false, target: null, targetRevised: false });
    expect(summary.innings[1]).toMatchObject({ runs: 60, legalBalls: 60, allottedBalls: 72, completion: 'target_reached', allOut: false, target: 60, targetRevised: true });
    expect(summary.result).toMatchObject({ type: 'win', method: 'revised_target' });
  });

  it('a chase shortened without a new target keeps the standard target: allotted balls change, targetRevised stays false', () => {
    const setup = matchSetup({ rules: { oversPerInnings: 5, powerplays: [] } });
    const runner = new ScriptRunner(setup, { autoBatters: true, autoBowlers: true });
    runner.run(['start:L1:L2:T7', ...Array.from({ length: 30 }, () => '1')]);
    runner.run(['start:T1:T2:L10', ...Array.from({ length: 12 }, () => '1')]);
    runner.apply(reviseOvers(1, { overs: 3 }), 'shorten chase');
    runner.run(Array.from({ length: 6 }, () => '0'));
    expect(runner.result.state.naturalResult).toEqual({ type: 'win', winnerTeamId: 'LIO', loserTeamId: 'TIG', margin: { kind: 'runs', runs: 18 }, method: 'normal' });
    runner.run(['end']);
    const summary = summaryOf(setup, runner.result.state);
    expect(summary.innings[0]).toMatchObject({ allottedBalls: 30, legalBalls: 30 });
    expect(summary.innings[1]).toMatchObject({ runs: 12, legalBalls: 18, allottedBalls: 18, target: 31, targetRevised: false, completion: 'overs_complete' });
  });

  it('all out keeps the full allotted quota and sets allOut; last-man-stands and uneven sides use their own thresholds', () => {
    const setup = matchSetup();
    const allOut = play(setup, ['start:L1:L2:T7', ...Array.from({ length: 10 }, () => 'W'), 'start:T1:T2:L10', '1', 'end']);
    const first = summaryOf(setup, allOut.state).innings[0];
    expect(first).toMatchObject({ runs: 0, wickets: 10, legalBalls: 10, allottedBalls: 120, allOut: true, completion: 'all_out' });
    expect(first.batting).toHaveLength(11);
    expect(first.batting.filter((line) => line.out)).toHaveLength(10);

    const lms = m8LmsSetup();
    const lastMan = play(lms, ['start:L1:L2:T7', ...Array.from({ length: 7 }, () => 'W')]);
    expect(inn(lastMan.state, 0)).toMatchObject({ wickets: 7, status: 'in_progress', nonStrikerId: null });
    const lmsDone = play(lms, ['start:L1:L2:T7', ...Array.from({ length: 8 }, () => 'W'), 'start:T1:T2:L10', '1', 'end']);
    expect(summaryOf(lms, lmsDone.state).innings[0]).toMatchObject({ wickets: 8, allOut: true, completion: 'all_out', allottedBalls: 120 });

    const uneven = m8v7Setup();
    const unevenDone = play(uneven, ['start:L1:L2:T7', '4', declare(), 'start:T1:T2:L10', ...Array.from({ length: 6 }, () => 'W'), 'end']);
    const unevenSummary = summaryOf(uneven, unevenDone.state);
    expect(unevenSummary.innings[0]).toMatchObject({ completion: 'declared', allOut: false, runs: 4, legalBalls: 1, allottedBalls: 120 });
    expect(unevenSummary.innings[1]).toMatchObject({ completion: 'all_out', allOut: true, wickets: 6, legalBalls: 6, allottedBalls: 120 });
    expect(unevenSummary.result).toMatchObject({ type: 'win', winnerTeamId: 'LIO', margin: { kind: 'runs', runs: 4 } });
  });

  it('batters_unavailable counts as all out and absentees never appear as batting lines', () => {
    const setup = matchSetup();
    const played = play(setup, ['start:L1:L2:T7', '1 1 W', battersUnavailable([{ playerId: 'L11', hurt: true }]), 'start:T1:T2:L10', '4', 'end']);
    expect(battingRow(played.state, 'L11', 0).status).toBe('absent');
    const summary = summaryOf(setup, played.state);
    expect(summary.innings[0]).toMatchObject({ runs: 2, wickets: 1, legalBalls: 3, allottedBalls: 120, allOut: true, completion: 'batters_unavailable' });
    expect(summary.innings[0].batting.map((line) => line.playerId).sort()).toEqual(['L1', 'L2']);
    expect(summary.innings[0].batting.find((line) => line.playerId === 'L1')).toMatchObject({ runs: 1, balls: 2, out: true, dismissalType: 'bowled' });
    expect(summary.innings[1]).toMatchObject({ runs: 4, allOut: false, completion: 'target_reached', target: 3 });
    expect(summary.result).toMatchObject({ type: 'win', winnerTeamId: 'TIG', margin: { kind: 'wickets', wickets: 10, ballsRemaining: 119 } });
  });

  it('super overs are excluded from regular innings, player lines and bowling figures', () => {
    const setup = matchSetup({ rules: { oversPerInnings: 1, powerplays: [] } });
    const played = play(setup, [
      'start:L1:L2:T7',
      '1 1 1 1 1 1',
      'start:T1:T2:L10',
      '1 1 1 1 1 1',
      'so',
      'start:T1:T3:L10',
      '6 1 0 0 0 0',
      'start:L5:L6:T8',
      '1 1 1 1 1 1',
      'end',
    ]);
    expect(played.state.result).toEqual({ type: 'tie', decider: { method: 'super_over', winnerTeamId: 'TIG', superOverRounds: 1 } });
    const summary = summaryOf(setup, played.state);
    expect(summary.winnerTeamId).toBe('TIG');
    expect(summary.innings.map((innings) => [innings.inningsIndex, innings.battingTeamId, innings.runs])).toEqual([
      [0, 'LIO', 6],
      [1, 'TIG', 6],
    ]);
    expect(summary.superOvers.map((innings) => [innings.battingTeamId, innings.runs])).toEqual([
      ['TIG', 7],
      ['LIO', 6],
    ]);
    expect(summary.innings[0].batting.map((line) => line.playerId).sort()).toEqual(['L1', 'L2']);
    expect(summary.innings[1].batting.map((line) => line.playerId).sort()).toEqual(['T1', 'T2']);
    expect(summary.innings[1].batting.find((line) => line.playerId === 'T1')).toMatchObject({ runs: 3, balls: 3, sixes: 0 });
    expect(summary.innings[1].sixes).toBe(0);
    expect(summary.innings[1].bowling).toEqual([expect.objectContaining({ playerId: 'L10', legalBalls: 6, runsConceded: 6 })]);
    expect(summary.innings[0].bowling.map((line) => line.playerId)).toEqual(['T7']);
  });

  it('13.5: a penalty after the last ball turns a tie into a win and is counted in runs and extras of the summary', () => {
    const setup = matchSetup({ rules: { oversPerInnings: 1, powerplays: [] } });
    const tied = play(setup, ['start:L1:L2:T7', '1 1 1 1 1 1', 'start:T1:T2:L10', '1 1 1 1 1 1']);
    expect(tied.state.naturalResult).toEqual({ type: 'tie', decider: null });
    const after = play(setup, ['start:L1:L2:T7', '1 1 1 1 1 1', 'start:T1:T2:L10', '1 1 1 1 1 1', penalty('TIG', 5, 1), 'end']);
    expect(after.state.result).toEqual({ type: 'win', winnerTeamId: 'TIG', loserTeamId: 'LIO', margin: { kind: 'wickets', wickets: 10, ballsRemaining: 0 }, method: 'normal' });
    const summary = summaryOf(setup, after.state);
    expect(summary.innings[1]).toMatchObject({ runs: 11, extras: 5, legalBalls: 6, allottedBalls: 6, completion: 'overs_complete', target: 7 });
    expect(summary.innings[1].batting.reduce((sum, line) => sum + line.runs, 0)).toBe(6);
    expect(summary.winnerTeamId).toBe('TIG');
  });

  it('no result after play keeps the partial innings and has no winner', () => {
    const setup = matchSetup();
    const played = play(setup, ['start:L1:L2:T7', '1 4', endMatch({ type: 'no_result', reason: 'Bad light' })]);
    const summary = summaryOf(setup, played.state);
    expect(summary).toMatchObject({ status: 'completed', winnerTeamId: null, result: { type: 'no_result', reason: 'Bad light' } });
    expect(summary.innings).toHaveLength(1);
    expect(summary.innings[0]).toMatchObject({ runs: 5, legalBalls: 2, completion: 'match_ended', allOut: false, allottedBalls: 120 });
  });

  it('walkover and abandoned-during-play summaries', () => {
    const setup = matchSetup();
    const walkover = play(setup, [endMatch({ type: 'walkover', winnerTeamId: 'TIG', reason: null })]);
    const w = summaryOf(setup, walkover.state);
    expect(w).toMatchObject({ status: 'completed', winnerTeamId: 'TIG', innings: [], superOvers: [], result: { type: 'walkover', winnerTeamId: 'TIG', loserTeamId: 'LIO' } });
    expect(w.squads.every((squad) => squad.playerIds.length === 11 && !squad.playerIds.some((id) => id.endsWith('12')))).toBe(true);
    const abandoned = play(setup, ['start:L1:L2:T7', '1 1', endMatch({ type: 'abandoned', reason: 'Rain' })]);
    expect(abandoned.state.lifecycle).toBe('abandoned');
    const a = summaryOf(setup, abandoned.state);
    expect(a).toMatchObject({ status: 'abandoned', winnerTeamId: null, result: { type: 'abandoned', reason: 'Rain' } });
    expect(a.innings).toHaveLength(1);
    expect(a.innings[0]).toMatchObject({ runs: 2, legalBalls: 2, allottedBalls: 120, completion: 'match_ended', allOut: false });
  });
});

describe('adversarial: performance of a full 50-over match', () => {
  const FIRST = ['1', '0', '4', 'wd', '2', '0', '1', 'lb1', '6', '0', '1', 'nb1', '0', '2', '1', '0', 'W', '1', '3', '0', '1', 'b1', '0', '4', '1', '0', '2', 'wd', '1', '0', '6', '1', '0', '1', '2', '0', '1', '0', '4', '1'];
  const CHASE = ['0', '1', '0', '0', '2', '0', '1', '0', 'W', '0', '1', '0', '0', '4', '0', '1', '0', '0', '1', '0', '1', '0', '0', '2', '0', '1', '0', '0', '1', '0', '0', '1', '0', '0', '4', '0', '1', '0', '0', '0'];

  function fiftyOverMatch(): Played {
    const setup = matchSetup({ rules: { oversPerInnings: 50, maxOversPerBowler: 10 } });
    const runner = new ScriptRunner(setup, { autoBatters: true, autoBowlers: true });
    runner.run(['start:L1:L2:T7']);
    for (let index = 0; runner.result.state.innings[0].status === 'in_progress'; index += 1) {
      runner.run([FIRST[index % FIRST.length]]);
    }
    runner.run(['start:T1:T2:L10']);
    for (let index = 0; runner.result.state.innings[1].status === 'in_progress'; index += 1) {
      runner.run([CHASE[index % CHASE.length]]);
    }
    runner.run(['end']);
    return { setup, events: runner.result.events, state: runner.result.state };
  }

  const match = fiftyOverMatch();

  it('the generated match is a realistic, healthy 50-over match', () => {
    expect(match.events.length).toBeGreaterThan(650);
    expect(match.state.issues).toEqual([]);
    expect(match.state.lifecycle).toBe('completed');
    expect(inn(match.state, 0)).toMatchObject({ legalBalls: 300, completion: { reason: 'overs_complete' } });
    expect(inn(match.state, 1).legalBalls).toBe(300);
    expect(match.state.result).toMatchObject({ type: 'win', winnerTeamId: 'LIO' });
  });

  it('replayMatch median < 150 ms (budget 50 ms, 3x margin)', () => {
    replayMatch(match.setup, match.events);
    const times: number[] = [];
    let last: MatchState | null = null;
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      last = replayMatch(match.setup, match.events);
      times.push(performance.now() - started);
    }
    const measured = median(times);
    console.log(`adversarial: replayMatch of ${match.events.length} events, median ${measured.toFixed(2)} ms`);
    expect(last).toEqual(match.state);
    expect(measured).toBeLessThan(150);
  });

  it('1000 applyEvent calls < 90 ms (budget 30 ms, 3x margin)', () => {
    const extra = Math.max(0, 1000 - match.events.length);
    fold(match.setup, match.events.slice(0, 50));
    const started = performance.now();
    const full = fold(match.setup, match.events);
    const again = fold(match.setup, match.events.slice(0, extra));
    const measured = performance.now() - started;
    console.log(`adversarial: ${match.events.length + extra} applyEvent calls in ${measured.toFixed(2)} ms`);
    expect(full).toEqual(match.state);
    expect(again.issues).toEqual([]);
    expect(measured).toBeLessThan(90);
  });

  it('undo (group removal + full replay) median < 150 ms (budget 50 ms, 3x margin)', () => {
    const times: number[] = [];
    let reopened: MatchState | null = null;
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      const undo = undoLastAction(match.events);
      reopened = replayMatch(match.setup, undo?.events ?? []);
      times.push(performance.now() - started);
    }
    const measured = median(times);
    console.log(`adversarial: undo on ${match.events.length} events, median ${measured.toFixed(2)} ms`);
    expect(reopened?.lifecycle).toBe('live');
    expect(reopened?.pendingAction?.type).toBe('confirm_result');
    expect(measured).toBeLessThan(150);
  });

  it('a history edit of the first ball (normalise + validate + before/after) < 600 ms (design target 200 ms, 3x margin)', () => {
    const first = deliveriesOf(match.events, 0)[0];
    expect(first).toMatchObject({ runsRun: 1, boundary: 0, call: 'fair', runsTo: 'bat' });
    const replacement = fairBall(stateBefore(match.setup, match.events, first.seq), { runsRun: 1, runsTo: 'leg_bye' });
    const times: number[] = [];
    const editTimes: number[] = [];
    const printTimes: number[] = [];
    let outcome: ReturnType<typeof editEvent> | null = null;
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now();
      outcome = editEvent(match.setup, match.events, first.seq, [replacement], editContext());
      const edited = performance.now();
      logFingerprint(match.events);
      const printed = performance.now();
      times.push(printed - started);
      editTimes.push(edited - started);
      printTimes.push(printed - edited);
    }
    const measured = median(times);
    console.log(
      `adversarial: history edit preview on ${match.events.length} events, median ${measured.toFixed(2)} ms (edit ${median(editTimes).toFixed(2)} ms, logFingerprint ${median(printTimes).toFixed(2)} ms)`,
    );
    expect(outcome).toMatchObject({ ok: true, affectedInnings: [0], resultChanged: false });
    if (outcome !== null && outcome.ok) {
      expect(inn(outcome.after, 0).runs).toBe(inn(match.state, 0).runs);
      expect(inn(outcome.after, 0).extras.legByes).toBe(inn(match.state, 0).extras.legByes + 1);
      expect(outcome.diff.restampedIds).toEqual([]);
    }
    expect(measured).toBeLessThan(600);
    expect(median(printTimes)).toBeLessThan(60);
  });
});

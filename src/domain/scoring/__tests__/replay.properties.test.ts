/** @jest-environment node */
import type { MatchEvent, MatchSetup, MatchState } from '../../types';
import { MATCH_EVENT_KINDS } from '../../types';
import { normalizeLog } from '../history';
import { applyEvent, currentInnings, deriveMatchStatus, initialMatchState, replayMatch } from '../replay';
import { validateLog } from '../validate';
import { deepFreeze, matchSetup, playScript, randomMatch, seededRandom, type Random } from '../testing';
import { corrupted, g1, inn, play, step } from './helpers';

function checkAccounting(state: MatchState): void {
  for (const innings of state.innings) {
    const extras = innings.extras;
    expect(extras.total).toBe(extras.wides + extras.noBalls + extras.byes + extras.legByes + extras.penalty);
    const batRuns = innings.batting.reduce((sum, row) => sum + row.runs, 0);
    expect(batRuns + extras.total).toBe(innings.runs);
    const bowlerRuns = innings.bowling.reduce((sum, row) => sum + row.runsConceded, 0);
    expect(bowlerRuns).toBe(innings.runs - extras.byes - extras.legByes - extras.penalty);
    expect(innings.balls.filter((ball) => ball.isLegal).length).toBe(innings.legalBalls);
    expect(innings.fallOfWickets.length).toBe(innings.wickets);
  }
}

describe('replay invariants (U-RPL)', () => {
  it('U-RPL-01/02 deterministic and pure over frozen inputs', () => {
    const { setup, events } = g1();
    const frozen = deepFreeze(g1());
    const first = replayMatch(frozen.setup, frozen.events);
    expect(replayMatch(frozen.setup, frozen.events)).toEqual(first);
    expect(first).toEqual(replayMatch(setup, events));
  });

  it('U-RPL-03 initial state equals an empty replay', () => {
    const setup = matchSetup();
    const initial = initialMatchState(setup);
    expect(initial).toEqual(replayMatch(setup, []));
    expect(initial).toMatchObject({ lifecycle: 'not_started', lastSeq: 0, lastAppliedSeq: 0, issues: [], needsRepair: false });
  });

  it('U-RPL-04 incremental equivalence for every prefix of G1', () => {
    const { setup, events } = g1();
    for (let k = 0; k < events.length; k += 1) {
      expect(applyEvent(setup, replayMatch(setup, events.slice(0, k)), events[k])).toEqual(replayMatch(setup, events.slice(0, k + 1)));
    }
  });

  it('U-RPL-04 incremental equivalence, accounting and healthy logs over random valid matches', () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      const match = randomMatch(seed);
      const label = `seed ${seed}`;
      expect({ label, issues: match.state.issues }).toEqual({ label, issues: [] });
      expect(validateLog(match.setup, match.events).ok).toBe(true);
      const replayed = replayMatch(match.setup, match.events);
      expect(replayed).toEqual(match.state);
      const random = seededRandom(seed);
      for (let sample = 0; sample < 4 && match.events.length > 0; sample += 1) {
        const k = random.int(match.events.length);
        expect(applyEvent(match.setup, replayMatch(match.setup, match.events.slice(0, k)), match.events[k])).toEqual(
          replayMatch(match.setup, match.events.slice(0, k + 1)),
        );
      }
      checkAccounting(replayed);
      expect(normalizeLog(match.setup, match.events)).toEqual({ events: match.events, reanchoredIds: [], restampedIds: [] });
    }
  });

  it('random matches reach every kind of pending action and result', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 120; seed += 1) {
      const match = randomMatch(seed);
      let state = initialMatchState(match.setup);
      for (const event of match.events) {
        state = applyEvent(match.setup, state, event);
        seen.add(state.pendingAction?.type ?? 'ready');
        seen.add(`event:${event.kind}`);
      }
      seen.add(`result:${state.result?.type ?? 'open'}`);
    }
    for (const expected of ['ready', 'select_next_batter', 'select_next_bowler', 'start_next_innings', 'confirm_result', 'resume_play', 'event:delivery', 'event:penalty_awarded', 'result:win']) {
      expect(seen.has(expected)).toBe(true);
    }
  });
});

function randomValue(random: Random): unknown {
  switch (random.int(12)) {
    case 0:
      return null;
    case 1:
      return undefined;
    case 2:
      return random.int(12) - 2;
    case 3:
      return random.next() * 10;
    case 4:
      return random.pick(['L1', 'L2', 'T7', 'LIO', 'TIG', 'X', '']);
    case 5:
      return random.chance(0.5);
    case 6:
      return [random.pick(['T1', 'L1', 'X'])];
    case 7:
      return { type: random.pick(['bowled', 'run_out', 'caught', 'nonsense']), playerOutId: 'L1', fielderIds: [], dismissalEnd: random.pick([null, 'striker_end', 'x']) };
    case 8:
      return random.pick(['fair', 'wide', 'no_ball', 'bat', 'bye', 'natural', 'declared', 'over_start', 'injury', 'rain']);
    case 9:
      return { type: random.pick(['natural', 'walkover', 'abandoned', 'awarded', 'x']), winnerTeamId: random.pick(['LIO', 'TIG', null]), reason: 'x' };
    case 10:
      return random.pick([0, 1, 2, 4, 6]);
    default:
      return 'garbage';
  }
}

const FIELDS = [
  'call',
  'runsTo',
  'strikerId',
  'nonStrikerId',
  'bowlerId',
  'runsRun',
  'shortRuns',
  'boundary',
  'wicket',
  'inningsIndex',
  'battingTeamId',
  'playerId',
  'position',
  'reason',
  'retirement',
  'type',
  'fielderIds',
  'teamId',
  'runs',
  'maxBalls',
  'target',
  'terminal',
  'absentees',
  'round',
  'outcome',
];

function randomEvent(random: Random, setup: MatchSetup, seq: number, templates: readonly MatchEvent[]): MatchEvent {
  if (templates.length > 0 && random.chance(0.4)) {
    const template = random.pick(templates);
    const mutated: Record<string, unknown> = { seq };
    if (random.chance(0.5)) {
      mutated[random.pick(FIELDS)] = randomValue(random);
    }
    return corrupted(template, mutated) as MatchEvent;
  }
  const event: Record<string, unknown> = {
    id: random.chance(0.95) ? `f${seq}` : random.int(5),
    matchId: setup.matchId,
    seq,
    actionId: 'fz',
    recordedAt: '2026-05-01T10:00:00.000Z',
    kind: random.chance(0.9) ? random.pick(MATCH_EVENT_KINDS) : random.pick(['coin_flip', 42, null]),
  };
  const count = random.int(8);
  for (let index = 0; index < count; index += 1) {
    event[random.pick(FIELDS)] = randomValue(random);
  }
  return corrupted({ kind: 'strike_swapped' }, event) as MatchEvent;
}

describe('totality (U-RPL-05)', () => {
  it('random event arrays never throw and every skipped event is an error issue', () => {
    const { events: templates } = g1();
    const setup = matchSetup();
    for (let seed = 1; seed <= 600; seed += 1) {
      const random = seededRandom(seed * 7919);
      const length = 1 + random.int(120);
      const seqs = Array.from({ length }, (_, index) => index + 1);
      for (let swap = 0; swap < random.int(4); swap += 1) {
        const a = random.int(length);
        const b = random.int(length);
        [seqs[a], seqs[b]] = [seqs[b], seqs[a]];
      }
      const events = seqs.map((seq) => randomEvent(random, setup, random.chance(0.03) ? seq + 50 : seq, templates));
      let state = initialMatchState(setup);
      let errors = 0;
      for (const event of events) {
        const next = applyEvent(setup, state, event);
        const after = next.issues.filter((issue) => issue.severity === 'error').length;
        if (after === errors) {
          expect(next.lastAppliedSeq).toBe(event.seq);
        } else {
          expect(after).toBe(errors + 1);
        }
        errors = after;
        state = next;
      }
      expect(state.needsRepair).toBe(errors > 0);
      expect(state.lastSeq).toBe(events[events.length - 1].seq);
      expect(() => replayMatch(setup, events)).not.toThrow();
      expect(replayMatch(setup, events)).toEqual(state);
    }
  });

  it('non-object entries are skipped', () => {
    const setup = matchSetup();
    const state = replayMatch(setup, [null, 42, 'x'] as unknown as MatchEvent[]);
    expect(state.issues).toHaveLength(3);
    expect(state.needsRepair).toBe(true);
  });
});

describe('damaged logs (U-RPL-06..09)', () => {
  it('U-RPL-06 one invalid event in the middle skips only that event', () => {
    const { setup, events } = g1();
    const invalid = corrupted(events[9], { seq: 10, id: 'bad', boundary: 5 }) as MatchEvent;
    const damaged = [...events.slice(0, 9), invalid, ...events.slice(9).map((event) => ({ ...event, seq: event.seq + 1 }))];
    const state = replayMatch(setup, damaged);
    expect(state.issues).toEqual([expect.objectContaining({ seq: 10, eventId: 'bad', severity: 'error', code: 'INVALID_BOUNDARY' })]);
    expect(state.lastSeq).toBe(events.length + 1);
    expect(state.lastAppliedSeq).toBe(events.length + 1);
    expect(inn(state, 1).runs).toBe(28);
    expect(state.needsRepair).toBe(true);
    expect(state.canRecordDelivery).toBe(false);
  });

  it('U-RPL-07 a seq gap', () => {
    const { setup, events } = g1();
    const gapped = events.filter((event) => event.seq !== 13);
    const state = replayMatch(setup, gapped);
    expect(state.issues[0]).toMatchObject({ seq: 14, code: 'SEQ_OUT_OF_ORDER', severity: 'error' });
    const upToNext = replayMatch(setup, gapped.filter((event) => event.seq <= 15));
    expect(upToNext.lastSeq).toBe(15);
    expect(upToNext.lastAppliedSeq).toBe(15);
  });

  it('U-RPL-08 a duplicated seq', () => {
    const { setup, events } = g1();
    const duplicated = [...events.slice(0, 7), events[6], ...events.slice(7)];
    const state = replayMatch(setup, duplicated);
    expect(state.issues[0]).toMatchObject({ seq: 7, code: 'SEQ_OUT_OF_ORDER' });
    expect(state.issues.filter((issue) => issue.severity === 'error')).toHaveLength(1);
    expect(state.lastSeq).toBe(events.length);
  });

  it('U-RPL-09 / EC-C-17 a stale stamp on replay', () => {
    const setup = matchSetup();
    const played = play(setup, ['start:L1:L2:T7', '1 1']);
    const stale = played.events.map((event) => (event.seq === 3 && event.kind === 'delivery' ? { ...event, strikerId: 'L9' } : event));
    const state = replayMatch(setup, stale);
    expect(state.issues).toEqual([expect.objectContaining({ seq: 3, severity: 'warning', code: 'CONTEXT_MISMATCH' })]);
    expect(state.needsRepair).toBe(false);
    expect(inn(state).batting.find((row) => row.playerId === 'L2')?.runs).toBe(1);
  });

  it('EC-P-09 event order uses seq, never timestamps', () => {
    const setup = matchSetup();
    const played = play(setup, ['start:L1:L2:T7', '1 2']);
    const skewed = played.events.map((event, index) => ({ ...event, recordedAt: `2020-01-0${9 - index}T00:00:00.000Z` }));
    expect(inn(replayMatch(setup, skewed)).runs).toBe(3);
  });
});

describe('status and innings helpers (U-RPL-10/11)', () => {
  it('U-RPL-10 deriveMatchStatus', () => {
    const setup = matchSetup();
    const empty = initialMatchState(setup);
    expect(deriveMatchStatus(empty, 'postponed')).toBe('postponed');
    expect(deriveMatchStatus(play(setup, ['start:L1:L2:T7']).state, 'scheduled')).toBe('live');
    expect(deriveMatchStatus(play(setup, ['start:L1:L2:T7', 'susp']).state, 'scheduled')).toBe('paused');
    expect(deriveMatchStatus(playScript(setup, [{ type: 'end_match', outcome: { type: 'walkover', winnerTeamId: 'LIO', reason: null } }]).state, 'scheduled')).toBe(
      'completed',
    );
    expect(deriveMatchStatus(playScript(setup, [{ type: 'end_match', outcome: { type: 'abandoned', reason: null } }]).state, 'scheduled')).toBe('abandoned');
  });

  it('U-RPL-11 currentInnings', () => {
    const { setup, events, state } = g1();
    expect(currentInnings(initialMatchState(setup))).toBeNull();
    expect(currentInnings(replayMatch(setup, events.slice(0, 3)))?.index).toBe(0);
    expect(currentInnings(state)?.index).toBe(1);
    expect(state.currentInningsIndex).toBe(1);
  });
});

describe('reference stability (SCORING_ENGINE §2.2)', () => {
  it('a dot ball keeps untouched objects identical', () => {
    const { setup, events } = g1();
    const chaseStart = events.findIndex((event) => event.kind === 'innings_started' && event.inningsIndex === 1);
    const before = replayMatch(setup, events.slice(0, chaseStart + 8));
    const after = step(setup, before, { type: 'runs', runsRun: 0 });
    expect(after.innings[0]).toBe(before.innings[0]);
    const nonStriker = inn(before).nonStrikerId;
    expect(inn(after).batting.find((row) => row.playerId === nonStriker)).toBe(inn(before).batting.find((row) => row.playerId === nonStriker));
    expect(inn(after).overs[0]).toBe(inn(before).overs[0]);
    expect(inn(after).balls[0]).toBe(inn(before).balls[0]);
  });
});

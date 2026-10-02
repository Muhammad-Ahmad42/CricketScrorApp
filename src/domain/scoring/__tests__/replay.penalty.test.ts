import { buildEvents } from '../commands';
import { formatRate } from '../format';
import { getBuiltinPreset } from '../presets';
import { validateEvent } from '../validate';
import { applyEvent } from '../replay';
import { envelope, matchSetup, penalty, playedMatch, playScript, reviseOvers } from '../testing';
import { build, chaseAfter, chaseAt, g1, inn, play, step } from './helpers';

describe('penalty runs (U-PEN)', () => {
  const setup = matchSetup();

  it('U-PEN-01 batting side, current innings', () => {
    const state = play(setup, ['start:L1:L2:T7', 'W', '6 6 6 6 6 6 6 6 2', penalty('LIO', 5, 0)], { autoBatters: true, autoBowlers: true }).state;
    expect(inn(state)).toMatchObject({ runs: 55, wickets: 1 });
    expect(inn(state).extras.penalty).toBe(5);
  });

  it('U-PEN-02 / EC-PN-01 a penalty can complete a chase', () => {
    const state = chaseAt(setup, { firstRuns: 149, runs: 146, wickets: 3 }, [penalty('TIG', 5, 1)]).state;
    expect(inn(state, 1)).toMatchObject({ runs: 151, completion: { reason: 'target_reached' } });
    expect(state.pendingAction?.type).toBe('confirm_result');
  });

  it('U-PEN-03 / EC-PN-03 fielding side after batting: the target rises', () => {
    const chase = chaseAfter(setup, { runs: 160 }, ['1']);
    expect(inn(chase.state).target?.runs).toBe(161);
    const state = playScript(setup, [penalty('LIO', 5)], { prior: chase.events }).state;
    expect(inn(state, 0).runs).toBe(165);
    expect(inn(state, 0).extras.penalty).toBe(5);
    expect(inn(state, 1).target).toEqual({ runs: 166, revised: false, source: 'first_innings' });
    expect(state.chase?.target).toBe(166);
  });

  it('U-PEN-04 / EC-PN-02 fielding side not yet batted: carried to its innings', () => {
    const during = play(setup, ['start:L1:L2:T7', '1', penalty('TIG', 5)]).state;
    expect(during.carriedPenalties).toEqual([{ inningsIndex: 1, teamId: 'TIG', runs: 5 }]);
    const started = play(setup, ['start:L1:L2:T7', '1', penalty('TIG', 5), 'decl', 'start:T1:T2:L10']).state;
    expect(inn(started)).toMatchObject({ runs: 5, extras: { penalty: 5, total: 5 } });
    expect(started.carriedPenalties).toEqual([]);
  });

  it('U-PEN-05 / EC-PN-04 penalty after a tying last ball turns the tie into a win without reopening', () => {
    const tie = playedMatch({ setup, first: { runs: 160, wickets: 8 }, second: { runs: 160, wickets: 7 }, end: null });
    expect(tie.state.naturalResult).toEqual({ type: 'tie', decider: null });
    const state = playScript(setup, [penalty('TIG', 5)], { prior: tie.events }).state;
    expect(inn(state, 1)).toMatchObject({ runs: 165, status: 'complete', completion: { reason: 'overs_complete' } });
    expect(state.naturalResult).toEqual({
      type: 'win',
      winnerTeamId: 'TIG',
      loserTeamId: 'LIO',
      margin: { kind: 'wickets', wickets: 3, ballsRemaining: 0 },
      method: 'normal',
    });
    expect(state.pendingAction?.type).toBe('confirm_result');
    expect(buildEvents(setup, state, { type: 'runs', runsRun: 1 })).toMatchObject({ ok: false, code: 'PENDING_ACTION_REQUIRED' });
  });

  it('penalty to a just-completed first innings defaults to that innings', () => {
    const done = playedMatch({ setup, first: { runs: 100 }, second: null, end: null });
    expect(build(setup, done.state, penalty('LIO'))).toEqual([expect.objectContaining({ inningsIndex: 0 })]);
    expect(build(setup, done.state, penalty('TIG'))).toEqual([expect.objectContaining({ inningsIndex: 1 })]);
  });

  describe('super-over phases (U-PEN-06/07)', () => {
    const tie = playedMatch({ setup, first: { runs: 100 }, second: { runs: 100, wickets: 2 }, end: null });
    const inSuperOver = playScript(setup, ['so', 'start:T1:T2:L10', '1'], { prior: tie.events });

    it('U-PEN-06 / EC-PN-05 main-match innings are closed to super-over penalties', () => {
      for (const [teamId, inningsIndex] of [
        ['LIO', 0],
        ['TIG', 1],
      ] as const) {
        const payload = { kind: 'penalty_awarded' as const, teamId, inningsIndex, runs: 5, reason: 'x' };
        expect(validateEvent(setup, inSuperOver.state, payload)).toMatchObject({ ok: false, code: 'INVALID_PENALTY_INNINGS' });
      }
      expect(inn(inSuperOver.state, 0).runs).toBe(100);
      expect(inn(inSuperOver.state, 1).runs).toBe(100);
    });

    it('U-PEN-07 a super-over penalty stays in its round', () => {
      const batting = playScript(setup, [penalty('TIG')], { prior: inSuperOver.events }).state;
      expect(inn(batting, 2).runs).toBe(6);
      expect(inn(batting, 1).runs).toBe(100);
      const fielding = playScript(setup, [penalty('LIO')], { prior: inSuperOver.events }).state;
      expect(fielding.carriedPenalties).toEqual([{ inningsIndex: 3, teamId: 'LIO', runs: 5 }]);
      expect(inn(fielding, 0).runs).toBe(100);
    });
  });

  it('U-PEN-08 / EC-PN-06 penalties are valid while suspended', () => {
    const paused = play(setup, ['start:L1:L2:T7', '1', 'susp']).state;
    expect(buildEvents(setup, paused, penalty('LIO')).ok).toBe(true);
  });

  it('U-PEN-09 / EC-PN-07 runs must be 1..99', () => {
    const { state } = play(setup, ['start:L1:L2:T7']);
    expect(buildEvents(setup, state, penalty('LIO', 0))).toMatchObject({ ok: false, code: 'INVALID_PENALTY' });
    expect(buildEvents(setup, state, penalty('LIO', 100))).toMatchObject({ ok: false, code: 'INVALID_PENALTY' });
  });

  it('U-PEN-10 unknown team', () => {
    const { state } = play(setup, ['start:L1:L2:T7']);
    expect(buildEvents(setup, state, penalty('ZZZ'))).toMatchObject({ ok: false, code: 'TEAM_NOT_IN_MATCH' });
  });

  it('U-PEN-11 default placement', () => {
    const first = play(setup, ['start:L1:L2:T7']).state;
    expect(build(setup, first, penalty('LIO'))[0]).toMatchObject({ inningsIndex: 0 });
    expect(build(setup, first, penalty('TIG'))[0]).toMatchObject({ inningsIndex: 1 });
    const chase = chaseAfter(setup, { runs: 100 }, []).state;
    expect(build(setup, chase, penalty('LIO'))[0]).toMatchObject({ inningsIndex: 0 });
    expect(build(setup, chase, penalty('TIG'))[0]).toMatchObject({ inningsIndex: 1 });
    expect(buildEvents(setup, first, penalty('LIO', 5, 1))).toMatchObject({ ok: false, code: 'INVALID_PENALTY_INNINGS' });
  });
});

describe('overs revision (U-REV)', () => {
  const setup = matchSetup();
  const eightOvers = ['start:L1:L2:T7', ...Array.from({ length: 48 }, () => '1')];

  it('U-REV-01 reducing innings 0 alone warns CHASE_OVERS_NOT_REVISED', () => {
    const { state } = play(setup, eightOvers, { autoBowlers: true });
    const [payload] = build(setup, state, reviseOvers(0, { overs: 12 }));
    expect(validateEvent(setup, state, payload)).toEqual({ ok: true, warnings: [expect.objectContaining({ code: 'CHASE_OVERS_NOT_REVISED' })] });
    const next = step(setup, state, reviseOvers(0, { overs: 12 }));
    expect(inn(next).limits).toMatchObject({ maxBalls: 72, revised: true });
    expect(inn(next).revisions).toHaveLength(1);
  });

  it('U-REV-02 / EC-I-08 both innings: one action, no warning, chase starts at 72 balls', () => {
    const { state } = play(setup, eightOvers, { autoBowlers: true });
    const payloads = build(setup, state, reviseOvers(0, { overs: 12, scope: 'both_innings' }));
    let current = state;
    for (const payload of payloads) {
      expect(validateEvent(setup, current, payload)).toEqual({ ok: true, warnings: [] });
      current = applyEvent(setup, current, envelope(setup, payload, current.lastSeq + 1, 'both'));
    }
    const played = play(setup, [...eightOvers, reviseOvers(0, { overs: 12, scope: 'both_innings' })], { autoBowlers: true });
    const revisions = played.events.filter((event) => event.kind === 'overs_revised');
    expect(revisions).toHaveLength(2);
    expect(new Set(revisions.map((event) => event.actionId)).size).toBe(1);
    const chase = playScript(setup, ['decl', 'start:T1:T2:L10'], { prior: played.events }).state;
    expect(inn(chase).limits).toMatchObject({ maxBalls: 72, revised: true });
    expect(chase.plannedRevisions).toEqual([]);
  });

  it('U-REV-03 / EC-I-06 fewer balls than bowled', () => {
    const { state } = play(setup, eightOvers, { autoBowlers: true });
    expect(buildEvents(setup, state, reviseOvers(0, { balls: 47 }))).toMatchObject({ ok: false, code: 'INVALID_OVERS_REVISION' });
  });

  it('U-REV-04 / EC-I-09 target only for the chase', () => {
    const { state } = play(setup, eightOvers, { autoBowlers: true });
    expect(buildEvents(setup, state, reviseOvers(0, { overs: 12, target: 100 }))).toMatchObject({ ok: false, code: 'INVALID_TARGET' });
    expect(buildEvents(setup, state, reviseOvers(1, { overs: 12, target: 0 }))).toMatchObject({ ok: false, code: 'INVALID_TARGET' });
    expect(buildEvents(setup, state, reviseOvers(1, { overs: 12, target: 90 })).ok).toBe(true);
  });

  it('U-REV-05 / EC-I-05 a revised target at or below the runs completes the chase', () => {
    const chase = chaseAt(setup, { firstRuns: 149, runs: 120, wickets: 2 }, [reviseOvers(1, { balls: 84, target: 118 })]).state;
    expect(inn(chase, 1).completion?.reason).toBe('target_reached');
    expect(chase.naturalResult).toMatchObject({ type: 'win', winnerTeamId: 'TIG', method: 'revised_target' });
  });

  it('U-REV-06 target without an overs change warns', () => {
    const chase = chaseAt(setup, { firstRuns: 149, runs: 20, wickets: 0 }).state;
    const [payload] = build(setup, chase, reviseOvers(1, { balls: 120, target: 140 }));
    expect(validateEvent(setup, chase, payload)).toEqual({ ok: true, warnings: [expect.objectContaining({ code: 'TARGET_REVISION_WITHOUT_OVERS_CHANGE' })] });
  });

  it('U-REV-07 / EC-I-10 powerplays are clamped to the new limit', () => {
    const { state } = play(setup, ['start:L1:L2:T7', reviseOvers(0, { overs: 5 })]);
    expect(inn(state).powerplay.phases.map((phase) => phase.rule)).toEqual([{ name: 'Powerplay', fromOver: 1, toOver: 5 }]);
    const t50 = matchSetup({ rules: getBuiltinPreset('T50')?.rules });
    const reduced = play(t50, ['start:L1:L2:T7', reviseOvers(0, { overs: 30 })]).state;
    expect(inn(reduced).powerplay.phases.map((phase) => [phase.rule.fromOver, phase.rule.toOver])).toEqual([
      [1, 10],
      [11, 30],
    ]);
    const replaced = play(setup, ['start:L1:L2:T7', { type: 'revise_overs', inningsIndex: 0, overs: 10, powerplays: [{ name: 'PP', fromOver: 1, toOver: 3 }], reason: 'Rain' }]).state;
    expect(inn(replaced).powerplay.phases.map((phase) => phase.rule)).toEqual([{ name: 'PP', fromOver: 1, toOver: 3 }]);
  });

  it('U-REV-08 a later revision supersedes the earlier one', () => {
    const { state } = play(setup, ['start:L1:L2:T7', reviseOvers(0, { overs: 15 }), reviseOvers(0, { overs: 12 })]);
    expect(inn(state).limits.maxBalls).toBe(72);
    expect(inn(state).revisions.map((revision) => revision.maxBalls)).toEqual([90, 72]);
    const planned = play(setup, ['start:L1:L2:T7', reviseOvers(1, { overs: 15 }), reviseOvers(1, { overs: 10 })]).state;
    expect(planned.plannedRevisions).toHaveLength(1);
    expect(planned.plannedRevisions[0].revision.maxBalls).toBe(60);
  });

  it('U-REV-09 / EC-I-12 terminal only for the chase in progress, at the balls bowled, with a target', () => {
    const { state } = play(setup, eightOvers, { autoBowlers: true });
    expect(buildEvents(setup, state, reviseOvers(0, { balls: 48, target: 100, terminal: true }))).toMatchObject({ ok: false, code: 'INVALID_OVERS_REVISION' });
    const chase = chaseAt(setup, { firstRuns: 149, runs: 60, wickets: 0 }).state;
    const bowled = inn(chase).legalBalls;
    expect(buildEvents(setup, chase, reviseOvers(1, { balls: bowled, terminal: true }))).toMatchObject({ ok: false, code: 'INVALID_OVERS_REVISION' });
    expect(buildEvents(setup, chase, reviseOvers(1, { balls: bowled + 1, target: 100, terminal: true }))).toMatchObject({ ok: false, code: 'INVALID_OVERS_REVISION' });
    expect(buildEvents(setup, chase, reviseOvers(1, { balls: bowled, target: 100, terminal: true })).ok).toBe(true);
  });

  it('U-REV-10 a completed innings cannot be revised', () => {
    const chase = chaseAfter(setup, { runs: 100 }, []).state;
    expect(buildEvents(setup, chase, reviseOvers(0, { overs: 10 }))).toMatchObject({ ok: false, code: 'INVALID_OVERS_REVISION' });
    expect(buildEvents(setup, chase, reviseOvers(2, { overs: 1 }))).toMatchObject({ ok: false, code: 'WRONG_INNINGS_INDEX' });
  });

  it('overs revision may be planned before the match starts', () => {
    const planned = playScript(setup, [reviseOvers(0, { overs: 10 }), 'start:L1:L2:T7']).state;
    expect(inn(planned).limits.maxBalls).toBe(60);
    expect(planned.plannedRevisions).toEqual([]);
  });
});

describe('run rates and chase state (U-CRR)', () => {
  it('U-CRR-01 G1 innings 0 after two overs', () => {
    const { setup, events } = g1();
    const afterTwo = playScript(setup, [], { prior: events.slice(0, 18) }).state;
    expect(inn(afterTwo)).toMatchObject({ runs: 21, legalBalls: 12 });
    expect(afterTwo.currentRunRate).toBeCloseTo(10.5, 6);
    expect(formatRate(afterTwo.currentRunRate)).toBe('10.50');
  });

  it('U-CRR-02 G1 chase after one over', () => {
    const { setup, events } = g1();
    const chaseStart = events.findIndex((event) => event.kind === 'innings_started' && event.inningsIndex === 1);
    const afterOne = playScript(setup, [], { prior: events.slice(0, chaseStart + 7) }).state;
    expect(afterOne.chase).toEqual({ target: 28, runsRequired: 10, ballsRemaining: 12, requiredRunRate: 5 });
    expect(afterOne.currentRunRate).toBeCloseTo(18, 6);
  });

  it('U-CRR-03 25-over chase at 142/4 in 16.4', () => {
    const setup = matchSetup({ rules: { oversPerInnings: 25, maxOversPerBowler: 5 } });
    const state = chaseAfter(setup, { runs: 217, wickets: 5 }, ['W W W W', ...Array.from({ length: 23 }, () => '6'), '4', ...Array.from({ length: 72 }, () => '0')]).state;
    expect(inn(state)).toMatchObject({ runs: 142, wickets: 4, legalBalls: 100 });
    expect(state.currentRunRate).toBeCloseTo(8.52, 6);
    expect(state.chase?.requiredRunRate).toBeCloseTo(9.12, 6);
    expect(state.chase).toMatchObject({ target: 218, runsRequired: 76, ballsRemaining: 50 });
  });

  it('U-CRR-04/05 before the first legal ball, and no chase in the first innings', () => {
    const setup = matchSetup();
    const state = play(setup, ['start:L1:L2:T7', 'wd']).state;
    expect(state.currentRunRate).toBeNull();
    expect(formatRate(state.currentRunRate)).toBe('–');
    expect(state.chase).toBeNull();
  });
});

describe('powerplay phases', () => {
  it('phases move from upcoming to active to complete', () => {
    const setup = matchSetup({ rules: getBuiltinPreset('T50')?.rules });
    const start = play(setup, ['start:L1:L2:T7']).state;
    expect(inn(start).powerplay.phases.map((phase) => phase.state)).toEqual(['active', 'upcoming', 'upcoming']);
    const tenOvers = play(setup, ['start:L1:L2:T7', ...Array.from({ length: 60 }, () => '1')], { autoBowlers: true }).state;
    expect(inn(tenOvers).powerplay.phases.map((phase) => phase.state)).toEqual(['complete', 'active', 'upcoming']);
    expect(inn(tenOvers).powerplay.phases[0]).toMatchObject({ runs: 60, legalBalls: 60, wickets: 0 });
    expect(inn(tenOvers).powerplay.active?.name).toBe('Powerplay 2');
    expect(inn(tenOvers).balls[59].powerplayName).toBe('Powerplay 1');
  });
});

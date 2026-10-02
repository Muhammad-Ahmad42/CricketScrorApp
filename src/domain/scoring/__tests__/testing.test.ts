import { replayMatch } from '../replay';
import { resultWinner } from '../result';
import {
  abandonedResult,
  generatedSquad,
  inningsSummary,
  m3Setup,
  m8LmsSetup,
  m8v7Setup,
  matchSetup,
  noResult,
  offBallDismissal,
  parseNotation,
  planInningsBalls,
  playedMatch,
  randomMatch,
  rawEvents,
  scriptedMatch,
  substitutePlayer,
  summary,
  walkover,
} from '../testing';

describe('fixtures', () => {
  it('matchSetup is the M20 fixture', () => {
    const setup = matchSetup();
    expect(setup.teams.map((team) => [team.id, team.name, team.playersInSide])).toEqual([
      ['LIO', 'Lions', 11],
      ['TIG', 'Tigers', 11],
    ]);
    expect(setup.players).toHaveLength(24);
    expect(setup.players.find((player) => player.playerId === 'L6')).toMatchObject({ name: 'Sarfraz', isWicketKeeper: true });
    expect(setup.players.find((player) => player.playerId === 'T12')).toMatchObject({ name: 'Ali', isSubstitute: true, battingOrder: null });
    expect(setup.toss).toEqual({ winnerTeamId: 'LIO', decision: 'bat' });
  });

  it('named variants', () => {
    expect(m3Setup().rules).toMatchObject({ oversPerInnings: 3, maxOversPerBowler: 2 });
    expect(m8LmsSetup().rules).toMatchObject({ playersPerSide: 8, lastManStands: true });
    expect(m8v7Setup().teams.map((team) => team.playersInSide)).toEqual([8, 7]);
  });

  it('custom teams get generated squads', () => {
    const setup = matchSetup({ teamA: { id: 'EAG', name: 'Eagles' }, teamB: { id: 'HAW', name: 'Hawks' }, toss: null });
    expect(setup.players.filter((player) => player.teamId === 'EAG')).toHaveLength(12);
    expect(setup.players[0]).toMatchObject({ playerId: 'EAG-1', name: 'Eagles 1' });
    expect(generatedSquad('M1', 'X', 'X', 3, 0)).toHaveLength(3);
  });
});

describe('scriptedMatch and notation', () => {
  it('assigns seqs, ids, one action per step and timestamps', () => {
    const setup = matchSetup();
    const events = scriptedMatch(setup, ['start:L1:L2:T7', '1 W>L3']);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
    expect(events.map((event) => event.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(events.map((event) => event.actionId)).toEqual(['a1', 'a2', 'a3', 'a3']);
    expect(events.map((event) => event.recordedAt)).toEqual([
      '2026-05-01T10:00:00.000Z',
      '2026-05-01T10:00:01.000Z',
      '2026-05-01T10:00:02.000Z',
      '2026-05-01T10:00:03.000Z',
    ]);
  });

  it('throws on the first rejected step with the reason', () => {
    expect(() => scriptedMatch(matchSetup(), ['start:L1:L2:T7', '0 0 0 0 0 0 1'])).toThrow(/PENDING_ACTION_REQUIRED/);
    expect(() => parseNotation('zz')).toThrow(/Unknown score notation/);
  });

  it('parses the compact notation', () => {
    expect(parseNotation('. 1 4 4r 2s 1+4 wd wd2 wd4 nb nb1 nb4 nb6 nb2b nb1lb b1 b4 lb2 sw @T8 @T8:injury >L3 >L3:n W W:c:T9 W:st W:lbw>L4')).toEqual([
      { type: 'runs', runsRun: 0 },
      { type: 'runs', runsRun: 1 },
      { type: 'runs', runsRun: 0, boundary: 4 },
      { type: 'runs', runsRun: 4 },
      { type: 'runs', runsRun: 2, shortRuns: 1 },
      { type: 'runs', runsRun: 1, boundary: 4 },
      { type: 'wide', runsRun: 0 },
      { type: 'wide', runsRun: 2 },
      { type: 'wide', runsRun: 0, boundary: true },
      { type: 'no_ball', runsTo: 'bat', runsRun: 0 },
      { type: 'no_ball', runsTo: 'bat', runsRun: 1 },
      { type: 'no_ball', runsTo: 'bat', boundary: 4 },
      { type: 'no_ball', runsTo: 'bat', boundary: 6 },
      { type: 'no_ball', runsTo: 'bye', runsRun: 2 },
      { type: 'no_ball', runsTo: 'leg_bye', runsRun: 1 },
      { type: 'bye', runsRun: 1 },
      { type: 'bye', runsRun: 0, boundary: true },
      { type: 'leg_bye', runsRun: 2 },
      { type: 'swap_strike' },
      { type: 'select_bowler', bowlerId: 'T8' },
      { type: 'select_bowler', bowlerId: 'T8', reason: 'injury' },
      { type: 'batter_in', playerId: 'L3' },
      { type: 'batter_in', playerId: 'L3', position: 'non_striker' },
      { type: 'wicket', dismissal: 'bowled' },
      { type: 'wicket', dismissal: 'caught', fielderIds: ['T9'] },
      { type: 'wicket', dismissal: 'stumped' },
      { type: 'wicket', dismissal: 'lbw', nextBatterId: 'L4' },
    ]);
  });

  it('auto bowlers and batters keep long scripts short', () => {
    const setup = matchSetup();
    const events = scriptedMatch(setup, ['start:L1:L2:T7', ...Array.from({ length: 30 }, () => '1'), 'W', '4'], { autoBowlers: true, autoBatters: true });
    const state = replayMatch(setup, events);
    expect(state.issues).toEqual([]);
    expect(state.innings[0]).toMatchObject({ runs: 34, wickets: 1, legalBalls: 32 });
    expect(state.innings[0].bowling.every((row) => row.oversUsed <= 4)).toBe(true);
  });

  it('rawEvents wraps payloads without validation', () => {
    const setup = matchSetup();
    const events = rawEvents(setup, [{ kind: 'strike_swapped' }, { kind: 'play_resumed' }], { firstSeq: 5 });
    expect(events.map((event) => [event.seq, event.id, event.actionId])).toEqual([
      [5, 'e5', 'a5'],
      [6, 'e6', 'a6'],
    ]);
  });
});

describe('playedMatch', () => {
  it('produces exact figures and a summary', () => {
    const played = playedMatch({ first: { runs: 187, wickets: 6 }, second: { runs: 150, wickets: 10, balls: 110 }, completedAt: '2026-05-01T13:00:00.000Z' });
    expect(played.state.issues).toEqual([]);
    expect(played.summary?.innings.map((innings) => [innings.runs, innings.wickets, innings.legalBalls, innings.allOut])).toEqual([
      [187, 6, 120, false],
      [150, 10, 110, true],
    ]);
    expect(played.summary?.result).toMatchObject({ type: 'win', winnerTeamId: 'LIO', margin: { kind: 'runs', runs: 37 } });
    expect(played.summary?.completedAt).toBe('2026-05-01T13:00:00.000Z');
  });

  it('chases finish exactly on the target ball', () => {
    const played = playedMatch({ first: { runs: 100, wickets: 3 }, second: { runs: 104, wickets: 4, balls: 80 } });
    expect(played.summary?.innings[1]).toMatchObject({ runs: 104, wickets: 4, legalBalls: 80, completion: 'target_reached' });
    expect(played.summary?.result).toMatchObject({ margin: { kind: 'wickets', wickets: 6, ballsRemaining: 40 } });
  });

  it('supports other teams, batting order and early endings', () => {
    const setup = matchSetup({ teamA: { id: 'EAG', name: 'Eagles' }, teamB: { id: 'HAW', name: 'Hawks' }, toss: null });
    const played = playedMatch({ setup, battingFirst: 'HAW', first: { runs: 90, wickets: 2 }, second: null, end: { type: 'no_result', reason: 'Rain' } });
    expect(played.summary).toMatchObject({ teamAId: 'EAG', teamBId: 'HAW', result: { type: 'no_result' }, winnerTeamId: null });
    expect(played.summary?.innings[0].battingTeamId).toBe('HAW');
  });

  it('rejects impossible plans', () => {
    expect(() => planInningsBalls({ runs: 100, wickets: 0, balls: 10 }, 10, null)).toThrow();
    expect(() => planInningsBalls({ runs: 10, wickets: 12, balls: 10 }, 10, null)).toThrow();
    expect(planInningsBalls({ runs: 6, wickets: 1, balls: 3 }, 10, null)).toEqual([3, 'W', 3]);
  });
});

describe('hand-built summaries and random matches', () => {
  it('summary and inningsSummary defaults', () => {
    const built = summary({ matchId: 'X', innings: [inningsSummary({ runs: 120 })] });
    expect(built).toMatchObject({ summaryVersion: 2, matchId: 'X', teamAId: 'LIO', teamBId: 'TIG', status: 'completed', winnerTeamId: 'LIO' });
    expect(built.innings[0]).toMatchObject({ battingTeamId: 'LIO', bowlingTeamId: 'TIG', runs: 120, allottedBalls: 120 });
    expect(resultWinner(built.result)).toBe(built.winnerTeamId);
    expect(summary({ result: { type: 'abandoned', reason: null } }).status).toBe('abandoned');
  });

  it('result and intent helpers', () => {
    expect(abandonedResult('Rain')).toEqual({ type: 'abandoned', reason: 'Rain' });
    expect(noResult()).toEqual({ type: 'no_result', reason: null });
    expect(walkover('TIG', 'LIO')).toEqual({ type: 'walkover', winnerTeamId: 'TIG', loserTeamId: 'LIO', reason: null });
    expect(offBallDismissal('L2', 'run_out', { fielderIds: ['T7'] })).toEqual({
      type: 'off_ball_dismissal',
      playerId: 'L2',
      dismissal: 'run_out',
      fielderIds: ['T7'],
      nextBatterId: null,
    });
    const setup = matchSetup();
    const extra = substitutePlayer(setup, 'LIO', 'L13', 'Hasan');
    const withSub = matchSetup({ extraPlayers: [extra] });
    const state = replayMatch(withSub, scriptedMatch(withSub, ['start:L1:L2:T7', 'ro:ss:0:T12']));
    expect(state.innings[0].batting.some((row) => row.playerId === 'L13')).toBe(false);
  });

  it('random matches are reproducible per seed', () => {
    expect(randomMatch(7).events).toEqual(randomMatch(7).events);
    expect(randomMatch(7).events).not.toEqual(randomMatch(8).events);
  });
});

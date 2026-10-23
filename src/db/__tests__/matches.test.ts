/** @jest-environment node */
import type { Match, MatchEvent } from '@/domain/types';
import { NotFoundError, SquadPlayerInUseError, sqliteErrorKind } from '../errors';
import { createRepositories, readMatchProjection } from '../repositories';
import type { Repositories } from '../repositories/contracts';
import { TEST_MATCH_RULES, buildMatch, buildTeamSeed, buildTournament, buildTournamentRules, isoAt, squadsFor } from '../testing/builders';
import { EventLogBuilder, ball, goldenMatchEvents, goldenProjection, type GoldenMatchOptions } from '../testing/goldenMatch';
import { countRows, openTestRepositories } from '../testing/harness';
import { seedLibrary } from '../testing/tournamentScenario';
import type { SqlDatabase } from '../types';

const lions = buildTeamSeed('lio', 'Lions', 'LIO');
const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');
const eagles = buildTeamSeed('eag', 'Eagles', 'EAG');

const L = (n: number): string => lions.players[n - 1].id;
const T = (n: number): string => tigers.players[n - 1].id;

const golden: GoldenMatchOptions = {
  matchId: 'm1',
  batFirst: { teamId: 'lio', playerIds: lions.players.map((p) => p.id) },
  bowlFirst: { teamId: 'tig', playerIds: tigers.players.map((p) => p.id) },
};

async function setup(): Promise<{ readonly db: SqlDatabase; readonly repos: Repositories }> {
  const { db, repos } = await openTestRepositories();
  await seedLibrary(db, [lions, tigers, eagles]);
  return { db, repos };
}

function completedMatch(id: string, overrides: Partial<Match> = {}): Match {
  return buildMatch({
    id,
    teamAId: 'lio',
    teamBId: 'tig',
    status: 'completed',
    result: {
      type: 'win',
      winnerTeamId: 'tig',
      loserTeamId: 'lio',
      margin: { kind: 'wickets', wickets: 9, ballsRemaining: 4 },
      method: 'normal',
    },
    winnerTeamId: 'tig',
    startedAt: isoAt(1),
    completedAt: isoAt(1800),
    ...overrides,
  });
}

describe('MatchRepository basics', () => {
  it('round-trips a match deep-equal including JSON rules, toss, result and nullables', async () => {
    const { repos } = await setup();
    const match = completedMatch('m1', {
      title: 'Lions v Tigers',
      scheduledDate: '2026-05-01',
      scheduledTime: '14:30',
      teamBPlayers: 7,
      toss: { winnerTeamId: 'tig', decision: 'bowl' },
      rules: { ...TEST_MATCH_RULES, mandatoryRetirement: { atRuns: 30, mayReturn: true, timing: 'end_of_over' } },
    });
    const scheduled = buildMatch({ id: 'm2', teamAId: 'tig', teamBId: 'eag', toss: null });
    await repos.matches.insert(match, squadsFor(lions, tigers));
    await repos.matches.insert(scheduled, []);
    expect(await repos.matches.get('m1')).toEqual(match);
    expect(await repos.matches.get('m2')).toEqual(scheduled);
    expect(await repos.matches.get('nope')).toBeNull();
  });

  it('builds the replay setup with resolved side sizes and squads joined with player names', async () => {
    const { repos } = await setup();
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', teamBPlayers: 7 }), squadsFor(lions, tigers));
    await repos.players.update({ ...lions.players[0], name: 'Babar Azam' });
    const replaySetup = await repos.matches.getSetup('m1');
    expect(replaySetup?.matchId).toBe('m1');
    expect(replaySetup?.rules).toEqual(TEST_MATCH_RULES);
    expect(replaySetup?.toss).toEqual({ winnerTeamId: 'lio', decision: 'bat' });
    expect(replaySetup?.teams).toEqual([
      { id: 'lio', name: 'Lions', shortName: 'LIO', playersInSide: 11 },
      { id: 'tig', name: 'Tigers', shortName: 'TIG', playersInSide: 7 },
    ]);
    expect(replaySetup?.players).toHaveLength(24);
    expect(replaySetup?.players[0]).toEqual({
      matchId: 'm1',
      playerId: L(1),
      teamId: 'lio',
      name: 'Babar Azam',
      jerseyNumber: 1,
      role: 'batter',
      battingOrder: 1,
      isCaptain: true,
      isWicketKeeper: false,
      isSubstitute: false,
    });
    expect(replaySetup?.players.slice(0, 12).map((p) => p.teamId)).toEqual(Array(12).fill('lio'));
    expect(replaySetup?.players[11]).toMatchObject({ playerId: L(12), battingOrder: null, isSubstitute: true });
    expect(replaySetup?.players[5]).toMatchObject({ playerId: L(6), isWicketKeeper: true });
    expect(await repos.matches.getSetup('nope')).toBeNull();
  });

  it('refuses a squad row of a team that is not playing the match (trigger)', async () => {
    const { repos } = await setup();
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig' }), []);
    const error = await repos.matches
      .addSquadPlayer('m1', 'eag', { playerId: eagles.players[0].id, battingOrder: 1, isCaptain: false, isWicketKeeper: false, isSubstitute: false })
      .catch((e: unknown) => e);
    expect(String(error)).toMatch(/not a team of this match/);
    expect(sqliteErrorKind(error)).toBe('trigger');
    await repos.matches.addSquadPlayer('m1', 'lio', {
      playerId: eagles.players[0].id,
      battingOrder: 12,
      isCaptain: false,
      isWicketKeeper: false,
      isSubstitute: false,
    });
    const replaySetup = await repos.matches.getSetup('m1');
    expect(replaySetup?.players.map((p) => [p.playerId, p.teamId])).toEqual([[eagles.players[0].id, 'lio']]);
    await expect(
      repos.matches.addSquadPlayer('m1', 'lio', { playerId: L(1), battingOrder: 1, isCaptain: true, isWicketKeeper: false, isSubstitute: true }),
    ).rejects.toThrow(/CHECK/);
  });

  it('refuses a raw change of a match team while its squad, innings or log still names the old team (trigger)', async () => {
    const { db, repos } = await setup();
    const teamOf = async (id: string): Promise<unknown> =>
      db.getFirstAsync<{ readonly team_a_id: string; readonly team_b_id: string }>('SELECT team_a_id, team_b_id FROM matches WHERE id = ?', [id]);
    const refused = async (sql: string, id: string): Promise<void> => {
      const before = await teamOf(id);
      const error = await db.runAsync(sql, [id]).then(
        () => null,
        (e: unknown) => e,
      );
      expect(String(error)).toMatch(/not a team of this match/);
      expect(sqliteErrorKind(error)).toBe('trigger');
      expect(await teamOf(id)).toEqual(before);
    };
    await repos.matches.insert(buildMatch({ id: 'sq', teamAId: 'lio', teamBId: 'tig', toss: null }), squadsFor(lions, tigers));
    await refused("UPDATE matches SET team_b_id = 'eag' WHERE id = ?", 'sq');
    await refused("UPDATE matches SET team_a_id = 'eag' WHERE id = ?", 'sq');

    await repos.matches.insert(buildMatch({ id: 'inn', teamAId: 'lio', teamBId: 'tig', status: 'live' }), []);
    await repos.matches.writeProjection(goldenProjection({ ...golden, matchId: 'inn' }, { projectionVersion: 1, teamAId: 'lio', at: isoAt(10), completed: false }));
    await refused("UPDATE matches SET team_b_id = 'eag' WHERE id = ?", 'inn');

    await repos.matches.insert(buildMatch({ id: 'log', teamAId: 'lio', teamBId: 'tig', status: 'live', toss: null }), []);
    await db.runAsync(
      "INSERT INTO match_events (id, match_id, seq, action_id, kind, recorded_at, payload_json) VALUES ('log-1', 'log', 1, 'a1', 'innings_started', ?, ?)",
      [isoAt(1), JSON.stringify({ inningsIndex: 0, battingTeamId: 'tig' })],
    );
    await refused("UPDATE matches SET team_b_id = 'eag' WHERE id = ?", 'log');
    await db.runAsync("UPDATE matches SET team_a_id = 'eag' WHERE id = 'log'");
    expect(await teamOf('log')).toEqual({ team_a_id: 'eag', team_b_id: 'tig' });

    await repos.matches.insert(buildMatch({ id: 'free', teamAId: 'lio', teamBId: 'tig', toss: null }), []);
    await db.runAsync("UPDATE matches SET team_b_id = 'eag' WHERE id = 'free'");
    expect(await teamOf('free')).toEqual({ team_a_id: 'lio', team_b_id: 'eag' });
    await db.runAsync("UPDATE matches SET team_a_id = team_b_id, team_b_id = team_a_id WHERE id = 'sq'");
    expect(await teamOf('sq')).toEqual({ team_a_id: 'tig', team_b_id: 'lio' });
  });

  it('updates configuration columns but writes status only while the log is empty', async () => {
    const { repos } = await setup();
    const match = buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig' });
    await repos.matches.insert(match, squadsFor(lions, tigers));
    const postponed: Match = {
      ...match,
      title: 'Lions v Tigers (rescheduled)',
      venueId: null,
      scheduledDate: '2026-06-01',
      scheduledTime: '09:15',
      formatId: 'T20',
      rules: { ...TEST_MATCH_RULES, oversPerInnings: 5 },
      toss: null,
      teamAPlayers: 9,
      teamBPlayers: 9,
      status: 'postponed',
      resumeDismissedAt: isoAt(50),
      updatedAt: isoAt(60),
    };
    await repos.matches.update(postponed);
    expect(await repos.matches.get('m1')).toEqual(postponed);
    await repos.events.append(goldenMatchEvents(golden).slice(0, 1));
    await repos.matches.update({ ...postponed, status: 'cancelled', title: 'Renamed' });
    const after = await repos.matches.get('m1');
    expect(after?.status).toBe('postponed');
    expect(after?.title).toBe('Renamed');
    expect((await repos.matches.list({})).find((item) => item.id === 'm1')?.oversPerInnings).toBe(5);
  });
});

describe('MatchRepository squad removal and payload foreign keys (IT-DB-04)', () => {
  async function started(): Promise<{ readonly db: SqlDatabase; readonly repos: Repositories }> {
    const context = await setup();
    await context.repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
    return context;
  }

  it('refuses to remove an opener referenced only by innings_started', async () => {
    const { repos } = await started();
    await repos.events.append(goldenMatchEvents(golden).slice(0, 1));
    for (const playerId of [L(1), L(2), T(7)]) {
      await expect(repos.matches.removeSquadPlayer('m1', playerId)).rejects.toBeInstanceOf(SquadPlayerInUseError);
    }
  });

  it('refuses players referenced only by batter_in, bowler_selected or off-ball dismissal fielders', async () => {
    const { repos } = await started();
    const events = new EventLogBuilder('m1', 'p-')
      .act({ kind: 'innings_started', inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7) })
      .act({ kind: 'batter_dismissed', playerId: L(1), type: 'timed_out', fielderIds: [] })
      .act({ kind: 'batter_in', playerId: L(9), position: 'striker' })
      .act({ kind: 'bowler_selected', bowlerId: T(9), reason: 'injury' })
      .act({ kind: 'batter_dismissed', playerId: L(9), type: 'run_out', fielderIds: [T(10), T(12)] })
      .events();
    await repos.events.append(events);
    for (const playerId of [L(9), T(9), T(10), T(12)]) {
      await expect(repos.matches.removeSquadPlayer('m1', playerId)).rejects.toBeInstanceOf(SquadPlayerInUseError);
    }
  });

  it('refuses a third fielder of an off-ball dismissal and an absentee (json_each checks)', async () => {
    const { repos } = await started();
    const events = new EventLogBuilder('m1', 'p-')
      .act({ kind: 'innings_started', inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7) })
      .act({ kind: 'batter_dismissed', playerId: L(1), type: 'run_out', fielderIds: [T(1), T(2), T(3)] })
      .act({ kind: 'innings_ended', reason: 'batters_unavailable', absentees: [{ playerId: L(11), hurt: true }] })
      .events();
    await repos.events.append(events);
    await expect(repos.matches.removeSquadPlayer('m1', T(3))).rejects.toBeInstanceOf(SquadPlayerInUseError);
    await expect(repos.matches.removeSquadPlayer('m1', L(11))).rejects.toBeInstanceOf(SquadPlayerInUseError);
  });

  it('refuses a substitute who took a catch on a delivery and removes an unused player', async () => {
    const { db, repos } = await started();
    const events = new EventLogBuilder('m1', 'p-')
      .act({ kind: 'innings_started', inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7) })
      .act(ball(L(1), L(2), T(7), { wicket: { type: 'caught', playerOutId: L(1), fielderIds: [T(12)], dismissalEnd: null } }))
      .events();
    await repos.events.append(events);
    await expect(repos.matches.removeSquadPlayer('m1', T(12))).rejects.toBeInstanceOf(SquadPlayerInUseError);
    await repos.matches.removeSquadPlayer('m1', L(10));
    expect(await countRows(db, 'match_players', 'match_id = ?', ['m1'])).toBe(23);
    await repos.matches.removeSquadPlayer('m1', 'not-in-squad');
    expect(await countRows(db, 'match_players', 'match_id = ?', ['m1'])).toBe(23);
  });
});

describe('MatchRepository projections', () => {
  it('writes and reads back the projection, replacing innings and partnership rows', async () => {
    const { db, repos } = await setup();
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
    await repos.events.append(goldenMatchEvents(golden));
    const live = goldenProjection(golden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(900), completed: false });
    await repos.matches.writeProjection(live);
    expect(await readMatchProjection(db, 'm1')).toEqual(live);
    expect(await countRows(db, 'innings', 'match_id = ?', ['m1'])).toBe(2);
    expect(await countRows(db, 'partnerships', 'match_id = ?', ['m1'])).toBe(4);
    const done = goldenProjection(golden, { projectionVersion: 3, teamAId: 'lio', at: isoAt(1800), completed: true });
    const trimmed = { ...done, innings: done.innings.slice(0, 1), partnerships: done.partnerships.slice(0, 1) };
    await repos.matches.writeProjection(trimmed);
    expect(await readMatchProjection(db, 'm1')).toEqual(trimmed);
    expect(await countRows(db, 'innings', 'match_id = ?', ['m1'])).toBe(1);
    expect(await countRows(db, 'partnerships', 'match_id = ?', ['m1'])).toBe(1);
    const row = await db.getFirstAsync<{ readonly projection_version: number; readonly result_type: string }>(
      'SELECT projection_version, result_type FROM matches WHERE id = ?',
      ['m1'],
    );
    expect(row).toEqual({ projection_version: 3, result_type: 'win' });
    const match = await repos.matches.get('m1');
    expect(match).toMatchObject({ status: 'completed', winnerTeamId: 'tig', completedAt: isoAt(1800), updatedAt: isoAt(1800) });
  });

  it('refuses inconsistent projections and unknown matches', async () => {
    const { repos } = await setup();
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
    const live = goldenProjection(golden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(900), completed: false });
    await expect(repos.matches.writeProjection({ ...live, status: 'completed' })).rejects.toThrow(/CHECK/);
    await expect(repos.matches.writeProjection({ ...live, matchId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    const foreignInnings = { ...live, innings: [{ ...live.innings[0], battingTeamId: 'eag' }] };
    await expect(repos.matches.writeProjection(foreignInnings)).rejects.toThrow(/innings teams are not the teams of this match/);
  });

  it('lists stale projections of matches with a non-empty log only', async () => {
    const { repos } = await setup();
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
    await repos.matches.insert(buildMatch({ id: 'm2', teamAId: 'lio', teamBId: 'tig', createdAt: isoAt(5) }), squadsFor(lions, tigers));
    await repos.matches.insert(buildMatch({ id: 'm3', teamAId: 'lio', teamBId: 'tig', status: 'live', createdAt: isoAt(9) }), squadsFor(lions, tigers));
    await repos.events.append(goldenMatchEvents(golden).slice(0, 2));
    await repos.events.append(goldenMatchEvents({ ...golden, matchId: 'm3' }).slice(0, 2));
    await repos.matches.writeProjection(goldenProjection({ ...golden, matchId: 'm3' }, { projectionVersion: 2, teamAId: 'lio', at: isoAt(10), completed: false }));
    expect(await repos.matches.listStaleProjections(2)).toEqual(['m1']);
    expect(await repos.matches.listStaleProjections(3)).toEqual(['m1', 'm3']);
    expect(await repos.matches.listStaleProjections(0)).toEqual([]);
  });

  it('deletes a match with its events, squad and projections and detaches its audit rows', async () => {
    const { db, repos } = await setup();
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
    await repos.matches.insert(buildMatch({ id: 'm2', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
    for (const id of ['m1', 'm2']) {
      await repos.events.append(goldenMatchEvents({ ...golden, matchId: id }));
      await repos.matches.writeProjection(goldenProjection({ ...golden, matchId: id }, { projectionVersion: 1, teamAId: 'lio', at: isoAt(9), completed: false }));
    }
    await repos.audit.append({
      id: 'au1',
      tournamentId: null,
      matchId: 'm1',
      action: 'match_history_edited',
      entityType: 'match',
      entityId: 'm1',
      summary: 'Edited',
      previousValue: null,
      newValue: null,
      reason: 'Umpire signal misread',
      impact: null,
      createdAt: isoAt(10),
    });
    await repos.matches.delete('m1');
    expect(await repos.matches.get('m1')).toBeNull();
    for (const table of ['match_events', 'match_players', 'innings', 'partnerships']) {
      expect(await countRows(db, table, 'match_id = ?', ['m1'])).toBe(0);
      expect(await countRows(db, table, 'match_id = ?', ['m2'])).toBeGreaterThan(0);
    }
    expect((await repos.audit.list({ limit: 10 }))[0].matchId).toBeNull();
  });
});

describe('MatchRepository lists (history, resume prompt)', () => {
  async function seedHistory(repos: Repositories): Promise<void> {
    await repos.tournaments.insert(buildTournament({ id: 'cup', name: 'Spring Cup' }), buildTournamentRules('cup'));
    await repos.tournaments.upsertTournamentTeams(
      ['lio', 'eag'].map((teamId, index) => ({
        id: `tt-${teamId}`,
        tournamentId: 'cup',
        teamId,
        seed: index + 1,
        status: 'active' as const,
        replacedByTeamId: null,
        inheritsFromTeamId: null,
        joinedAt: isoAt(1),
      })),
    );
    const rows: Match[] = [
      completedMatch('h1', { title: 'Friendly opener', createdAt: isoAt(100), updatedAt: isoAt(2000), scheduledDate: '2026-05-10' }),
      buildMatch({ id: 'h2', teamAId: 'tig', teamBId: 'eag', title: 'Night game', status: 'live', createdAt: isoAt(200), updatedAt: isoAt(900), scheduledDate: '2026-05-03', scheduledTime: '20:00' }),
      buildMatch({ id: 'h3', teamAId: 'lio', teamBId: 'eag', title: 'Cup tie', status: 'paused', tournamentId: 'cup', createdAt: isoAt(300), updatedAt: isoAt(950), scheduledDate: '2026-05-03', scheduledTime: '09:00' }),
      buildMatch({ id: 'h4', teamAId: 'tig', teamBId: 'lio', title: 'Future', status: 'scheduled', createdAt: isoAt(400), updatedAt: isoAt(400) }),
      buildMatch({ id: 'h5', teamAId: 'eag', teamBId: 'tig', title: 'Washed out', status: 'cancelled', createdAt: isoAt(500), updatedAt: isoAt(500), scheduledDate: '2026-04-01' }),
    ];
    for (const match of rows) {
      await repos.matches.insert(match, []);
    }
    await repos.matches.insert(buildMatch({ id: 'h1b', teamAId: 'lio', teamBId: 'tig', createdAt: isoAt(50) }), squadsFor(lions, tigers));
    await repos.matches.delete('h1b');
  }

  it('returns list items with teams, innings lines, tournament name and result', async () => {
    const { repos } = await setup();
    await seedHistory(repos);
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live', createdAt: isoAt(600) }), squadsFor(lions, tigers));
    const playedGolden: GoldenMatchOptions = { ...golden, start: isoAt(600) };
    await repos.events.append(goldenMatchEvents(playedGolden));
    const projection = goldenProjection(playedGolden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(1700), completed: true });
    await repos.matches.writeProjection(projection);
    const [latest] = await repos.matches.list({ sort: 'recent', limit: 1 });
    expect(latest).toEqual({
      id: 'm1',
      title: 'lio v tig',
      status: 'completed',
      result: projection.result,
      teamA: { id: 'lio', name: 'Lions', shortName: 'LIO' },
      teamB: { id: 'tig', name: 'Tigers', shortName: 'TIG' },
      oversPerInnings: 3,
      innings: projection.innings.map((line) => ({
        inningsIndex: line.inningsIndex,
        kind: line.kind,
        battingTeamId: line.battingTeamId,
        runs: line.runs,
        wickets: line.wickets,
        legalBalls: line.legalBalls,
        ballsPerOver: line.ballsPerOver,
        status: line.status,
        completionReason: line.completionReason,
      })),
      scheduledDate: null,
      tournamentId: null,
      tournamentName: null,
      resumeDismissedAt: null,
      updatedAt: isoAt(1700),
      startedAt: isoAt(601),
      completedAt: isoAt(1700),
    });
    const cup = (await repos.matches.list({ tournamentId: 'cup' }))[0];
    expect(cup).toMatchObject({ id: 'h3', tournamentId: 'cup', tournamentName: 'Spring Cup', innings: [], startedAt: null, completedAt: null });
  });

  it('orders recent and oldest by when a match was played, not when its row was created (wave-3 bug #5)', async () => {
    const { repos } = await setup();
    await repos.matches.insert(
      buildMatch({ id: 'fixture', teamAId: 'lio', teamBId: 'tig', scheduledDate: '2026-05-09', createdAt: isoAt(100), updatedAt: isoAt(100) }),
      squadsFor(lions, tigers),
    );
    await repos.matches.insert(buildMatch({ id: 'friendly', teamAId: 'lio', teamBId: 'tig', createdAt: isoAt(200), updatedAt: isoAt(200) }), squadsFor(lions, tigers));
    await repos.matches.insert(buildMatch({ id: 'planned', teamAId: 'tig', teamBId: 'eag', createdAt: isoAt(300), updatedAt: isoAt(300), scheduledDate: '2026-05-20' }), []);
    const fixtureGolden: GoldenMatchOptions = { ...golden, matchId: 'fixture', start: isoAt(5000) };
    await repos.events.append(goldenMatchEvents(fixtureGolden));
    await repos.matches.writeProjection(goldenProjection(fixtureGolden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(6000), completed: true }));
    const friendlyGolden: GoldenMatchOptions = { ...golden, matchId: 'friendly', idPrefix: 'fr-', start: isoAt(1000) };
    await repos.events.append(goldenMatchEvents(friendlyGolden));
    await repos.matches.writeProjection(goldenProjection(friendlyGolden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(2000), completed: true }));
    const ids = async (sort: 'recent' | 'oldest'): Promise<string[]> => (await repos.matches.list({ sort })).map((item) => item.id);
    expect(await ids('recent')).toEqual(['fixture', 'friendly', 'planned']);
    expect(await ids('oldest')).toEqual(['planned', 'friendly', 'fixture']);
    const fixture = (await repos.matches.list({ sort: 'recent', limit: 1 }))[0];
    expect(fixture).toMatchObject({ scheduledDate: '2026-05-09', startedAt: isoAt(5001), completedAt: isoAt(6000) });
  });

  it('filters by status, tournament, team and search, sorts and pages', async () => {
    const { repos } = await setup();
    await seedHistory(repos);
    const ids = async (query: Parameters<Repositories['matches']['list']>[0]): Promise<string[]> =>
      (await repos.matches.list(query)).map((item) => item.id);
    expect(await ids({})).toEqual(['h5', 'h4', 'h3', 'h2', 'h1']);
    expect(await ids({ sort: 'oldest' })).toEqual(['h1', 'h2', 'h3', 'h4', 'h5']);
    expect(await ids({ sort: 'scheduled' })).toEqual(['h5', 'h3', 'h2', 'h1', 'h4']);
    expect(await ids({ statuses: ['live', 'paused'] })).toEqual(['h3', 'h2']);
    expect(await ids({ statuses: [] })).toEqual([]);
    expect(await ids({ tournamentId: null })).toEqual(['h5', 'h4', 'h2', 'h1']);
    expect(await ids({ tournamentId: 'cup' })).toEqual(['h3']);
    expect(await ids({ teamId: 'eag' })).toEqual(['h5', 'h3', 'h2']);
    expect(await ids({ search: 'night' })).toEqual(['h2']);
    expect(await ids({ search: 'EAGLES' })).toEqual(['h5', 'h3', 'h2']);
    expect(await ids({ search: 'lio' })).toEqual(['h4', 'h3', 'h1']);
    expect(await ids({ search: '  ' })).toEqual(['h5', 'h4', 'h3', 'h2', 'h1']);
    expect(await ids({ search: '%' })).toEqual([]);
    expect(await ids({ teamId: 'lio', statuses: ['completed', 'scheduled'], sort: 'oldest' })).toEqual(['h1', 'h4']);
    expect(await ids({ limit: 2 })).toEqual(['h5', 'h4']);
    expect(await ids({ limit: 2, offset: 2 })).toEqual(['h3', 'h2']);
    expect(await ids({ limit: 2, offset: 4 })).toEqual(['h1']);
    expect(await ids({ offset: 3 })).toEqual(['h2', 'h1']);
  });

  it('finds resumable matches, most recently updated first, honouring SAVE & EXIT for the prompt', async () => {
    const { repos } = await setup();
    await seedHistory(repos);
    const ids = async (forPrompt?: boolean): Promise<string[]> =>
      (await repos.matches.findResumable(forPrompt === undefined ? undefined : { forPrompt })).map((item) => item.id);
    expect(await ids()).toEqual(['h3', 'h2']);
    expect(await ids(true)).toEqual(['h3', 'h2']);
    await repos.matches.setResumeDismissed('h3', isoAt(1000));
    expect(await ids(true)).toEqual(['h2']);
    expect(await ids(false)).toEqual(['h3', 'h2']);
    expect((await repos.matches.findResumable())[0].resumeDismissedAt).toBe(isoAt(1000));
    expect((await repos.matches.get('h3'))?.updatedAt).toBe(isoAt(950));
    await repos.matches.setResumeDismissed('h3', null);
    expect(await ids(true)).toEqual(['h3', 'h2']);
  });

  it('keeps history reads consistent while writes are queued', async () => {
    const { db } = await setup();
    const repos = createRepositories(db);
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
    const events: MatchEvent[] = goldenMatchEvents(golden);
    const write = db.withTransactionAsync(async (tx) => {
      const scoped = createRepositories(tx);
      await scoped.events.append(events.slice(0, 2));
      await scoped.matches.writeProjection(goldenProjection(golden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(3), completed: false }));
    });
    const read = repos.matches.findResumable({ forPrompt: true });
    await write;
    const items = await read;
    expect(items[0].innings).toHaveLength(2);
  });
});

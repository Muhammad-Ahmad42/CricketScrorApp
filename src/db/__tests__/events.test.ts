/** @jest-environment node */
import type { MatchEvent } from '@/domain/types';
import { InvalidRowsError, LogConflictError, sqliteErrorKind } from '../errors';
import { createRepositories } from '../repositories';
import { buildMatch, buildTeamSeed, squadsFor, type TeamSeed } from '../testing/builders';
import { createFaultInjectingDatabase } from '../testing/faultInjectingDatabase';
import { EventLogBuilder, ball, goldenMatchEvents, type GoldenMatchOptions } from '../testing/goldenMatch';
import { countRows, openTestRepositories } from '../testing/harness';
import { runMigrations } from '../migrate';
import { createSqlJsDatabase } from '../testing/sqljsDatabase';
import { seedLibrary } from '../testing/tournamentScenario';
import type { SqlDatabase } from '../types';

const lions = buildTeamSeed('lio', 'Lions', 'LIO');
const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');

const golden: GoldenMatchOptions = {
  matchId: 'm1',
  batFirst: { teamId: 'lio', playerIds: lions.players.map((p) => p.id) },
  bowlFirst: { teamId: 'tig', playerIds: tigers.players.map((p) => p.id) },
};

async function seedMatch(db: SqlDatabase, matchId = 'm1', teamA: TeamSeed = lions, teamB: TeamSeed = tigers): Promise<void> {
  await createRepositories(db).matches.insert(
    buildMatch({ id: matchId, teamAId: teamA.team.id, teamBId: teamB.team.id, status: 'live' }),
    squadsFor(teamA, teamB),
  );
}

async function setup(): Promise<{ readonly db: SqlDatabase; readonly repos: ReturnType<typeof createRepositories> }> {
  const { db, repos } = await openTestRepositories();
  await seedLibrary(db, [lions, tigers]);
  await seedMatch(db);
  return { db, repos };
}

const L = (n: number): string => lions.players[n - 1].id;
const T = (n: number): string => tigers.players[n - 1].id;

function everyKindLog(matchId: string): MatchEvent[] {
  return new EventLogBuilder(matchId, 'k-')
    .act({ kind: 'innings_started', inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7) })
    .act(ball(L(1), L(2), T(7), { runs: 2, runsTo: 'bye' }))
    .act({ ...ball(L(1), L(2), T(7), { runs: 3 }), shortRuns: 1 })
    .act({ kind: 'strike_swapped' })
    .act(
      ball(L(2), L(1), T(7), {
        runs: 1,
        wicket: { type: 'run_out', playerOutId: L(1), fielderIds: [T(3), T(1)], dismissalEnd: 'non_striker_end' },
      }),
      { kind: 'batter_in', playerId: L(3), position: 'non_striker' },
    )
    .act(ball(L(2), L(3), T(7), { call: 'wide', wicket: { type: 'stumped', playerOutId: L(2), fielderIds: [T(1)], dismissalEnd: null } }))
    .act({ kind: 'batter_in', playerId: L(4), position: 'striker' })
    .act(ball(L(4), L(3), T(7), { call: 'no_ball', boundary: 6 }))
    .act({ kind: 'batter_retired', playerId: L(4), retirement: 'retired_hurt' })
    .act({ kind: 'batter_in', playerId: L(5), position: 'striker' })
    .act({ kind: 'batter_dismissed', playerId: L(3), type: 'run_out', fielderIds: [T(12)] })
    .act({ kind: 'batter_in', playerId: L(6), position: 'non_striker' })
    .act({ kind: 'penalty_awarded', teamId: 'lio', inningsIndex: 0, runs: 5, reason: 'Ball tampering' })
    .act({
      kind: 'overs_revised',
      inningsIndex: 0,
      maxBalls: 12,
      target: null,
      maxOversPerBowler: 1,
      bowlerQuotaMode: 'icc_one_fifth',
      powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 1 }],
      terminal: false,
      reason: 'Rain',
    })
    .act({ kind: 'overs_revised', inningsIndex: 1, maxBalls: 12, target: 20, terminal: false, reason: 'Rain' })
    .act({ kind: 'play_suspended', reason: 'rain', note: null })
    .act({ kind: 'play_resumed' })
    .act({ kind: 'bowler_selected', bowlerId: T(8), reason: 'injury' })
    .act({ kind: 'innings_ended', reason: 'batters_unavailable', absentees: [{ playerId: L(11), hurt: true }, { playerId: L(10), hurt: false }] })
    .act({ kind: 'super_over_started', round: 1 })
    .act({ kind: 'match_ended', outcome: { type: 'awarded', winnerTeamId: 'tig', reason: 'Crowd trouble', margin: { kind: 'runs', runs: 12 } } })
    .events();
}

describe('MatchEventRepository', () => {
  it('appends and lists the golden match log deep-equal, ordered by seq', async () => {
    const { repos } = await setup();
    const events = goldenMatchEvents(golden);
    expect(events).toHaveLength(43);
    expect(await repos.events.lastSeq('m1')).toBe(0);
    expect(await repos.events.listByMatch('m1')).toEqual([]);
    await repos.events.append(events.slice(0, 10));
    await repos.events.append(events.slice(10));
    expect(await repos.events.listByMatch('m1')).toEqual(events);
    expect(await repos.events.lastSeq('m1')).toBe(43);
  });

  it('round-trips every event kind: typed delivery columns and payload JSON', async () => {
    const { db, repos } = await setup();
    const events = everyKindLog('m1');
    await repos.events.append(events);
    expect(await repos.events.listByMatch('m1')).toEqual(events);
    const stored = await db.getAllAsync<{ readonly kind: string; readonly payload_json: string | null; readonly p_player_id: string | null }>(
      'SELECT kind, payload_json, p_player_id FROM match_events WHERE match_id = ? ORDER BY seq',
      ['m1'],
    );
    expect(stored[0].payload_json).toBe(
      JSON.stringify({ inningsIndex: 0, battingTeamId: 'lio', strikerId: L(1), nonStrikerId: L(2), bowlerId: T(7) }),
    );
    expect(stored.find((row) => row.kind === 'strike_swapped')?.payload_json).toBe('{}');
    expect(stored.filter((row) => row.kind === 'delivery').every((row) => row.payload_json === null)).toBe(true);
    expect(stored.find((row) => row.kind === 'batter_in')?.p_player_id).toBe(L(3));
    const wide = await db.getFirstAsync<{ readonly runs_to: string | null; readonly wicket_type: string }>(
      "SELECT runs_to, wicket_type FROM match_events WHERE match_id = 'm1' AND call = 'wide'",
    );
    expect(wide).toEqual({ runs_to: null, wicket_type: 'stumped' });
  });

  it('keeps logs of different matches apart', async () => {
    const { db, repos } = await setup();
    await seedMatch(db, 'm2');
    const first = goldenMatchEvents(golden);
    const second = goldenMatchEvents({ ...golden, matchId: 'm2' });
    await repos.events.append(first);
    await repos.events.append(second.slice(0, 5));
    expect(await repos.events.lastSeq('m2')).toBe(5);
    expect(await repos.events.listByMatch('m2')).toEqual(second.slice(0, 5));
    expect(await repos.events.listByMatch('m1')).toEqual(first);
  });

  it('rejects a stale writer through UNIQUE(match_id, seq)', async () => {
    const { repos } = await setup();
    const events = goldenMatchEvents(golden);
    await repos.events.append(events.slice(0, 9));
    const stale = { ...events[8], id: 'other-writer-e9' };
    const error = await repos.events.append([stale]).catch((e: unknown) => e);
    expect(sqliteErrorKind(error)).toBe('unique');
    expect(String(error)).toMatch(/match_events\.match_id, match_events\.seq/);
    expect(await repos.events.listByMatch('m1')).toEqual(events.slice(0, 9));
  });

  it('refuses gaps and non-contiguous batches', async () => {
    const { repos } = await setup();
    const events = goldenMatchEvents(golden);
    await repos.events.append(events.slice(0, 3));
    await expect(repos.events.append(events.slice(4, 6))).rejects.toBeInstanceOf(LogConflictError);
    await expect(repos.events.append([events[3], events[5]])).rejects.toBeInstanceOf(InvalidRowsError);
    await expect(repos.events.append([events[3], { ...events[4], matchId: 'm2' }])).rejects.toBeInstanceOf(InvalidRowsError);
    expect(await repos.events.lastSeq('m1')).toBe(3);
    await repos.events.append([]);
    expect(await repos.events.lastSeq('m1')).toBe(3);
  });

  it('truncateFrom deletes a whole undo group and returns the count', async () => {
    const { repos } = await setup();
    const events = goldenMatchEvents(golden);
    const wicketGroup = events.filter((event) => event.actionId === events[10].actionId);
    expect(wicketGroup.map((e) => e.kind)).toEqual(['delivery', 'batter_in']);
    await repos.events.append(events.slice(0, 12));
    expect(await repos.events.truncateFrom('m1', wicketGroup[0].seq, 12)).toBe(2);
    expect(await repos.events.listByMatch('m1')).toEqual(events.slice(0, 10));
    await repos.events.append(wicketGroup);
    expect(await repos.events.listByMatch('m1')).toEqual(events.slice(0, 12));
  });

  it('truncateFrom refuses a wrong expected tail and deletes nothing', async () => {
    const { repos } = await setup();
    const events = goldenMatchEvents(golden);
    await repos.events.append(events.slice(0, 12));
    const error = await repos.events.truncateFrom('m1', 11, 11).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LogConflictError);
    expect(error).toMatchObject({ expectedLastSeq: 11, actualLastSeq: 12 });
    await expect(repos.events.truncateFrom('m1', 13, 12)).resolves.toBe(0);
    await expect(repos.events.truncateFrom('m1', 14, 12)).rejects.toBeInstanceOf(LogConflictError);
    await expect(repos.events.truncateFrom('m1', 0, 12)).rejects.toBeInstanceOf(LogConflictError);
    expect(await repos.events.lastSeq('m1')).toBe(12);
  });

  it('truncateFrom inside a transaction rolls back the whole use case on a wrong tail', async () => {
    const { db, repos } = await setup();
    const events = goldenMatchEvents(golden);
    await repos.events.append(events.slice(0, 12));
    await expect(
      db.withTransactionAsync(async (tx) => {
        const scoped = createRepositories(tx);
        await scoped.matches.setResumeDismissed('m1', '2026-05-01T12:00:00.000Z');
        await scoped.events.truncateFrom('m1', 11, 10);
      }),
    ).rejects.toBeInstanceOf(LogConflictError);
    expect((await repos.matches.get('m1'))?.resumeDismissedAt).toBeNull();
    expect(await repos.events.lastSeq('m1')).toBe(12);
  });

  it('replaceAll rewrites the whole log and requires seqs 1..n of that match', async () => {
    const { repos } = await setup();
    const events = goldenMatchEvents(golden);
    await repos.events.append(events);
    const edited = events.map((event, index) =>
      index === 1 && event.kind === 'delivery' ? { ...event, id: 'edit-1', actionId: 'edit-a', runsRun: 2 } : event,
    );
    await repos.events.replaceAll('m1', edited);
    expect(await repos.events.listByMatch('m1')).toEqual(edited);
    await expect(repos.events.replaceAll('m1', edited.slice(1))).rejects.toBeInstanceOf(InvalidRowsError);
    await repos.events.replaceAll('m1', []);
    expect(await repos.events.lastSeq('m1')).toBe(0);
  });

  it('keeps the old log when replaceAll crashes midway (FR-01e)', async () => {
    const db = await createFaultInjectingDatabase();
    await runMigrations(db, { now: () => 'now' });
    await seedLibrary(db, [lions, tigers]);
    await seedMatch(db);
    const events = goldenMatchEvents(golden);
    await createRepositories(db).events.append(events);
    db.crashAt({ sql: /INSERT INTO match_events/, occurrence: 20 });
    await expect(
      db.withTransactionAsync(async (tx) => {
        await createRepositories(tx).events.replaceAll('m1', events.map((e) => ({ ...e, id: `new-${e.id}` })));
      }),
    ).rejects.toMatchObject({ name: 'SimulatedCrash' });
    const reopened = await createSqlJsDatabase({ data: db.durableImages[db.durableImages.length - 1] });
    expect(await createRepositories(reopened).events.listByMatch('m1')).toEqual(events);
  });

  it('only accepts squad members in delivery columns and payload player fields', async () => {
    const { db, repos } = await setup();
    const spare = buildTeamSeed('spare', 'Spare', 'SPR', 1);
    await seedLibrary(db, [spare]);
    const events = goldenMatchEvents(golden);
    await repos.events.append(events.slice(0, 2));
    const outsider = spare.players[0].id;
    const bad = [
      { ...ball(outsider, L(2), T(7)), seq: 3 },
      { kind: 'batter_in' as const, playerId: outsider, position: 'striker' as const, seq: 3 },
      { kind: 'bowler_selected' as const, bowlerId: outsider, reason: 'over_start' as const, seq: 3 },
      { kind: 'batter_dismissed' as const, playerId: L(1), type: 'run_out' as const, fielderIds: [T(2), outsider], seq: 3 },
      { kind: 'penalty_awarded' as const, teamId: 'no-team', inningsIndex: 0, runs: 5, reason: 'x', seq: 3 },
    ];
    for (const payload of bad) {
      const { seq, ...body } = payload;
      const event = { ...body, id: `bad-${seq}-${payload.kind}`, matchId: 'm1', seq, actionId: 'bad', recordedAt: 'now' } as MatchEvent;
      const error = await repos.events.append([event]).catch((e: unknown) => e);
      expect(sqliteErrorKind(error)).toBe('foreign_key');
    }
    expect(await countRows(db, 'match_events')).toBe(2);
  });

  it('rejects corrupt payload JSON and invalid delivery shapes via CHECK constraints (FR-05g)', async () => {
    const { db, repos } = await setup();
    await repos.events.append(goldenMatchEvents(golden).slice(0, 4));
    await expect(db.runAsync("UPDATE match_events SET payload_json = 'x' WHERE seq = 1")).rejects.toThrow(/CHECK|JSON/i);
    await expect(db.runAsync("UPDATE matches SET rules_json = '{bad' WHERE id = 'm1'")).rejects.toThrow(/CHECK|JSON/i);
    await expect(db.runAsync("UPDATE match_events SET runs_to = 'bat' WHERE seq = 4")).rejects.toThrow(/CHECK/);
    await expect(db.runAsync('UPDATE match_events SET boundary = 5 WHERE seq = 2')).rejects.toThrow(/CHECK/);
    await expect(db.runAsync("UPDATE match_events SET runs_to = 'bye', boundary = 6 WHERE seq = 2")).rejects.toThrow(/CHECK/);
    await expect(db.runAsync('UPDATE match_events SET short_runs = 3, runs_run = 1 WHERE seq = 2')).rejects.toThrow(/CHECK/);
  });

  it('refuses a delivery wicket with more than two fielders instead of losing one', async () => {
    const { repos } = await setup();
    const opening = goldenMatchEvents(golden).slice(0, 1);
    await repos.events.append(opening);
    const event: MatchEvent = {
      ...ball(L(1), L(2), T(7), { wicket: { type: 'run_out', playerOutId: L(1), fielderIds: [T(1), T(2), T(3)], dismissalEnd: 'striker_end' } }),
      id: 'three',
      matchId: 'm1',
      seq: 2,
      actionId: 'a',
      recordedAt: 'now',
    };
    await expect(repos.events.append([event])).rejects.toBeInstanceOf(InvalidRowsError);
  });
});

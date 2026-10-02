/** @jest-environment node */
import { buildEvents, scoreRuns } from '@/domain/scoring';
import type { SqlJsTestDatabase } from '@/db/testing';
import type { ServiceResult } from '../contracts';
import { ARCHIVED_MESSAGE } from '../tournament/matchEffects';
import type { TestApp } from '../testing';
import { expectFailure, expectOk, openHarness } from './support/app';
import { createLeague, LEAGUE_TEAMS, type League, type LeagueTeam } from './support/league';
import { live, score } from './support/scoring';
import { squadsFor } from './support/tournament';

jest.setTimeout(120000);

interface Completed {
  readonly db: SqlJsTestDatabase;
  readonly app: TestApp;
  readonly league: League;
  readonly matchIds: readonly string[];
}

const RANK: readonly LeagueTeam[] = LEAGUE_TEAMS;

async function completedLeague(): Promise<Completed> {
  const { db, app } = await openHarness();
  const league = await createLeague(app, 'Summer League');
  const matchIds: string[] = [];
  const rankOf = (teamId: string) => RANK.findIndex((team) => league.sides[team].team.id === teamId);
  for (let guard = 0; guard < 20; guard += 1) {
    const open = (await league.evaluate()).snapshot.fixtures.find((fixture) => fixture.matchId === null);
    if (open === undefined) {
      break;
    }
    const [sideA, sideB] = league.sidesOf(open);
    const winner = rankOf(sideA.team.id) < rankOf(sideB.team.id) ? sideA : sideB;
    const match = expectOk(await app.tournaments.startFixtureMatch(open.id, { squads: squadsFor(sideA, sideB), toss: null }));
    expectOk(await app.matches.endMatch(match.id, 0, { type: 'walkover', winnerTeamId: winner.team.id, reason: 'No show' }, 'Opponent did not arrive'));
    matchIds.push(match.id);
  }
  expectOk(await app.tournaments.setStatus(league.tournamentId, 'completed', null));
  return { db, app, league, matchIds };
}

async function count(db: SqlJsTestDatabase, sql: string, params: readonly string[]): Promise<number> {
  return (await db.getFirstAsync<{ readonly n: number }>(sql, [...params]))?.n ?? 0;
}

describe('reopening a match of a completed tournament (EC-Q-32, BR-TS-01)', () => {
  it('moves the tournament back to active in the same transaction and audits it with the reopen reason', async () => {
    const { db, app, league, matchIds } = await completedLeague();
    const matchId = matchIds[0];
    const undone = expectOk(await app.matches.undo(matchId, 1, 'Protest upheld'));
    const { snapshot, evaluation } = await league.evaluate();
    expect(snapshot.tournament.status).toBe('active');
    expect(snapshot.stages[0].status).toBe('active');
    expect(evaluation.champion).toBeNull();
    const audit = await db.getFirstAsync<{ readonly reason: string | null; readonly match_id: string | null }>(
      "SELECT reason, match_id FROM audit_events WHERE action = 'tournament_status_changed' AND tournament_id = ? ORDER BY created_at DESC, rowid DESC",
      [league.tournamentId],
    );
    expect(audit).toEqual({ reason: 'Protest upheld', match_id: matchId });
    expectOk(await app.matches.redo(matchId, 0, undone.undone, 'Protest dismissed'));
    expect((await league.evaluate()).snapshot.tournament.status).toBe('active');
    expectOk(await app.tournaments.setStatus(league.tournamentId, 'completed', null));
    expect((await league.evaluate()).evaluation.champion?.teamIds).toEqual([league.sides.Lions.team.id]);
  });

  it('a correction that keeps the match finished leaves a completed tournament completed', async () => {
    const { app, league, matchIds } = await completedLeague();
    const matchId = matchIds[0];
    const loaded = await live(app, matchId);
    const ended = loaded.events[0];
    if (ended.kind !== 'match_ended' || ended.outcome.type !== 'walkover') {
      throw new Error('walkover missing');
    }
    const ops = [{ op: 'replace' as const, seq: 1, with: [{ kind: 'match_ended' as const, outcome: { ...ended.outcome, reason: 'Corrected wording' } }] }];
    const preview = expectOk(await app.matches.previewHistoryEdit(matchId, ops));
    expectOk(await app.matches.applyHistoryEdit(matchId, ops, 'Reason text fixed', preview.baseFingerprint));
    expect((await league.evaluate()).snapshot.tournament.status).toBe('completed');
  });
});

describe('the archived lock covers every write of a tournament match (BR-CC-02, EC-T-23)', () => {
  it('refuses each match write with the archived message and changes nothing', async () => {
    const { db, app, league, matchIds } = await completedLeague();
    expectOk(await app.tournaments.setStatus(league.tournamentId, 'archived', null));
    const matchId = matchIds[0];
    const loaded = await live(app, matchId);
    const lions = league.sides.Lions;
    const before = await count(db, 'SELECT count(*) AS n FROM audit_events WHERE tournament_id = ?', [league.tournamentId]);
    const refusals: readonly ServiceResult<unknown>[] = [
      await app.matches.record(matchId, loaded.state.lastSeq, [{ kind: 'match_ended', outcome: { type: 'natural' } }]),
      await app.matches.undo(matchId, loaded.state.lastSeq, 'Recheck'),
      await app.matches.endMatch(matchId, loaded.state.lastSeq, { type: 'no_result', reason: 'Rain' }, 'Rain'),
      await app.matches.previewHistoryEdit(matchId, []),
      await app.matches.applyHistoryEdit(matchId, [], 'Fix', 'stale'),
      await app.matches.updateDetails(matchId, { title: 'Renamed' }),
      await app.matches.updateRules(matchId, { rules: loaded.match.rules }, 'Rules'),
      await app.matches.setToss(matchId, null, 'Toss'),
      await app.matches.setPrePlayStatus(matchId, 'postponed', 'Rain'),
      await app.matches.addSquadPlayer(matchId, lions.team.id, { newPlayer: { name: 'Late Arrival' } }),
      await app.matches.removeSquadPlayer(matchId, lions.p(6)),
    ];
    for (const result of refusals) {
      expect(expectFailure(result, 'FORBIDDEN_STATE').message).toBe(ARCHIVED_MESSAGE);
    }
    expect(await count(db, 'SELECT count(*) AS n FROM audit_events WHERE tournament_id = ?', [league.tournamentId])).toBe(before);
    expect((await live(app, matchId)).match.title).toBe(loaded.match.title);
    expectOk(await app.tournaments.setStatus(league.tournamentId, 'completed', null));
    expectOk(await app.matches.updateDetails(matchId, { title: 'Renamed after unarchiving' }));
  });
});

describe('ending a tournament match through record keeps the organizer reason (§53)', () => {
  it('refuses a reason-bearing ending without a reason, and audits the given reason and impact', async () => {
    const { db, app } = await openHarness();
    const league = await createLeague(app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    const match = expectOk(
      await app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: { winnerTeamId: sideA.team.id, decision: 'bat' } }, [
        { kind: 'innings_started', inningsIndex: 0, battingTeamId: sideA.team.id, strikerId: sideA.p(1), nonStrikerId: sideA.p(2), bowlerId: sideB.p(6) },
      ]),
    );
    await score(app, match.id, scoreRuns(1));
    const current = await live(app, match.id);
    for (const reason of [null, '   ']) {
      const built = buildEvents(current.setup, current.state, { type: 'end_match', outcome: { type: 'abandoned', reason } });
      if (!built.ok) {
        throw new Error(built.message);
      }
      expectFailure(await app.matches.record(match.id, current.state.lastSeq, built.events), 'CONFIRMATION_REQUIRED');
    }
    expect((await live(app, match.id)).state.lastSeq).toBe(current.state.lastSeq);
    await score(app, match.id, { type: 'end_match', outcome: { type: 'abandoned', reason: '  Waterlogged outfield ' } });
    const audit = await db.getFirstAsync<{ readonly reason: string | null; readonly impact_json: string | null }>(
      "SELECT reason, impact_json FROM audit_events WHERE action = 'result_recorded' AND match_id = ?",
      [match.id],
    );
    expect(audit?.reason).toBe('Waterlogged outfield');
    expect(audit?.impact_json).not.toBeNull();
  });
});

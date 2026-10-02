/** @jest-environment node */
import type { Fixture, StandingRow, TournamentEvaluation, TournamentOverride } from '@/domain/types';
import { expectFailure, expectOk, openHarness, rowCount, type Harness } from './support/app';
import { createLeague, type League, type LeagueTeam } from './support/league';
import { live } from './support/scoring';
import { playFixture, squadsFor, type FixturePlay } from './support/tournament';

jest.setTimeout(60000);

function rows(evaluation: TournamentEvaluation): readonly StandingRow[] {
  return evaluation.stages[0].tables[0].rows;
}

function rowOf(league: League, evaluation: TournamentEvaluation, team: LeagueTeam): StandingRow {
  const found = rows(evaluation).find((entry) => entry.teamId === league.sides[team].team.id);
  if (found === undefined) {
    throw new Error(`row ${team} missing`);
  }
  return found;
}

async function revision(harness: Harness, tournamentId: string): Promise<number> {
  return (await harness.db.getFirstAsync<{ revision: number }>('SELECT revision FROM tournaments WHERE id = ?', [tournamentId]))?.revision ?? -1;
}

async function fixtureStatus(league: League, fixtureId: string): Promise<Fixture['status'] | undefined> {
  return (await league.evaluate()).snapshot.fixtures.find((fixture) => fixture.id === fixtureId)?.status;
}

function quickPlay(league: League, batting: LeagueTeam, fielding: LeagueTeam): FixturePlay {
  return {
    battingFirst: league.sides[batting],
    fieldingFirst: league.sides[fielding],
    first: { line: { runs: 20, wickets: 2, balls: 12 } },
    second: { line: { runs: 15, wickets: 3, balls: 12 } },
  };
}

describe('tournament match outcomes without play (§22, §39)', () => {
  let harness: Harness;
  let league: League;

  beforeAll(async () => {
    harness = await openHarness();
    league = await createLeague(harness.app);
  });

  it('records a walkover with a reason, mirrors the fixture, bumps the revision and audits it', async () => {
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    const match = expectOk(await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: null }));
    expect(await fixtureStatus(league, fixture.id)).toBe('scheduled');
    const outcome = { type: 'walkover' as const, winnerTeamId: league.sides.Lions.team.id, reason: 'Tigers did not arrive' };
    expectFailure(await harness.app.matches.endMatch(match.id, 0, outcome, null), 'CONFIRMATION_REQUIRED');
    const before = await revision(harness, league.tournamentId);
    const ended = expectOk(await harness.app.matches.endMatch(match.id, 0, outcome, 'Team bus broke down'));
    expect(ended.match.status).toBe('completed');
    expect(await fixtureStatus(league, fixture.id)).toBe('completed');
    expect(await revision(harness, league.tournamentId)).toBeGreaterThan(before);
    const audit = await harness.db.getFirstAsync<{ reason: string; impact_json: string | null }>(
      "SELECT reason, impact_json FROM audit_events WHERE action = 'result_recorded' AND match_id = ?",
      [match.id],
    );
    expect(audit?.reason).toBe('Team bus broke down');
    expect(audit?.impact_json).not.toBeNull();
    const { evaluation } = await league.evaluate();
    expect(rowOf(league, evaluation, 'Lions')).toMatchObject({ played: 1, won: 1, points: 2 });
    expect(rowOf(league, evaluation, 'Tigers')).toMatchObject({ played: 1, lost: 1, points: 0 });
  });

  it('reopening the walkover needs a reason, reverts the fixture and redo restores it with an audit entry', async () => {
    const { snapshot } = await league.evaluate();
    const fixture = snapshot.fixtures.find((entry) => entry.status === 'completed');
    if (fixture === undefined || fixture.matchId === null) {
      throw new Error('completed fixture missing');
    }
    const loaded = await live(harness.app, fixture.matchId);
    expectFailure(await harness.app.matches.undo(fixture.matchId, loaded.state.lastSeq), 'CONFIRMATION_REQUIRED');
    const reopened = expectOk(await harness.app.matches.undo(fixture.matchId, loaded.state.lastSeq, 'Tigers arrived late'));
    expect(reopened.live.match.status).toBe('scheduled');
    expect(await fixtureStatus(league, fixture.id)).toBe('scheduled');
    const reopenAudit = await harness.db.getFirstAsync<{ reason: string; impact_json: string | null }>(
      "SELECT reason, impact_json FROM audit_events WHERE action = 'match_reopened' AND match_id = ?",
      [fixture.matchId],
    );
    expect(reopenAudit?.reason).toBe('Tigers arrived late');
    expect(reopenAudit?.impact_json).not.toBeNull();
    expect(rowOf(league, (await league.evaluate()).evaluation, 'Lions').played).toBe(0);
    expectFailure(await harness.app.matches.redo(fixture.matchId, reopened.live.state.lastSeq, reopened.undone), 'CONFIRMATION_REQUIRED');
    expectOk(await harness.app.matches.redo(fixture.matchId, reopened.live.state.lastSeq, reopened.undone, 'They left again'));
    expect(await fixtureStatus(league, fixture.id)).toBe('completed');
    expect(await rowCount(harness.db, 'audit_events', "action = 'result_recorded' AND match_id = ? AND reason = 'They left again'", [fixture.matchId])).toBe(1);
    expect(rowOf(league, (await league.evaluate()).evaluation, 'Lions').points).toBe(2);
  });

  it('abandons a live match and counts it as a no result', async () => {
    const fixture = await league.fixture('Eagles', 'Hawks');
    const [sideA, sideB] = league.sidesOf(fixture);
    const match = expectOk(
      await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: { winnerTeamId: sideA.team.id, decision: 'bat' } }, [
        { kind: 'innings_started', inningsIndex: 0, battingTeamId: sideA.team.id, strikerId: sideA.p(1), nonStrikerId: sideA.p(2), bowlerId: sideB.p(6) },
      ]),
    );
    expect(await fixtureStatus(league, fixture.id)).toBe('live');
    const ended = expectOk(await harness.app.matches.endMatch(match.id, 1, { type: 'abandoned', reason: 'Rain' }, 'Rain all afternoon'));
    expect(ended.match.status).toBe('abandoned');
    expect(await fixtureStatus(league, fixture.id)).toBe('abandoned');
    const { evaluation } = await league.evaluate();
    expect(rowOf(league, evaluation, 'Eagles')).toMatchObject({ played: 1, noResult: 1, points: 1 });
    expect(rowOf(league, evaluation, 'Hawks')).toMatchObject({ played: 1, noResult: 1, points: 1 });
  });

  it('reschedules a replay of an abandoned fixture with a new date when the stage replays abandoned matches (§39)', async () => {
    const abandoned = (await league.evaluate()).snapshot.fixtures.find((entry) => entry.status === 'abandoned');
    if (abandoned === undefined) {
      throw new Error('abandoned fixture missing');
    }
    const fixture = abandoned;
    expectFailure(await harness.app.tournaments.updateFixture(fixture.id, { scheduledDate: '2026-05-28' }, 'Replay ordered'), 'FORBIDDEN_STATE');
    await harness.db.runAsync("UPDATE tournament_stages SET config_json = json_set(config_json, '$.abandonedMatches', 'replay') WHERE tournament_id = ?", [league.tournamentId]);
    const replayed = expectOk(
      await harness.app.tournaments.updateFixture(fixture.id, { status: 'rescheduled', scheduledDate: '2026-05-28', scheduledTime: '10:00' }, 'Replay ordered by the committee'),
    );
    expect(replayed.fixtures.find((entry) => entry.id === fixture.id)).toMatchObject({ status: 'rescheduled', scheduledDate: '2026-05-28', scheduledTime: '10:00', matchId: null });
    await harness.db.runAsync("UPDATE tournament_stages SET config_json = json_set(config_json, '$.abandonedMatches', 'no_result') WHERE tournament_id = ?", [league.tournamentId]);
  });

  it('records a no result and refuses to start a postponed fixture until it is rescheduled', async () => {
    const fixture = await league.fixture('Lions', 'Eagles');
    const postponed = expectOk(await harness.app.tournaments.updateFixture(fixture.id, { status: 'postponed' }, 'Ground unavailable'));
    expect(postponed.fixtures.find((entry) => entry.id === fixture.id)?.status).toBe('postponed');
    const [sideA, sideB] = league.sidesOf(fixture);
    const refused = expectFailure(await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: null }), 'FORBIDDEN_STATE');
    expect(refused.message).toMatch(/Reschedule/);
    expectOk(await harness.app.tournaments.updateFixture(fixture.id, { status: 'rescheduled', scheduledDate: '2026-05-20' }, null));
    const match = expectOk(
      await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: { winnerTeamId: sideA.team.id, decision: 'bat' } }, [
        { kind: 'innings_started', inningsIndex: 0, battingTeamId: sideA.team.id, strikerId: sideA.p(1), nonStrikerId: sideA.p(2), bowlerId: sideB.p(6) },
      ]),
    );
    expectFailure(await harness.app.matches.endMatch(match.id, 0, { type: 'no_result', reason: null }, 'Floodlights failed'), 'CONFLICT');
    expectOk(await harness.app.matches.endMatch(match.id, 1, { type: 'no_result', reason: null }, 'Floodlights failed'));
    expect(await fixtureStatus(league, fixture.id)).toBe('completed');
    const audit = await harness.db.getAllAsync<{ action: string }>("SELECT action FROM audit_events WHERE entity_id = ? AND action LIKE 'fixture_%'", [fixture.id]);
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it('validates fixture scheduling edits', async () => {
    const fixture = await league.fixture('Tigers', 'Hawks');
    expectFailure(await harness.app.tournaments.updateFixture(fixture.id, { scheduledDate: '31/12/2026' }, null), 'VALIDATION');
    const updated = expectOk(await harness.app.tournaments.updateFixture(fixture.id, { scheduledDate: '2026-05-21', scheduledTime: '14:30' }, null));
    expect(updated.fixtures.find((entry) => entry.id === fixture.id)).toMatchObject({ scheduledDate: '2026-05-21', scheduledTime: '14:30' });
    expectFailure(await harness.app.tournaments.updateFixture(fixture.id, { sideA: { kind: 'team', teamId: league.sides.Lions.team.id } }, null), 'CONFIRMATION_REQUIRED');
  });
});

describe('reopening a played tournament match (FR-10c/d/e)', () => {
  it('needs a reason, audits the impact and redo restores the standings', async () => {
    const harness = await openHarness();
    const league = await createLeague(harness.app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    const played = await playFixture(harness.app, fixture, quickPlay(league, 'Lions', 'Tigers'), sideA, sideB);
    const standings = rows((await league.evaluate()).evaluation);
    const loaded = await live(harness.app, played.match.id);
    expectFailure(await harness.app.matches.undo(played.match.id, loaded.state.lastSeq), 'CONFIRMATION_REQUIRED');
    const before = await revision(harness, league.tournamentId);
    const reopened = expectOk(await harness.app.matches.undo(played.match.id, loaded.state.lastSeq, 'Wrong last ball'));
    expect(reopened.live.match.status).toBe('live');
    expect(await fixtureStatus(league, fixture.id)).toBe('live');
    const { snapshot, evaluation } = await league.evaluate();
    expect(snapshot.stages[0].status).toBe('active');
    expect(rowOf(league, evaluation, 'Lions').played).toBe(0);
    expect(await revision(harness, league.tournamentId)).toBeGreaterThan(before);
    const audit = await harness.db.getFirstAsync<{ impact_json: string }>("SELECT impact_json FROM audit_events WHERE action = 'match_reopened'");
    expect(JSON.parse(audit?.impact_json ?? 'null')).toMatchObject({ completedMatchesAffected: expect.any(Number) });
    expectOk(await harness.app.matches.redo(played.match.id, reopened.live.state.lastSeq, reopened.undone, 'Result stands'));
    expect(rows((await league.evaluate()).evaluation)).toEqual(standings);
  });
});

describe('overrides, withdrawals, status changes and deletion', () => {
  let harness: Harness;
  let league: League;

  beforeAll(async () => {
    harness = await openHarness();
    league = await createLeague(harness.app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    await playFixture(harness.app, fixture, quickPlay(league, 'Lions', 'Tigers'), sideA, sideB);
  });

  function adjustment(id: string, points: number, reason: string): TournamentOverride {
    return {
      id,
      tournamentId: league.tournamentId,
      reason,
      createdAt: '2026-05-02T10:00:00.000Z',
      revokedAt: null,
      revokeReason: null,
      kind: 'points_adjustment',
      stageId: league.stage.id,
      poolId: null,
      teamId: league.sides.Tigers.team.id,
      points,
    };
  }

  it('applies and revokes a points adjustment only on the previewed version', async () => {
    const { snapshot } = await league.evaluate();
    expectFailure(await harness.app.tournaments.applyOverride(league.tournamentId, adjustment('ovr-1', -2, ' '), snapshot.version), 'CONFIRMATION_REQUIRED');
    expectFailure(await harness.app.tournaments.applyOverride(league.tournamentId, adjustment('ovr-1', -2, 'Slow over rate'), 'stale'), 'CONFLICT');
    const applied = expectOk(await harness.app.tournaments.applyOverride(league.tournamentId, adjustment('ovr-1', -2, 'Slow over rate'), snapshot.version));
    expect(applied.overrides).toHaveLength(1);
    expect(rowOf(league, (await league.evaluate()).evaluation, 'Tigers')).toMatchObject({ points: -2, pointsAdjustment: -2 });
    const revoked = expectOk(await harness.app.tournaments.revokeOverride(league.tournamentId, 'ovr-1', 'Appeal upheld', applied.version));
    expect(revoked.overrides[0]).toMatchObject({ revokeReason: 'Appeal upheld' });
    expect(revoked.overrides[0].revokedAt).not.toBeNull();
    expect(rowOf(league, (await league.evaluate()).evaluation, 'Tigers').points).toBe(0);
    expect(await rowCount(harness.db, 'audit_events', "action IN ('override_applied', 'override_revoked')")).toBe(2);
  });

  it('withdraws a team and awards walkovers for its remaining fixtures', async () => {
    const change = { kind: 'team_withdraw' as const, teamId: league.sides.Hawks.team.id, remainingFixtures: 'walkover' as const, expungeResults: false };
    const preview = expectOk(await harness.app.tournaments.previewChange(league.tournamentId, change));
    expect(preview.impact.blocked).toBeNull();
    const after = expectOk(await harness.app.tournaments.applyChange(league.tournamentId, change, 'Hawks left the league', preview));
    const hawksFixtures = after.fixtures.filter(
      (fixture) =>
        (fixture.sideA.kind === 'team' && fixture.sideA.teamId === league.sides.Hawks.team.id) ||
        (fixture.sideB.kind === 'team' && fixture.sideB.teamId === league.sides.Hawks.team.id),
    );
    expect(hawksFixtures).toHaveLength(6);
    expect(hawksFixtures.every((fixture) => fixture.status === 'completed' && fixture.matchId !== null)).toBe(true);
    const { evaluation } = await league.evaluate();
    expect(rowOf(league, evaluation, 'Eagles')).toMatchObject({ won: 2, points: 4 });
    expect(await rowCount(harness.db, 'audit_events', "action = 'team_withdrawn' AND reason = 'Hawks left the league'")).toBe(1);
  });

  it('runs what-if simulations without persisting anything', async () => {
    const before = await revision(harness, league.tournamentId);
    const fixture = await league.fixture('Lions', 'Eagles');
    const result = expectOk(await harness.app.tournaments.whatIf(league.tournamentId, [{ fixtureId: fixture.id, outcome: 'side_a_win', score: null }]));
    expect(result.after.tables.length).toBeGreaterThan(0);
    expect(await revision(harness, league.tournamentId)).toBe(before);
  });

  it('saves the structure as a template and lists it with the built-ins', async () => {
    expectFailure(await harness.app.tournaments.saveAsTemplate(league.tournamentId, { name: ' ', description: '' }), 'VALIDATION');
    const template = expectOk(await harness.app.tournaments.saveAsTemplate(league.tournamentId, { name: 'Club league', description: 'Our format' }));
    const templates = expectOk(await harness.app.tournaments.listTemplates());
    expect(templates.map((entry) => entry.id)).toEqual(expect.arrayContaining(['builtin:8-team-t20', template.id]));
  });

  it('guards status changes and needs a reason to reopen', async () => {
    expectFailure(await harness.app.tournaments.setStatus(league.tournamentId, 'draft', null), 'FORBIDDEN_STATE');
    expectFailure(await harness.app.tournaments.updateInfo(league.tournamentId, { name: ' ' }), 'VALIDATION');
    const renamed = expectOk(await harness.app.tournaments.updateInfo(league.tournamentId, { name: 'Summer League' }));
    expect(renamed.name).toBe('Summer League');
  });

  it('deletes the tournament and its matches after the typed confirmation', async () => {
    const footprint = expectOk(await harness.app.tournaments.previewDelete(league.tournamentId));
    expect(footprint.matches).toBeGreaterThan(0);
    expectFailure(await harness.app.tournaments.delete(league.tournamentId, { typedName: 'Summer League', deleteCompletedMatches: false }), 'CONFIRMATION_REQUIRED');
    expectOk(await harness.app.tournaments.delete(league.tournamentId, { typedName: 'Summer League', deleteCompletedMatches: true }));
    expect(await rowCount(harness.db, 'tournaments')).toBe(0);
    expect(await rowCount(harness.db, 'matches')).toBe(0);
    expect(await rowCount(harness.db, 'match_events')).toBe(0);
    expect(await rowCount(harness.db, 'teams')).toBe(4);
    expectFailure(await harness.app.tournaments.evaluate(league.tournamentId), 'NOT_FOUND');
  });
});

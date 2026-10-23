/** @jest-environment node */
import { foreignKeyCheck } from '@/db';
import type { Fixture, StandingRow, TournamentEvaluation } from '@/domain/types';
import { SUPERSEDED_MESSAGE } from '../tournament/matchEffects';
import { expectFailure, expectOk, openHarness, type Harness } from './support/app';
import { createLeague, type League, type LeagueTeam } from './support/league';
import { live } from './support/scoring';
import { playFixture, squadsFor } from './support/tournament';

jest.setTimeout(60000);

function rowOf(league: League, evaluation: TournamentEvaluation, team: LeagueTeam): StandingRow {
  const found = evaluation.stages[0].tables[0].rows.find((entry) => entry.teamId === league.sides[team].team.id);
  if (found === undefined) {
    throw new Error(`row ${team} missing`);
  }
  return found;
}

async function counts(harness: Harness, league: League) {
  const { evaluation } = await league.evaluate();
  const list = expectOk(await harness.app.tournaments.list()).find((item) => item.id === league.tournamentId);
  const stats = expectOk(await harness.app.tournaments.stats(league.tournamentId));
  const tablePlayed = evaluation.stages[0].tables[0].rows.reduce((sum, row) => sum + row.played, 0) / 2;
  return { listDone: list?.fixturesDone, progress: evaluation.progress.done, tablePlayed, statsCompleted: stats.completedMatches };
}

async function fixtureNow(league: League, fixtureId: string): Promise<Fixture> {
  const found = (await league.evaluate()).snapshot.fixtures.find((entry) => entry.id === fixtureId);
  if (found === undefined) {
    throw new Error('fixture missing');
  }
  return found;
}

describe('replaying an abandoned tournament fixture (§39, §59, §99)', () => {
  let harness: Harness;
  let league: League;
  let fixture: Fixture;
  let abandonedId: string;
  let abandonedEvents: number;

  beforeAll(async () => {
    harness = await openHarness();
    league = await createLeague(harness.app);
    await harness.db.runAsync("UPDATE tournament_stages SET config_json = json_set(config_json, '$.abandonedMatches', 'replay') WHERE tournament_id = ?", [league.tournamentId]);
    fixture = await league.fixture('Eagles', 'Hawks');
    const [sideA, sideB] = league.sidesOf(fixture);
    const match = expectOk(
      await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: { winnerTeamId: sideA.team.id, decision: 'bat' } }, [
        { kind: 'innings_started', inningsIndex: 0, battingTeamId: sideA.team.id, strikerId: sideA.p(1), nonStrikerId: sideA.p(2), bowlerId: sideB.p(6) },
      ]),
    );
    expectOk(await harness.app.matches.endMatch(match.id, 1, { type: 'abandoned', reason: 'Rain' }, 'Rain all afternoon'));
    abandonedId = match.id;
    abandonedEvents = (await live(harness.app, match.id)).events.length;
  });

  it('counts the abandoned match as a no result before the replay, in every engine', async () => {
    const { evaluation } = await league.evaluate();
    expect(rowOf(league, evaluation, 'Eagles')).toMatchObject({ played: 1, noResult: 1, points: 1 });
    expect(await counts(harness, league)).toEqual({ listDone: 1, progress: 1, tablePlayed: 1, statsCompleted: 1 });
  });

  it('previews the replay through previewChange with WHAT WILL CHANGE instead of blocking it', async () => {
    const preview = expectOk(
      await harness.app.tournaments.previewChange(league.tournamentId, { kind: 'fixture_update', fixtureId: fixture.id, patch: { status: 'rescheduled', scheduledDate: '2026-05-28' } }),
    );
    expect(preview.impact.blocked).toBeNull();
    expect(preview.impact).toMatchObject({ requiresReason: true, requiresConfirmation: true, completedMatchesAffected: 1 });
    expect(preview.impact.lines.join(' ')).toMatch(/will be replayed as a new match/);
    for (const team of ['Eagles', 'Hawks'] as const) {
      const line = preview.impact.standings.find((entry) => entry.teamId === league.sides[team].team.id);
      expect(line).toMatchObject({ before: { points: 1 }, after: { points: 0 } });
    }
  });

  it('asks for a reason, then detaches the abandoned match, keeps it on record and audits the impact', async () => {
    expectFailure(await harness.app.tournaments.updateFixture(fixture.id, { status: 'rescheduled', scheduledDate: '2026-05-28' }, null), 'CONFIRMATION_REQUIRED');
    expect((await fixtureNow(league, fixture.id)).status).toBe('abandoned');
    const replayed = expectOk(
      await harness.app.tournaments.updateFixture(fixture.id, { status: 'rescheduled', scheduledDate: ' 2026-05-28 ', scheduledTime: '10:00' }, 'Replay ordered by the committee'),
    );
    expect(replayed.fixtures.find((entry) => entry.id === fixture.id)).toMatchObject({
      status: 'rescheduled',
      scheduledDate: '2026-05-28',
      scheduledTime: '10:00',
      matchId: null,
      matchSides: null,
    });
    expect(replayed.supersededMatches).toEqual([{ fixtureId: fixture.id, matchId: abandonedId }]);
    const old = await live(harness.app, abandonedId);
    expect(old.match).toMatchObject({ status: 'abandoned', fixtureId: fixture.id, tournamentId: league.tournamentId });
    expect(old.events).toHaveLength(abandonedEvents);
    const [audit] = expectOk(await harness.app.tournaments.auditLog(league.tournamentId, { limit: 1 }));
    expect(audit).toMatchObject({
      action: 'fixture_status_changed',
      matchId: abandonedId,
      reason: 'Replay ordered by the committee',
      previousValue: expect.objectContaining({ status: 'abandoned', matchId: abandonedId }),
    });
    expect(audit.summary).toMatch(/will be replayed/);
    expect(audit.impact?.lines.join(' ')).toMatch(/stays on record but no longer counts/);
    expect(audit.impact?.keyItems).toContainEqual({ headline: 'Match 6 will be replayed', detail: 'The abandoned match stays on record but no longer counts.' });
  });

  it('stops counting the superseded no result: standings, NRR, progress, list and stats all agree', async () => {
    const { evaluation } = await league.evaluate();
    expect(rowOf(league, evaluation, 'Eagles')).toMatchObject({ played: 0, noResult: 0, points: 0, nrr: null });
    expect(rowOf(league, evaluation, 'Hawks')).toMatchObject({ played: 0, noResult: 0, points: 0, nrr: null });
    expect(await counts(harness, league)).toEqual({ listDone: 0, progress: 0, tablePlayed: 0, statsCompleted: 0 });
    const whatIf = expectOk(await harness.app.tournaments.whatIf(league.tournamentId, [{ fixtureId: fixture.id, outcome: 'side_b_win', score: null }]));
    expect(whatIf.narrative.join(' ')).not.toMatch(/already been played/);
  });

  it('keeps the superseded match read-only and the replayed fixture undeletable', async () => {
    const old = await live(harness.app, abandonedId);
    const undo = expectFailure(await harness.app.matches.undo(abandonedId, old.state.lastSeq, 'Reopen it'), 'FORBIDDEN_STATE');
    expect(undo.message).toBe(SUPERSEDED_MESSAGE);
    expectFailure(await harness.app.matches.updateDetails(abandonedId, { title: 'Renamed' }), 'FORBIDDEN_STATE');
    const deletion = expectOk(await harness.app.tournaments.previewChange(league.tournamentId, { kind: 'fixture_delete', fixtureId: fixture.id }));
    expect(deletion.impact.blocked?.reason).toMatch(/keeps an abandoned match on record/);
  });

  it('plays the replay as a new match without a toss and with side B batting first, and counts only its result', async () => {
    const [sideA, sideB] = league.sidesOf(fixture);
    const replay = expectOk(await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: null }));
    expect(replay.id).not.toBe(abandonedId);
    expect(replay).toMatchObject({ teamAId: sideA.team.id, teamBId: sideB.team.id, toss: null });
    const played = await playFixture(
      harness.app,
      fixture,
      { battingFirst: sideB, fieldingFirst: sideA, first: { line: { runs: 20, wickets: 2, balls: 12 } }, second: { line: { runs: 15, wickets: 3, balls: 12 } } },
      sideA,
      sideB,
      replay,
    );
    expect(played.state.innings[0].battingTeamId).toBe(sideB.team.id);
    const now = await fixtureNow(league, fixture.id);
    expect(now).toMatchObject({ status: 'completed', matchId: replay.id });
    const { snapshot, evaluation } = await league.evaluate();
    expect(snapshot.supersededMatches).toEqual([{ fixtureId: fixture.id, matchId: abandonedId }]);
    const winner = (Object.keys(league.sides) as LeagueTeam[]).find((team) => league.sides[team].team.id === sideB.team.id) ?? 'Hawks';
    expect(rowOf(league, evaluation, winner)).toMatchObject({ played: 1, won: 1, noResult: 0 });
    expect(await counts(harness, league)).toEqual({ listDone: 1, progress: 1, tablePlayed: 1, statsCompleted: 1 });
    expect((await live(harness.app, abandonedId)).match.status).toBe('abandoned');
  });

  it('round-trips the replayed tournament through a backup copy with the superseded match still on record', async () => {
    const exported = expectOk(await harness.app.backup.exportBackup({ kind: 'tournament', tournamentId: league.tournamentId }));
    expectOk(await harness.app.backup.previewImport(exported.fileUri));
    expectOk(await harness.app.backup.applyImport(exported.fileUri, 'import_as_copy'));
    const copy = expectOk(await harness.app.tournaments.list()).find((item) => item.id !== league.tournamentId);
    if (copy === undefined) {
      throw new Error('copy missing');
    }
    const copied = expectOk(await harness.app.tournaments.evaluate(copy.id));
    expect(copied.snapshot.supersededMatches).toHaveLength(1);
    expect(copied.evaluation.progress.done).toBe(1);
    expect(copy.fixturesDone).toBe(1);
    expect(await foreignKeyCheck(harness.db)).toEqual([]);
  });
});

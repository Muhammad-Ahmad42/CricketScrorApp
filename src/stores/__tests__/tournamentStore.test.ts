/** @jest-environment node */
import { createLeague, type League } from '@/services/__tests__/support/league';
import { squadsFor } from '@/services/__tests__/support/tournament';
import { useTournamentStore } from '@/stores';
import { storeHarness, type StoreHarness } from './support/harness';

jest.setTimeout(60000);

const store = () => useTournamentStore.getState();

describe('useTournamentStore', () => {
  let harness: StoreHarness;
  let league: League;

  beforeEach(async () => {
    harness = await storeHarness();
    league = await createLeague(harness.app);
    expect(await store().open(league.tournamentId)).toBe(true);
  });

  it('opens the snapshot and its evaluation', () => {
    expect(store()).toMatchObject({ tournamentId: league.tournamentId, status: 'ready', error: null });
    expect(store().snapshot?.fixtures).toHaveLength(12);
    expect(store().evaluation?.progress).toEqual({ done: 0, total: 12 });
  });

  it('applies a change only with the kept preview and refreshes', async () => {
    const fixture = store().snapshot?.fixtures[0];
    if (fixture === undefined) {
      throw new Error('fixture missing');
    }
    const change = { kind: 'fixture_update' as const, fixtureId: fixture.id, patch: { scheduledDate: '2026-05-10' } };
    const preview = await store().previewChange(change);
    if (preview === null) {
      throw new Error('preview missing');
    }
    expect(preview.version).toBe(store().snapshot?.version);
    expect(await store().applyChange(change, null, preview)).toBe(true);
    expect(store().snapshot?.fixtures.find((entry) => entry.id === fixture.id)?.scheduledDate).toBe('2026-05-10');
    expect(store().snapshot?.version).not.toBe(preview.version);
    expect(await store().applyChange(change, null, preview)).toBe(false);
    expect(store().error?.code).toBe('CONFLICT');
    expect(store().snapshot?.version).not.toBe(preview.version);
    store().clearError();
  });

  it('runs what-if without touching the stored snapshot or evaluation', async () => {
    const snapshot = store().snapshot;
    const evaluation = store().evaluation;
    const fixture = snapshot?.fixtures[0];
    const result = await store().whatIf([{ fixtureId: fixture?.id ?? '', outcome: 'side_a_win', score: null }]);
    expect(result?.after.tables.length).toBeGreaterThan(0);
    expect(store().snapshot).toBe(snapshot);
    expect(store().evaluation).toBe(evaluation);
  });

  it('exposes stats, audit, templates and fixture actions', async () => {
    expect((await store().loadStats())?.totalMatches).toBe(12);
    expect((await store().loadAudit({ limit: 5 }))?.length).toBe(5);
    expect((await store().listTemplates())?.some((template) => template.id === 'builtin:8-team-t20')).toBe(true);
    const fixture = store().snapshot?.fixtures[1];
    expect(await store().updateFixture(fixture?.id ?? '', { scheduledTime: '10:30' }, null)).toBe(true);
    expect(store().snapshot?.fixtures.find((entry) => entry.id === fixture?.id)?.scheduledTime).toBe('10:30');
    expect(await store().updateFixture(fixture?.id ?? '', { scheduledTime: '99:99' }, null)).toBe(false);
    expect(store().error?.code).toBe('VALIDATION');
    const plan = await store().generateFixtures(league.stage.id);
    expect(plan?.fixtures).toHaveLength(12);
    expect(await store().updateInfo({ description: 'Friday nights' })).toBe(true);
    expect(store().snapshot?.tournament.description).toBe('Friday nights');
    expect((await store().saveAsTemplate({ name: 'Friday', description: '' }))?.name).toBe('Friday');
    expect(await store().setStatus('draft', null)).toBe(false);
    expect(store().error?.code).toBe('FORBIDDEN_STATE');
  });

  it('previews and performs deletion, then clears itself', async () => {
    expect(await store().previewDelete()).toEqual({ matches: 0, completedMatches: 0, events: 0 });
    expect(await store().delete({ typedName: 'wrong', deleteCompletedMatches: false })).toBe(false);
    expect(store().error?.code).toBe('VALIDATION');
    expect(await store().delete({ typedName: 'Spring League', deleteCompletedMatches: false })).toBe(true);
    expect(store()).toMatchObject({ tournamentId: null, snapshot: null, evaluation: null, status: 'idle' });
    expect(await store().refresh()).toBe(false);
    expect(await store().loadStats()).toBeNull();
    expect(store().error?.code).toBe('NOT_FOUND');
  });

  it('previews and applies the replay of an abandoned fixture; the old no result stops counting in the store evaluation', async () => {
    await harness.db.runAsync("UPDATE tournament_stages SET config_json = json_set(config_json, '$.abandonedMatches', 'replay') WHERE tournament_id = ?", [league.tournamentId]);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    const match = await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: null }, [
      { kind: 'innings_started', inningsIndex: 0, battingTeamId: sideB.team.id, strikerId: sideB.p(1), nonStrikerId: sideB.p(2), bowlerId: sideA.p(6) },
    ]);
    if (!match.ok) {
      throw new Error(match.error.message);
    }
    expect((await harness.app.matches.endMatch(match.value.id, 1, { type: 'abandoned', reason: 'Rain' }, 'Rain')).ok).toBe(true);
    expect(await store().refresh()).toBe(true);
    const lions = () => store().evaluation?.stages[0].tables[0].rows.find((row) => row.teamId === league.sides.Lions.team.id);
    expect(lions()).toMatchObject({ played: 1, noResult: 1 });
    expect(store().evaluation?.progress.done).toBe(1);
    const change = { kind: 'fixture_update' as const, fixtureId: fixture.id, patch: { status: 'rescheduled' as const, scheduledDate: '2026-06-01' } };
    const preview = await store().previewChange(change);
    if (preview === null) {
      throw new Error('preview missing');
    }
    expect(preview.impact).toMatchObject({ blocked: null, requiresReason: true, severity: 'destructive' });
    expect(await store().applyChange(change, null, preview)).toBe(false);
    expect(store().error?.code).toBe('CONFIRMATION_REQUIRED');
    store().clearError();
    expect(await store().updateFixture(fixture.id, { status: 'rescheduled', scheduledDate: '2026-06-01' }, 'Replay agreed by both captains')).toBe(true);
    expect(store().snapshot?.fixtures.find((entry) => entry.id === fixture.id)).toMatchObject({ status: 'rescheduled', matchId: null });
    expect(store().snapshot?.supersededMatches).toEqual([{ fixtureId: fixture.id, matchId: match.value.id }]);
    expect(lions()).toMatchObject({ played: 0, noResult: 0 });
    expect(store().evaluation?.progress.done).toBe(0);
  });

  it('reports a missing tournament as an error state', async () => {
    expect(await store().open('missing')).toBe(false);
    expect(store()).toMatchObject({ status: 'error', error: { code: 'NOT_FOUND' } });
  });
});

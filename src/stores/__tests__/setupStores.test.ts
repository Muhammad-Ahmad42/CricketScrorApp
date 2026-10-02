/** @jest-environment node */
import { BASE_MATCH_RULES, rulesForOvers } from '@/domain/scoring';
import { createLeague } from '@/services/__tests__/support/league';
import { createSide, sixNames, type Side } from '@/services/__tests__/support/sides';
import { standaloneWorld } from '@/services/__tests__/support/standalone';
import { useMatchSetupStore, useTournamentWizardStore } from '@/stores';
import { BATTING_FIRST_REQUIRED } from '@/stores/matchSetup';
import { expectValue, storeHarness } from './support/harness';

jest.setTimeout(60000);

describe('useMatchSetupStore', () => {
  it('creates a standalone match with its opening event in one step', async () => {
    const harness = await storeHarness();
    const world = await standaloneWorld(harness.app);
    const store = () => useMatchSetupStore.getState();
    expect(store().draft.formatId).toBe('T20');
    expect(store().draft.rules.oversPerInnings).toBe(20);
    store().update({ formatId: 'T10' });
    expect(store().draft.rules.oversPerInnings).toBe(10);
    expect(await store().submit()).toBeNull();
    expect(store().error?.code).toBe('VALIDATION');
    store().update({
      title: 'Friendly',
      teamAId: world.lions.team.id,
      teamBId: world.tigers.team.id,
      squadA: world.lions.players.slice(0, 11).map((player) => player.id),
      squadB: world.tigers.players.slice(0, 11).map((player) => player.id),
      substitutesA: [world.lions.p(12)],
      toss: { winnerTeamId: world.tigers.team.id, decision: 'bowl' },
      openers: { strikerId: world.lions.p(1), nonStrikerId: world.lions.p(2), bowlerId: world.tigers.p(7) },
    });
    const matchId = await store().submit();
    expect(matchId).not.toBeNull();
    const live = expectValue(await harness.app.matches.load(matchId ?? ''));
    expect(live.match).toMatchObject({ title: 'Friendly', status: 'live' });
    expect(live.events.map((event) => event.kind)).toEqual(['innings_started']);
    expect(live.setup.players.filter((player) => player.isSubstitute).map((player) => player.playerId)).toEqual([world.lions.p(12)]);
    expect(store().draft.teamAId).toBeNull();
  });

  it('marks the team captain and the first wicket-keeper in the XI on the match squad (W-S3)', async () => {
    const harness = await storeHarness();
    const players = ['Opener', 'Keeper', 'Spare keeper', 'Bowler'].map((name, index) => ({
      name,
      jerseyNumber: index + 1,
      role: name.includes('eeper') ? ('wicket_keeper' as const) : ('batter' as const),
    }));
    const lions = expectValue(await harness.app.teams.create({ name: 'Lions', shortName: 'LIO', players, captainIndex: 3 }));
    const tigers = expectValue(await harness.app.teams.create({ name: 'Tigers', shortName: 'TIG', players: players.map((player) => ({ ...player, role: 'batter' as const })) }));
    const lionsPlayers = expectValue(await harness.app.teams.get(lions.id)).players;
    const tigersPlayers = expectValue(await harness.app.teams.get(tigers.id)).players;
    const id = (list: typeof lionsPlayers, name: string) => list.find((player) => player.name === name)?.id ?? '';
    const store = () => useMatchSetupStore.getState();
    store().update({
      teamAId: lions.id,
      teamBId: tigers.id,
      squadA: ['Opener', 'Keeper', 'Bowler'].map((name) => id(lionsPlayers, name)),
      substitutesA: [id(lionsPlayers, 'Spare keeper')],
      squadB: tigersPlayers.map((player) => player.id),
      toss: { winnerTeamId: lions.id, decision: 'bat' },
      openers: { strikerId: id(lionsPlayers, 'Opener'), nonStrikerId: id(lionsPlayers, 'Keeper'), bowlerId: id(tigersPlayers, 'Bowler') },
    });
    const matchId = await store().submit();
    const live = expectValue(await harness.app.matches.load(matchId ?? ''));
    const flags = (playerId: string) => live.setup.players.find((entry) => entry.playerId === playerId);
    expect(flags(id(lionsPlayers, 'Keeper'))).toMatchObject({ isWicketKeeper: true, isCaptain: false });
    expect(flags(id(lionsPlayers, 'Bowler'))).toMatchObject({ isWicketKeeper: false, isCaptain: true });
    expect(flags(id(lionsPlayers, 'Spare keeper'))).toMatchObject({ isWicketKeeper: false, isSubstitute: true });
    expect(live.setup.players.filter((entry) => entry.isWicketKeeper).map((entry) => entry.playerId)).toEqual([id(lionsPlayers, 'Keeper')]);
    expect(tigersPlayers.some((player) => flags(player.id)?.isCaptain === true)).toBe(tigers.captainId !== null);
  });

  it('starts a standalone match without a toss with Team B batting first, keeping Team A and Team B as chosen', async () => {
    const harness = await storeHarness();
    const world = await standaloneWorld(harness.app);
    const store = () => useMatchSetupStore.getState();
    store().update({
      teamAId: world.lions.team.id,
      teamBId: world.tigers.team.id,
      squadA: world.lions.players.slice(0, 11).map((player) => player.id),
      squadB: world.tigers.players.slice(0, 11).map((player) => player.id),
      teamAPlayers: 11,
      teamBPlayers: 11,
      toss: null,
      battingFirstTeamId: world.tigers.team.id,
      openers: { strikerId: world.tigers.p(1), nonStrikerId: world.tigers.p(2), bowlerId: world.lions.p(7) },
    });
    const matchId = await store().submit();
    expect(store().error).toBeNull();
    const live = expectValue(await harness.app.matches.load(matchId ?? ''));
    expect(live.match).toMatchObject({ teamAId: world.lions.team.id, teamBId: world.tigers.team.id, toss: null, status: 'live' });
    expect(live.events[0]).toMatchObject({ kind: 'innings_started', battingTeamId: world.tigers.team.id, strikerId: world.tigers.p(1), bowlerId: world.lions.p(7) });
    expect(live.state.innings[0]).toMatchObject({ battingTeamId: world.tigers.team.id, bowlingTeamId: world.lions.team.id });
    expect(store().draft.battingFirstTeamId).toBeNull();
  });

  it('never guesses the side batting first: no toss and no choice is refused before anything is saved', async () => {
    const harness = await storeHarness();
    const world = await standaloneWorld(harness.app);
    const store = () => useMatchSetupStore.getState();
    store().reset();
    store().update({
      teamAId: world.lions.team.id,
      teamBId: world.tigers.team.id,
      squadA: world.lions.players.slice(0, 11).map((player) => player.id),
      squadB: world.tigers.players.slice(0, 11).map((player) => player.id),
      toss: null,
      openers: { strikerId: world.lions.p(1), nonStrikerId: world.lions.p(2), bowlerId: world.tigers.p(7) },
    });
    expect(await store().submit()).toBeNull();
    expect(store().error).toMatchObject({ code: 'VALIDATION', message: BATTING_FIRST_REQUIRED });
    expect(store().status).not.toBe('saving');
    expect(expectValue(await harness.app.matches.list({ limit: 10 })).length).toBe(0);
    store().update({ toss: { winnerTeamId: world.lions.team.id, decision: 'bat' }, battingFirstTeamId: world.tigers.team.id });
    const matchId = await store().submit();
    const live = expectValue(await harness.app.matches.load(matchId ?? ''));
    expect(live.state.innings[0].battingTeamId).toBe(world.lions.team.id);
  });

  it('starts a fixture match without a toss with side B batting first, keeping the fixture sides', async () => {
    const harness = await storeHarness();
    const league = await createLeague(harness.app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const store = () => useMatchSetupStore.getState();
    expect(await store().startFromFixture(league.tournamentId, fixture.id)).toBe(true);
    expect(store().draft.battingFirstTeamId).toBeNull();
    const [sideA, sideB] = league.sidesOf(fixture);
    store().update({
      squadA: sideA.players.map((player) => player.id),
      squadB: sideB.players.map((player) => player.id),
      toss: null,
      battingFirstTeamId: sideB.team.id,
      openers: { strikerId: sideB.p(1), nonStrikerId: sideB.p(2), bowlerId: sideA.p(6) },
    });
    const matchId = await store().submit();
    const live = expectValue(await harness.app.matches.load(matchId ?? ''));
    expect(live.match).toMatchObject({ teamAId: sideA.team.id, teamBId: sideB.team.id, fixtureId: fixture.id, toss: null });
    expect(live.state.innings[0].battingTeamId).toBe(sideB.team.id);
    const after = (await league.evaluate()).snapshot.fixtures.find((entry) => entry.id === fixture.id);
    expect(after?.matchSides).toEqual({ teamAId: sideA.team.id, teamBId: sideB.team.id });
  });

  it('starts a fixture match with the fixture teams and rules', async () => {
    const harness = await storeHarness();
    const league = await createLeague(harness.app);
    const fixture = await league.fixture('Eagles', 'Hawks');
    const store = () => useMatchSetupStore.getState();
    expect(await store().startFromFixture(league.tournamentId, fixture.id)).toBe(true);
    const [sideA, sideB] = league.sidesOf(fixture);
    expect(store().draft).toMatchObject({ teamAId: sideA.team.id, teamBId: sideB.team.id, fixtureId: fixture.id });
    expect(store().draft.rules.oversPerInnings).toBe(2);
    store().update({
      squadA: sideA.players.map((player) => player.id),
      squadB: sideB.players.map((player) => player.id),
      toss: { winnerTeamId: sideA.team.id, decision: 'bat' },
      openers: { strikerId: sideA.p(1), nonStrikerId: sideA.p(2), bowlerId: sideB.p(6) },
    });
    const matchId = await store().submit();
    const live = expectValue(await harness.app.matches.load(matchId ?? ''));
    expect(live.match).toMatchObject({ tournamentId: league.tournamentId, fixtureId: fixture.id, status: 'live' });
    expect(await store().startFromFixture(league.tournamentId, 'missing')).toBe(false);
    expect(store().status).toBe('error');
    store().reset();
    expect(store().status).toBe('idle');
  });
});

describe('useTournamentWizardStore', () => {
  it('walks the seven steps from a template to confirmed fixtures and resumes midway', async () => {
    const harness = await storeHarness();
    const sides: Side[] = [];
    for (const name of ['Lions', 'Tigers', 'Eagles', 'Hawks', 'Bulls', 'Bears', 'Cobras', 'Wolves']) {
      sides.push(await createSide(harness.app, name, name.slice(0, 3).toUpperCase(), sixNames(name)));
    }
    const store = () => useTournamentWizardStore.getState();
    expect((await store().listTemplates())?.length).toBeGreaterThanOrEqual(5);
    store().update({ info: { ...store().draft.info, name: ' ' } });
    expect(await store().saveStep()).toBe(false);
    expect(store().error?.code).toBe('VALIDATION');
    store().update({ info: { ...store().draft.info, name: 'Wizard Cup', templateId: 'builtin:8-team-t20' } });
    expect(await store().saveStep()).toBe(true);
    expect(store().step).toBe('teams');
    const tournamentId = store().draft.tournamentId ?? '';
    store().update({ teams: sides.map((side, index) => ({ teamId: side.team.id, seed: index + 1 })) });
    expect(await store().saveStep()).toBe(true);
    expect(store().step).toBe('structure');
    expect(await store().saveStep()).toBe(true);
    expect(store().step).toBe('rules');
    expect(store().draft.stages).toHaveLength(2);
    const rules = store().draft.rules;
    if (rules === null) {
      throw new Error('rules missing');
    }
    store().update({ rules: { ...rules, defaultMatchRules: rulesForOvers(2, { ...BASE_MATCH_RULES, playersPerSide: 6 }) } });
    expect(await store().saveStep()).toBe(true);
    expect(store().step).toBe('pools');
    expect(await store().saveStep()).toBe(false);
    expect(store().error?.message).toMatch(/pools/);
    const first = await store().previewPools({ kind: 'random', seed: 847291 });
    const second = await store().previewPools({ kind: 'random', seed: 847291 });
    expect(first).toEqual(second);
    expect(first?.pools.flatMap((pool) => pool.members)).toHaveLength(8);
    expect(await store().saveStep()).toBe(true);
    expect(store().step).toBe('fixtures');

    useTournamentWizardStore.getState().reset();
    expect(await store().resume(tournamentId)).toBe(true);
    expect(store().step).toBe('fixtures');
    expect(store().draft.poolAssignment?.pools.flatMap((pool) => pool.members)).toHaveLength(8);
    expect(store().draft.teams).toHaveLength(8);

    const plan = await store().generateFixtures();
    expect(plan?.fixtures).toHaveLength(12);
    expect(await store().saveStep()).toBe(true);
    expect(store().step).toBe('review');
    const snapshot = expectValue(await harness.app.tournaments.snapshot(tournamentId));
    expect(snapshot.tournament.status).toBe('fixtures_generated');
    expect(snapshot.fixtures).toHaveLength(15);
    expect(await store().commit()).toBe(tournamentId);
    expect(store().draft.tournamentId).toBeNull();
    expect(await store().resume(tournamentId)).toBe(true);
    expect(store().step).toBe('review');
  });

  it('refuses to commit early and to resume a started tournament', async () => {
    const harness = await storeHarness();
    const league = await createLeague(harness.app);
    const store = () => useTournamentWizardStore.getState();
    expect(await store().commit()).toBeNull();
    expect(store().error?.code).toBe('VALIDATION');
    const fixture = await league.fixture('Lions', 'Tigers');
    expectValue(await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: [], toss: null }));
    expect(await store().resume(league.tournamentId)).toBe(false);
    expect(store().error?.code).toBe('FORBIDDEN_STATE');
  });
});

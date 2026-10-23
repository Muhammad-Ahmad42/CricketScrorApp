/** @jest-environment node */
import type { MatchSquadEntry } from '@/domain/types';
import { expectFailure, expectOk, openHarness } from './support/app';
import { createLeague } from './support/league';
import { squadOf } from './support/sides';
import { standaloneWorld } from './support/standalone';

jest.setTimeout(60000);

describe('side size is enforced when a match is created (wave-3 bug #7)', () => {
  it('refuses a standalone match with more selected players than the side size and saves nothing', async () => {
    const harness = await openHarness();
    const world = await standaloneWorld(harness.app);
    const input = world.input({
      squads: [
        { teamId: world.lions.team.id, players: squadOf(world.lions, { keeper: 6 }) },
        { teamId: world.tigers.team.id, players: squadOf(world.tigers, { substitutes: [12], keeper: 1 }) },
      ],
    });
    const failure = expectFailure(await harness.app.matches.createMatch(input, world.opening()), 'VALIDATION');
    expect(failure.domainCode).toBe('SQUAD_TOO_LARGE');
    expect(failure.message).toBe('Lions: 1 player too many. This match is 11 a side. Remove 1 or make them a substitute.');
    expect(failure).toMatchObject({ headline: 'Lions: 1 player too many', supporting: 'This match is 11 a side. Remove 1 or make them a substitute.' });
    expect(expectOk(await harness.app.matches.list({ limit: 5 }))).toEqual([]);
  });

  it('uses a per-team side size when one is set', async () => {
    const harness = await openHarness();
    const world = await standaloneWorld(harness.app);
    const failure = expectFailure(await harness.app.matches.createMatch(world.input({ teamBPlayers: 8 }), world.opening()), 'VALIDATION');
    expect(failure).toMatchObject({ domainCode: 'SQUAD_TOO_LARGE', message: 'Tigers: 3 players too many. This match is 8 a side. Remove 3 or make them substitutes.' });
    expectOk(await harness.app.matches.createMatch(world.input({ teamBPlayers: 11 }), world.opening()));
  });

  it('accepts a full side plus substitutes and a short side', async () => {
    const harness = await openHarness();
    const world = await standaloneWorld(harness.app);
    const short: MatchSquadEntry[] = squadOf(world.tigers, { keeper: 1 }).slice(0, 7);
    const started = expectOk(
      await harness.app.matches.createMatch(
        world.input({ squads: [{ teamId: world.lions.team.id, players: squadOf(world.lions, { substitutes: [12], keeper: 6 }) }, { teamId: world.tigers.team.id, players: short }] }),
        world.opening(),
      ),
    );
    expect(started.setup.players.filter((player) => player.teamId === world.tigers.team.id)).toHaveLength(7);
  });

  it('refuses to start a tournament fixture with 11 players in a 6-a-side tournament', async () => {
    const harness = await openHarness();
    const league = await createLeague(harness.app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    const extras = [expectOk(await harness.app.teams.addPlayer(sideA.team.id, { name: 'Extra one' })), expectOk(await harness.app.teams.addPlayer(sideA.team.id, { name: 'Extra two' }))];
    const squadA: MatchSquadEntry[] = [
      ...squadOf(sideA, { keeper: 1 }),
      ...extras.map((player, index) => ({ playerId: player.id, battingOrder: 7 + index, isCaptain: false, isWicketKeeper: false, isSubstitute: false })),
    ];
    const failure = expectFailure(
      await harness.app.tournaments.startFixtureMatch(fixture.id, {
        squads: [
          { teamId: sideA.team.id, players: squadA },
          { teamId: sideB.team.id, players: squadOf(sideB, { keeper: 1 }) },
        ],
        toss: { winnerTeamId: sideA.team.id, decision: 'bat' },
      }),
      'VALIDATION',
    );
    expect(failure.domainCode).toBe('SQUAD_TOO_LARGE');
    expect(failure.message).toMatch(/: 2 players too many\. This match is 6 a side\. Remove 2 or make them substitutes\.$/);
    const after = (await league.evaluate()).snapshot.fixtures.find((entry) => entry.id === fixture.id);
    expect(after?.matchId).toBeNull();
    const asSubstitutes = squadA.map((entry, index) => (index >= 6 ? { ...entry, battingOrder: null, isSubstitute: true } : entry));
    expectOk(
      await harness.app.tournaments.startFixtureMatch(fixture.id, {
        squads: [
          { teamId: sideA.team.id, players: asSubstitutes },
          { teamId: sideB.team.id, players: squadOf(sideB, { keeper: 1 }) },
        ],
        toss: { winnerTeamId: sideA.team.id, decision: 'bat' },
      }),
    );
  });
});

describe('side size is enforced when a squad player is added (wave-3 bug #7)', () => {
  it('a full side only takes substitutes; a short side takes a regular player', async () => {
    const harness = await openHarness();
    const world = await standaloneWorld(harness.app);
    const started = await world.start(harness.app, {
      squads: [
        { teamId: world.lions.team.id, players: squadOf(world.lions, { substitutes: [12], keeper: 6 }) },
        { teamId: world.tigers.team.id, players: squadOf(world.tigers, { keeper: 1 }).slice(0, 10) },
      ],
    });
    const matchId = started.match.id;
    const full = expectFailure(await harness.app.matches.addSquadPlayer(matchId, world.lions.team.id, { newPlayer: { name: 'Late Arrival' } }), 'VALIDATION');
    expect(full).toMatchObject({
      domainCode: 'SQUAD_TOO_LARGE',
      message: 'Lions already have 11 players. Add this player as a substitute.',
      headline: 'Lions already have 11 players',
      supporting: 'Add this player as a substitute.',
    });
    const libraryAfter = expectOk(await harness.app.teams.get(world.lions.team.id)).players;
    expect(libraryAfter.some((player) => player.name === 'Late Arrival')).toBe(false);
    const substitute = expectOk(await harness.app.matches.addSquadPlayer(matchId, world.lions.team.id, { newPlayer: { name: 'Late Arrival' } }, { isSubstitute: true }));
    expect(substitute.isSubstitute).toBe(true);
    const regular = expectOk(await harness.app.matches.addSquadPlayer(matchId, world.tigers.team.id, { playerId: world.tigers.p(11) }));
    expect(regular).toMatchObject({ isSubstitute: false, battingOrder: 11 });
    expectFailure(await harness.app.matches.addSquadPlayer(matchId, world.tigers.team.id, { playerId: world.tigers.p(12) }), 'VALIDATION');
  });
});

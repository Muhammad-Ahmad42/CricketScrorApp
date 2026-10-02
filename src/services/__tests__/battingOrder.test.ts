/** @jest-environment node */
import { openingBattingTeam } from '@/domain/scoring';
import { expectFailure, expectOk, openHarness, rowCount, type Harness } from './support/app';
import { createLeague } from './support/league';
import { standaloneWorld, type StandaloneWorld } from './support/standalone';
import { squadsFor } from './support/tournament';

jest.setTimeout(60000);

describe('batting order at match start (§6–§8, §64)', () => {
  let harness: Harness;
  let world: StandaloneWorld;

  beforeAll(async () => {
    harness = await openHarness();
    world = await standaloneWorld(harness.app);
  });

  const tigersOpen = () =>
    [
      {
        kind: 'innings_started' as const,
        inningsIndex: 0,
        battingTeamId: world.tigers.team.id,
        strikerId: world.tigers.p(1),
        nonStrikerId: world.tigers.p(2),
        bowlerId: world.lions.p(7),
      },
    ] as const;

  it('derives the opening side from the toss or the explicit choice, never from the team order', () => {
    const sides = { teamAId: world.lions.team.id, teamBId: world.tigers.team.id };
    expect(openingBattingTeam(sides, null, world.tigers.team.id)).toBe(world.tigers.team.id);
    expect(openingBattingTeam(sides, null, null)).toBeNull();
    expect(openingBattingTeam(sides, { winnerTeamId: world.lions.team.id, decision: 'bowl' }, null)).toBe(world.tigers.team.id);
    expect(openingBattingTeam(sides, { winnerTeamId: world.tigers.team.id, decision: 'bat' }, world.lions.team.id)).toBe(world.tigers.team.id);
  });

  it('creates a standalone match with no toss and Team B batting first, without swapping the teams', async () => {
    const live = expectOk(await harness.app.matches.createMatch(world.input({ toss: null }), tigersOpen()));
    expect(live.match).toMatchObject({ teamAId: world.lions.team.id, teamBId: world.tigers.team.id, toss: null, status: 'live' });
    expect(live.state.innings[0]).toMatchObject({ battingTeamId: world.tigers.team.id, bowlingTeamId: world.lions.team.id });
    expectFailure(await harness.app.matches.setToss(live.match.id, { winnerTeamId: world.lions.team.id, decision: 'bat' }, 'Toss found later'), 'VALIDATION');
    const tossed = expectOk(await harness.app.matches.setToss(live.match.id, { winnerTeamId: world.lions.team.id, decision: 'bowl' }, 'Toss found later'));
    expect(tossed.toss).toEqual({ winnerTeamId: world.lions.team.id, decision: 'bowl' });
  });

  it('refuses an opening side that contradicts the recorded toss and saves nothing', async () => {
    const before = await rowCount(harness.db, 'matches');
    const refused = expectFailure(
      await harness.app.matches.createMatch(world.input({ toss: { winnerTeamId: world.lions.team.id, decision: 'bat' } }), tigersOpen()),
      'VALIDATION',
    );
    expect(refused.domainCode).toBe('TOSS_MISMATCH');
    expect(await rowCount(harness.db, 'matches')).toBe(before);
  });

  it('starts a tournament fixture with no toss and side B batting first, keeping the fixture sides', async () => {
    const league = await createLeague(harness.app);
    const fixture = await league.fixture('Eagles', 'Hawks');
    const [sideA, sideB] = league.sidesOf(fixture);
    const match = expectOk(
      await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: null }, [
        { kind: 'innings_started', inningsIndex: 0, battingTeamId: sideB.team.id, strikerId: sideB.p(1), nonStrikerId: sideB.p(2), bowlerId: sideA.p(6) },
      ]),
    );
    expect(match).toMatchObject({ teamAId: sideA.team.id, teamBId: sideB.team.id, toss: null, fixtureId: fixture.id });
    const live = expectOk(await harness.app.matches.load(match.id));
    expect(live.state.innings[0].battingTeamId).toBe(sideB.team.id);
  });
});

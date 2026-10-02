import type { Fixture, Match, MatchState, TeamId, TournamentSnapshot } from '@/domain/types';
import type { AppServices } from '../../contracts';
import { expectOk } from './app';
import { live, playBalls, playLine, score, startInnings, type Ball, type InningsLine } from './scoring';
import { squadOf, type Side } from './sides';

export type InningsPlay = { readonly line: InningsLine } | { readonly balls: readonly Ball[] };

export interface FixturePlay {
  readonly battingFirst: Side;
  readonly fieldingFirst: Side;
  readonly first: InningsPlay;
  readonly second: InningsPlay;
  readonly superOver?: { readonly first: readonly Ball[]; readonly second: readonly Ball[] };
}

function hasTeam(fixture: Fixture, teamId: TeamId): boolean {
  return (
    (fixture.sideA.kind === 'team' && fixture.sideA.teamId === teamId) ||
    (fixture.sideB.kind === 'team' && fixture.sideB.teamId === teamId) ||
    fixture.matchSides?.teamAId === teamId ||
    fixture.matchSides?.teamBId === teamId
  );
}

export function fixtureBetween(snapshot: TournamentSnapshot, a: Side, b: Side): Fixture {
  const between = snapshot.fixtures.filter((fixture) => hasTeam(fixture, a.team.id) && hasTeam(fixture, b.team.id));
  const found = between.find((fixture) => fixture.matchId === null) ?? between[0];
  if (found === undefined) {
    throw new Error(`No fixture ${a.team.name} v ${b.team.name}`);
  }
  return found;
}

async function playInnings(app: AppServices, matchId: string, play: InningsPlay): Promise<MatchState> {
  return 'line' in play ? playLine(app, matchId, play.line) : playBalls(app, matchId, play.balls);
}

export interface PlayedFixture {
  readonly match: Match;
  readonly state: MatchState;
}

export function squadsFor(sideA: Side, sideB: Side) {
  return [
    { teamId: sideA.team.id, players: squadOf(sideA, { keeper: 1 }) },
    { teamId: sideB.team.id, players: squadOf(sideB, { keeper: 1 }) },
  ];
}

async function openMatch(app: AppServices, fixture: Fixture, play: FixturePlay, sideA: Side, sideB: Side, existing: Match | null): Promise<Match> {
  if (existing !== null) {
    await score(app, existing.id, {
      type: 'start_innings',
      strikerId: play.battingFirst.p(1),
      nonStrikerId: play.battingFirst.p(2),
      bowlerId: play.fieldingFirst.p(6),
      battingTeamId: play.battingFirst.team.id,
    });
    return existing;
  }
  return expectOk(
    await app.tournaments.startFixtureMatch(
      fixture.id,
      {
        squads: squadsFor(sideA, sideB),
        toss: { winnerTeamId: play.battingFirst.team.id, decision: 'bat' },
      },
      [
        {
          kind: 'innings_started',
          inningsIndex: 0,
          battingTeamId: play.battingFirst.team.id,
          strikerId: play.battingFirst.p(1),
          nonStrikerId: play.battingFirst.p(2),
          bowlerId: play.fieldingFirst.p(6),
        },
      ],
    ),
  );
}

export async function playFixture(app: AppServices, fixture: Fixture, play: FixturePlay, sideA: Side, sideB: Side, existing: Match | null = null): Promise<PlayedFixture> {
  const match = await openMatch(app, fixture, play, sideA, sideB, existing);
  await playInnings(app, match.id, play.first);
  await startInnings(app, match.id);
  await playInnings(app, match.id, play.second);
  if (play.superOver !== undefined) {
    await score(app, match.id, { type: 'start_super_over' });
    await startInnings(app, match.id);
    await playBalls(app, match.id, play.superOver.first);
    await startInnings(app, match.id);
    await playBalls(app, match.id, play.superOver.second);
  }
  const before = await live(app, match.id);
  if (before.state.pendingAction?.type !== 'confirm_result') {
    throw new Error(`Expected confirm_result, got ${before.state.pendingAction?.type ?? 'none'}`);
  }
  const state = await score(app, match.id, { type: 'end_match', outcome: { type: 'natural' } });
  return { match, state };
}


import { BASE_MATCH_RULES } from '@/domain/scoring';
import { M3_RULES } from '@/domain/scoring/testing';
import type { MatchEventInput, MatchRules, NewMatchInput } from '@/domain/types';
import type { AppServices, LiveMatch } from '../../contracts';
import { expectOk } from './app';
import { createSide, LION_NAMES, squadOf, TIGER_NAMES, type Side } from './sides';

export const M3: MatchRules = { ...BASE_MATCH_RULES, ...M3_RULES };

export interface StandaloneWorld {
  readonly lions: Side;
  readonly tigers: Side;
  input(overrides?: Partial<NewMatchInput>): NewMatchInput;
  opening(): readonly MatchEventInput[];
  start(app: AppServices, overrides?: Partial<NewMatchInput>): Promise<LiveMatch>;
}

export async function standaloneWorld(app: AppServices): Promise<StandaloneWorld> {
  const lions = await createSide(app, 'Lions', 'LIO', LION_NAMES);
  const tigers = await createSide(app, 'Tigers', 'TIG', TIGER_NAMES);
  const input = (overrides: Partial<NewMatchInput> = {}): NewMatchInput => ({
    title: 'Lions v Tigers',
    teamAId: lions.team.id,
    teamBId: tigers.team.id,
    venueId: null,
    scheduledDate: null,
    scheduledTime: null,
    formatId: 'custom',
    rules: M3,
    squads: [
      { teamId: lions.team.id, players: squadOf(lions, { substitutes: [12], keeper: 6 }) },
      { teamId: tigers.team.id, players: squadOf(tigers, { substitutes: [12], keeper: 1 }) },
    ],
    toss: { winnerTeamId: lions.team.id, decision: 'bat' },
    tournamentId: null,
    fixtureId: null,
    teamAPlayers: null,
    teamBPlayers: null,
    ...overrides,
  });
  const opening = (): readonly MatchEventInput[] => [
    { kind: 'innings_started', inningsIndex: 0, battingTeamId: lions.team.id, strikerId: lions.p(1), nonStrikerId: lions.p(2), bowlerId: tigers.p(7) },
  ];
  return {
    lions,
    tigers,
    input,
    opening,
    async start(target, overrides) {
      return expectOk(await target.matches.createMatch(input(overrides), opening()));
    },
  };
}

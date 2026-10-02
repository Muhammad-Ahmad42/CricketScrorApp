import type {
  Fixture,
  FixtureSide,
  KnockoutConfig,
  MatchSummary,
  Seed,
  SeedingMethod,
  SlotResolution,
  TeamId,
} from '../types';
import { mulberry32, shuffle } from './rng';
import type { Guard } from './stateMachine';
import { bracketOrder, isPowerOfTwo, nextPowerOfTwo } from './structure/bracketMath';
import { fixedSeedOrder } from './structure/fixedSeeding';
import { assertNever } from './structure/sides';

export function standardBracketOrder(size: number): readonly number[] {
  if (!isPowerOfTwo(size)) {
    throw new RangeError(`Bracket size must be a power of two, got ${size}.`);
  }
  return bracketOrder(size);
}

export function bracketShape(
  entrants: number,
  rounds: number | null,
): { readonly size: number; readonly totalRounds: number; readonly roundsPlayed: number; readonly winners: number } {
  if (rounds !== null && (!Number.isInteger(rounds) || rounds < 1)) {
    throw new RangeError(`A knockout plays at least one round, got ${rounds}.`);
  }
  const size = nextPowerOfTwo(Math.max(1, Math.floor(entrants)));
  const totalRounds = Math.round(Math.log2(size));
  const roundsPlayed = rounds === null ? totalRounds : Math.min(rounds, totalRounds);
  return { size, totalRounds, roundsPlayed, winners: size / 2 ** roundsPlayed };
}

export interface SeededEntrant {
  readonly side: FixtureSide;
  readonly rank: number | null;
  readonly poolIndex: number | null;
  readonly poolPosition: number | null;
}

function rankingOrder(entrants: readonly SeededEntrant[]): readonly FixtureSide[] {
  return entrants
    .map((entrant, index) => ({ entrant, index }))
    .sort((a, b) => {
      const ra = a.entrant.rank ?? Number.POSITIVE_INFINITY;
      const rb = b.entrant.rank ?? Number.POSITIVE_INFINITY;
      return ra === rb ? a.index - b.index : ra - rb;
    })
    .map((entry) => entry.entrant.side);
}

export function seedEntrants(entrants: readonly SeededEntrant[], method: SeedingMethod, seed: Seed | null): readonly FixtureSide[] {
  switch (method) {
    case 'fixed':
      return fixedSeedOrder(entrants);
    case 'random':
      if (seed === null) {
        throw new Error('A random draw needs a seed.');
      }
      return shuffle(
        entrants.map((entrant) => entrant.side),
        mulberry32(seed),
      );
    case 'ranking':
      return rankingOrder(entrants);
    default:
      return assertNever(method);
  }
}

export function knockoutGenerationGuard(method: SeedingMethod, entrySlots: readonly SlotResolution[]): Guard {
  const open = entrySlots.filter((slot) => slot.status !== 'final').length;
  if (method === 'ranking' && open > 0) {
    return { ok: false, reason: `Seeding by ranking is possible once all ${entrySlots.length} qualifiers are known.` };
  }
  if (open > 0) {
    const places = open === 1 ? '1 knockout place is' : `${open} knockout places are`;
    return { ok: true, warnings: [`${places} still to be decided; the draw uses their qualification slots.`] };
  }
  return { ok: true, warnings: [] };
}

export type AdvancementBasis =
  | 'result'
  | 'tie_decider'
  | 'higher_seed'
  | 'walkover'
  | 'awarded'
  | 'shared'
  | 'organizer_required'
  | 'not_played';

type Advancement = { readonly winnerTeamId: TeamId | null; readonly loserTeamId: TeamId | null; readonly basis: AdvancementBasis };

function undecided(basis: AdvancementBasis): Advancement {
  return { winnerTeamId: null, loserTeamId: null, basis };
}

function otherTeam(teams: { readonly a: TeamId | null; readonly b: TeamId | null }, winner: TeamId): TeamId | null {
  if (teams.a === winner) {
    return teams.b;
  }
  if (teams.b === winner) {
    return teams.a;
  }
  return null;
}

function decided(teams: { readonly a: TeamId | null; readonly b: TeamId | null }, winner: TeamId, basis: AdvancementBasis, loser?: TeamId | null): Advancement {
  return { winnerTeamId: winner, loserTeamId: loser ?? otherTeam(teams, winner), basis };
}

function byHigherSeed(
  teams: { readonly a: TeamId | null; readonly b: TeamId | null },
  seedOf: (teamId: TeamId) => number | null,
): Advancement {
  if (teams.a === null || teams.b === null) {
    return undecided('organizer_required');
  }
  const seedA = seedOf(teams.a);
  const seedB = seedOf(teams.b);
  if (seedA === null || seedB === null || seedA === seedB) {
    return undecided('organizer_required');
  }
  return seedA < seedB ? decided(teams, teams.a, 'higher_seed', teams.b) : decided(teams, teams.b, 'higher_seed', teams.a);
}

function noResultAdvance(
  teams: { readonly a: TeamId | null; readonly b: TeamId | null },
  config: KnockoutConfig,
  seedOf: (teamId: TeamId) => number | null,
): Advancement {
  switch (config.noResult) {
    case 'higher_seed':
      return byHigherSeed(teams, seedOf);
    case 'shared':
      return undecided('shared');
    case 'replay':
    case 'organizer':
      return undecided('organizer_required');
    default:
      return assertNever(config.noResult);
  }
}

function tiedAdvance(
  teams: { readonly a: TeamId | null; readonly b: TeamId | null },
  config: KnockoutConfig,
  seedOf: (teamId: TeamId) => number | null,
): Advancement {
  switch (config.tiedMatch) {
    case 'higher_seed':
      return byHigherSeed(teams, seedOf);
    case 'super_over':
    case 'boundary_count':
    case 'organizer':
      return undecided('organizer_required');
    default:
      return assertNever(config.tiedMatch);
  }
}

function playedTeams(
  fixture: Fixture,
  sideTeams: { readonly a: TeamId | null; readonly b: TeamId | null },
  summary: MatchSummary,
): { readonly a: TeamId | null; readonly b: TeamId | null } {
  if (fixture.matchSides !== null) {
    return { a: fixture.matchSides.teamAId, b: fixture.matchSides.teamBId };
  }
  if (summary.teamAId && summary.teamBId) {
    return { a: summary.teamAId, b: summary.teamBId };
  }
  return sideTeams;
}

export function knockoutAdvancer(
  fixture: Fixture,
  sideTeams: { readonly a: TeamId | null; readonly b: TeamId | null },
  summary: MatchSummary | null,
  config: KnockoutConfig,
  seedOf: (teamId: TeamId) => number | null,
): { readonly winnerTeamId: TeamId | null; readonly loserTeamId: TeamId | null; readonly basis: AdvancementBasis } {
  if (summary === null) {
    return undecided('not_played');
  }
  const teams = playedTeams(fixture, sideTeams, summary);
  const result = summary.result;
  switch (result.type) {
    case 'win':
      return decided(teams, result.winnerTeamId, 'result', result.loserTeamId);
    case 'walkover':
      return decided(teams, result.winnerTeamId, 'walkover', result.loserTeamId);
    case 'awarded':
      return result.winnerTeamId === null
        ? noResultAdvance(teams, config, seedOf)
        : decided(teams, result.winnerTeamId, 'awarded', result.loserTeamId);
    case 'tie':
      return result.decider === null ? tiedAdvance(teams, config, seedOf) : decided(teams, result.decider.winnerTeamId, 'tie_decider');
    case 'no_result':
    case 'abandoned':
      return noResultAdvance(teams, config, seedOf);
    default:
      return assertNever(result);
  }
}

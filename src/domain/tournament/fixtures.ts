import type {
  Fixture,
  FixtureDraft,
  FixtureId,
  FixtureSide,
  FormatId,
  IdGenerator,
  IsoDate,
  LocalTime,
  MatchRules,
  PoolId,
  SlotId,
  StageId,
  StageSlot,
  TournamentId,
  VenueId,
} from '../types';
import { planKnockoutBracket } from './structure/bracketPlan';
import { fixtureDraftIssues } from './structure/fixtureValidation';
import { roundNameFor } from './structure/labels';
import { circleRounds } from './structure/roundRobin';
import { scheduleDrafts } from './structure/schedule';
import { sameSide } from './structure/sides';

export interface RoundRobinPairing {
  readonly round: number;
  readonly leg: number;
  readonly sideA: FixtureSide;
  readonly sideB: FixtureSide;
}

export interface RoundRobinRound {
  readonly round: number;
  readonly leg: number;
  readonly pairings: readonly RoundRobinPairing[];
  readonly bye: FixtureSide | null;
}

export function roundRobin(entrants: readonly FixtureSide[], legs: number): readonly RoundRobinRound[] {
  if (entrants.length < 2) {
    throw new RangeError(`A round robin needs at least 2 entrants, got ${entrants.length}.`);
  }
  if (!Number.isInteger(legs) || legs < 1) {
    throw new RangeError(`A round robin needs at least 1 leg, got ${legs}.`);
  }
  const base = circleRounds(entrants);
  const rounds: RoundRobinRound[] = [];
  for (let leg = 1; leg <= legs; leg += 1) {
    const mirrored = leg % 2 === 0;
    base.forEach((circle, index) => {
      const round = (leg - 1) * base.length + index + 1;
      rounds.push({
        round,
        leg,
        bye: circle.bye,
        pairings: circle.pairings.map(([x, y]) => ({ round, leg, sideA: mirrored ? y : x, sideB: mirrored ? x : y })),
      });
    });
  }
  return rounds;
}

export interface DraftDefaults {
  readonly tournamentId: TournamentId;
  readonly stageId: StageId;
  readonly poolId: PoolId | null;
  readonly formatId: FormatId | null;
  readonly matchRules: MatchRules | null;
  readonly venueId: VenueId | null;
  readonly startMatchNumber: number;
}

function baseDraft(
  defaults: DraftDefaults,
  fields: Pick<FixtureDraft, 'id' | 'matchNumber' | 'sideA' | 'sideB' | 'round' | 'leg' | 'label'>,
): FixtureDraft {
  return {
    tournamentId: defaults.tournamentId,
    stageId: defaults.stageId,
    poolId: defaults.poolId,
    bracket: null,
    isFinal: false,
    scheduledDate: null,
    scheduledTime: null,
    venueId: defaults.venueId,
    status: 'scheduled',
    formatId: defaults.formatId,
    matchRules: defaults.matchRules,
    notes: null,
    ...fields,
  };
}

export function draftsFromRoundRobin(rounds: readonly RoundRobinRound[], defaults: DraftDefaults, ids: IdGenerator): readonly FixtureDraft[] {
  const pairings = [...rounds].sort((a, b) => a.round - b.round).flatMap((round) => round.pairings);
  return pairings.map((pairing, index) =>
    baseDraft(defaults, {
      id: ids(),
      matchNumber: defaults.startMatchNumber + index,
      sideA: pairing.sideA,
      sideB: pairing.sideB,
      round: pairing.round,
      leg: pairing.leg,
      label: null,
    }),
  );
}

export interface ManualFixtureInput {
  readonly sideA: FixtureSide;
  readonly sideB: FixtureSide;
  readonly scheduledDate: IsoDate | null;
  readonly scheduledTime: LocalTime | null;
  readonly venueId: VenueId | null;
  readonly formatId: FormatId | null;
  readonly matchRules: MatchRules | null;
  readonly notes: string | null;
  readonly label: string | null;
}

export function manualFixture(input: ManualFixtureInput, defaults: DraftDefaults, ids: IdGenerator): FixtureDraft {
  return {
    ...baseDraft(defaults, {
      id: ids(),
      matchNumber: defaults.startMatchNumber,
      sideA: input.sideA,
      sideB: input.sideB,
      round: null,
      leg: null,
      label: input.label,
    }),
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    venueId: input.venueId ?? defaults.venueId,
    formatId: input.formatId ?? defaults.formatId,
    matchRules: input.matchRules ?? defaults.matchRules,
    notes: input.notes,
  };
}

export type FixtureIssueCode =
  | 'SAME_SIDE_TWICE'
  | 'SIDE_NOT_IN_POOL'
  | 'SIDE_NOT_IN_TOURNAMENT'
  | 'DUPLICATE_ENCOUNTER'
  | 'TEAM_DOUBLE_BOOKED'
  | 'OUTSIDE_TOURNAMENT_DATES';

export interface FixtureIssue {
  readonly code: FixtureIssueCode;
  readonly severity: 'error' | 'warning';
  readonly fixtureId: FixtureId;
  readonly message: string;
}

export function validateFixtureDrafts(
  drafts: readonly FixtureDraft[],
  context: {
    readonly poolMembers: Readonly<Record<PoolId, readonly FixtureSide[]>>;
    readonly tournamentSides: readonly FixtureSide[];
    readonly legsByPool: ReadonlyMap<PoolId, number>;
    readonly defaultLegs: number;
    readonly startDate: IsoDate | null;
    readonly endDate: IsoDate | null;
  },
): readonly FixtureIssue[] {
  return fixtureDraftIssues(drafts, context);
}

export function scheduleSequential(
  drafts: readonly FixtureDraft[],
  opts: { readonly startDate: IsoDate; readonly matchesPerDay: number; readonly times: readonly LocalTime[]; readonly restDates?: readonly IsoDate[] },
): readonly FixtureDraft[] {
  return scheduleDrafts(drafts, opts);
}

export interface KnockoutBracketPlan {
  readonly fixtures: readonly FixtureDraft[];
  readonly slots: readonly StageSlot[];
  readonly entrySlotSeeds: readonly { readonly slotId: SlotId; readonly seed: number }[];
  readonly byes: readonly FixtureSide[];
}

export function knockoutBracket(
  entrants: readonly FixtureSide[],
  opts: {
    readonly thirdPlacePlayoff: boolean;
    readonly rounds: number | null;
    readonly firstSlotIndex: number;
    readonly defaults: DraftDefaults;
  },
  ids: IdGenerator,
): KnockoutBracketPlan {
  return planKnockoutBracket(entrants, opts, ids);
}

export function roundName(teamsInRound: number, round: number): string {
  return roundNameFor(teamsInRound, round);
}

export function fixturesForPoolMove(
  input: {
    readonly member: FixtureSide;
    readonly fromPoolId: PoolId;
    readonly fixtures: readonly Fixture[];
    readonly targetMembers: readonly FixtureSide[];
    readonly legs: number;
    readonly defaults: DraftDefaults;
  },
  ids: IdGenerator,
): { readonly removeFixtureIds: readonly FixtureId[]; readonly addFixtures: readonly FixtureDraft[] } {
  const { member, defaults } = input;
  const removeFixtureIds = input.fixtures
    .filter(
      (fixture) =>
        fixture.poolId === input.fromPoolId &&
        fixture.matchId === null &&
        (sameSide(fixture.sideA, member) || sameSide(fixture.sideB, member)),
    )
    .map((fixture) => fixture.id);
  const opponents = input.targetMembers.filter((candidate) => !sameSide(candidate, member));
  const legs = Math.max(0, Math.floor(input.legs));
  const addFixtures: FixtureDraft[] = [];
  for (let leg = 1; leg <= legs; leg += 1) {
    opponents.forEach((opponent, index) => {
      const memberSecond = (index % 2 === 1) !== (leg % 2 === 0);
      addFixtures.push(
        baseDraft(defaults, {
          id: ids(),
          matchNumber: defaults.startMatchNumber + addFixtures.length,
          sideA: memberSecond ? opponent : member,
          sideB: memberSecond ? member : opponent,
          round: null,
          leg,
          label: null,
        }),
      );
    });
  }
  return { removeFixtureIds, addFixtures };
}
